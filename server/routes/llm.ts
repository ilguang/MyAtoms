/**
 * LLM 配置与生成 API。
 * - GET    /api/llm/configs           列出全部配置条目（apiKey 脱敏）+ 当前生效 id
 * - POST   /api/llm/configs           新增配置条目（baseUrl/model/apiKey）
 * - PUT    /api/llm/configs/:id       编辑条目（apiKey 留空表示不变）
 * - DELETE /api/llm/configs/:id       删除条目
 * - PUT    /api/llm/configs/:id/activate  设为当前生效条目
 * - POST /api/llm/generate  流式生成 HTML → Playwright 真实测试 → 自动修复（最多 3 轮）
 *                           SSE 事件：phase / delta / test-result / done / error
 * - POST /api/llm/fix       流式修复（SSE：delta / done / error）
 * - GET  /api/llm/presets   返回常见供应商的默认配置参考
 */
import { Router, type Response } from 'express'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  listLLMConfigs,
  addLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  activateLLMConfig,
  getActiveDecryptedLLMConfig,
  getLatestApp,
} from '../store.js'
import {
  streamGenerateHTML,
  streamFixHTML,
  type StreamEvent,
  type Attachment,
  type AgentThought,
  type BugReport,
} from '../llm.js'
import { testHTML, formatBugs } from '../tester.js'
import { asyncHandler } from '../../shared/asyncHandler.js'

const router = Router()

router.use(requireAuth)

// 常见供应商预设：方便用户在前端快速选择
const PRESETS: { name: string; baseUrl: string; model: string; docUrl: string }[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini', docUrl: 'https://platform.openai.com/api-keys' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', docUrl: 'https://platform.deepseek.com/api_keys' },
  { name: '通义千问 (DashScope OpenAI 兼容)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-plus', docUrl: 'https://dashscope.console.aliyun.com/apiKey' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', docUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { name: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn', model: 'moonshot-v1-8k', docUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { name: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn', model: 'Qwen/Qwen2.5-7B-Instruct', docUrl: 'https://cloud.siliconflow.cn/account/ak' },
]

// 读取全部配置条目（脱敏）+ 当前生效 id
router.get('/configs', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  res.json({ success: true, ...(await listLLMConfigs(req.userId as string)) })
}))

// 新增配置条目
router.post('/configs', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const { baseUrl, model, apiKey } = req.body || {}
  if (typeof baseUrl !== 'string' || typeof model !== 'string' || typeof apiKey !== 'string') {
    res.status(400).json({ success: false, error: 'baseUrl / model / apiKey 必须为字符串' })
    return
  }
  try {
    res.status(201).json({ success: true, ...(await addLLMConfig(req.userId as string, { baseUrl, model, apiKey })) })
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '保存失败' })
  }
}))

// 编辑配置条目（apiKey 留空/不传表示保留原 Key）
router.put('/configs/:id', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  const { baseUrl, model, apiKey } = req.body || {}
  const update: { baseUrl?: string; model?: string; apiKey?: string } = {}
  if (typeof baseUrl === 'string') update.baseUrl = baseUrl
  if (typeof model === 'string') update.model = model
  if (typeof apiKey === 'string') update.apiKey = apiKey
  if (update.baseUrl === undefined && update.model === undefined && update.apiKey === undefined) {
    res.status(400).json({ success: false, error: '没有需要更新的字段' })
    return
  }
  try {
    res.json({ success: true, ...(await updateLLMConfig(req.userId as string, req.params.id, update)) })
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '保存失败' })
  }
}))

// 删除配置条目
router.delete('/configs/:id', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, ...(await deleteLLMConfig(req.userId as string, req.params.id)) })
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '删除失败' })
  }
}))

// 设为当前生效条目（工作台快速切换模型）
router.put('/configs/:id/activate', asyncHandler(async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, ...(await activateLLMConfig(req.userId as string, req.params.id)) })
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '切换失败' })
  }
}))

// 预设列表
router.get('/presets', (_req: AuthedRequest, res: Response): void => {
  res.json({ success: true, presets: PRESETS })
})

/** 写一条 SSE 事件 */
function writeSSE(res: Response, evt: StreamEvent): void {
  res.write(`event: ${evt.type}\n`)
  res.write(`data: ${JSON.stringify(evt)}\n\n`)
}

/** 把 res 切到 SSE 模式 */
function startSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // 立即 flush 头，让客户端尽快进入流式消费
  res.flushHeaders?.()
}

/** 校验并规范化请求体里的 attachments 字段；非法抛错 */
function parseAttachments(raw: unknown): Attachment[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error('attachments 必须为数组')
  const result: Attachment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new Error('attachments 内每项必须为对象')
    }
    const obj = item as Record<string, unknown>
    const kind = obj.kind
    const name = obj.name
    if (kind === 'image') {
      if (typeof name !== 'string' || typeof obj.dataUrl !== 'string') {
        throw new Error('图片附件缺少 name/dataUrl')
      }
      if (!obj.dataUrl.startsWith('data:image/')) {
        throw new Error(`图片附件 ${name} 的 dataUrl 必须以 data:image/ 开头`)
      }
      // 限制 5MB（base64 长度约 6.7M 字符）
      if (obj.dataUrl.length > 7 * 1024 * 1024) {
        throw new Error(`图片附件 ${name} 超过 5MB 限制`)
      }
      result.push({ kind: 'image', name, dataUrl: obj.dataUrl })
    } else if (kind === 'text') {
      if (typeof name !== 'string' || typeof obj.content !== 'string') {
        throw new Error('文本附件缺少 name/content')
      }
      if (obj.content.length > 200 * 1024) {
        throw new Error(`文本附件 ${name} 超过 200KB 限制`)
      }
      result.push({ kind: 'text', name, content: obj.content })
    } else {
      throw new Error(`附件 kind 必须是 image 或 text，收到 ${String(kind)}`)
    }
    if (result.length > 10) {
      throw new Error('附件数量不能超过 10 个')
    }
  }
  return result
}

// 流式调用 LLM 生成 HTML，随后用 Playwright 真实测试，发现问题自动修复（最多 3 轮）
router.post('/generate', async (req: AuthedRequest, res: Response): Promise<void> => {
  const { prompt } = req.body || {}
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ success: false, error: 'prompt 不能为空' })
    return
  }
  let cfg
  try {
    cfg = await getActiveDecryptedLLMConfig(req.userId as string)
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '服务异常' })
    return
  }
  if (!cfg) {
    res.status(400).json({ success: false, error: '请先在「设置」页配置 LLM API Key' })
    return
  }
  let atts: Attachment[]
  try {
    atts = parseAttachments(req.body?.attachments)
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '附件解析失败' })
    return
  }
  const MAX_FIX_ROUNDS = 3
  startSSE(res)
  try {
    // ===== 阶段 1：生成 =====
    writeSSE(res, { type: 'phase', phase: 'generating' })
    let currentHtml = ''
    let allThoughts: AgentThought[] = []
    for await (const evt of streamGenerateHTML({ ...cfg, prompt: prompt.trim(), attachments: atts })) {
      if (evt.type === 'delta') {
        writeSSE(res, evt)
      } else if (evt.type === 'done') {
        currentHtml = evt.html
        allThoughts = evt.thoughts
      } else if (evt.type === 'error') {
        writeSSE(res, evt)
        return
      }
    }
    if (!currentHtml) {
      writeSSE(res, { type: 'error', message: '生成失败：未得到有效 HTML', status: 502 })
      return
    }

    // ===== 阶段 2+：测试 → 修复 循环 =====
    // testHTML 返回 null 表示当前环境没有 chromium（如 Vercel），直接跳过测试
    let bugsFixed = 0
    let tested = false
    for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
      writeSSE(res, { type: 'phase', phase: 'testing' })
      let bugs: BugReport[]
      try {
        const result = await testHTML(currentHtml)
        if (result === null) {
          // 当前环境无 chromium（如 Vercel），跳过测试环节直接完成
          break
        }
        bugs = result
      } catch (e) {
        // 测试器自身异常（非浏览器缺失）：不阻塞产出，跳过剩余测试
        console.warn('[generate] testHTML 异常，跳过测试：', e)
        break
      }
      tested = true
      writeSSE(res, { type: 'test-result', bugs })

      // 没有问题 → 流程完成
      if (bugs.length === 0) break
      // 达到修复轮数上限 → 带着剩余问题完成
      if (round >= MAX_FIX_ROUNDS) break

      // ===== 阶段 3：修复 =====
      writeSSE(res, { type: 'phase', phase: 'fixing' })
      const runtimeErrs = bugs.filter((b) => b.type === 'runtime-error').map((b) => b.message)
      let fixedHtml = ''
      let fixThoughts: AgentThought[] = []
      for await (const evt of streamFixHTML({
        ...cfg,
        code: currentHtml,
        bugDescription: formatBugs(bugs),
        runtimeErrors: runtimeErrs.length > 0 ? runtimeErrs : undefined,
      })) {
        if (evt.type === 'delta') {
          writeSSE(res, evt)
        } else if (evt.type === 'done') {
          fixedHtml = evt.html
          fixThoughts = evt.thoughts
        } else if (evt.type === 'error') {
          writeSSE(res, evt)
          return
        }
      }
      if (!fixedHtml) {
        writeSSE(res, { type: 'error', message: '修复失败：未得到有效 HTML', status: 502 })
        return
      }
      currentHtml = fixedHtml
      allThoughts = [...allThoughts, ...fixThoughts]
      bugsFixed += bugs.length
    }

    // ===== 阶段 4：完成 =====
    writeSSE(res, { type: 'phase', phase: 'complete' })
    writeSSE(res, { type: 'done', html: currentHtml, thoughts: allThoughts, tested, bugsFixed })
  } catch (e) {
    writeSSE(res, {
      type: 'error',
      message: e instanceof Error ? e.message : 'LLM 调用失败',
      status: 500,
    })
  } finally {
    res.end()
  }
})

// 流式调用 LLM 修复已有 HTML
router.post('/fix', async (req: AuthedRequest, res: Response): Promise<void> => {
  const { projectId, bugDescription, runtimeErrors } = req.body || {}
  if (typeof projectId !== 'string' || !projectId.trim()) {
    res.status(400).json({ success: false, error: 'projectId 不能为空' })
    return
  }
  if (typeof bugDescription !== 'string' || !bugDescription.trim()) {
    res.status(400).json({ success: false, error: 'bug 描述不能为空' })
    return
  }
  let app
  try {
    app = await getLatestApp(projectId)
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '服务异常' })
    return
  }
  if (!app) {
    res.status(400).json({ success: false, error: '该项目还没有应用，请先生成' })
    return
  }
  let cfg
  try {
    cfg = await getActiveDecryptedLLMConfig(req.userId as string)
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '服务异常' })
    return
  }
  if (!cfg) {
    res.status(400).json({ success: false, error: '请先在「设置」页配置 LLM API Key' })
    return
  }
  let atts: Attachment[]
  try {
    atts = parseAttachments(req.body?.attachments)
  } catch (e) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : '附件解析失败' })
    return
  }
  const errors = Array.isArray(runtimeErrors)
    ? runtimeErrors.filter((e: unknown): e is string => typeof e === 'string').slice(0, 20)
    : undefined
  startSSE(res)
  try {
    for await (const evt of streamFixHTML({
      ...cfg,
      code: app.code,
      bugDescription: bugDescription.trim(),
      runtimeErrors: errors,
      attachments: atts,
    })) {
      writeSSE(res, evt)
      if (evt.type === 'done' || evt.type === 'error') break
    }
  } catch (e) {
    writeSSE(res, {
      type: 'error',
      message: e instanceof Error ? e.message : 'LLM 修复失败',
      status: 500,
    })
  } finally {
    res.end()
  }
})

export default router
