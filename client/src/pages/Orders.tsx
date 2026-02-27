import { useState, useEffect, useCallback } from 'react'
import { ShoppingBag, RefreshCw, Search } from 'lucide-react'
import { api } from '../services/api'
import type { Order, OrderStatus } from '../types'
import OrderDetail from '../components/OrderDetail'

const statusBadgeClass: Record<OrderStatus, string> = {
  pending: 'badge-pending',
  unfulfilled: 'badge-unfulfilled',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  async function handleRowClick(orderId: number) {
    try {
      const res = await api.get(`/orders/${orderId}`)
      setSelectedOrder(res.data.order)
    } catch {
      // ignore
    }
  }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get('/orders')
      setOrders(res.data.orders)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  async function handleSync() {
    setSyncing(true)
    setSyncResult('')
    try {
      const res = await api.post('/orders/sync')
      setSyncResult(
        `Synced ${res.data.synced} order(s)` +
          (res.data.errors.length ? `. Errors: ${res.data.errors.join(', ')}` : ''),
      )
      await fetchOrders()
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const filtered = search
    ? orders.filter(
        (o) =>
          o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          o.external_id.includes(search) ||
          o.receipt_id?.includes(search),
      )
    : orders

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 text-glow">Order Management</h1>
          <p className="text-zinc-500 mt-1">View and manage orders across all platforms</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Orders'}
        </button>
      </div>

      {syncResult && (
        <div className={`p-3 rounded-lg text-sm ${
          syncResult.includes('Errors') || syncResult.includes('failed')
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }`}>
          {syncResult}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search orders..."
              className="input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <p className="animate-pulse">Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <div className="text-center">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{orders.length === 0 ? 'No orders yet' : 'No matching orders'}</p>
              {orders.length === 0 && (
                <p className="text-sm mt-1 text-zinc-600">
                  Connect a store in Settings, then click "Sync Orders"
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="pb-3 pr-4">Order #</th>
                  <th className="pb-3 pr-4">Platform</th>
                  <th className="pb-3 pr-4">Customer</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4 text-right">Total</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-surface-700 hover:bg-surface-700/30 cursor-pointer" onClick={() => handleRowClick(order.id)}>
                    <td className="py-3 pr-4 font-medium">#{order.receipt_id || order.external_id}</td>
                    <td className="py-3 pr-4 capitalize">{order.platform}</td>
                    <td className="py-3 pr-4">{order.customer_name || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`badge ${statusBadgeClass[order.status] || 'badge-pending'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">{formatCents(order.total, order.currency)}</td>
                    <td className="py-3 text-zinc-500 text-sm">
                      {order.platform_created_at
                        ? new Date(order.platform_created_at).toLocaleDateString()
                        : new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  )
}
