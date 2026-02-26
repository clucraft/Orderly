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
