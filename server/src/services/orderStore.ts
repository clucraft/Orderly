import { pool } from '../db.js'

export interface MappedOrder {
  external_id: string
  receipt_id: string
  customer_name: string
  customer_email: string
  status: string
  total: number
  currency: string
  items_json: string
  shipping_json: string
  platform_created_at: string | null
}

export async function upsertOrder(connectionId: number, platform: string, order: MappedOrder) {
  await pool.query(
    `INSERT INTO orders (store_connection_id, platform, external_id, receipt_id,
      customer_name, customer_email, status, total, currency,
      items_json, shipping_json, platform_created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (platform, external_id) DO UPDATE SET
      store_connection_id = EXCLUDED.store_connection_id,
      customer_name = EXCLUDED.customer_name,
      customer_email = EXCLUDED.customer_email,
      status = EXCLUDED.status,
      total = EXCLUDED.total,
      items_json = EXCLUDED.items_json,
      shipping_json = EXCLUDED.shipping_json,
      updated_at = NOW()`,
    [
      connectionId,
      platform,
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
}
