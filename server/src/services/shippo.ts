import { pool } from '../db.js'
import { upsertOrder, type MappedOrder } from './orderStore.js'

const SHIPPO_API = 'https://api.goshippo.com'
// How far back each sync looks for orders
const SYNC_DAYS = 90
const SYNC_MAX_PAGES = 10

export interface ShippoAddress {
  name: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

export interface PackagePreset {
  name: string
  length: number
  width: number
  height: number
  weight_oz: number
}

export interface ShippoSettings {
  api_token: string | null
  from_address: ShippoAddress | null
  packages: PackagePreset[]
}

interface ShippoOrder {
  object_id: string
  order_number?: string | null
  order_status: string
  placed_at: string
  to_address: Partial<ShippoAddress>
  line_items?: Array<{
    title?: string
    variant_title?: string | null
    quantity?: number
    total_price?: string | null
    currency?: string | null
  }>
  shipping_method?: string | null
  total_price?: string | null
  currency?: string | null
  weight?: string | null
  weight_unit?: string | null
  notes?: string | null
  shop_app?: string
  transactions?: Array<{ tracking_number?: string | null }>
}

interface ShippoRate {
  object_id: string
  amount: string
  currency: string
  provider: string
  servicelevel: { name: string; token: string }
  estimated_days: number | null
  duration_terms: string | null
  attributes: string[]
}

interface ShippoMessage {
  source?: string
  code?: string
  text: string
}

interface ShippoShipment {
  object_id: string
  status: string
  rates: ShippoRate[]
  messages: ShippoMessage[]
}

export interface ShippoTransaction {
  object_id: string
  status: string
  label_url: string | null
  tracking_number: string | null
  tracking_url_provider: string | null
  messages: ShippoMessage[]
}

export class ShippoError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export function isTestToken(token: string): boolean {
  return token.startsWith('shippo_test_')
}

async function shippoRequest<T>(token: string, method: string, pathOrUrl: string, body?: unknown): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${SHIPPO_API}${pathOrUrl}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const text = await res.text()
    let message = text.slice(0, 300)
    try {
      const data = JSON.parse(text)
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data).slice(0, 300)
    } catch {
      // not JSON
    }
    if (res.status === 401) message = 'Shippo rejected the API token'
    throw new ShippoError(message, res.status)
  }

  return res.json() as Promise<T>
}

// Throws if Shippo doesn't accept the token
export async function checkToken(token: string) {
  await shippoRequest(token, 'GET', '/orders/?results=1')
}

export async function getShippoSettings(userId: number): Promise<ShippoSettings | null> {
  const { rows } = await pool.query(
    'SELECT api_token, from_address, packages FROM shippo_settings WHERE user_id = $1',
    [userId],
  )
  return rows[0] || null
}

async function listOrders(token: string, shopApp: string): Promise<ShippoOrder[]> {
  const since = new Date(Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const params = new URLSearchParams({ shop_app: shopApp, start_date: since, results: '100' })
  let next: string | null = `/orders/?${params.toString()}`
  const orders: ShippoOrder[] = []

  for (let page = 0; next && page < SYNC_MAX_PAGES; page++) {
    const data: { results: ShippoOrder[]; next: string | null } = await shippoRequest(token, 'GET', next)
    orders.push(...data.results)
    next = data.next
  }
  return orders
}

function toCents(amount: string | null | undefined): number {
  const value = parseFloat(amount || '0')
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function orderNumber(order: ShippoOrder): string {
  return (order.order_number || '').replace(/^#/, '').trim()
}

function mapShippoStatus(status: string): string {
  switch (status) {
    case 'PAID':
      return 'unfulfilled'
    case 'SHIPPED':
    case 'PARTIALLY_FULFILLED':
      return 'shipped'
    case 'CANCELLED':
    case 'REFUNDED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

// Variant titles look like "Color: Blue, Size: Large"; anything else is kept whole
function parseVariant(variant: string | null | undefined): Array<{ name: string; value: string }> {
  if (!variant) return []
  const parts = variant.split(/,\s*/)
  if (parts.every((p) => p.includes(':'))) {
    return parts.map((p) => {
      const i = p.indexOf(':')
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() }
    })
  }
  return [{ name: 'Variant', value: variant }]
}

function mapShippoOrder(order: ShippoOrder): MappedOrder {
  const currency = order.currency || 'USD'
  const to = order.to_address || {}

  const items = (order.line_items || []).map((li) => {
    const quantity = li.quantity || 1
    return {
      title: li.title || '',
      quantity,
      price: toCents(li.total_price) / 100 / quantity,
      currency: li.currency || currency,
      options: parseVariant(li.variant_title),
    }
  })

  const shipping: Record<string, unknown> = {
    method: order.shipping_method || '',
    notes: order.notes || '',
    address: {
      name: to.name || '',
      address1: to.street1 || '',
      address2: to.street2 || '',
      city: to.city || '',
      state: to.state || '',
      zip: to.zip || '',
      country: to.country || '',
      country_code: to.country || '',
      phone: to.phone || '',
    },
  }
  const weight = parseFloat(order.weight || '')
  if (weight > 0 && order.weight_unit) shipping.weight = { value: weight, unit: order.weight_unit }

  const tracking = order.transactions?.find((t) => t.tracking_number)?.tracking_number
  if (tracking) shipping.tracking = tracking

  const number = orderNumber(order) || order.object_id
  return {
    external_id: number,
    receipt_id: number,
    customer_name: to.name || '',
    customer_email: to.email || '',
    status: mapShippoStatus(order.order_status),
    total: toCents(order.total_price),
    currency,
    items_json: JSON.stringify(items),
    shipping_json: JSON.stringify(shipping),
    platform_created_at: order.placed_at || null,
  }
}

// Finds the user's Etsy store connection, creating one for Shippo-imported orders if needed
async function etsyConnectionId(userId: number): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE store_connections
     SET connection_type = CASE WHEN access_token IS NULL THEN 'shippo' ELSE connection_type END,
         shop_name = COALESCE(shop_name, 'Etsy'),
         connected_at = COALESCE(connected_at, NOW())
     WHERE id = (SELECT id FROM store_connections WHERE user_id = $1 AND platform = 'etsy' ORDER BY id LIMIT 1)
     RETURNING id`,
    [userId],
  )
  if (rows.length > 0) return rows[0].id

  const { rows: created } = await pool.query(
    `INSERT INTO store_connections (user_id, platform, connection_type, shop_name, connected_at)
     VALUES ($1, 'etsy', 'shippo', 'Etsy', NOW()) RETURNING id`,
    [userId],
  )
  return created[0].id
}

// Imports Etsy orders from Shippo, and links Shopify orders to their Shippo copies
export async function syncShippoOrders(userId: number, token: string): Promise<number> {
  const etsyOrders = await listOrders(token, 'Etsy')
  if (etsyOrders.length > 0) {
    const connectionId = await etsyConnectionId(userId)
    for (const order of etsyOrders) {
      const mapped = mapShippoOrder(order)
      await upsertOrder(connectionId, 'etsy', mapped)
      await pool.query(
        `UPDATE orders SET shippo_order_id = $1 WHERE platform = 'etsy' AND external_id = $2`,
        [order.object_id, mapped.external_id],
      )
    }
  }

  const shopifyOrders = await listOrders(token, 'Shopify')
  for (const order of shopifyOrders) {
    const number = orderNumber(order)
    if (!number) continue
    await pool.query(
      `UPDATE orders SET shippo_order_id = $1
       WHERE platform = 'shopify' AND ltrim(receipt_id, '#') = $2
         AND store_connection_id IN (SELECT id FROM store_connections WHERE user_id = $3)`,
      [order.object_id, number, userId],
    )
  }

  return etsyOrders.length
}

export interface Parcel {
  length: number
  width: number
  height: number
  weight_oz: number
}

export async function createShipment(token: string, from: ShippoAddress, to: ShippoAddress, parcel: Parcel) {
  const shipment = await shippoRequest<ShippoShipment>(token, 'POST', '/shipments/', {
    address_from: from,
    address_to: to,
    parcels: [
      {
        length: String(parcel.length),
        width: String(parcel.width),
        height: String(parcel.height),
        distance_unit: 'in',
        weight: String(parcel.weight_oz),
        mass_unit: 'oz',
      },
    ],
    async: false,
  })

  const rates = shipment.rates
    .map((r) => ({
      id: r.object_id,
      provider: r.provider,
      service: r.servicelevel?.name || '',
      amount: toCents(r.amount),
      currency: r.currency,
      estimated_days: r.estimated_days,
      duration_terms: r.duration_terms,
      attributes: r.attributes || [],
    }))
    .sort((a, b) => a.amount - b.amount)

  return { rates, messages: shipment.messages.map((m) => m.text).filter(Boolean) }
}

export type QuotedRate = Awaited<ReturnType<typeof createShipment>>['rates'][number]

const PENDING_STATUSES = ['QUEUED', 'WAITING']

// Buys the label for a rate; waits for Shippo to finish if it queues the purchase
export async function purchaseLabel(token: string, rateId: string, shippoOrderId: string | null) {
  let transaction = await shippoRequest<ShippoTransaction>(token, 'POST', '/transactions/', {
    rate: rateId,
    label_file_type: 'PDF_4x6',
    async: false,
    ...(shippoOrderId ? { order: shippoOrderId } : {}),
  })

  for (let i = 0; i < 15 && PENDING_STATUSES.includes(transaction.status); i++) {
    await new Promise((r) => setTimeout(r, 2000))
    transaction = await shippoRequest<ShippoTransaction>(token, 'GET', `/transactions/${transaction.object_id}`)
  }
  return transaction
}

export async function downloadLabel(labelUrl: string): Promise<Buffer> {
  const res = await fetch(labelUrl, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Label download failed (${res.status})`)
  const pdf = Buffer.from(await res.arrayBuffer())
  if (pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('Label download was not a PDF')
  return pdf
}
