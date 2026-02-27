import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Store, Key, Bell, ExternalLink, Trash2, Check } from 'lucide-react'
import { api } from '../services/api'
import type { StoreConnection } from '../types'

export default function Settings() {
  const [stores, setStores] = useState<StoreConnection[]>([])
  const [loading, setLoading] = useState(true)

  // Etsy credential form
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Shopify form
  const [shopifyUrl, setShopifyUrl] = useState('')
  const [shopifyClientId, setShopifyClientId] = useState('')
  const [shopifyClientSecret, setShopifyClientSecret] = useState('')
  const [shopifySaving, setShopifySaving] = useState(false)

  // Connection status message from URL params
  const [statusMsg, setStatusMsg] = useState('')

  const fetchStores = useCallback(async () => {
    try {
      const res = await api.get('/stores')
      setStores(res.data.stores)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()

    // Check URL params for OAuth callback status
    const params = new URLSearchParams(window.location.search)
    if (params.get('etsy_connected') === 'true') {
      setStatusMsg('Etsy store connected successfully!')
      window.history.replaceState({}, '', '/settings')
    } else if (params.get('etsy_error')) {
      setStatusMsg(`Etsy connection error: ${params.get('etsy_error')}`)
      window.history.replaceState({}, '', '/settings')
    } else if (params.get('shopify_connected') === 'true') {
      setStatusMsg('Shopify store connected successfully!')
      window.history.replaceState({}, '', '/settings')
    } else if (params.get('shopify_error')) {
      setStatusMsg(`Shopify connection error: ${params.get('shopify_error')}`)
      window.history.replaceState({}, '', '/settings')
    }
  }, [fetchStores])

  const etsyConnection = stores.find((s) => s.platform === 'etsy')
  const shopifyConnection = stores.find((s) => s.platform === 'shopify')

  async function handleSaveCredentials(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await api.post('/stores/etsy', { apiKey, apiSecret })
      setApiKey('')
      setApiSecret('')
      await fetchStores()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleConnect(id: number) {
    try {
      const res = await api.get(`/stores/etsy/connect/${id}`)
      // Redirect user to Etsy OAuth
      window.location.href = res.data.url
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to start OAuth')
    }
  }

  async function handleShopifySaveCredentials(e: FormEvent) {
    e.preventDefault()
    setShopifySaving(true)
    setSaveError('')
    try {
      await api.post('/stores/shopify', { storeUrl: shopifyUrl, clientId: shopifyClientId, clientSecret: shopifyClientSecret })
      setShopifyUrl('')
      setShopifyClientId('')
      setShopifyClientSecret('')
      await fetchStores()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save Shopify credentials')
    } finally {
      setShopifySaving(false)
    }
  }

  async function handleShopifyOAuth(id: number) {
    try {
      const res = await api.get(`/stores/shopify/connect/${id}`)
      window.location.href = res.data.url
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to start Shopify OAuth')
    }
  }

  async function handleDisconnect(id: number) {
    try {
      await api.delete(`/stores/${id}`)
      await fetchStores()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-400 text-glow">Settings & Integrations</h1>
        <p className="text-zinc-500 mt-1">Configure store connections and preferences</p>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          statusMsg.includes('error')
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }`}>
          {statusMsg}
        </div>
      )}

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Store className="h-6 w-6 text-primary-400" />
            <h2 className="text-lg font-semibold text-zinc-200">Store Connections</h2>
          </div>

          {saveError && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {saveError}
            </div>
          )}

          <div className="space-y-3">
            {/* Etsy */}
            {loading ? (
              <div className="p-3 bg-surface-700/50 rounded-lg border border-surface-600 text-zinc-500 text-sm">
                Loading...
              </div>
            ) : etsyConnection?.is_connected ? (
              /* Connected state */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-green-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-200 font-medium">Etsy</p>
                      <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">
                        <Check className="h-3 w-3 mr-1" />Connected
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Shop: <span className="text-primary-400">{etsyConnection.shop_name}</span>
                    </p>
                    {etsyConnection.connected_at && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Connected {new Date(etsyConnection.connected_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn btn-danger text-sm flex items-center gap-2"
                    onClick={() => handleDisconnect(etsyConnection.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : etsyConnection?.has_credentials ? (
              /* Credentials saved, not yet connected via OAuth */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-amber-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-200 font-medium">Etsy</p>
                      <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Credentials saved
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Click connect to authorize with Etsy
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary text-sm flex items-center gap-2"
                      onClick={() => handleConnect(etsyConnection.id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Connect to Etsy
                    </button>
                    <button
                      className="btn btn-danger text-sm"
                      onClick={() => handleDisconnect(etsyConnection.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* No credentials yet — show form */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-surface-600">
                <p className="text-zinc-200 font-medium mb-3">Etsy</p>
                <form onSubmit={handleSaveCredentials} className="space-y-3">
                  <div>
                    <label className="label">API Key (Keystring)</label>
                    <input
                      type="text"
                      className="input"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Etsy API key"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Shared Secret</label>
                    <input
                      type="password"
                      className="input"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Enter your Etsy shared secret"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary text-sm" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Credentials'}
                  </button>
                </form>
              </div>
            )}

            {/* Shopify */}
            {shopifyConnection?.is_connected ? (
              /* Connected state */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-green-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-200 font-medium">Shopify</p>
                      <span className="badge bg-green-500/20 text-green-400 border border-green-500/30">
                        <Check className="h-3 w-3 mr-1" />Connected
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Shop: <span className="text-primary-400">{shopifyConnection.shop_name}</span>
                    </p>
                    {shopifyConnection.connected_at && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Connected {new Date(shopifyConnection.connected_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn btn-danger text-sm flex items-center gap-2"
                    onClick={() => handleDisconnect(shopifyConnection.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : shopifyConnection?.has_credentials ? (
              /* Credentials saved, not yet connected via OAuth */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-amber-500/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-zinc-200 font-medium">Shopify</p>
                      <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Credentials saved
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Click connect to authorize with Shopify
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary text-sm flex items-center gap-2"
                      onClick={() => handleShopifyOAuth(shopifyConnection.id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Connect to Shopify
                    </button>
                    <button
                      className="btn btn-danger text-sm"
                      onClick={() => handleDisconnect(shopifyConnection.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* No credentials yet — show form */
              <div className="p-4 bg-surface-700/50 rounded-lg border border-surface-600">
                <p className="text-zinc-200 font-medium mb-3">Shopify</p>
                <form onSubmit={handleShopifySaveCredentials} className="space-y-3">
                  <div>
                    <label className="label">Store URL</label>
                    <input
                      type="text"
                      className="input"
                      value={shopifyUrl}
                      onChange={(e) => setShopifyUrl(e.target.value)}
                      placeholder="my-store.myshopify.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Client ID</label>
                    <input
                      type="text"
                      className="input"
                      value={shopifyClientId}
                      onChange={(e) => setShopifyClientId(e.target.value)}
                      placeholder="Enter your app's Client ID"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Client Secret</label>
                    <input
                      type="password"
                      className="input"
                      value={shopifyClientSecret}
                      onChange={(e) => setShopifyClientSecret(e.target.value)}
                      placeholder="Enter your app's Client Secret"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary text-sm" disabled={shopifySaving}>
                    {shopifySaving ? 'Saving...' : 'Save Credentials'}
                  </button>
                </form>
              </div>
            )}
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
