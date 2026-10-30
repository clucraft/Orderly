import pg from 'pg'
import bcrypt from 'bcryptjs'

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_connections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      platform TEXT NOT NULL DEFAULT 'etsy',
      api_key TEXT,
      api_secret TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      shop_id TEXT,
      shop_name TEXT,
      connected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      store_connection_id INTEGER REFERENCES store_connections(id),
      platform TEXT NOT NULL DEFAULT 'etsy',
      external_id TEXT NOT NULL,
      receipt_id TEXT,
      customer_name TEXT,
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total INTEGER NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      items_json JSONB DEFAULT '[]',
      shipping_json JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      platform_created_at TIMESTAMPTZ,
      UNIQUE(platform, external_id)
    )
  `)

  // 'api' = connected via the platform's own API/OAuth, 'shippo' = orders imported through Shippo
  await pool.query(`
    ALTER TABLE store_connections ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'api'
  `)

  // The matching order in Shippo; labels bought against it send tracking back to the store
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shippo_order_id TEXT
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shippo_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_token TEXT,
      from_address JSONB,
      packages JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipping_labels (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      shippo_transaction_id TEXT,
      carrier TEXT,
      service TEXT,
      tracking_code TEXT,
      tracking_url TEXT,
      cost INTEGER,
      currency TEXT DEFAULT 'USD',
      test_mode BOOLEAN NOT NULL DEFAULT false,
      label_url TEXT,
      -- Cached copy of the PDF at label_url
      label_pdf BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_notes (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Seed default admin if no users exist, or update password if ADMIN_PASSWORD is set
  const { rows } = await pool.query('SELECT COUNT(*) FROM users')
  if (parseInt(rows[0].count) === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin', 10)
    await pool.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)',
      ['admin@orderly.app', hash, 'Admin']
    )
    console.log('Seeded default admin user (admin@orderly.app)')
  } else if (process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hash, 'admin@orderly.app']
    )
    console.log('Updated admin password from ADMIN_PASSWORD env var')
  }
}
