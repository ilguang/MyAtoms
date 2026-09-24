/**
 * HTML <-> 多文件 拆分/组装 helper。
 *
 * 设计原则：
 * - code（组装后的完整 HTML）始终是预览/LLM/Playwright/分享的「运行时版本」，全程不动
 * - files（拆分后的多文件视图）只供编辑器使用
 * - 旧 app 可能没有 files 字段，由调用方现场用 splitHtmlToFiles 兜底
 *
 * 拆分规则：抽所有 inline <style> 合并到 style.css，抽所有 inline 无 src 的 <script>
 * 合并到 script.js，原 HTML 去掉这些标签得到 index.html。
 * 组装规则：取 index.html，把 style.css 用 <style> 注入 </head> 前，
 * script.js 用 <script> 注入 </body> 前。
 */

export interface AppFile {
  path: string
  content: string
}

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

/** 是否为 inline 脚本（无 src 属性） */
function isInlineScript(attrs: string): boolean {
  return !/\bsrc\s*=/.test(attrs)
}

/**
 * 把自包含 HTML 拆成 [index.html, style.css, script.js]。
 * 即使没有 style/script 标签也会返回对应空内容的文件，方便编辑器展示。
 */
export function splitHtmlToFiles(html: string): AppFile[] {
  if (!html || !html.trim()) {
    return [
      { path: 'index.html', content: '' },
      { path: 'style.css', content: '' },
      { path: 'script.js', content: '' },
    ]
  }

  // 收集所有 inline style 内容
  const styleChunks: string[] = []
  // 收集所有 inline script 内容（无 src）
  const scriptChunks: string[] = []

  // 先扫 style
  let m: RegExpExecArray | null
  while ((m = STYLE_RE.exec(html)) !== null) {
    styleChunks.push(m[1])
  }
  // 再扫 script，记下需要删除的 inline 脚本区间
  const inlineRanges: { start: number; end: number }[] = []
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    if (isInlineScript(m[1])) {
      scriptChunks.push(m[2])
      inlineRanges.push({ start: m.index, end: m.index + m[0].length })
    }
  }

  // 从原 HTML 中删掉所有 <style>...</style> 和 inline <script>...</script>
  // 合并所有待删区间，按起点降序排列后逐个删，避免索引错位
  const ranges: { start: number; end: number }[] = []
  STYLE_RE.lastIndex = 0
  while ((m = STYLE_RE.exec(html)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length })
  }
  for (const r of inlineRanges) ranges.push(r)
  ranges.sort((a, b) => b.start - a.start)
  let indexHtml = html
  for (const r of ranges) {
    indexHtml = indexHtml.slice(0, r.start) + indexHtml.slice(r.end)
  }
  // 清理删完后留下的多余空行（连续 3 个以上换行压成 2 个）
  indexHtml = indexHtml.replace(/\n{3,}/g, '\n\n').trim() + '\n'

  return [
    { path: 'index.html', content: indexHtml },
    { path: 'style.css', content: styleChunks.join('\n\n') },
    { path: 'script.js', content: scriptChunks.join('\n\n') },
  ]
}

/** 根据扩展名推断 Monaco 语言 */
export function languageForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md')) return 'markdown'
  return 'plaintext'
}

/**
 * 把 files 组装回单 HTML：
 * - 取 index.html 作为骨架
 * - style.css 用 <style> 包起来注入 </head> 前
 * - script.js 用 <script> 包起来注入 </body> 前
 * - 其余文件（如 notes.md）不参与组装，只在编辑器里可见
 * - 没有 index.html 时兜底用 code 原样返回
 */
export function assembleFilesToHtml(files: AppFile[]): string {
  const find = (p: string) => files.find((f) => f.path === p)?.content ?? ''
  const indexHtml = find('index.html')
  const css = find('style.css')
  const js = find('script.js')

  if (!indexHtml) {
    // 兜底：没有 index.html，把所有内容拼一段最小 HTML
    const body = files.map((f) => f.content).join('\n\n')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>应用</title>${
      css ? `<style>\n${css}\n</style>` : ''
    }</head><body>\n${body}\n${js ? `<script>\n${js}\n</script>` : ''}</body></html>`
  }

  let out = indexHtml
  if (css.trim()) {
    const styleTag = `<style>\n${css}\n</style>`
    const lower = out.toLowerCase()
    const headEnd = lower.lastIndexOf('</head>')
    if (headEnd >= 0) {
      out = out.slice(0, headEnd) + styleTag + '\n' + out.slice(headEnd)
    } else {
      // 没有 </head>，尝试在 <html> 或 <!DOCTYPE> 后插入
      const htmlStart = lower.indexOf('<html')
      if (htmlStart >= 0) {
        const tagEnd = out.indexOf('>', htmlStart)
        out = out.slice(0, tagEnd + 1) + `\n<head>${styleTag}</head>` + out.slice(tagEnd + 1)
      } else {
        out = `<!DOCTYPE html><html><head>${styleTag}</head></html><html>` + out
      }
    }
  }
  if (js.trim()) {
    const scriptTag = `<script>\n${js}\n</script>`
    const lower = out.toLowerCase()
    const bodyEnd = lower.lastIndexOf('</body>')
    if (bodyEnd >= 0) {
      out = out.slice(0, bodyEnd) + scriptTag + '\n' + out.slice(bodyEnd)
    } else {
      out = out + '\n' + scriptTag
    }
  }
  return out
}
