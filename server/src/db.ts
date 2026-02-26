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

  // Seed default admin if no users exist
  const { rows } = await pool.query('SELECT COUNT(*) FROM users')
  if (parseInt(rows[0].count) === 0) {
    const hash = await bcrypt.hash('admin', 10)
    await pool.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)',
      ['admin@orderly.app', hash, 'Admin']
    )
    console.log('Seeded default admin user (admin@orderly.app / admin)')
  }
}
