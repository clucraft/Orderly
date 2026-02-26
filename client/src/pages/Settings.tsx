import { Store, Key, Bell } from 'lucide-react'

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400 text-glow">Settings & Integrations</h1>
        <p className="text-zinc-500 mt-1">Configure store connections and preferences</p>
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Store className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Store Connections</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-surface-700/50 rounded-lg border border-surface-600">
              <div>
                <p className="text-zinc-200 font-medium">Shopify</p>
                <p className="text-xs text-zinc-500">Not connected</p>
              </div>
              <button className="btn btn-secondary text-sm" disabled>Connect</button>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-700/50 rounded-lg border border-surface-600">
              <div>
                <p className="text-zinc-200 font-medium">Etsy</p>
                <p className="text-xs text-zinc-500">Not connected</p>
              </div>
              <button className="btn btn-secondary text-sm" disabled>Connect</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Key className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">API Keys</h2>
          </div>
          <p className="text-sm text-zinc-500">API key management coming soon</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Notifications</h2>
          </div>
          <p className="text-sm text-zinc-500">Notification preferences coming soon</p>
        </div>
      </div>
    </div>
  )
}
