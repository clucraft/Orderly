export interface User {
  id: number
  email: string
  displayName: string
}

export type OrderStatus = 'pending' | 'unfulfilled' | 'shipped' | 'delivered' | 'cancelled'

export interface OrderItem {
  title: string
  quantity: number
  price: number
  currency: string
  options?: Array<{ name: string; value: string }>
}

export interface ShippingAddress {
  name: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  country: string
  country_code?: string
  phone: string
}

export interface ShippingInfo {
  carrier?: string
  tracking?: string
  address?: ShippingAddress
  method?: string
  shipping_paid?: number // cents the buyer paid for shipping
  notes?: string
  weight?: { value: number; unit: string }
}

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
  items_json: OrderItem[]
  shipping_json: ShippingInfo
  created_at: string
  updated_at: string
  platform_created_at: string | null
  store_url?: string
  shop_name?: string
}

export interface OrderNote {
  id: number
  content: string
  author: string
  created_at: string
}

export interface StoreConnection {
  id: number
  platform: string
  connection_type: 'api' | 'shippo'
  shop_id: string | null
  shop_name: string | null
  connected_at: string | null
  has_credentials: boolean
  is_connected: boolean
}

export interface ShipFromAddress {
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

export interface ShippingLabel {
  id: number
  carrier: string
  service: string
  tracking_code: string | null
  tracking_url: string | null
  cost: number
  currency: string
  test_mode: boolean
  created_at: string
}

export interface LabelRate {
  id: string
  provider: string
  service: string
  amount: number
  currency: string
  estimated_days: number | null
  duration_terms: string | null
  attributes: string[]
}
