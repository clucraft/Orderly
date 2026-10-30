import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { getReceipts, mapReceiptToOrder } from '../services/etsy.js'
import { getOrders as getShopifyOrders, mapShopifyOrder } from '../services/shopify.js'
import { ensureFreshTokens } from './stores.js'
import { upsertOrder } from '../services/orderStore.js'
import {
  createShipment,
  downloadLabel,
  getShippoSettings,
  isTestToken,
  purchaseLabel,
  syncShippoOrders,
  type QuotedRate,
  type ShippoAddress,
} from '../services/shippo.js'

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
    'SELECT id, platform, api_key, shop_id FROM store_connections WHERE user_id = $1 AND access_token IS NOT NULL',
    [userId],
  )
  const shippoToken = (await getShippoSettings(userId))?.api_token

  if (connections.length === 0 && !shippoToken) {
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
          await upsertOrder(conn.id, 'etsy', mapReceiptToOrder(receipt))
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
          await upsertOrder(conn.id, 'shopify', mapShopifyOrder(shopifyOrder))
          synced++
        }
      } catch (err) {
        console.error(`Sync error for connection ${conn.id}:`, err)
        errors.push(`Shopify (${conn.shop_id}): ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }
  }

  // After Shopify, so newly synced Shopify orders can be linked to their Shippo copies
  if (shippoToken) {
    try {
      synced += await syncShippoOrders(userId, shippoToken)
    } catch (err) {
      console.error(`Shippo sync error for user ${userId}:`, err)
      errors.push(`Shippo: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  res.json({ synced, errors })
})

// Finds an order owned by the user, or null
async function findUserOrder(orderId: number, userId: number) {
  const { rows } = await pool.query(
    `SELECT o.* FROM orders o
     JOIN store_connections sc ON o.store_connection_id = sc.id
     WHERE o.id = $1 AND sc.user_id = $2`,
    [orderId, userId],
  )
  return rows[0] || null
}

// The order's ship-to address in Shippo's format, or null if it's incomplete
function shippoAddressTo(order: any): ShippoAddress | null {
  const a = order.shipping_json?.address
  if (!a?.address1 || !a.city || !a.zip) return null
  const country = a.country_code || (/^[A-Za-z]{2}$/.test(a.country || '') ? a.country : '')
  if (!country) return null
  return {
    name: a.name || order.customer_name || '',
    street1: a.address1,
    street2: a.address2 || '',
    city: a.city,
    state: a.state || '',
    zip: a.zip,
    country: country.toUpperCase(),
    phone: a.phone || '',
  }
}

// Rates Orderly last showed for each order; a purchase must use one of them
const quotedRates = new Map<number, Map<string, QuotedRate>>()
// Orders with a label purchase in progress, so a double tap can't buy two labels
const purchasing = new Set<number>()

const parcelSchema = z.object({
  length: z.number().positive().max(108),
  width: z.number().positive().max(108),
  height: z.number().positive().max(108),
  weight_oz: z.number().positive().max(2400),
})

const LABEL_COLUMNS = 'id, carrier, service, tracking_code, tracking_url, cost, currency, test_mode, created_at'

// GET /api/orders/:id/label — the order's label (if any) and what's needed to buy one
router.get('/:id/label', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)

  const order = await findUserOrder(orderId, userId)
  if (!order) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const { rows: labels } = await pool.query(
    `SELECT ${LABEL_COLUMNS} FROM shipping_labels WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  )
  const settings = await getShippoSettings(userId)
  const token = settings?.api_token

  res.json({
    label: labels[0] || null,
    shippo: {
      connected: !!token,
      test_mode: token ? isTestToken(token) : false,
      from_address: settings?.from_address || null,
      packages: settings?.packages || [],
      linked: !!order.shippo_order_id,
      has_address: !!shippoAddressTo(order),
    },
  })
})

// POST /api/orders/:id/label/rates — get label prices from Shippo for a package
router.post('/:id/label/rates', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)

  const parsed = parcelSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Enter the package size (inches) and weight (ounces)' })
    return
  }

  const order = await findUserOrder(orderId, userId)
  if (!order) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const settings = await getShippoSettings(userId)
  if (!settings?.api_token) {
    res.status(400).json({ message: 'Connect Shippo in Settings first' })
    return
  }
  if (!settings.from_address) {
    res.status(400).json({ message: 'Add your ship-from address in Settings first' })
    return
  }
  const addressTo = shippoAddressTo(order)
  if (!addressTo) {
    res.status(400).json({ message: 'This order has no complete shipping address. Try syncing orders again.' })
    return
  }

  try {
    const { rates, messages } = await createShipment(settings.api_token, settings.from_address, addressTo, parsed.data)
    quotedRates.set(orderId, new Map(rates.map((r) => [r.id, r])))
    res.json({ rates, messages })
  } catch (err) {
    console.error(`Shippo rates error for order ${orderId}:`, err)
    res.status(502).json({ message: `Shippo: ${err instanceof Error ? err.message : 'unknown error'}` })
  }
})

// POST /api/orders/:id/label — buy the label for one of the quoted rates
router.post('/:id/label', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)
  const rateId = typeof req.body?.rate_id === 'string' ? req.body.rate_id : ''

  const order = await findUserOrder(orderId, userId)
  if (!order) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const rate = quotedRates.get(orderId)?.get(rateId)
  if (!rate) {
    res.status(409).json({ message: 'These prices have expired. Get rates again.' })
    return
  }

  const token = (await getShippoSettings(userId))?.api_token
  if (!token) {
    res.status(400).json({ message: 'Connect Shippo in Settings first' })
    return
  }

  if (purchasing.has(orderId)) {
    res.status(409).json({ message: 'A label is already being bought for this order' })
    return
  }
  purchasing.add(orderId)

  try {
    const { rows: existing } = await pool.query('SELECT id FROM shipping_labels WHERE order_id = $1 LIMIT 1', [orderId])
    if (existing.length > 0) {
      res.status(409).json({ message: 'This order already has a label' })
      return
    }

    const testMode = isTestToken(token)
    // Linking the label to the Shippo order is what sends the tracking number back to Etsy or Shopify
    const linkOrder = testMode ? null : order.shippo_order_id || null
    const transaction = await purchaseLabel(token, rateId, linkOrder)
    quotedRates.delete(orderId)

    if (transaction.status !== 'SUCCESS' || !transaction.label_url) {
      const detail = transaction.messages.map((m) => m.text).filter(Boolean).join(' ')
      res.status(502).json({ message: `Shippo couldn't create the label${detail ? `: ${detail}` : ''}` })
      return
    }

    // The label is paid for at this point, so save it even if the PDF download fails (printing retries it)
    const pdf = await downloadLabel(transaction.label_url).catch((err) => {
      console.error(`Label download failed for order ${orderId}:`, err)
      return null
    })

    const { rows } = await pool.query(
      `INSERT INTO shipping_labels (order_id, shippo_transaction_id, carrier, service, tracking_code,
         tracking_url, cost, currency, test_mode, label_url, label_pdf)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${LABEL_COLUMNS}`,
      [
        orderId,
        transaction.object_id,
        rate.provider,
        rate.service,
        transaction.tracking_number,
        transaction.tracking_url_provider,
        rate.amount,
        rate.currency,
        testMode,
        transaction.label_url,
        pdf,
      ],
    )

    // Test labels aren't real shipments, so they don't change the order
    if (!testMode) {
      await pool.query(
        `UPDATE orders SET
           status = CASE WHEN status IN ('pending', 'unfulfilled') THEN 'shipped' ELSE status END,
           shipping_json = shipping_json || jsonb_build_object('carrier', $2::text, 'tracking', $3::text),
           updated_at = NOW()
         WHERE id = $1`,
        [orderId, rate.provider, transaction.tracking_number || ''],
      )
    }

    res.status(201).json({ label: rows[0], tracking_sent: !!linkOrder })
  } catch (err) {
    console.error(`Label purchase error for order ${orderId}:`, err)
    res.status(502).json({ message: `Shippo: ${err instanceof Error ? err.message : 'unknown error'}` })
  } finally {
    purchasing.delete(orderId)
  }
})

// GET /api/orders/:id/label/pdf — the latest label PDF
router.get('/:id/label/pdf', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const orderId = parseInt(req.params.id as string)

  const order = await findUserOrder(orderId, userId)
  if (!order) {
    res.status(404).json({ message: 'Order not found' })
    return
  }

  const { rows } = await pool.query(
    'SELECT id, label_pdf, label_url FROM shipping_labels WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
    [orderId],
  )
  if (rows.length === 0) {
    res.status(404).json({ message: 'No label for this order' })
    return
  }

  let pdf: Buffer | null = rows[0].label_pdf
  if (!pdf) {
    try {
      pdf = await downloadLabel(rows[0].label_url)
      await pool.query('UPDATE shipping_labels SET label_pdf = $1 WHERE id = $2', [pdf, rows[0].id])
    } catch (err) {
      console.error(`Label download failed for order ${orderId}:`, err)
      res.status(502).json({ message: 'Could not download the label from Shippo. Try again.' })
      return
    }
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="label-${order.external_id}.pdf"`)
  res.send(pdf)
})

export default router
