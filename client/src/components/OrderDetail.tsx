import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ExternalLink, Truck, MessageSquare, Send } from 'lucide-react'
import { api } from '../services/api'
import type { Order, OrderNote, OrderStatus } from '../types'

const statusBadgeClass: Record<OrderStatus, string> = {
  pending: 'badge-pending',
  unfulfilled: 'badge-unfulfilled',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

interface Props {
  order: Order | null
  onClose: () => void
}

export default function OrderDetail({ order, onClose }: Props) {
  const [notes, setNotes] = useState<OrderNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadNotes = useCallback(async () => {
    if (!order) return
    try {
      const res = await api.get(`/orders/${order.id}/notes`)
      setNotes(res.data.notes)
    } catch {
      // ignore
    }
  }, [order])

  useEffect(() => {
    if (order) {
      loadNotes()
      setNoteText('')
    } else {
      setNotes([])
    }
  }, [order, loadNotes])

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (order) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [order, onClose])

  async function handleAddNote() {
    if (!order || !noteText.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await api.post(`/orders/${order.id}/notes`, { content: noteText.trim() })
      setNotes((prev) => [...prev, res.data.note])
      setNoteText('')
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleAddNote()
    }
  }

  const shipping = order?.shipping_json
  const items = order?.items_json || []
  const address = shipping?.address

  // Build Shopify admin deep link
  const shopifyLink =
    order?.platform === 'shopify' && order.store_url
      ? `https://${order.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/admin/orders/${order.external_id}`
      : null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          order ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-surface-800 border-l border-surface-600 z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          order ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {order && (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">
                  Order #{order.receipt_id || order.external_id}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`badge ${statusBadgeClass[order.status] || 'badge-pending'}`}>
                    {order.status}
                  </span>
                  <span className="badge bg-surface-700 text-zinc-300 border border-surface-600 capitalize">
                    {order.platform}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Customer */}
            <section>
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">Customer</h3>
              <div className="card !p-4 space-y-1">
                <p className="text-zinc-200 font-medium">{order.customer_name || '—'}</p>
                {order.customer_email && (
                  <p className="text-zinc-400 text-sm">{order.customer_email}</p>
                )}
              </div>
            </section>

            {/* Ship To */}
            {address && (address.address1 || address.city) && (
              <section>
                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">Ship To</h3>
                <div className="card !p-4 space-y-1 text-sm text-zinc-300">
                  {address.name && <p className="font-medium text-zinc-200">{address.name}</p>}
                  {address.address1 && <p>{address.address1}</p>}
                  {address.address2 && <p>{address.address2}</p>}
                  <p>
                    {[address.city, address.state, address.zip].filter(Boolean).join(', ')}
                  </p>
                  {address.country && <p>{address.country}</p>}
                  {address.phone && <p className="text-zinc-500">{address.phone}</p>}
                </div>
              </section>
            )}

            {/* Items */}
            {items.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">Items</h3>
                <div className="card !p-0 overflow-hidden">
                  <table>
                    <thead>
                      <tr className="border-b border-surface-600">
                        <th className="p-3 text-left">Product</th>
                        <th className="p-3 text-right">Qty</th>
                        <th className="p-3 text-right">Price</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} className="border-b border-surface-700 last:border-0">
                          <td className="p-3 text-sm">{item.title}</td>
                          <td className="p-3 text-right text-sm">{item.quantity}</td>
                          <td className="p-3 text-right text-sm">
                            {formatCents(Math.round(item.price * 100), item.currency || order.currency)}
                          </td>
                          <td className="p-3 text-right text-sm font-medium">
                            {formatCents(Math.round(item.price * item.quantity * 100), item.currency || order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Total Paid */}
            <section>
              <div className="flex items-center justify-between card !p-4">
                <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Total Paid</span>
                <span className="text-lg font-bold text-primary-400">
                  {formatCents(order.total, order.currency)}
                </span>
              </div>
            </section>

            {/* Tracking */}
            {shipping?.carrier && (
              <section>
                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">Tracking</h3>
                <div className="card !p-4 flex items-center gap-3">
                  <Truck className="h-5 w-5 text-primary-400 shrink-0" />
                  <div>
                    {shipping.carrier && (
                      <p className="text-zinc-200 text-sm font-medium">{shipping.carrier}</p>
                    )}
                    {shipping.tracking && (
                      <p className="text-zinc-400 text-sm font-mono">{shipping.tracking}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Shopify Deep Link */}
            {shopifyLink && (
              <a
                href={shopifyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Buy Label in Shopify
              </a>
            )}

            {/* Notes */}
            <section>
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Notes
              </h3>

              <div className="space-y-3">
                {notes.length === 0 && (
                  <p className="text-zinc-600 text-sm">No notes yet</p>
                )}

                {notes.map((note) => (
                  <div key={note.id} className="card !p-3 space-y-1">
                    <p className="text-zinc-300 text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between text-xs text-zinc-600">
                      <span>{note.author}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}

                {/* Add Note */}
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    className="input flex-1 resize-none text-sm"
                    rows={2}
                    placeholder="Add a note... (Ctrl+Enter to submit)"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={2000}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || submitting}
                    className="btn btn-primary self-end px-3"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  )
}
