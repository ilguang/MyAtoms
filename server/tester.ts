/**
 * 测试员：用 Playwright 无头 chromium 真实加载生成的 HTML，
 * 捕获运行时异常、console.error、交互失败，返回 BugReport[]。
 *
 * 测试流程：
 * 1. 启动 chromium，新开页面
 * 2. 监听 console（error）/ pageerror / dialog（自动 accept 防 alert 阻塞）
 * 3. page.setContent(html) 加载代码
 * 4. 模拟交互：逐个 click 按钮、fill 输入框、submit 表单，每次 try/catch 捕错
 * 5. 关闭浏览器（try/finally 保证清理），去重返回 bugs
 */
import type { Page, ConsoleMessage } from 'playwright'
import type { BugReport } from './llm.js'

// 延迟加载 playwright：模块名用变量，避免打包器/nft 静态追踪，
// 否则会把约 18MB 的 playwright-core 打进 Vercel serverless 函数
// （Vercel 上无 chromium，测试环节本就会跳过）。
const PLAYWRIGHT_MODULE = 'playwright'

/**
 * 用无头 chromium 真实测试一段 HTML，返回发现的问题列表。
 * 返回 null 表示当前环境无法启动 chromium（如 Vercel Serverless 未安装浏览器），
 * 调用方应跳过测试环节，而不是当成 bug。
 */
export async function testHTML(html: string): Promise<BugReport[] | null> {
  let browser
  try {
    const { chromium } = await import(PLAYWRIGHT_MODULE)
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    console.warn(
      '[tester] chromium 不可用，跳过真实测试：',
      e instanceof Error ? e.message : String(e),
    )
    return null
  }

  const bugs: BugReport[] = []
  const seen = new Set<string>()
  const addBug = (b: BugReport): void => {
    const key = `${b.type}|${b.message}|${b.location || ''}`
    if (seen.has(key)) return
    seen.add(key)
    bugs.push(b)
  }

  const page: Page = await browser.newPage()

  // 捕获 console.error
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // 过滤掉 favicon 404 等噪声
      if (/favicon|Failed to load resource/i.test(text)) return
      addBug({ type: 'console-error', message: text, location: msg.location().url })
    }
  })

  // 捕获未捕获异常
  page.on('pageerror', (err: Error) => {
    addBug({ type: 'runtime-error', message: err.message, context: err.stack })
  })

  // 自动接受 alert/confirm/prompt，防止阻塞
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept()
    } catch {
      /* ignore */
    }
  })

  try {
    // 加载 HTML
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 15000 })
    } catch (e) {
      addBug({
        type: 'runtime-error',
        message: `页面加载失败：${e instanceof Error ? e.message : String(e)}`,
      })
      return bugs
    }

    // 等一拍，让 onload 里的报错冒出来
    await page.waitForTimeout(500)

    // 模拟交互：逐个点击按钮
    const buttons = await page.$$('button')
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i]
      const label = await btn.evaluate((el) => (el as HTMLButtonElement).textContent || `[button#${i}]`).catch(() => `[button#${i}]`)
      try {
        await btn.click({ timeout: 3000 })
        await page.waitForTimeout(150)
      } catch (e) {
        addBug({
          type: 'interaction-error',
          message: `点击按钮「${label}」失败：${e instanceof Error ? e.message : String(e)}`,
          location: `button: ${label}`,
        })
      }
    }

    // 模拟交互：逐个填写输入框
    const inputs = await page.$$('input, textarea')
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i]
      const name = await inp.evaluate((el) => {
        const e = el as HTMLInputElement
        return e.name || e.id || e.placeholder || e.type || `[input#${i}]`
      }).catch(() => `[input#${i}]`)
      try {
        await inp.fill('test', { timeout: 3000 })
        await page.waitForTimeout(100)
      } catch (e) {
        addBug({
          type: 'interaction-error',
          message: `填写输入框「${name}」失败：${e instanceof Error ? e.message : String(e)}`,
          location: `input: ${name}`,
        })
      }
    }

    // 模拟交互：提交表单
    const forms = await page.$$('form')
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i]
      try {
        await form.evaluate((el) => (el as HTMLFormElement).requestSubmit ? (el as HTMLFormElement).requestSubmit() : (el as HTMLFormElement).submit()).catch((e: unknown) => {
          throw e
        })
        await page.waitForTimeout(200)
      } catch (e) {
        addBug({
          type: 'interaction-error',
          message: `提交表单 #${i} 失败：${e instanceof Error ? e.message : String(e)}`,
          location: `form#${i}`,
        })
      }
    }

    // 最后再等一拍，让交互触发的异步错误冒出来
    await page.waitForTimeout(500)
  } finally {
    await browser.close()
  }

  return bugs
}

/** 把 BugReport[] 格式化成给 LLM 的 bug 描述文本 */
export function formatBugs(bugs: BugReport[]): string {
  if (bugs.length === 0) return ''
  const lines = bugs.map((b, i) => {
    const loc = b.location ? ` [位置: ${b.location}]` : ''
    const ctx = b.context ? `\n  堆栈: ${b.context}` : ''
    return `${i + 1}. [${b.type}] ${b.message}${loc}${ctx}`
  })
  return `Playwright 无头浏览器真实测试发现以下 ${bugs.length} 个问题：\n${lines.join('\n')}`
}
