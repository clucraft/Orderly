import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-random-secret'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: 'Invalid credentials format' })
    return
  }

  const { email, password } = result.data

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  if (rows.length === 0) {
    res.status(401).json({ message: 'Invalid email or password' })
    return
  }

  const user = rows[0]
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    res.status(401).json({ message: 'Invalid email or password' })
    return
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

  res.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.display_name },
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const { rows } = await pool.query('SELECT id, email, display_name FROM users WHERE id = $1', [userId])

  if (rows.length === 0) {
    res.status(404).json({ message: 'User not found' })
    return
  }

  const user = rows[0]
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } })
})

export default router
