/**
 * 工作台：项目详情页。左侧为对话与智能体协作日志，右侧为代码预览。
 */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  CheckCircle2,
  TriangleAlert,
  Settings as SettingsIcon,
  Paperclip,
  X,
  ChevronDown,
  FileText,
  Copy,
  Check,
} from 'lucide-react'
import { api, type Attachment, type BugReport } from '@/lib/api'
import type { Message, Project, LLMConfigItem, AppFile } from '@/lib/types'
import { splitHtmlToFiles, assembleFilesToHtml } from '@/lib/htmlFiles'
import { TEMPLATES } from '@/lib/templates'
import { AgentAvatar } from '@/components/AgentAvatar'
import { CodePreview, type PreviewError } from '@/components/CodePreview'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

/** 接受上传的文本类后缀（除图片外） */
const TEXT_EXTS = ['.txt', '.md', '.markdown', '.json', '.csv', '.js', '.ts', '.tsx', '.jsx', '.html', '.htm', '.css', '.py', '.yml', '.yaml', '.xml', '.svg', '.sh', '.go', '.java', '.rs']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_BYTES = 200 * 1024

/** 从生成的 HTML 中提取 <title>，提取不到则用 prompt 前 24 字兜底 */
function extractTitle(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const t = m ? m[1].trim() : ''
  return t || fallback.slice(0, 24)
}

/** 判断错误是否提示需要去配置 LLM */
function isLLMConfigError(msg: string): boolean {
  return /设置.*配置|API\s*Key|llm/i.test(msg)
}

/** 把 LLM 返回的中文角色名映射成 AgentAvatar 支持的 agentId */
function mapAgentId(agent: string): string {
  if (/需求|分析/i.test(agent)) return 'researcher'
  if (/架构/i.test(agent)) return 'architect'
  if (/测试|qa/i.test(agent)) return 'qa'
  if (/设计/i.test(agent)) return 'designer'
  return 'engineer'
}

function parseAgentLog(
  content: string,
): { agentId: string; text: string } | null {
  try {
    const o = JSON.parse(content)
    if (o && typeof o.agentId === 'string' && typeof o.text === 'string') return o
  } catch {
    /* ignore */
  }
  return null
}

export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const promptParam = params.get('prompt')

  const [project, setProject] = useState<Project | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [files, setFiles] = useState<AppFile[]>([])
  const [appTitle, setAppTitle] = useState('应用')
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [input, setInput] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([])
  /** 流式生成期间的累计 buffer：实时显示团队思考打字机效果 */
  const [streamBuf, setStreamBuf] = useState('')
  /** 当前构建阶段：generating/testing/fixing/complete，用于切换状态提示 */
  const [buildPhase, setBuildPhase] = useState<'generating' | 'testing' | 'fixing' | 'complete'>('generating')
  /** 测试员本轮发现的问题（null=未出结果，[] = 通过，[...]=有问题）；构建期间实时展示 */
  const [liveTestBugs, setLiveTestBugs] = useState<BugReport[] | null>(null)
  /** 待发送的附件：图片走 vision，文本类拼到 prompt 前 */
  const [attachments, setAttachments] = useState<Attachment[]>([])
  /** 已配置的 LLM 条目 + 当前生效 id（用于模型徽章与切换） */
  const [llmConfigs, setLLMConfigs] = useState<LLMConfigItem[]>([])
  const [activeLLMId, setActiveLLMId] = useState<string | null>(null)
  /** 模型切换下拉是否展开 */
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  /** 模型切换中 */
  const [switchingModel, setSwitchingModel] = useState(false)
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  function append(newMsgs: Message[]) {
    setMessages((prev) => [...prev, ...newMsgs])
  }

  /** 把 File 读成 Attachment；超限/格式不对抛错 */
  async function readFile(file: File): Promise<Attachment> {
    const name = file.name
    const isImage = file.type.startsWith('image/')
    const lower = name.toLowerCase()
    const isText = !isImage && (TEXT_EXTS.some((ext) => lower.endsWith(ext)) || file.type.startsWith('text/'))
    if (!isImage && !isText) {
      throw new Error(`${name}: 不支持的文件类型（仅图片或文本类）`)
    }
    if (isImage) {
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`${name}: 图片超过 5MB 限制`)
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(file)
      })
      return { kind: 'image', name, dataUrl }
    }
    if (file.size > MAX_TEXT_BYTES) {
      throw new Error(`${name}: 文本文件超过 200KB 限制`)
    }
    const content = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result ?? ''))
      fr.onerror = () => reject(fr.error)
      fr.readAsText(file)
    })
    return { kind: 'text', name, content }
  }

  async function handleFilePick(e: { target: { files: FileList | null } }) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const newAtts: Attachment[] = []
    const errors: string[] = []
    for (const f of Array.from(files)) {
      try {
        const att = await readFile(f)
        newAtts.push(att)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (newAtts.length > 0) {
      setAttachments((prev) => [...prev, ...newAtts].slice(0, 10))
    }
    if (errors.length > 0) {
      setError(errors.join('；'))
    }
    // 清空 input 让同一文件可再次选择
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  /** 切换当前生效的 LLM 配置条目（各自携带独立 API Key） */
  async function switchConfig(cfg: LLMConfigItem) {
    if (switchingModel) return
    setModelMenuOpen(false)
    if (cfg.id === activeLLMId) return
    setSwitchingModel(true)
    try {
      const res = await api.activateLLMConfig(cfg.id)
      setLLMConfigs(res.configs)
      setActiveLLMId(res.activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换模型失败')
    } finally {
      setSwitchingModel(false)
    }
  }

  async function runBuild(prompt: string, atts: Attachment[]) {
    if (!id || building) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    setBuilding(true)
    setError('')
    setStreamBuf('')
    setBuildPhase('generating')
    setLiveTestBugs(null)
    try {
      const userRes = await api.addMessages(id, [
        { role: 'user', kind: 'text', content: trimmed },
      ])
      append(userRes.messages)

      // 流式消费：phase 切换阶段，delta 累加到 streamBuf 触发打字机，
      // test-result 实时展示测试员发现的问题，done 收尾。
      let finalHtml = ''
      let finalThoughts: { agent: string; thinking: string }[] = []
      const testReportTexts: string[] = []
      for await (const evt of api.generateHTMLStream(trimmed, atts)) {
        if (evt.type === 'phase' && evt.phase) {
          setBuildPhase(evt.phase)
          // 切到新阶段清空打字机与测试结果，让新阶段单独展示
          if (evt.phase !== 'testing') {
            setStreamBuf('')
            setLiveTestBugs(null)
          }
        } else if (evt.type === 'delta' && evt.text) {
          setStreamBuf((prev) => prev + evt.text!)
        } else if (evt.type === 'test-result') {
          const bugs = evt.bugs || []
          setLiveTestBugs(bugs)
          if (bugs.length > 0) {
            const text = `真实浏览器测试发现 ${bugs.length} 个问题：\n${bugs
              .map((b, i) => `${i + 1}. [${b.type}] ${b.message}${b.location ? ` (${b.location})` : ''}`)
              .join('\n')}`
            testReportTexts.push(text)
          } else {
            testReportTexts.push('真实浏览器测试通过，未发现问题。')
          }
        } else if (evt.type === 'done') {
          finalHtml = evt.html || ''
          finalThoughts = evt.thoughts || []
          setStreamBuf('')
          setLiveTestBugs(null)
        } else if (evt.type === 'error') {
          throw new Error(evt.message || 'LLM 调用失败')
        }
      }

      // 流结束后批量持久化团队思考（生成 + 修复阶段累计）
      if (finalThoughts.length > 0) {
        const msgs = finalThoughts.map((t) => ({
          role: 'agent' as const,
          kind: 'agent-log' as const,
          content: JSON.stringify({ agentId: mapAgentId(t.agent), text: t.thinking }),
        }))
        const thoughtRes = await api.addMessages(id, msgs)
        append(thoughtRes.messages)
      }

      // 持久化测试报告（按轮次顺序）
      if (testReportTexts.length > 0) {
        const testMsgs = testReportTexts.map((text) => ({
          role: 'agent' as const,
          kind: 'agent-log' as const,
          content: JSON.stringify({ agentId: 'qa', text }),
        }))
        const testRes = await api.addMessages(id, testMsgs)
        append(testRes.messages)
      }

      const title = extractTitle(finalHtml, trimmed)
      const builtFiles = splitHtmlToFiles(finalHtml)
      const app = (await api.saveApp(id, title, finalHtml, builtFiles)).app
      setCode(finalHtml)
      setFiles(builtFiles)
      setAppTitle(title)
      setVersion(app.version)

      const doneRes = await api.addMessages(id, [
        { role: 'agent', kind: 'app-created', content: title },
      ])
      append(doneRes.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '构建失败，请重试')
    } finally {
      setBuilding(false)
      setStreamBuf('')
      setLiveTestBugs(null)
    }
  }

  async function runFix(bugDescription: string, atts: Attachment[]) {
    if (!id || building) return
    const trimmed = bugDescription.trim()
    if (!trimmed) return
    setBuilding(true)
    setError('')
    setStreamBuf('')
    try {
      const userRes = await api.addMessages(id, [
        { role: 'user', kind: 'text', content: trimmed },
      ])
      append(userRes.messages)

      const errs = previewErrors
        .map((e) => `${e.msg}${e.src ? ' (' + e.src + (e.line ? ':' + e.line : '') + ')' : ''}`)

      // 流式消费修复过程：思考实时打字机展示
      let finalHtml = ''
      let finalThoughts: { agent: string; thinking: string }[] = []
      for await (const evt of api.fixHTMLStream(id, trimmed, errs.length ? errs : undefined, atts)) {
        if (evt.type === 'delta' && evt.text) {
          setStreamBuf((prev) => prev + evt.text!)
        } else if (evt.type === 'done') {
          finalHtml = evt.html || ''
          finalThoughts = evt.thoughts || []
          setStreamBuf('')
        } else if (evt.type === 'error') {
          throw new Error(evt.message || 'LLM 修复失败')
        }
      }

      if (finalThoughts.length > 0) {
        const msgs = finalThoughts.map((t) => ({
          role: 'agent' as const,
          kind: 'agent-log' as const,
          content: JSON.stringify({ agentId: mapAgentId(t.agent), text: t.thinking }),
        }))
        const thoughtRes = await api.addMessages(id, msgs)
        append(thoughtRes.messages)
      }

      const title = extractTitle(finalHtml, appTitle || trimmed)
      const fixedFiles = splitHtmlToFiles(finalHtml)
      const app = (await api.saveApp(id, title, finalHtml, fixedFiles)).app
      setCode(finalHtml)
      setFiles(fixedFiles)
      setAppTitle(title)
      setVersion(app.version)

      const doneRes = await api.addMessages(id, [
        { role: 'agent', kind: 'app-created', content: title },
      ])
      append(doneRes.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '修复失败，请重试')
    } finally {
      setBuilding(false)
      setStreamBuf('')
    }
  }

  /**
   * 编辑器保存：把编辑后的 files 组装回完整 HTML，
   * 调 saveApp 持久化（同时存 code + files），刷新本地状态。
   */
  async function handleSaveFiles(updatedFiles: AppFile[]) {
    if (!id || building) return
    const assembled = assembleFilesToHtml(updatedFiles)
    const title = appTitle || '应用'
    try {
      const app = (await api.saveApp(id, title, assembled, updatedFiles)).app
      setCode(assembled)
      setFiles(updatedFiles)
      setVersion(app.version)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  useEffect(() => {
    if (!id || startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const proj = await api.getProject(id)
        setProject(proj.project)
        const [msgs, latest] = await Promise.all([
          api.listMessages(id),
          api.getLatestApp(id),
        ])
        setMessages(msgs.messages)
        if (latest.app) {
          setCode(latest.app.code)
          setFiles(latest.app.files || splitHtmlToFiles(latest.app.code))
          setAppTitle(latest.app.name || '应用')
          setVersion(latest.app.version)
        }
        if (promptParam && promptParam.trim()) {
          setParams({}, { replace: true })
          runBuild(promptParam, [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, building, streamBuf, liveTestBugs, buildPhase])

  // 拉取已配置的 LLM 条目（用于模型切换徽章）
  useEffect(() => {
    ;(async () => {
      try {
        const cfgRes = await api.getLLMConfigs()
        setLLMConfigs(cfgRes.configs)
        setActiveLLMId(cfgRes.activeId)
      } catch {
        /* 忽略：模型徽章非关键功能 */
      }
    })()
  }, [])

  // 点击模型下拉外部时关闭
  useEffect(() => {
    if (!modelMenuOpen) return
    function onClick(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [modelMenuOpen])

  // textarea 自适应高度：起始 3 行（72px），最大 200px
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(72, Math.min(el.scrollHeight, 200)) + 'px'
  }, [input])

  /** Enter 发送，Shift+Enter 换行 */
  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!building && (input.trim() || attachments.length > 0)) {
        submit(e as unknown as FormEvent)
      }
    }
  }

  async function handleShare() {
    if (!id) return
    const res = await api.createShare(id)
    setShareUrl(`${window.location.origin}/share/${res.slug}`)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = input
    if (!p.trim() && attachments.length === 0) return
    setInput('')
    const atts = attachments
    setAttachments([])
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    if (code) {
      await runFix(p, atts)
    } else {
      await runBuild(p, atts)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-ink text-white">
      {/* 顶部栏 */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line/60 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/app/projects"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-white"
            title="返回项目列表"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold leading-tight">
              {project?.name || '加载中...'}
            </h1>
            <p className="truncate font-mono text-xs text-muted">
              {building ? '智能体团队协作中...' : 'Atoms 工作台'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'hidden items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs sm:flex',
              building
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-line bg-surface-2 text-muted',
            )}
          >
            {building ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#6fe3a5]" />
            )}
            {building ? '构建中' : '就绪'}
          </span>
        </div>
      </header>

      {/* 主体：左侧对话 / 右侧预览 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 左：对话 */}
        <aside className="flex h-[46vh] min-h-0 flex-col border-b border-line lg:h-auto lg:w-[400px] lg:flex-none lg:border-b-0 lg:border-r">
          {/* 模板捷径 */}
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-line/60 px-4 py-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => runBuild(t.prompt, [])}
                disabled={building}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-white disabled:opacity-50"
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 消息流 */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-xl border border-line bg-surface"
                  />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent">
                  <Sparkles size={22} />
                </span>
                <p className="mt-4 text-sm font-semibold">开始构建你的应用</p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-muted">
                  输入一句话描述，或点击上方的模板，智能体团队将协作生成可运行的应用。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <MessageItem key={m.id} message={m} />
                ))}
                {building && streamBuf && (
                  <StreamingThoughts buf={streamBuf} />
                )}
                {building && !streamBuf && liveTestBugs !== null && (
                  <TestResultBubble bugs={liveTestBugs} />
                )}
                {building && !streamBuf && liveTestBugs === null && (
                  <div className="flex items-center gap-2 pl-1 text-xs text-muted">
                    <Loader2 size={12} className="animate-spin text-accent" />
                    {buildPhase === 'testing'
                      ? '测试员正在真实浏览器中测试生成的代码...'
                      : buildPhase === 'fixing'
                        ? '正在修复测试发现的问题...'
                        : buildPhase === 'complete'
                          ? '正在收尾...'
                          : '正在连接大模型...'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <form
            onSubmit={submit}
            className="shrink-0 border-t border-line/60 p-3"
          >
            {error && (
              <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div>{error}</div>
                  {isLLMConfigError(error) && (
                    <Link
                      to="/app/settings"
                      className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                    >
                      <SettingsIcon size={11} /> 前往设置
                    </Link>
                  )}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-line bg-surface-2 p-1.5 focus-within:border-accent">
              {/* 附件预览 */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 pt-1 pb-2">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="group flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted"
                      title={a.name}
                    >
                      {a.kind === 'image' ? (
                        <img
                          src={a.dataUrl}
                          alt={a.name}
                          className="h-6 w-6 rounded object-cover"
                        />
                      ) : (
                        <FileText size={13} className="shrink-0 text-muted" />
                      )}
                      <span className="max-w-[120px] truncate">{a.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="ml-0.5 rounded p-0.5 text-muted hover:bg-surface-2 hover:text-white"
                        aria-label={`移除 ${a.name}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 上方：输入区（约 3 行高，最高 200px） */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={code ? '描述遇到的问题，例如：点击添加没反应...（Shift+Enter 换行）' : '描述你想要的应用...（Shift+Enter 换行）'}
                rows={3}
                className="block max-h-[200px] min-h-[72px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white placeholder:text-muted/70 focus:outline-none"
              />

              {/* 下方：按钮区 */}
              <div className="flex items-center justify-between gap-1.5 pt-1">
                {/* 左：上传按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={building}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-white disabled:opacity-50"
                  title="上传图片或文本附件"
                  aria-label="上传附件"
                >
                  <Paperclip size={15} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.markdown,.json,.csv,.js,.ts,.tsx,.jsx,.html,.htm,.css,.py,.yml,.yaml,.xml,.svg,.sh,.go,.java,.rs"
                  onChange={handleFilePick}
                  className="hidden"
                />
                {/* 右：模型切换 + 发送 */}
                <div className="flex items-center gap-1.5">
                  <ModelSwitcher
                    configs={llmConfigs}
                    activeId={activeLLMId}
                    open={modelMenuOpen}
                    switching={switchingModel}
                    onToggle={() => setModelMenuOpen((v) => !v)}
                    onPick={switchConfig}
                    menuRef={modelMenuRef}
                  />
                  <Button
                    size="sm"
                    type="submit"
                    disabled={building || (!input.trim() && attachments.length === 0)}
                  >
                    {building ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={14} className="mr-1" />
                        发送
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </aside>

        {/* 右：预览 */}
        <main className="min-h-0 flex-1 p-3 sm:p-4">
          <CodePreview
            code={code}
            version={version}
            appTitle={appTitle}
            shareUrl={shareUrl}
            onShare={handleShare}
            errors={previewErrors}
            onClearErrors={() => setPreviewErrors([])}
            files={files}
            onSaveFiles={handleSaveFiles}
          />
        </main>
      </div>
    </div>
  )
}

/** 用户消息气泡 + 悬停时显示的一键复制按钮 */
function UserMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板被浏览器拦截，静默忽略 */
    }
  }
  return (
    <div className="group flex items-center gap-1.5 justify-end">
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-white group-hover:opacity-100 focus:opacity-100"
        title={copied ? '已复制' : '复制'}
        aria-label="复制该消息"
      >
        {copied ? <Check size={13} className="text-[#6fe3a5]" /> : <Copy size={13} />}
      </button>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-sm font-medium text-[#141210]">
        {content}
      </div>
    </div>
  )
}

function MessageItem({ message }: { message: Message }) {
  if (message.role === 'user') {
    return <UserMessage content={message.content} />
  }

  if (message.kind === 'app-created') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[#6fe3a5]/25 bg-[#6fe3a5]/8 px-3.5 py-3">
        <CheckCircle2 size={17} className="shrink-0 text-[#6fe3a5]" />
        <div className="min-w-0 text-sm">
          <span className="font-semibold text-[#6fe3a5]">应用已生成</span>
          <span className="text-muted"> · {message.content}</span>
        </div>
      </div>
    )
  }

  const log = parseAgentLog(message.content)
  if (log) {
    return (
      <div className="flex items-start gap-2.5">
        <AgentAvatar agentId={log.agentId} size="sm" className="mt-0.5" />
        <div className="min-w-0 pt-0.5">
          <span className="block text-xs font-semibold text-muted">
            {(log.agentId === 'researcher' && '研究员') ||
              (log.agentId === 'pm' && '产品经理') ||
              (log.agentId === 'architect' && '架构师') ||
              (log.agentId === 'engineer' && '工程师') ||
              (log.agentId === 'qa' && '测试') ||
              '智能体'}
          </span>
          <p className="text-sm leading-relaxed">{log.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <AgentAvatar agentId="engineer" size="sm" className="mt-0.5" />
      <p className="pt-0.5 text-sm leading-relaxed">{message.content}</p>
    </div>
  )
}

/**
 * 模型切换器：显示当前生效条目，下拉列出全部已配置模型，
 * 点击切换 active（每条配置携带各自独立的 API Key）。
 */
function ModelSwitcher({
  configs,
  activeId,
  open,
  switching,
  onToggle,
  onPick,
  menuRef,
}: {
  configs: LLMConfigItem[]
  activeId: string | null
  open: boolean
  switching: boolean
  onToggle: () => void
  onPick: (cfg: LLMConfigItem) => void
  menuRef: React.RefObject<HTMLDivElement | null>
}) {
  const current = configs.find((c) => c.id === activeId) ?? configs[0]
  const currentLabel = current?.model || '未配置'
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={switching}
        className="flex h-9 max-w-[160px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-white disabled:opacity-50"
        title={current ? `当前: ${current.baseUrl} · ${current.model}` : '请先在设置页配置 LLM'}
      >
        {switching ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${current ? 'bg-accent' : 'bg-danger'}`} />
        )}
        <span className="truncate font-mono">{currentLabel}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-64 overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl">
          <div className="border-b border-line/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            切换模型（各自独立 API Key）
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {configs.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-muted">
                        尚未配置模型，请先在设置中添加。
              </li>
            )}
            {configs.map((c) => {
              const isActive = c.id === (activeId ?? current?.id)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface',
                      isActive ? 'text-accent' : 'text-white',
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <span className="truncate font-semibold">{c.model}</span>
                      {isActive && <CheckCircle2 size={11} className="ml-auto shrink-0" />}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted">{c.baseUrl}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-line/60 px-3 py-1.5">
            <Link
              to="/app/settings"
              className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-white"
              onClick={() => onToggle()}
            >
              <SettingsIcon size={10} /> 管理模型与 API Key
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 测试员结果气泡：把 Playwright 跑出来的 BugReport[] 渲染成 QA 角色消息。
 * bugs 为空表示测试通过。
 */
function TestResultBubble({ bugs }: { bugs: BugReport[] }) {
  const passed = bugs.length === 0
  const text = passed
    ? '真实浏览器测试通过，未发现问题。'
    : `真实浏览器测试发现 ${bugs.length} 个问题：\n${bugs
        .map((b, i) => `${i + 1}. [${b.type}] ${b.message}${b.location ? ` (${b.location})` : ''}`)
        .join('\n')}`
  return (
    <div className="flex items-start gap-2.5">
      <AgentAvatar agentId="qa" size="sm" className="mt-0.5" />
      <div className="min-w-0 pt-0.5">
        <span className="block text-xs font-semibold text-muted">测试员</span>
        <div
          className={cn(
            'mt-1 rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed',
            passed
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          <pre className="whitespace-pre-wrap break-words font-sans">{text}</pre>
        </div>
      </div>
    </div>
  )
}

/**
 * 流式团队思考展示：
 * 把 LLM 实时产出的 buffer 切成「完整角色行 + 当前正在打字的一行」。
 * 遇到 ===HTML=== 标记后切换为「正在生成应用代码...」提示，不再渲染思考。
 */
function StreamingThoughts({ buf }: { buf: string }) {
  const markerIdx = buf.indexOf('===HTML===')
  const thoughtPart = markerIdx >= 0 ? buf.slice(0, markerIdx) : buf
  const htmlStarted = markerIdx >= 0

  // 按行切分：除最后一行外都是完整的角色思考；最后一行可能仍在打字中
  const lines = thoughtPart.split(/\r?\n/)
  const parsed: { agent: string; thinking: string }[] = []
  // 全部行尝试解析，最后一行单独处理
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/^\s*[-*\d.\s]*([^\s:：][^:：]{1,12})[：:]\s*(.+)$/)
    if (m) parsed.push({ agent: m[1].trim(), thinking: m[2].trim() })
  }

  const lastLine = lines[lines.length - 1] || ''
  const lastMatch = lastLine.match(/^\s*[-*\d.\s]*([^\s:：][^:：]{1,12})[：:]\s*(.*)$/)
  // 最后一行有「角色:」前缀且正在打字内容 → 当作正在输入的气泡
  const typing = !htmlStarted && lastMatch && lastMatch[2]
  // 最后一行没匹配到角色前缀但有内容 → 当前角色仍在写角色名/或 LLM 输出格式异常
  const typingAmbiguous = !htmlStarted && !lastMatch && lastLine.trim().length > 0

  return (
    <div className="space-y-3">
      {parsed.map((t, i) => (
        <ThoughtBubble
          key={i}
          agentId={mapAgentId(t.agent)}
          agentName={t.agent}
          text={t.thinking}
        />
      ))}
      {typing && lastMatch && (
        <ThoughtBubble
          agentId={mapAgentId(lastMatch[1].trim())}
          agentName={lastMatch[1].trim()}
          text={lastMatch[2]}
          typing
        />
      )}
      {typingAmbiguous && (
        <div className="flex items-start gap-2.5">
          <AgentAvatar agentId="researcher" size="sm" className="mt-0.5" />
          <div className="min-w-0 pt-0.5">
            <span className="block text-xs font-semibold text-muted">研究员</span>
            <p className="text-sm leading-relaxed">
              {lastLine}
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
            </p>
          </div>
        </div>
      )}
      {htmlStarted && (
        <div className="flex items-center gap-2 pl-1 text-xs text-muted">
          <Loader2 size={12} className="animate-spin text-accent" />
          团队思考结束，正在生成应用代码...
        </div>
      )}
    </div>
  )
}

function ThoughtBubble({
  agentId,
  agentName,
  text,
  typing,
}: {
  agentId: string
  agentName: string
  text: string
  typing?: boolean
}) {
  const label =
    (agentId === 'researcher' && '研究员') ||
    (agentId === 'pm' && '产品经理') ||
    (agentId === 'architect' && '架构师') ||
    (agentId === 'engineer' && '工程师') ||
    (agentId === 'qa' && '测试') ||
    agentName
  return (
    <div className="flex items-start gap-2.5">
      <AgentAvatar agentId={agentId} size="sm" className="mt-0.5" />
      <div className="min-w-0 pt-0.5">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        <p className="text-sm leading-relaxed">
          {text}
          {typing && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
          )}
        </p>
      </div>
    </div>
  )
}