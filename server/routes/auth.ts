/**
 * 认证相关 API：注册、登录、登出、获取当前用户。
 */
import { Router, type Request, type Response } from 'express'
import {
  createUser,
  verifyUser,
  createSession,
  deleteSession,
  findUserByEmail,
  findUserById,
  publicUser as toPublic,
} from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/register', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '请填写邮箱和密码' })
    return
  }
  if (!EMAIL_RE.test(email.trim())) {
    res.status(400).json({ success: false, error: '邮箱格式不正确' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ success: false, error: '密码至少 6 位' })
    return
  }
  if (await findUserByEmail(email)) {
    res.status(409).json({ success: false, error: '该邮箱已注册，请直接登录' })
    return
  }
  const user = await createUser(email, password)
  const token = await createSession(user.id)
  res.status(201).json({ success: true, token, user })
}))

router.post('/login', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '请填写邮箱和密码' })
    return
  }
  const user = await verifyUser(email, password)
  if (!user) {
    res.status(401).json({ success: false, error: '邮箱或密码错误' })
    return
  }
  const token = await createSession(user.id)
  res.json({ success: true, token, user: toPublic(user) })
}))

router.post('/logout', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token) await deleteSession(token)
  res.json({ success: true })
}))

router.get('/me', requireAuth, asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const user = await findUserById(req.userId as string)
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在' })
    return
  }
  res.json({ success: true, user: toPublic(user) })
}))

export default router
