import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Truck, Check, Trash2, Plus } from 'lucide-react'
import { api } from '../services/api'
import type { PackagePreset, ShipFromAddress } from '../types'

interface ShippoStatus {
  connected: boolean
  test_mode: boolean
  token_hint: string | null
  from_address: ShipFromAddress | null
  packages: PackagePreset[]
}

const emptyAddress: ShipFromAddress = {
  name: '',
  company: '',
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  phone: '',
  email: '',
}

const addressFields: Array<{ key: keyof ShipFromAddress; label: string; required?: boolean; half?: boolean }> = [
  { key: 'name', label: 'Name', required: true },
  { key: 'company', label: 'Shop / company' },
  { key: 'street1', label: 'Street', required: true },
  { key: 'street2', label: 'Apt / suite' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true, half: true },
  { key: 'zip', label: 'ZIP', required: true, half: true },
  { key: 'country', label: 'Country (2 letters)', required: true, half: true },
  { key: 'phone', label: 'Phone', half: true },
  { key: 'email', label: 'Email' },
]

// Package presets are edited as text so fields can be cleared while typing
interface PackageDraft {
  name: string
  length: string
  width: string
  height: string
  weight_oz: string
}

function toDraft(p: PackagePreset): PackageDraft {
  return {
    name: p.name,
    length: String(p.length),
    width: String(p.width),
    height: String(p.height),
    weight_oz: String(p.weight_oz),
  }
}

export default function ShippoSettings({ onConnectedChange }: { onConnectedChange?: () => void }) {
  const [status, setStatus] = useState<ShippoStatus | null>(null)
  const [token, setToken] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)
  const [address, setAddress] = useState<ShipFromAddress>(emptyAddress)
  const [packages, setPackages] = useState<PackageDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/shippo')
      setStatus(res.data)
      setAddress({ ...emptyAddress, ...(res.data.from_address || {}) })
      setPackages((res.data.packages as PackagePreset[]).map(toDraft))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSaveToken(e: FormEvent) {
    e.preventDefault()
    setTokenSaving(true)
    setError('')
    try {
      await api.put('/shippo/token', { token })
      setToken('')
      await load()
      onConnectedChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setTokenSaving(false)
    }
  }

  async function handleDisconnect() {
    setError('')
    try {
      await api.delete('/shippo/token')
      await load()
      onConnectedChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await api.put('/shippo/settings', {
        from_address: address,
        packages: packages.map((p) => ({
          name: p.name,
          length: Number(p.length),
          width: Number(p.width),
          height: Number(p.height),
          weight_oz: Number(p.weight_oz || 0),
        })),
      })
      setSaved(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function updatePackage(index: number, field: keyof PackageDraft, value: string) {
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <Truck className="h-6 w-6 text-primary-400" />
        <h2 className="text-lg font-semibold text-zinc-200">Shipping Labels (Shippo)</h2>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!status ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {/* API token */}
          {status.connected ? (
            <div className="p-4 bg-surface-700/50 rounded-lg border border-green-500/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-zinc-200 font-medium">Shippo</p>
                    <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">
                      <Check className="h-3 w-3 mr-1" />Connected
                    </span>
                    {status.test_mode && (
                      <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Test mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    API token ending in {status.token_hint}
                    {status.test_mode && '. Test labels are free and can\'t be shipped with.'}
                  </p>
                </div>
                <button
                  className="btn btn-danger text-sm flex items-center gap-2 self-start sm:self-auto"
                  onClick={handleDisconnect}
                >
                  <Trash2 className="h-4 w-4" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-surface-700/50 rounded-lg border border-surface-600">
              <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside mb-3">
                <li>Create a Shippo account and connect your Etsy shop to it. Connect Shopify too if you want Shopify tracking sent back automatically.</li>
                <li>In Shippo's API settings, generate a Live API token. A Test token lets you try printing without being charged.</li>
                <li>Paste the token here.</li>
              </ol>
              <form onSubmit={handleSaveToken} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  className="input flex-1"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="shippo_live_..."
                  autoComplete="off"
                  required
                />
                <button type="submit" className="btn btn-primary text-sm" disabled={tokenSaving}>
                  {tokenSaving ? 'Checking...' : 'Connect'}
                </button>
              </form>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Ship-from address */}
            <div>
              <p className="text-zinc-200 font-medium mb-1">Ship-from address</p>
              <p className="text-xs text-zinc-500 mb-3">Printed as the return address on labels and invoices</p>
              <div className="grid grid-cols-2 gap-3">
                {addressFields.map((f) => (
                  <div key={f.key} className={f.half ? 'col-span-1' : 'col-span-2'}>
                    <label className="label">{f.label}</label>
                    <input
                      type={f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : 'text'}
                      className="input"
                      value={address[f.key] || ''}
                      onChange={(e) => setAddress((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      required={f.required}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Package presets */}
            <div>
              <p className="text-zinc-200 font-medium mb-1">Packages</p>
              <p className="text-xs text-zinc-500 mb-3">
                Boxes and mailers you use, in inches. The weight is the usual packed weight in ounces; you can change it per order.
              </p>
              <div className="space-y-3">
                {packages.map((p, i) => (
                  <div key={i} className="p-3 bg-surface-700/50 rounded-lg border border-surface-600 space-y-2">
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        value={p.name}
                        onChange={(e) => updatePackage(i, 'name', e.target.value)}
                        placeholder="Name, e.g. Small mailer"
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-secondary px-3"
                        onClick={() => setPackages((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove package"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(['length', 'width', 'height', 'weight_oz'] as const).map((field) => (
                        <div key={field}>
                          <label className="text-xs text-zinc-500">
                            {field === 'weight_oz' ? 'Weight oz' : field[0].toUpperCase() + field.slice(1)}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min={field === 'weight_oz' ? 0 : 0.1}
                            className="input"
                            value={p[field]}
                            onChange={(e) => updatePackage(i, field, e.target.value)}
                            required={field !== 'weight_oz'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary text-sm flex items-center gap-2"
                  onClick={() =>
                    setPackages((prev) => [...prev, { name: '', length: '', width: '', height: '', weight_oz: '' }])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add package
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save shipping settings'}
              </button>
              {saved && <span className="text-sm text-green-400">Saved</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
