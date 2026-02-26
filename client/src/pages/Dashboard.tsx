import { LayoutDashboard, ShoppingBag, Truck, Package } from 'lucide-react'

const stats = [
  { label: 'Total Orders', value: '—', icon: ShoppingBag, color: 'text-primary-400' },
  { label: 'Unfulfilled', value: '—', icon: Package, color: 'text-amber-400' },
  { label: 'In Transit', value: '—', icon: Truck, color: 'text-blue-400' },
  { label: 'Delivered', value: '—', icon: LayoutDashboard, color: 'text-green-400' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400 text-glow">Unified Orders Dashboard</h1>
        <p className="text-zinc-500 mt-1">Manage Shopify & Etsy orders in one place</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold text-zinc-200">{stat.value}</p>
                <p className="text-xs text-zinc-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Recent Orders</h2>
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <div className="text-center">
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Connect your Shopify or Etsy store to see orders here</p>
            <p className="text-sm mt-1 text-zinc-600">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
