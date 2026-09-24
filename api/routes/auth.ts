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

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/register', (req: Request, res: Response): void => {
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
  if (findUserByEmail(email)) {
    res.status(409).json({ success: false, error: '该邮箱已注册，请直接登录' })
    return
  }
  const user = createUser(email, password)
  const token = createSession(user.id)
  res.status(201).json({ success: true, token, user })
})

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '请填写邮箱和密码' })
    return
  }
  const user = verifyUser(email, password)
  if (!user) {
    res.status(401).json({ success: false, error: '邮箱或密码错误' })
    return
  }
  const token = createSession(user.id)
  res.json({ success: true, token, user: toPublic(user) })
})

router.post('/logout', (req: Request, res: Response): void => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token) deleteSession(token)
  res.json({ success: true })
})

router.get('/me', requireAuth, (req: AuthedRequest, res: Response): void => {
  const user = findUserById(req.userId as string)
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在' })
    return
  }
  res.json({ success: true, user: toPublic(user) })
})

export default router