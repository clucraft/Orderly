export interface User {
  id: number
  email: string
  displayName: string
}

export type OrderStatus = 'pending' | 'unfulfilled' | 'shipped' | 'delivered' | 'cancelled'

export interface Order {
  id: number
  store_connection_id: number
  platform: 'shopify' | 'etsy'
  external_id: string
  receipt_id: string | null
  customer_name: string
  customer_email: string
  status: OrderStatus
  total: number
  currency: string
  items_json: string
  shipping_json: string
  created_at: string
  updated_at: string
  platform_created_at: string | null
}

export interface StoreConnection {
  id: number
  platform: string
  shop_id: string | null
  shop_name: string | null
  connected_at: string | null
  has_credentials: boolean
  is_connected: boolean
}
