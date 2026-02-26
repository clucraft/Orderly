import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-random-secret'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authenticated' })
    return
  }

  try {
    const token = authHeader.slice(7)
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number }
    ;(req as any).userId = payload.userId
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}
