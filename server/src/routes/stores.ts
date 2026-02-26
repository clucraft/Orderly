import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import {
  generateCodeVerifier,
  generateState,
  generateOAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getShopInfo,
} from '../services/etsy.js'

const router = Router()

// In-memory store for OAuth state (code verifier + state per connection id)
// In production, consider storing in DB or Redis
const oauthPending = new Map<number, { codeVerifier: string; state: string }>()

// GET /api/stores — list user's connected stores
router.get('/', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const { rows } = await pool.query(
    `SELECT id, platform, shop_id, shop_name, connected_at,
            CASE WHEN api_key IS NOT NULL THEN true ELSE false END as has_credentials,
            CASE WHEN access_token IS NOT NULL THEN true ELSE false END as is_connected
     FROM store_connections WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  )
  res.json({ stores: rows })
})

// POST /api/stores/etsy — save Etsy API key + secret (before OAuth)
router.post('/etsy', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const { apiKey, apiSecret } = req.body

  if (!apiKey || !apiSecret) {
    res.status(400).json({ message: 'API key and secret are required' })
    return
  }

  // Check if user already has an Etsy connection
  const { rows: existing } = await pool.query(
    'SELECT id FROM store_connections WHERE user_id = $1 AND platform = $2',
    [userId, 'etsy'],
  )

  if (existing.length > 0) {
    // Update existing
    await pool.query(
      'UPDATE store_connections SET api_key = $1, api_secret = $2 WHERE id = $3',
      [apiKey, apiSecret, existing[0].id],
    )
    res.json({ id: existing[0].id, message: 'Etsy credentials updated' })
    return
  }

  // Create new
  const { rows } = await pool.query(
    `INSERT INTO store_connections (user_id, platform, api_key, api_secret)
     VALUES ($1, 'etsy', $2, $3) RETURNING id`,
    [userId, apiKey, apiSecret],
  )
  res.json({ id: rows[0].id, message: 'Etsy credentials saved' })
})

// GET /api/stores/etsy/connect/:id — generate OAuth URL, redirect user to Etsy
router.get('/etsy/connect/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const connectionId = parseInt(String(req.params.id), 10)

  const { rows } = await pool.query(
    'SELECT * FROM store_connections WHERE id = $1 AND user_id = $2',
    [connectionId, userId],
  )

  if (rows.length === 0) {
    res.status(404).json({ message: 'Store connection not found' })
    return
  }

  const conn = rows[0]
  if (!conn.api_key) {
    res.status(400).json({ message: 'API key not configured' })
    return
  }

  const callbackUrl = process.env.ETSY_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/stores/etsy/callback`

  const codeVerifier = generateCodeVerifier()
  const state = generateState()

  // Store verifier + state + connectionId for callback
  oauthPending.set(connectionId, { codeVerifier, state })

  const authUrl = generateOAuthUrl(conn.api_key, callbackUrl, codeVerifier, `${connectionId}:${state}`)

  res.json({ url: authUrl })
})

// GET /api/stores/etsy/callback — handle Etsy OAuth redirect
router.get('/etsy/callback', async (req, res) => {
  const { code, state, error } = req.query

  if (error) {
    res.redirect('/?etsy_error=' + encodeURIComponent(String(error)))
    return
  }

  if (!code || !state) {
    res.redirect('/?etsy_error=missing_params')
    return
  }

  // Parse state = "connectionId:randomState"
  const stateStr = String(state)
  const colonIndex = stateStr.indexOf(':')
  if (colonIndex === -1) {
    res.redirect('/?etsy_error=invalid_state')
    return
  }

  const connectionId = parseInt(stateStr.slice(0, colonIndex), 10)
  const stateValue = stateStr.slice(colonIndex + 1)

  const pending = oauthPending.get(connectionId)
  if (!pending || pending.state !== stateValue) {
    res.redirect('/?etsy_error=state_mismatch')
    return
  }

  oauthPending.delete(connectionId)

  try {
    // Fetch the connection to get api_key
    const { rows } = await pool.query('SELECT * FROM store_connections WHERE id = $1', [connectionId])
    if (rows.length === 0) {
      res.redirect('/?etsy_error=connection_not_found')
      return
    }

    const conn = rows[0]
    const callbackUrl = process.env.ETSY_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/stores/etsy/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      conn.api_key,
      String(code),
      pending.codeVerifier,
      callbackUrl,
    )

    // Get shop info
    const shop = await getShopInfo(conn.api_key, tokens.access_token)

    // Store tokens and shop info
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    await pool.query(
      `UPDATE store_connections
       SET access_token = $1, refresh_token = $2, token_expires_at = $3,
           shop_id = $4, shop_name = $5, connected_at = NOW()
       WHERE id = $6`,
      [tokens.access_token, tokens.refresh_token, expiresAt, String(shop.shop_id), shop.shop_name, connectionId],
    )

    res.redirect('/settings?etsy_connected=true')
  } catch (err) {
    console.error('Etsy OAuth callback error:', err)
    const msg = err instanceof Error ? err.message : 'unknown'
    res.redirect('/settings?etsy_error=' + encodeURIComponent(msg))
  }
})

// DELETE /api/stores/:id — disconnect a store
router.delete('/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const connectionId = parseInt(String(req.params.id), 10)

  // Delete associated orders first
  await pool.query('DELETE FROM orders WHERE store_connection_id = $1', [connectionId])

  const { rowCount } = await pool.query(
    'DELETE FROM store_connections WHERE id = $1 AND user_id = $2',
    [connectionId, userId],
  )

  if (rowCount === 0) {
    res.status(404).json({ message: 'Store connection not found' })
    return
  }

  res.json({ message: 'Store disconnected' })
})

// Helper: ensure tokens are fresh (used by orders sync)
export async function ensureFreshTokens(connectionId: number) {
  const { rows } = await pool.query('SELECT * FROM store_connections WHERE id = $1', [connectionId])
  if (rows.length === 0) throw new Error('Connection not found')

  const conn = rows[0]
  if (!conn.access_token || !conn.refresh_token) throw new Error('Not connected')

  // Refresh if token expires within 5 minutes
  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const tokens = await refreshAccessToken(conn.api_key, conn.refresh_token)
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    await pool.query(
      `UPDATE store_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3 WHERE id = $4`,
      [tokens.access_token, tokens.refresh_token, newExpiresAt, connectionId],
    )
    return { ...conn, access_token: tokens.access_token }
  }

  return conn
}

export default router
