/**
 * LLM 调用层：OpenAI 兼容协议。
 * 支持任何兼容 /v1/chat/completions（或 /chat/completions）的端点：
 * OpenAI 官方 / DeepSeek / 通义千问 / 智谱 GLM / Kimi / 自建 vLLM 等。
 */

export interface LLMGenerateInput {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  /** 可选附件：图片走 vision，文本拼到 prompt 前 */
  attachments?: Attachment[]
}

export interface LLMFixInput {
  baseUrl: string
  apiKey: string
  model: string
  code: string
  bugDescription: string
  /** 可选：预览捕获到的运行时报错，帮助 LLM 定位 */
  runtimeErrors?: string[]
  /** 可选附件 */
  attachments?: Attachment[]
}

export interface AgentThought {
  agent: string
  thinking: string
}

/** 用户上传的附件：图片用 dataUrl 走多模态，文本类直接拼到 prompt */
export type Attachment =
  | { kind: 'image'; name: string; dataUrl: string }
  | { kind: 'text'; name: string; content: string }

/** 测试员发现的问题（由 api/tester.ts 产出） */
export interface BugReport {
  type: 'runtime-error' | 'console-error' | 'interaction-error'
  message: string
  location?: string
  context?: string
}

/**
 * 流式事件：
 * - delta：LLM 增量 token
 * - phase：阶段切换（generating/testing/fixing/complete）
 * - test-result：测试员跑完一轮，给出 BugReport[]（可能为空）
 * - done：完成。低层 streamLLM 的 done 只带 html+thoughts（单次 LLM 调用完成）；
 *   路由层最终 done 额外带 tested/bugsFixed（整个流程完成）。
 * - error：错误
 */
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'phase'; phase: 'generating' | 'testing' | 'fixing' | 'complete' }
  | { type: 'test-result'; bugs: BugReport[] }
  | { type: 'done'; html: string; thoughts: AgentThought[]; tested?: boolean; bugsFixed?: number }
  | { type: 'error'; message: string; status: number }

export class LLMError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'LLMError'
    this.status = status
  }
}

const SYSTEM_PROMPT = `你带领一个智能体团队协作完成前端应用开发。团队依次思考后输出最终 HTML。真实浏览器测试由独立测试员完成，思考阶段不需要测试角色。

团队成员与思考要求（思考内容必须具体贴合用户需求，不要泛泛而谈）：
- 需求分析师：拆解用户需求，明确核心功能、交互动作、数据持久化需求
- 架构师：规划页面结构、模块划分、数据存储方案、技术取舍
- 前端工程师：给出初始实现思路（关键交互、状态管理、边界处理）；务必考虑边界 case（空输入、重复点击、localStorage 异常、移动端 viewport 等），避免常见 bug

输出格式（必须严格遵守）：
1. 依次输出每个角色的思考，每行格式为「角色名: 思考内容」（1-3 句，具体贴合需求）
2. 然后单独一行输出分隔标记：===HTML===
3. 最后输出一个完整、自包含的 HTML 文档，以 <!DOCTYPE html> 开头，以 </html> 结尾

HTML 规范：
- 所有 CSS 内联在 <style>，所有 JavaScript 内联在 <script>
- 不引用任何外部 CDN 资源；如需图标用 emoji 或 SVG 内联
- 所有按钮、表单、交互元素必须实现完整可运行逻辑，不能停留在视觉层面
- 状态数据用 localStorage 持久化（如适用），且需 try/catch 包裹防止隐私模式抛错
- 视觉简洁现代：合理留白、柔和圆角、清晰层次、单色调主题色
- 适配移动端：使用响应式布局或 viewport meta
- 代码必须精简紧凑：不写冗余注释、不重复代码、用最简实现达成功能，确保完整文档能在输出上限内收尾
- 严禁输出 markdown 代码块标记（如 \`\`\`html），HTML 部分只输出 HTML 本身`

const FIX_SYSTEM_PROMPT = `你是一位资深前端工程师。用户会给你一段已有的 HTML 代码和测试员在真实浏览器中跑出来的问题清单（可能附带运行时报错），请先输出团队修复思考过程，再输出修复后的完整 HTML。真实浏览器复测由独立测试员完成，思考阶段不需要测试角色。

团队成员与思考要求（思考内容必须具体贴合问题）：
- 需求分析师：定位问题根因，分析报错指向的代码位置
- 架构师：说明修复方案、是否影响其他模块、风险评估
- 前端工程师：给出修复思路（具体改哪些代码、为什么这样改），逐条回应测试员列出的问题，格式如"问题1：xxx → 修复：yyy"

输出格式（必须严格遵守）：
1. 依次输出每个角色的思考，每行格式为「角色名: 思考内容」（1-3 句）
2. 然后单独一行输出分隔标记：===HTML===
3. 最后输出修复后的完整 HTML 文档，以 <!DOCTYPE html> 开头，以 </html> 结尾

修复规范：
- 只修复测试员列出的问题和报错，不要重写整个应用、不要改动无关代码、不要改变视觉风格
- 所有 CSS 内联在 <style>，所有 JavaScript 内联在 <script>
- 不引用任何外部 CDN 资源
- 严禁输出任何 markdown 代码块标记、解释文字，HTML 部分只输出 HTML 本身`

const HTML_MARKER = '===HTML==='

/** 从 LLM 返回内容中解析团队思考 + HTML */
function parseThoughtsAndHtml(content: string): { thoughts: AgentThought[]; html: string } {
  const markerIdx = content.indexOf(HTML_MARKER)
  let thoughtPart = ''
  let htmlPart = content
  if (markerIdx >= 0) {
    thoughtPart = content.slice(0, markerIdx)
    htmlPart = content.slice(markerIdx + HTML_MARKER.length)
  }
  const thoughts: AgentThought[] = []
  const lines = thoughtPart.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^\s*[-*\d.\s]*([^\s:：][^:：]{1,12})[：:]\s*(.+)$/)
    if (m) {
      thoughts.push({ agent: m[1].trim(), thinking: m[2].trim() })
    }
  }
  return { thoughts, html: extractHtml(htmlPart) }
}

/** 把用户配置的 baseUrl 拼接成 chat/completions 端点 */
function buildEndpoint(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '')
  // 用户可能填 https://api.openai.com 或 https://api.openai.com/v1，统一处理
  if (!/\/v\d+$/.test(base)) base += '/v1'
  return `${base}/chat/completions`
}

/** 从 LLM 返回内容中提取 HTML */
function extractHtml(content: string): string {
  let s = (content || '').trim()
  // 兼容 ```html ... ``` 包裹
  const fence = s.match(/^```(?:html|HTML)?\s*\n([\s\S]*?)\n```$/)
  if (fence) s = fence[1].trim()
  // 兼容 ``` 开头但无闭合的情况
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:html|HTML)?\s*\n?/, '').replace(/\n?```$/, '').trim()
  }
  // 截取 <!doctype ... </html>
  const lower = s.toLowerCase()
  const start = lower.indexOf('<!doctype')
  const end = lower.lastIndexOf('</html>')
  if (start >= 0 && end > start) return s.slice(start, end + 7)
  // 兜底：直接返回
  return s
}

/** 把 HTTP 状态码翻译成中文提示 */
function hintForStatus(status: number): string {
  if (status === 401 || status === 403) return '（可能是 API Key 无效或无权访问该模型）'
  if (status === 402) return '（账户余额不足，请前往供应商后台充值）'
  if (status === 404) return '（端点或模型不存在，请检查 baseUrl 和 model 名称）'
  if (status === 429) return '（请求频率或额度超限）'
  return ''
}

/**
 * 构造发给 LLM 的 user message 内容：
 * - 无附件：直接返回 prompt 字符串
 * - 仅文本附件：把附件内容拼到 prompt 前，仍返回字符串
 * - 含图片附件：返回 OpenAI 多模态 content 数组（text + image_url 段）
 */
function buildUserContent(
  prompt: string,
  attachments?: Attachment[],
): string | Array<Record<string, unknown>> {
  if (!attachments || attachments.length === 0) return prompt
  const images = attachments.filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image')
  const texts = attachments.filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text')

  if (images.length === 0) {
    // 纯文本附件：拼到 prompt 前面，避免对非视觉模型造成兼容问题
    const textPrefix = texts
      .map((t) => `[附件 ${t.name}]\n${t.content}`)
      .join('\n\n')
    return textPrefix ? `${textPrefix}\n\n${prompt}` : prompt
  }

  // 含图片：用 OpenAI vision 多模态格式
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  for (const t of texts) {
    parts.push({ type: 'text', text: `[附件 ${t.name}]\n${t.content}` })
  }
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: img.dataUrl } })
  }
  return parts
}

/**
 * 流式调用 LLM。底层调用 OpenAI 兼容协议，stream:true，
 * 把每个 token 增量以 delta 事件 yield，流末解析完整内容后 yield done/error。
 */
async function* streamLLM(
  input: LLMGenerateInput | LLMFixInput,
  systemPrompt: string,
  userContent: string,
  temperature: number,
): AsyncGenerator<StreamEvent> {
  const endpoint = buildEndpoint(input.baseUrl)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserContent(userContent, input.attachments) },
        ],
        temperature,
        // DeepSeek-chat 官方输出上限 8192（思考+HTML 共享）；复杂应用仍可能被截断，
        // 截断时下方会根据 finish_reason=length 给出明确提示
        max_tokens: 8192,
        stream: true,
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    yield {
      type: 'error',
      message: `无法连接 LLM 服务：${msg}（请检查 baseUrl 是否可达）`,
      status: 502,
    }
    return
  }

  if (!res.ok) {
    let errBody = ''
    try {
      errBody = await res.text()
    } catch {
      /* ignore */
    }
    yield {
      type: 'error',
      message: `LLM 服务返回 ${res.status}${hintForStatus(res.status)}：${errBody.slice(0, 300)}`,
      status: res.status,
    }
    return
  }

  if (!res.body) {
    yield { type: 'error', message: 'LLM 响应流为空', status: 502 }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let sseBuf = ''
  let full = ''
  let finishReason: string | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuf += decoder.decode(value, { stream: true })
      // 按空行切分 SSE 事件；最后一段可能不完整，保留到 sseBuf
      const segments = sseBuf.split('\n\n')
      sseBuf = segments.pop() || ''
      for (const seg of segments) {
        if (!seg.trim()) continue
        let data = ''
        for (const line of seg.split(/\r?\n/)) {
          if (line.startsWith('data:')) data += line.slice(5).trimStart()
        }
        if (!data) continue
        if (data === '[DONE]') continue
        let delta = ''
        try {
          const json = JSON.parse(data)
          const choice = json?.choices?.[0]
          delta = choice?.delta?.content || ''
          // 记录结束原因：length=达到 max_tokens 被截断，stop=正常结束
          if (choice?.finish_reason) finishReason = choice.finish_reason
        } catch {
          /* 忽略半截 JSON */
        }
        if (delta) {
          full += delta
          yield { type: 'delta', text: delta }
        }
      }
    }
    // flush 最后一段
    if (sseBuf.trim()) {
      let data = ''
      for (const line of sseBuf.split(/\r?\n/)) {
        if (line.startsWith('data:')) data += line.slice(5).trimStart()
      }
      if (data && data !== '[DONE]') {
        try {
          const json = JSON.parse(data)
          const choice = json?.choices?.[0]
          const delta: string = choice?.delta?.content || ''
          if (choice?.finish_reason) finishReason = choice.finish_reason
          if (delta) {
            full += delta
            yield { type: 'delta', text: delta }
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    yield { type: 'error', message: `LLM 流读取中断：${msg}`, status: 502 }
    return
  }

  if (!full) {
    yield { type: 'error', message: 'LLM 未返回任何内容', status: 502 }
    return
  }
  const { thoughts, html } = parseThoughtsAndHtml(full)
  if (!html || !/<\/html>/i.test(html)) {
    // finish_reason=length 表示输出达到 max_tokens 被截断，HTML 没收尾
    if (finishReason === 'length') {
      yield {
        type: 'error',
        message:
          '生成内容过长被模型截断（达到 8192 token 上限），HTML 不完整。请简化需求（例如减少功能点、拆分页面），或在设置中切换支持更长输出的模型后重试。',
        status: 502,
      }
    } else {
      yield { type: 'error', message: 'LLM 未返回有效 HTML 文档（可能未按格式输出，请重试或更换模型）', status: 502 }
    }
    return
  }
  yield { type: 'done', html, thoughts }
}

/** 流式生成 HTML */
export function streamGenerateHTML(input: LLMGenerateInput): AsyncGenerator<StreamEvent> {
  return streamLLM(input, SYSTEM_PROMPT, input.prompt, 0.7)
}

/** 流式修复已有 HTML */
export function streamFixHTML(input: LLMFixInput): AsyncGenerator<StreamEvent> {
  const bugPart =
    input.runtimeErrors && input.runtimeErrors.length > 0
      ? `\n\n浏览器捕获到的运行时报错：\n${input.runtimeErrors.map((e) => '- ' + e).join('\n')}`
      : ''
  const userContent = `已有代码：
\`\`\`html
${input.code}
\`\`\`

用户反馈的问题：
${input.bugDescription}${bugPart}

请修复上述问题，输出修复后的完整 HTML。`
  return streamLLM(input, FIX_SYSTEM_PROMPT, userContent, 0.3)
}
