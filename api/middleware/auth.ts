/**
 * 鉴权中间件：解析 Bearer token，把 userId 挂到 req 上。
 */
import type { Request, Response, NextFunction } from 'express'
import { findUserIdBySession } from '../store.js'

export interface AuthedRequest extends Request {
  userId?: string
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const userId = token ? await findUserIdBySession(token) : null
    if (!userId) {
      res.status(401).json({ success: false, error: '未登录或登录已过期' })
      return
    }
    req.userId = userId
    next()
  } catch (e) {
    next(e)
  }
}
