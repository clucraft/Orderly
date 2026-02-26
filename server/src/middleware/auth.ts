import type { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authenticated' })
    return
  }

  const token = authHeader.slice(7)

  // TODO: Verify JWT token and attach user to request
  if (!token) {
    res.status(401).json({ message: 'Invalid token' })
    return
  }

  next()
}
