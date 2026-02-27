import crypto from 'crypto'

const SHOPIFY_API_VERSION = '2026-01'

export function normalizeHost(storeUrl: string): string {
  return storeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function shopifyUrl(storeUrl: string, path: string): string {
  return `https://${normalizeHost(storeUrl)}/admin/api/${SHOPIFY_API_VERSION}${path}`
}

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateAuthUrl(
  storeUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const host = normalizeHost(storeUrl)
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read_orders',
    redirect_uri: redirectUri,
    state,
  })
  return `https://${host}/admin/oauth/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(
  storeUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ access_token: string; scope: string }> {
  const host = normalizeHost(storeUrl)
  const res = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shopify token exchange failed: ${err}`)
  }

  return res.json()
}

export async function getShop(
  storeUrl: string,
  accessToken: string,
): Promise<{ id: number; name: string }> {
  const res = await fetch(shopifyUrl(storeUrl, '/shop.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shopify API error: ${err}`)
  }

  const data = await res.json()
  return { id: data.shop.id, name: data.shop.name }
}

interface ShopifyOrder {
  id: number
  order_number: number
  name: string
  email: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  currency: string
  line_items: Array<{
    title: string
    quantity: number
    price: string
    variant_title?: string
    properties?: Array<{ name: string; value: string }>
  }>
  shipping_address?: {
    name: string
    address1: string
    address2: string | null
    city: string
    province: string
    zip: string
    country: string
    phone: string | null
  }
  fulfillments: Array<{
    tracking_company: string | null
    tracking_number: string | null
  }>
  created_at: string
  updated_at: string
  customer?: {
    first_name: string
    last_name: string
    email: string
  }
}

export async function getOrders(
  storeUrl: string,
  accessToken: string,
  params: { limit?: number; status?: string } = {},
): Promise<ShopifyOrder[]> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit || 100))
  query.set('status', params.status || 'any')

  const res = await fetch(shopifyUrl(storeUrl, `/orders.json?${query.toString()}`), {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Shopify getOrders failed: ${err}`)
  }

  const data = await res.json()
  return data.orders
}

export function mapShopifyStatus(
  financialStatus: string,
  fulfillmentStatus: string | null,
): string {
  if (financialStatus === 'refunded' || financialStatus === 'voided') return 'cancelled'
  if (fulfillmentStatus === 'fulfilled') return 'delivered'
  if (fulfillmentStatus === 'partial') return 'shipped'
  if (financialStatus === 'paid' || financialStatus === 'partially_paid') return 'unfulfilled'
  return 'pending'
}

export function mapShopifyOrder(order: ShopifyOrder) {
  const total = Math.round(parseFloat(order.total_price) * 100)

  const items = (order.line_items || []).map((li) => {
    const options: Array<{ name: string; value: string }> = []
    if (li.variant_title) {
      li.variant_title.split(' / ').forEach((v) => {
        options.push({ name: 'Variant', value: v.trim() })
      })
    }
    if (li.properties) {
      for (const p of li.properties) {
        if (!p.name.startsWith('_')) {
          options.push({ name: p.name, value: p.value })
        }
      }
    }
    return {
      title: li.title,
      quantity: li.quantity,
      price: parseFloat(li.price),
      currency: order.currency,
      options,
    }
  })

  const fulfillment = order.fulfillments?.[0]
  const shipping: Record<string, unknown> = fulfillment
    ? { carrier: fulfillment.tracking_company || '', tracking: fulfillment.tracking_number || '' }
    : {}

  if (order.shipping_address) {
    shipping.address = {
      name: order.shipping_address.name || '',
      address1: order.shipping_address.address1 || '',
      address2: order.shipping_address.address2 || '',
      city: order.shipping_address.city || '',
      state: order.shipping_address.province || '',
      zip: order.shipping_address.zip || '',
      country: order.shipping_address.country || '',
      phone: order.shipping_address.phone || '',
    }
  }

  const customerName =
    order.shipping_address?.name ||
    (order.customer ? `${order.customer.first_name} ${order.customer.last_name}`.trim() : '')

  return {
    external_id: String(order.id),
    receipt_id: order.name || String(order.order_number),
    customer_name: customerName,
    customer_email: order.email || order.customer?.email || '',
    status: mapShopifyStatus(order.financial_status, order.fulfillment_status),
    total,
    currency: order.currency || 'USD',
    items_json: JSON.stringify(items),
    shipping_json: JSON.stringify(shipping),
    platform_created_at: order.created_at || null,
  }
}
