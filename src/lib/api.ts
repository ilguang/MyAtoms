/**
 * REST API 客户端。
 */
import { useAuth } from './auth'
import type { User, Project, Message, GeneratedApp, LLMConfigList, LLMPreset } from './types'

const BASE = '/api'

interface ApiEnvelope {
  success: boolean
  error?: string
  [key: string]: unknown
}

async function request<T extends ApiEnvelope>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = useAuth.getState().token
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = (await res.json().catch(() => ({}))) as T
  if (!res.ok) {
    throw new Error((data as ApiEnvelope).error || '请求失败，请稍后重试')
  }
  return data
}

/** 测试员发现的问题（与后端 BugReport 对应） */
export interface BugReport {
  type: 'runtime-error' | 'console-error' | 'interaction-error'
  message: string
  location?: string
  context?: string
}

/**
 * SSE 流事件：
 * - delta：LLM 增量 token
 * - phase：阶段切换（generating/testing/fixing/complete），前端据此切显示状态
 * - test-result：测试员跑完一轮，给出 bugs（可能为空）
 * - done：整个流程完成（含最终 HTML、累计思考、是否测试过、修复问题数）
 * - error：错误
 */
export interface LLMStreamEvent {
  type: 'delta' | 'done' | 'error' | 'phase' | 'test-result'
  text?: string
  html?: string
  thoughts?: { agent: string; thinking: string }[]
  message?: string
  status?: number
  phase?: 'generating' | 'testing' | 'fixing' | 'complete'
  bugs?: BugReport[]
  tested?: boolean
  bugsFixed?: number
}

/** 用户上传的附件：图片用 dataUrl 走多模态，文本类直接拼到 prompt */
export type Attachment =
  | { kind: 'image'; name: string; dataUrl: string }
  | { kind: 'text'; name: string; content: string }

/**
 * 消费后端 SSE 流，逐事件 yield。
 * 若服务端返回非 200（如 400 配置错误），抛出 Error。
 */
async function* streamSSE(
  path: string,
  body: unknown,
): AsyncGenerator<LLMStreamEvent> {
  const token = useAuth.getState().token
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // 非流式错误：尝试解析 JSON
    const data = (await res.json().catch(() => ({}))) as ApiEnvelope
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  if (!res.body) {
    throw new Error('响应没有可读流')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let sseBuf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    sseBuf += decoder.decode(value, { stream: true })
    // SSE 事件以空行分隔；最后一段可能不完整，保留到 sseBuf
    const segments = sseBuf.split('\n\n')
    sseBuf = segments.pop() || ''
    for (const seg of segments) {
      if (!seg.trim()) continue
      let eventType = 'message'
      let data = ''
      for (const line of seg.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          data += line.slice(5).trimStart()
        }
      }
      if (!data) continue
      try {
        const payload = JSON.parse(data) as LLMStreamEvent
        // 优先用 SSE event: 头里的类型，兜底用 payload.type
        yield { ...payload, type: (eventType as LLMStreamEvent['type']) || payload.type }
      } catch {
        /* 忽略半截 JSON */
      }
    }
  }
}

export interface AuthResponse extends ApiEnvelope {
  token: string
  user: User
}

export interface MessageInput {
  role: 'user' | 'agent'
  kind: 'text' | 'agent-log' | 'app-created'
  content: string
}

export const api = {
  // 认证
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<ApiEnvelope>('/auth/logout', { method: 'POST' }),
  me: () => request<ApiEnvelope & { user: User }>('/auth/me'),

  // 项目
  listProjects: () =>
    request<ApiEnvelope & { projects: Project[] }>('/projects'),
  getProject: (id: string) =>
    request<ApiEnvelope & { project: Project }>(`/projects/${id}`),
  createProject: (name: string, description: string) =>
    request<ApiEnvelope & { project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  deleteProject: (id: string) =>
    request<ApiEnvelope>(`/projects/${id}`, { method: 'DELETE' }),

  // 消息
  listMessages: (projectId: string) =>
    request<ApiEnvelope & { messages: Message[] }>(
      `/projects/${projectId}/messages`,
    ),
  addMessages: (projectId: string, messages: MessageInput[]) =>
    request<ApiEnvelope & { messages: Message[] }>(
      `/projects/${projectId}/messages`,
      { method: 'POST', body: JSON.stringify({ messages }) },
    ),

  // 应用
  saveApp: (
    projectId: string,
    name: string,
    code: string,
    files?: { path: string; content: string }[],
  ) =>
    request<ApiEnvelope & { app: GeneratedApp }>(`/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify({ name, code, files }),
    }),
  getLatestApp: (projectId: string) =>
    request<ApiEnvelope & { app: GeneratedApp | null }>(
      `/projects/${projectId}/apps/latest`,
    ),

  // 分享
  createShare: (projectId: string) =>
    request<ApiEnvelope & { slug: string }>(`/projects/${projectId}/share`, {
      method: 'POST',
    }),
  getShare: (slug: string) =>
    request<ApiEnvelope & { name: string; code: string; projectName: string }>(
      `/share/${slug}`,
    ),

  // LLM 配置（多条，可增删改 + 切换当前生效条目）
  getLLMConfigs: () =>
    request<ApiEnvelope & LLMConfigList>('/llm/configs'),
  addLLMConfig: (baseUrl: string, model: string, apiKey: string) =>
    request<ApiEnvelope & LLMConfigList>('/llm/configs', {
      method: 'POST',
      body: JSON.stringify({ baseUrl, model, apiKey }),
    }),
  /** 编辑条目；apiKey 传空字符串表示保留原 Key */
  updateLLMConfig: (
    id: string,
    payload: { baseUrl?: string; model?: string; apiKey?: string },
  ) =>
    request<ApiEnvelope & LLMConfigList>(`/llm/configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteLLMConfig: (id: string) =>
    request<ApiEnvelope & LLMConfigList>(`/llm/configs/${id}`, {
      method: 'DELETE',
    }),
  activateLLMConfig: (id: string) =>
    request<ApiEnvelope & LLMConfigList>(`/llm/configs/${id}/activate`, {
      method: 'PUT',
    }),
  listLLMPresets: () =>
    request<ApiEnvelope & { presets: LLMPreset[] }>('/llm/presets'),

  // LLM 流式生成 / 修复：返回 AsyncGenerator，逐事件 yield；可选附件随请求体一起发
  generateHTMLStream: (prompt: string, attachments?: Attachment[]) =>
    streamSSE('/llm/generate', { prompt, attachments }),
  fixHTMLStream: (
    projectId: string,
    bugDescription: string,
    runtimeErrors?: string[],
    attachments?: Attachment[],
  ) =>
    streamSSE('/llm/fix', { projectId, bugDescription, runtimeErrors, attachments }),
}