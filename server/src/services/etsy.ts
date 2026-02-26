import crypto from 'crypto'

const ETSY_BASE = 'https://openapi.etsy.com/v3'
const ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect'
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateOAuthUrl(
  apiKey: string,
  redirectUri: string,
  codeVerifier: string,
  state: string,
): string {
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: apiKey,
    redirect_uri: redirectUri,
    scope: 'transactions_r shops_r',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${ETSY_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  apiKey: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: apiKey,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Etsy token exchange failed: ${err}`)
  }

  return res.json()
}

export async function refreshAccessToken(
  apiKey: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: apiKey,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Etsy token refresh failed: ${err}`)
  }

  return res.json()
}

export async function getShopInfo(
  apiKey: string,
  accessToken: string,
): Promise<{ shop_id: number; shop_name: string }> {
  const res = await fetch(`${ETSY_BASE}/application/shops`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': apiKey,
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Etsy getShopInfo failed: ${err}`)
  }

  const data = await res.json()
  // Etsy returns { count, results: [{ shop_id, shop_name, ... }] }
  if (!data.results || data.results.length === 0) {
    throw new Error('No Etsy shop found for this account')
  }

  const shop = data.results[0]
  return { shop_id: shop.shop_id, shop_name: shop.shop_name }
}

interface EtsyReceipt {
  receipt_id: number
  buyer_email: string
  name: string
  status: string
  grandtotal: { amount: number; divisor: number; currency_code: string }
  transactions: Array<{
    title: string
    quantity: number
    price: { amount: number; divisor: number; currency_code: string }
  }>
  shipments: Array<{
    carrier_name: string
    tracking_code: string
  }>
  create_timestamp: number
  update_timestamp: number
}

export async function getReceipts(
  apiKey: string,
  accessToken: string,
  shopId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<{ count: number; results: EtsyReceipt[] }> {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))

  const url = `${ETSY_BASE}/application/shops/${shopId}/receipts?${query.toString()}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': apiKey,
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Etsy getReceipts failed: ${err}`)
  }

  return res.json()
}

export function mapReceiptStatus(etsyStatus: string): string {
  // Etsy statuses: paid, completed, open, refunded, etc.
  switch (etsyStatus) {
    case 'paid':
    case 'open':
      return 'unfulfilled'
    case 'completed':
      return 'delivered'
    case 'refunded':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function mapReceiptToOrder(receipt: EtsyReceipt) {
  const total = receipt.grandtotal
    ? Math.round((receipt.grandtotal.amount / receipt.grandtotal.divisor) * 100)
    : 0
  const currency = receipt.grandtotal?.currency_code || 'USD'

  const items = (receipt.transactions || []).map((t) => ({
    title: t.title,
    quantity: t.quantity,
    price: t.price ? t.price.amount / t.price.divisor : 0,
    currency: t.price?.currency_code || currency,
  }))

  const shipping = receipt.shipments?.[0]
    ? {
        carrier: receipt.shipments[0].carrier_name,
        tracking: receipt.shipments[0].tracking_code,
      }
    : {}

  return {
    external_id: String(receipt.receipt_id),
    receipt_id: String(receipt.receipt_id),
    customer_name: receipt.name || '',
    customer_email: receipt.buyer_email || '',
    status: mapReceiptStatus(receipt.status),
    total,
    currency,
    items_json: JSON.stringify(items),
    shipping_json: JSON.stringify(shipping),
    platform_created_at: receipt.create_timestamp
      ? new Date(receipt.create_timestamp * 1000).toISOString()
      : null,
  }
}
