/**
 * API 服务入口。
 * 开发环境：前端由 Vite 启动，本地通过 /api 代理访问。
 * 生产环境：若存在 dist 目录，则同时托管前端静态资源。
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import shareRoutes from './routes/share.js'
import llmRoutes from './routes/llm.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/share', shareRoutes)
app.use('/api/llm', llmRoutes)

/**
 * health
 */
app.get('/api/health', (req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: 'ok' })
})

/**
 * 生产环境：托管前端构建产物（单服务部署）
 */
const distDir = path.resolve(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API not found' })
})

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  // 打印完整堆栈到服务端日志，便于定位
  console.error('[server-error]', req.method, req.originalUrl, error)
  const isProd = process.env.NODE_ENV === 'production'
  res.status(500).json({
    success: false,
    error: isProd ? 'Server internal error' : (error.message || 'Server internal error'),
  })
})

export default app