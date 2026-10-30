import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Printer, FileText, Tag, AlertTriangle, ExternalLink } from 'lucide-react'
import { api } from '../services/api'
import { getPrintRoot, printNow, renderLabelImage } from '../services/print'
import type { LabelRate, Order, PackagePreset, ShipFromAddress, ShippingLabel } from '../types'
import PackingSlip from './PackingSlip'

interface LabelInfo {
  label: ShippingLabel | null
  shippo: {
    connected: boolean
    test_mode: boolean
    from_address: ShipFromAddress | null
    packages: PackagePreset[]
    linked: boolean
    has_address: boolean
  }
}

const OZ_PER_UNIT: Record<string, number> = { oz: 1, lb: 16, g: 1 / 28.3495, kg: 35.274 }

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

// The order's own weight in ounces (Etsy listings carry a packed weight), if the store provided one
function orderWeightOz(order: Order): number | null {
  const w = order.shipping_json?.weight
  const factor = w ? OZ_PER_UNIT[w.unit] : undefined
  return w && factor ? w.value * factor : null
}

function splitOz(totalOz: number): { lb: string; oz: string } {
  const lb = Math.floor(totalOz / 16)
  const oz = Math.round((totalOz - lb * 16) * 10) / 10
  return { lb: lb ? String(lb) : '', oz: oz ? String(oz) : '' }
}

const CARRIERS = ['usps', 'ups', 'fedex', 'dhl']

function normalize(text: string | null | undefined): string {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// The rate for the shipping option the buyer picked, e.g. "USPS Priority Mail" → USPS Priority Mail.
// When the buyer's option names a carrier only that carrier's rates count; otherwise only multi-word
// service names do, so a generic title like "Ground shipping" doesn't land on UPS Ground.
function matchBuyerRate(method: string | undefined, rates: LabelRate[]): LabelRate | null {
  const wanted = normalize(method)
  if (!wanted) return null
  const carrier = CARRIERS.find((c) => ` ${wanted} `.includes(` ${c} `))
  let best: LabelRate | null = null
  for (const rate of rates) {
    const service = normalize(rate.service)
    if (!service || !` ${wanted} `.includes(` ${service} `)) continue
    if (carrier ? !normalize(rate.provider).startsWith(carrier) : !service.includes(' ')) continue
    if (!best || service.length > normalize(best.service).length) best = rate
  }
  return best
}

// With no option name to go on, the rate closest to what the buyer paid for shipping, if that isn't
// the cheapest one; a hint that they may have paid for an upgrade
function closestToPaid(paid: number | undefined, rates: LabelRate[]): LabelRate | null {
  if (!paid || rates.length < 2) return null
  const closest = rates.reduce((a, b) => (Math.abs(b.amount - paid) < Math.abs(a.amount - paid) ? b : a))
  return closest.id !== rates[0].id ? closest : null
}

interface Props {
  order: Order
  onOrderUpdated?: () => void
}

// Create label → Print label → Print invoice, for one order
export default function ShippingActions({ order, onOrderUpdated }: Props) {
  const [info, setInfo] = useState<LabelInfo | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [labelImage, setLabelImage] = useState<string | null>(null)
  const [labelImageError, setLabelImageError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [packageIndex, setPackageIndex] = useState(-1)
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
  const [weight, setWeight] = useState({ lb: '', oz: '' })
  const [rates, setRates] = useState<LabelRate[] | null>(null)
  const [rateMessages, setRateMessages] = useState<string[]>([])
  const [selectedRate, setSelectedRate] = useState('')
  const [busy, setBusy] = useState<'rates' | 'buy' | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/orders/${order.id}/label`)
      setInfo(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load label info')
    }
  }, [order.id])

  useEffect(() => {
    setInfo(null)
    setError('')
    setNotice('')
    setFormOpen(false)
    setRates(null)
    load()
  }, [load])

  // Turn the label PDF into an image ahead of time, so "Print label" prints right away
  const labelId = info?.label?.id
  useEffect(() => {
    if (!labelId) return
    let cancelled = false
    let url: string | null = null
    setLabelImage(null)
    setLabelImageError('')

    api
      .getFile(`/orders/${order.id}/label/pdf`)
      .then(renderLabelImage)
      .then((u) => {
        url = u
        if (cancelled) URL.revokeObjectURL(u)
        else setLabelImage(u)
      })
      .catch((err) => {
        if (!cancelled) setLabelImageError(err instanceof Error ? err.message : 'Could not prepare the label')
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [labelId, order.id])

  function applyPackage(index: number, packages: PackagePreset[]) {
    setPackageIndex(index)
    setRates(null)
    const preset = packages[index]
    if (preset) setDims({ length: String(preset.length), width: String(preset.width), height: String(preset.height) })
    const oz = orderWeightOz(order) ?? (preset?.weight_oz || 0)
    setWeight(oz > 0 ? splitOz(oz) : { lb: '', oz: '' })
  }

  function openForm() {
    if (!info) return
    setFormOpen(true)
    setError('')
    applyPackage(info.shippo.packages.length > 0 ? 0 : -1, info.shippo.packages)
  }

  const totalOz = (Number(weight.lb) || 0) * 16 + (Number(weight.oz) || 0)
  const canQuote = Number(dims.length) > 0 && Number(dims.width) > 0 && Number(dims.height) > 0 && totalOz > 0

  async function handleGetRates() {
    setBusy('rates')
    setError('')
    setRates(null)
    try {
      const res = await api.post(`/orders/${order.id}/label/rates`, {
        length: Number(dims.length),
        width: Number(dims.width),
        height: Number(dims.height),
        weight_oz: totalOz,
      })
      setRates(res.data.rates)
      setRateMessages(res.data.messages)
      // Rates come cheapest first; go with the buyer's choice when it can be matched
      const choice = matchBuyerRate(order.shipping_json?.method, res.data.rates)
      setSelectedRate(choice?.id || res.data.rates[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get rates')
    } finally {
      setBusy(null)
    }
  }

  async function handleBuy() {
    if (!selectedRate || busy) return
    setBusy('buy')
    setError('')
    try {
      const res = await api.post(`/orders/${order.id}/label`, { rate_id: selectedRate })
      const label: ShippingLabel = res.data.label
      setInfo((prev) => (prev ? { ...prev, label } : prev))
      setFormOpen(false)
      setRates(null)
      if (!label.test_mode && !res.data.tracking_sent) {
        setNotice(
          `Shippo doesn't have this order, so ${order.platform === 'etsy' ? 'Etsy' : 'Shopify'} won't get the tracking number automatically. Add it there yourself.`,
        )
      }
      onOrderUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not buy the label')
    } finally {
      setBusy(null)
    }
  }

  async function handleOpenPdf() {
    // Open the window during the tap so it isn't blocked as a popup
    const win = window.open('', '_blank')
    try {
      const data = await api.getFile(`/orders/${order.id}/label/pdf`)
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      if (win) win.location.href = url
      else window.location.href = url
    } catch (err) {
      win?.close()
      setError(err instanceof Error ? err.message : 'Could not open the label')
    }
  }

  const label = info?.label
  const shippo = info?.shippo
  const selected = rates?.find((r) => r.id === selectedRate)
  const alreadyShipped = order.status === 'shipped' || order.status === 'delivered'
  const buyerMethod = order.shipping_json?.method || ''
  const buyerPaid = order.shipping_json?.shipping_paid
  const buyerRate = rates ? matchBuyerRate(buyerMethod, rates) : null
  const paidHint = rates && !buyerMethod ? closestToPaid(buyerPaid, rates) : null

  return (
    <section className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">{notice}</div>
      )}

      {label ? (
        <div className="card !p-4 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-primary-400" />
            <p className="text-zinc-200 text-sm font-medium">
              {label.carrier} {label.service}
            </p>
            <span className="text-zinc-400 text-sm">{formatCents(label.cost, label.currency)}</span>
            {label.test_mode && (
              <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30">Test label</span>
            )}
          </div>
          {label.tracking_code && (
            <p className="text-sm font-mono">
              {label.tracking_url ? (
                <a href={label.tracking_url} target="_blank" rel="noopener noreferrer" className="text-primary-400">
                  {label.tracking_code}
                </a>
              ) : (
                <span className="text-zinc-400">{label.tracking_code}</span>
              )}
            </p>
          )}
        </div>
      ) : !info ? null : !shippo?.connected || !shippo.from_address ? (
        <p className="text-sm text-zinc-500">
          To create labels here,{' '}
          <Link to="/settings" className="text-primary-400 underline">
            {shippo?.connected ? 'add your ship-from address in Settings' : 'connect Shippo in Settings'}
          </Link>
          .
        </p>
      ) : !shippo.has_address ? (
        <p className="text-sm text-zinc-500">This order has no complete shipping address, so a label can't be created.</p>
      ) : formOpen ? (
        <div className="card !p-4 space-y-3">
          <p className="text-zinc-200 font-medium">Create shipping label</p>

          {shippo.test_mode && (
            <p className="text-xs text-amber-400">Test mode: the label is free and can't be used to ship.</p>
          )}
          {alreadyShipped && (
            <p className="text-xs text-amber-400 flex gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This order is already marked shipped. A new label is charged again.
            </p>
          )}
          {!shippo.linked && !shippo.test_mode && (
            <p className="text-xs text-amber-400 flex gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {order.platform === 'etsy' ? 'Etsy' : 'Shopify'} won't get the tracking number automatically: this order
              isn't in Shippo.
            </p>
          )}

          {(buyerMethod || buyerPaid !== undefined) && (
            <p className="text-sm text-zinc-400">
              {buyerMethod ? (
                <>
                  Buyer chose: <span className="text-zinc-200 font-medium">{buyerMethod}</span>
                  {buyerPaid !== undefined && <> · paid {formatCents(buyerPaid, order.currency)}</>}
                </>
              ) : (
                <>
                  Buyer paid <span className="text-zinc-200 font-medium">{formatCents(buyerPaid ?? 0, order.currency)}</span>{' '}
                  for shipping
                </>
              )}
            </p>
          )}

          <div>
            <label className="label">Package</label>
            <select
              className="input"
              value={packageIndex}
              onChange={(e) => applyPackage(Number(e.target.value), shippo.packages)}
            >
              {shippo.packages.map((p, i) => (
                <option key={i} value={i}>
                  {p.name} ({p.length}×{p.width}×{p.height} in)
                </option>
              ))}
              <option value={-1}>Custom size</option>
            </select>
          </div>

          {packageIndex === -1 && (
            <div className="grid grid-cols-3 gap-2">
              {(['length', 'width', 'height'] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-zinc-500">{field[0].toUpperCase() + field.slice(1)} (in)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0.1"
                    className="input"
                    value={dims[field]}
                    onChange={(e) => {
                      setDims((prev) => ({ ...prev, [field]: e.target.value }))
                      setRates(null)
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(['lb', 'oz'] as const).map((field) => (
              <div key={field}>
                <label className="text-xs text-zinc-500">Weight ({field})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="input"
                  value={weight[field]}
                  onChange={(e) => {
                    setWeight((prev) => ({ ...prev, [field]: e.target.value }))
                    setRates(null)
                  }}
                />
              </div>
            ))}
          </div>

          {rates === null ? (
            <div className="flex gap-2">
              <button
                className="btn btn-primary flex-1 py-3"
                onClick={handleGetRates}
                disabled={!canQuote || busy !== null}
              >
                {busy === 'rates' ? 'Getting rates...' : 'Get rates'}
              </button>
              <button className="btn btn-secondary py-3" onClick={() => setFormOpen(false)} disabled={busy !== null}>
                Cancel
              </button>
            </div>
          ) : rates.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-red-400">
                No rates for this package{rateMessages.length > 0 ? `: ${rateMessages.join(' ')}` : '.'}
              </p>
              <button className="btn btn-secondary w-full" onClick={handleGetRates} disabled={busy !== null}>
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {buyerMethod && !buyerRate && (
                <p className="text-xs text-zinc-500">
                  None of these rates matches "{buyerMethod}", so the cheapest is selected.
                </p>
              )}
              {paidHint && buyerPaid !== undefined && (
                <p className="text-xs text-amber-400 flex gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  The buyer paid {formatCents(buyerPaid, order.currency)} for shipping, closest to {paidHint.provider}{' '}
                  {paidHint.service}. They may have picked an upgrade.
                </p>
              )}
              <div className="space-y-1.5">
                {rates.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      r.id === selectedRate ? 'border-primary-500 bg-primary-500/10' : 'border-surface-600 bg-surface-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rate"
                      checked={r.id === selectedRate}
                      onChange={() => setSelectedRate(r.id)}
                      className="accent-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          {r.provider} {r.service}
                        </span>
                        {(r.id === buyerRate?.id || r.id === paidHint?.id) && (
                          <span className="badge whitespace-nowrap bg-primary-500/20 text-primary-400 border border-primary-500/30">
                            {r.id === buyerRate?.id ? "Buyer's choice" : 'Matches what buyer paid'}
                          </span>
                        )}
                      </p>
                      {(r.estimated_days || r.duration_terms) && (
                        <p className="text-xs text-zinc-500 truncate">
                          {r.estimated_days ? `${r.estimated_days} day${r.estimated_days === 1 ? '' : 's'}` : r.duration_terms}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-medium text-zinc-200">{formatCents(r.amount, r.currency)}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1 py-3" onClick={handleBuy} disabled={!selected || busy !== null}>
                  {busy === 'buy'
                    ? 'Buying label...'
                    : `Buy label${selected ? ` · ${formatCents(selected.amount, selected.currency)}` : ''}`}
                </button>
                <button className="btn btn-secondary py-3" onClick={() => setFormOpen(false)} disabled={busy !== null}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button className="btn btn-primary w-full py-3 flex items-center justify-center gap-2" onClick={openForm}>
          <Tag className="h-4 w-4" />
          Create shipping label
        </button>
      )}

      <div className={`grid gap-2 ${label ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {label && (
          <button
            className="btn btn-primary py-3 flex items-center justify-center gap-2"
            onClick={() => printNow('label')}
            disabled={!labelImage}
          >
            <Printer className="h-4 w-4" />
            {labelImage ? 'Print label' : labelImageError ? 'Label unavailable' : 'Preparing...'}
          </button>
        )}
        <button
          className="btn btn-secondary py-3 flex items-center justify-center gap-2"
          onClick={() => printNow('invoice')}
        >
          <FileText className="h-4 w-4" />
          Print invoice
        </button>
      </div>

      {label && (labelImageError || labelImage) && (
        <button className="text-xs text-zinc-500 underline flex items-center gap-1" onClick={handleOpenPdf}>
          <ExternalLink className="h-3 w-3" />
          {labelImageError ? `${labelImageError}. Open the label PDF instead` : 'Open label PDF'}
        </button>
      )}

      {createPortal(
        <>
          {labelImage && (
            <div className="print-label">
              <img src={labelImage} alt="" />
            </div>
          )}
          <PackingSlip order={order} from={shippo?.from_address || null} label={label || null} />
        </>,
        getPrintRoot(),
      )}
    </section>
  )
}
