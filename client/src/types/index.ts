export interface User {
  id: number
  email: string
  displayName: string
}

export type OrderStatus = 'pending' | 'unfulfilled' | 'shipped' | 'delivered' | 'cancelled'

export interface Order {
  id: number
  externalId: string
  platform: 'shopify' | 'etsy'
  customerName: string
  status: OrderStatus
  total: number
  currency: string
  createdAt: string
  updatedAt: string
}
