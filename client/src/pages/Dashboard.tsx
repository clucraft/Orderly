import { useState, useEffect } from 'react'
import { LayoutDashboard, ShoppingBag, Truck, Package } from 'lucide-react'
import { api } from '../services/api'
import type { Order, OrderStatus } from '../types'

const statusBadgeClass: Record<OrderStatus, string> = {
  pending: 'badge-pending',
  unfulfilled: 'badge-unfulfilled',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
}

interface Stats {
  total: number
  unfulfilled: number
  shipped: number
  delivered: number
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, unfulfilled: 0, shipped: 0, delivered: 0 })
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          api.get('/orders/stats'),
          api.get('/orders'),
        ])
        setStats(statsRes.data)
        setRecentOrders(ordersRes.data.orders.slice(0, 5))
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards = [
    { label: 'Total Orders', value: stats.total, icon: ShoppingBag, color: 'text-primary-400' },
    { label: 'Unfulfilled', value: stats.unfulfilled, icon: Package, color: 'text-amber-400' },
    { label: 'In Transit', value: stats.shipped, icon: Truck, color: 'text-blue-400' },
    { label: 'Delivered', value: stats.delivered, icon: LayoutDashboard, color: 'text-green-400' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400 text-glow">Unified Orders Dashboard</h1>
        <p className="text-zinc-500 mt-1">Manage Shopify & Etsy orders in one place</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card">
            <div className="flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold text-zinc-200">
                  {loading ? '—' : stat.value}
                </p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Recent Orders</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500 animate-pulse">
            Loading...
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <div className="text-center">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Connect your Shopify or Etsy store to see orders here</p>
              <p className="text-sm mt-1 text-zinc-600">Go to Settings to connect a store</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="pb-3 pr-4">Order #</th>
                  <th className="pb-3 pr-4">Customer</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4 text-right">Total</th>
                  <th className="pb-3 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-surface-700">
                    <td className="py-3 pr-4 font-medium">#{order.receipt_id || order.external_id}</td>
                    <td className="py-3 pr-4">
                      <div>{order.customer_name || '—'}</div>
                      {order.items_json?.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {order.items_json.map((item, i) => (
                            <div key={i}>
                              <p className="text-xs text-zinc-500">{item.title} ×{item.quantity}</p>
                              {item.options?.map((opt, j) => (
                                <p key={j} className="text-[11px] text-zinc-600 pl-2">{opt.name}: {opt.value}</p>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`badge ${statusBadgeClass[order.status] || 'badge-pending'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">{formatCents(order.total, order.currency)}</td>
                    <td className="py-3 text-zinc-500 text-sm hidden sm:table-cell">
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
    </div>
  )
}
