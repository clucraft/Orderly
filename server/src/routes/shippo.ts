import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { ShippoError, checkToken, getShippoSettings, isTestToken } from '../services/shippo.js'

const router = Router()

const addressSchema = z.object({
  name: z.string().trim().min(1).max(100),
  company: z.string().trim().max(100).optional(),
  street1: z.string().trim().min(1).max(100),
  street2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(1).max(60),
  state: z.string().trim().min(1).max(60),
  zip: z.string().trim().min(1).max(20),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code').transform((c) => c.toUpperCase()),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(100).optional(),
})

const packageSchema = z.object({
  name: z.string().trim().min(1).max(40),
  length: z.number().positive().max(108),
  width: z.number().positive().max(108),
  height: z.number().positive().max(108),
  weight_oz: z.number().min(0).max(2400),
})

const settingsSchema = z.object({
  from_address: addressSchema,
  packages: z.array(packageSchema).max(20),
})

// GET /api/shippo — Shippo connection and label settings (the token itself is never returned)
router.get('/', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const settings = await getShippoSettings(userId)
  const token = settings?.api_token || null

  res.json({
    connected: !!token,
    test_mode: token ? isTestToken(token) : false,
    token_hint: token ? token.slice(-4) : null,
    from_address: settings?.from_address || null,
    packages: settings?.packages || [],
  })
})

// PUT /api/shippo/token — save a Shippo API token after checking it with Shippo
router.put('/token', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''

  if (!/^shippo_(live|test)_\w+$/.test(token)) {
    res.status(400).json({ message: 'That doesn\'t look like a Shippo API token (it starts with shippo_live_ or shippo_test_)' })
    return
  }

  try {
    await checkToken(token)
  } catch (err) {
    const message = err instanceof ShippoError ? err.message : 'Could not reach Shippo'
    res.status(400).json({ message })
    return
  }

  await pool.query(
    `INSERT INTO shippo_settings (user_id, api_token) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET api_token = EXCLUDED.api_token, updated_at = NOW()`,
    [userId, token],
  )
  res.json({ message: 'Shippo connected', test_mode: isTestToken(token) })
})

// DELETE /api/shippo/token — disconnect Shippo (keeps the ship-from address and packages)
router.delete('/token', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  await pool.query('UPDATE shippo_settings SET api_token = NULL, updated_at = NOW() WHERE user_id = $1', [userId])
  res.json({ message: 'Shippo disconnected' })
})

// PUT /api/shippo/settings — ship-from address and package presets
router.put('/settings', requireAuth, async (req, res) => {
  const userId = (req as any).userId
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    res.status(400).json({ message: `${issue.path.join('.')}: ${issue.message}` })
    return
  }

  await pool.query(
    `INSERT INTO shippo_settings (user_id, from_address, packages) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET from_address = EXCLUDED.from_address,
       packages = EXCLUDED.packages, updated_at = NOW()`,
    [userId, JSON.stringify(parsed.data.from_address), JSON.stringify(parsed.data.packages)],
  )
  res.json({ message: 'Settings saved' })
})

export default router
