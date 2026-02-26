import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.json({ status: 'ok', db: 'disconnected' })
  }
})

export default router
