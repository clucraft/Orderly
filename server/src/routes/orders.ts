import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getReceipts, mapReceiptToOrder } from '../services/etsy.js'
import { ensureFreshTokens } from './stores.js'

const router = Router()

// GET /api/orders — list all orders (with optional filters)
router.get('/', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const { platform, status } = req.query

  let query = `
    SELECT o.* FROM orders o
    JOIN store_connections sc ON o.store_connection_id = sc.id
    WHERE sc.user_id = $1
  `
  const params: unknown[] = [userId]

  if (platform) {
    params.push(String(platform))
    query += ` AND o.platform = $${params.length}`
  }

  if (status) {
    params.push(String(status))
    query += ` AND o.status = $${params.length}`
  }

  query += ' ORDER BY o.platform_created_at DESC NULLS LAST, o.created_at DESC'

  const { rows } = await pool.query(query, params)
  res.json({ orders: rows })
})

// GET /api/orders/stats — get order count stats
router.get('/stats', requireAuth, async (req, res) => {
  const userId = (req as any).userId

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE o.status = 'unfulfilled')::int as unfulfilled,
       COUNT(*) FILTER (WHERE o.status = 'shipped')::int as shipped,
       COUNT(*) FILTER (WHERE o.status = 'delivered')::int as delivered
     FROM orders o
     JOIN store_connections sc ON o.store_connection_id = sc.id
     WHERE sc.user_id = $1`,
    [userId],
  )

  res.json(rows[0])
})

// POST /api/orders/sync — trigger manual sync from all connected stores
router.post('/sync', requireAuth, async (req, res) => {
  const userId = (req as any).userId

  const { rows: connections } = await pool.query(
    `SELECT id, platform, api_key, shop_id FROM store_connections
     WHERE user_id = $1 AND access_token IS NOT NULL`,
    [userId],
  )

  if (connections.length === 0) {
    res.status(400).json({ message: 'No connected stores to sync' })
    return
  }

  let synced = 0
  const errors: string[] = []

  for (const conn of connections) {
    if (conn.platform === 'etsy') {
      try {
        const freshConn = await ensureFreshTokens(conn.id)
        const data = await getReceipts(freshConn.api_key, freshConn.access_token, freshConn.shop_id, { limit: 100 })

        for (const receipt of data.results) {
          const order = mapReceiptToOrder(receipt)

          await pool.query(
            `INSERT INTO orders (store_connection_id, platform, external_id, receipt_id,
              customer_name, customer_email, status, total, currency,
              items_json, shipping_json, platform_created_at)
             VALUES ($1, 'etsy', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (platform, external_id) DO UPDATE SET
              customer_name = EXCLUDED.customer_name,
              customer_email = EXCLUDED.customer_email,
              status = EXCLUDED.status,
              total = EXCLUDED.total,
              items_json = EXCLUDED.items_json,
              shipping_json = EXCLUDED.shipping_json,
              updated_at = NOW()`,
            [
              conn.id,
              order.external_id,
              order.receipt_id,
              order.customer_name,
              order.customer_email,
              order.status,
              order.total,
              order.currency,
              order.items_json,
              order.shipping_json,
              order.platform_created_at,
            ],
          )
          synced++
        }
      } catch (err) {
        console.error(`Sync error for connection ${conn.id}:`, err)
        errors.push(`Etsy (${conn.shop_id}): ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }
  }

  res.json({ synced, errors })
})

export default router
