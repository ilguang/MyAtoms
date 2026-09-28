/**
 * 公开分享 API：根据 slug 返回应用代码（无需登录）。
 */
import { Router, type Response, type Request } from 'express'
import { getShareBySlug, getAppById, getProject } from '../store.js'
import { asyncHandler } from '../asyncHandler.js'

const router = Router()

router.get('/:slug', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const share = await getShareBySlug(req.params.slug)
  if (!share) {
    res.status(404).json({ success: false, error: '分享链接不存在' })
    return
  }
  const app = await getAppById(share.appId)
  if (!app) {
    res.status(404).json({ success: false, error: '应用不存在' })
    return
  }
  const project = await getProject(share.projectId)
  res.json({
    success: true,
    name: app.name,
    code: app.code,
    createdAt: app.createdAt,
    projectName: project ? project.name : '',
  })
}))

export default router
