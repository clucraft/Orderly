import { ShoppingBag, Filter, Search } from 'lucide-react'

export default function Orders() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 text-glow">Order Management</h1>
          <p className="text-zinc-500 mt-1">View and manage orders across all platforms</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search orders..."
              className="input pl-10"
              disabled
            />
          </div>
        </div>

        <div className="flex items-center justify-center py-16 text-zinc-500">
          <div className="text-center">
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No orders yet</p>
            <p className="text-sm mt-1 text-zinc-600">Orders will appear here once store integrations are configured</p>
          </div>
        </div>
      </div>
    </div>
  )
}
