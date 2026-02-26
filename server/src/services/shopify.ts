const SHOPIFY_API_VERSION = '2025-10'

function shopifyUrl(storeUrl: string, path: string): string {
  // Normalize: strip protocol, trailing slashes
  const host = storeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `https://${host}/admin/api/${SHOPIFY_API_VERSION}${path}`
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
  }>
  shipping_address?: {
    name: string
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

  const items = (order.line_items || []).map((li) => ({
    title: li.title,
    quantity: li.quantity,
    price: parseFloat(li.price),
    currency: order.currency,
  }))

  const fulfillment = order.fulfillments?.[0]
  const shipping = fulfillment
    ? { carrier: fulfillment.tracking_company || '', tracking: fulfillment.tracking_number || '' }
    : {}

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
