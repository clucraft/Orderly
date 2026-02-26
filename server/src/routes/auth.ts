import { Router } from 'express'
import { z } from 'zod'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', (req, res) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: 'Invalid credentials format' })
    return
  }

  // TODO: Implement real authentication
  res.status(501).json({ message: 'Authentication not yet implemented' })
})

router.get('/me', (_req, res) => {
  // TODO: Implement with JWT verification
  res.status(401).json({ message: 'Not authenticated' })
})

export default router
