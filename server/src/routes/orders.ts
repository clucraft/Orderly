import { Router } from 'express'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getReceipts, mapReceiptToOrder } from '../services/etsy.js'
import { getOrders as getShopifyOrders, mapShopifyOrder } from '../services/shopify.js'
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

// GET /api/orders/:id — full order detail with store info
router.get('/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)

  const { rows } = await pool.query(
    `SELECT o.*, sc.refresh_token as store_url, sc.shop_name
     FROM orders o
     JOIN store_connections sc ON o.store_connection_id = sc.id
     WHERE o.id = $1 AND sc.user_id = $2`,
    [orderId, userId],
  )

  if (rows.length === 0) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  res.json({ order: rows[0] })
})

// GET /api/orders/:id/notes — list notes for an order
router.get('/:id/notes', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)

  // Verify the order belongs to the user
  const { rows: orderCheck } = await pool.query(
    `SELECT o.id FROM orders o
     JOIN store_connections sc ON o.store_connection_id = sc.id
     WHERE o.id = $1 AND sc.user_id = $2`,
    [orderId, userId],
  )

  if (orderCheck.length === 0) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const { rows: notes } = await pool.query(
    `SELECT n.id, n.content, n.created_at, u.display_name as author
     FROM order_notes n
     JOIN users u ON n.user_id = u.id
     WHERE n.order_id = $1
     ORDER BY n.created_at ASC`,
    [orderId],
  )

  res.json({ notes })
})

// POST /api/orders/:id/notes — add a note to an order
router.post('/:id/notes', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)
  const { content } = req.body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ message: 'Content is required' })
    return
  }

  if (content.length > 2000) {
    res.status(400).json({ message: 'Content must be 2000 characters or less' })
    return
  }

  // Verify the order belongs to the user
  const { rows: orderCheck } = await pool.query(
    `SELECT o.id FROM orders o
     JOIN store_connections sc ON o.store_connection_id = sc.id
     WHERE o.id = $1 AND sc.user_id = $2`,
    [orderId, userId],
  )

  if (orderCheck.length === 0) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const { rows } = await pool.query(
    `INSERT INTO order_notes (order_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, content, created_at`,
    [orderId, userId, content.trim()],
  )

  // Fetch the author name to return
  const { rows: userRows } = await pool.query(
    'SELECT display_name FROM users WHERE id = $1',
    [userId],
  )

  res.status(201).json({
    note: { ...rows[0], author: userRows[0]?.display_name || 'Unknown' },
  })
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
    } else if (conn.platform === 'shopify') {
      try {
        // refresh_token = store URL, access_token = offline token (doesn't expire)
        const { rows: connRows } = await pool.query(
          'SELECT refresh_token, access_token FROM store_connections WHERE id = $1',
          [conn.id],
        )
        const shopifyConn = connRows[0]
        const orders = await getShopifyOrders(shopifyConn.refresh_token, shopifyConn.access_token, { limit: 100 })

        for (const shopifyOrder of orders) {
          const order = mapShopifyOrder(shopifyOrder)

          await pool.query(
            `INSERT INTO orders (store_connection_id, platform, external_id, receipt_id,
              customer_name, customer_email, status, total, currency,
              items_json, shipping_json, platform_created_at)
             VALUES ($1, 'shopify', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        errors.push(`Shopify (${conn.shop_id}): ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }
  }

  res.json({ synced, errors })
})

export default router
