/**
 * 项目相关 API：项目 CRUD、消息、应用、分享。
 */
import { Router, type Response } from 'express'
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  touchProject,
  listMessages,
  addMessages,
  type MessageInput,
  saveApp,
  getLatestApp,
  createShare,
} from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../../shared/asyncHandler.js'

const router = Router()

router.use(requireAuth)

// 列表
router.get('/', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const projects = await listProjects(req.userId as string)
  res.json({ success: true, projects })
}))

// 新建
router.post('/', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const { name, description } = req.body || {}
  const project = await createProject(
    req.userId as string,
    typeof name === 'string' ? name : '',
    typeof description === 'string' ? description : '',
  )
  res.status(201).json({ success: true, project })
}))

// 详情
router.get('/:id', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, project })
}))

// 删除
router.delete('/:id', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  await deleteProject(req.params.id)
  res.json({ success: true })
}))

// 消息列表
router.get('/:id/messages', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, messages: await listMessages(req.params.id) })
}))

// 追加消息（支持批量）
router.post('/:id/messages', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : []
  const inputs: MessageInput[] = raw
    .filter(
      (m: unknown): m is MessageInput =>
        !!m &&
        typeof (m as MessageInput).content === 'string' &&
        (m as MessageInput).kind !== undefined,
    )
    .map((m: MessageInput) => ({
      role: m.role === 'agent' ? 'agent' : 'user',
      kind: m.kind,
      content: String(m.content),
    }))
  const created = await addMessages(req.params.id, inputs)
  if (created.length > 0) await touchProject(req.params.id)
  res.status(201).json({ success: true, messages: created })
}))

// 保存生成的应用
router.post('/:id/apps', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const { name, code, files } = req.body || {}
  if (typeof code !== 'string' || code.length === 0) {
    res.status(400).json({ success: false, error: '缺少应用代码' })
    return
  }
  // files 可选：编辑器保存时带 files；LLM 生成时只传 code
  const validFiles = Array.isArray(files)
    ? files
        .filter(
          (f: unknown): f is { path: string; content: string } =>
            !!f &&
            typeof (f as { path: string }).path === 'string' &&
            typeof (f as { content: string }).content === 'string',
        )
        .map((f) => ({ path: f.path, content: f.content }))
    : undefined
  const app = await saveApp(
    req.params.id,
    typeof name === 'string' ? name : '',
    code,
    validFiles,
  )
  await touchProject(req.params.id)
  res.status(201).json({ success: true, app })
}))

// 获取最新应用
router.get('/:id/apps/latest', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const app = await getLatestApp(req.params.id)
  res.json({ success: true, app: app || null })
}))

// 生成分享链接
router.post('/:id/share', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const project = await getProject(req.params.id)
  if (!project || project.userId !== req.userId) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const app = await getLatestApp(req.params.id)
  if (!app) {
    res.status(400).json({ success: false, error: '请先生成应用再分享' })
    return
  }
  const share = await createShare(req.params.id, app.id)
  res.status(201).json({ success: true, slug: share.slug })
}))

export default router
