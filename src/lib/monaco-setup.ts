/**
 * Monaco 本地加载配置：
 * 默认 @monaco-editor/react 会从 jsdelivr CDN 拉取 monaco 主包，
 * 国内网络常超时导致代码 Tab 空白。这里改为从 node_modules 本地打包，
 * 并用 Vite 的 ?worker 方式注册各语言 worker。
 *
 * 动态 import + 单例 Promise：仅在用户首次打开「代码」Tab 时加载，不拖慢首屏。
 */
import { loader } from '@monaco-editor/react'

let promise: Promise<void> | null = null

export function ensureMonaco(): Promise<void> {
  if (promise) return promise
  promise = (async () => {
    const [monaco, editorWorker, jsonWorker, cssWorker, htmlWorker, tsWorker] =
      await Promise.all([
        import('monaco-editor'),
        import('monaco-editor/esm/vs/editor/editor.worker.js?worker'),
        import('monaco-editor/esm/vs/language/json/json.worker.js?worker'),
        import('monaco-editor/esm/vs/language/css/css.worker.js?worker'),
        import('monaco-editor/esm/vs/language/html/html.worker.js?worker'),
        import('monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'),
      ])

    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === 'json') return new jsonWorker.default()
        if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker.default()
        if (label === 'html' || label === 'handlebars' || label === 'razor')
          return new htmlWorker.default()
        if (label === 'typescript' || label === 'javascript') return new tsWorker.default()
        return new editorWorker.default()
      },
    }

    // 让 @monaco-editor/react 复用本地 monaco，不再请求 CDN
    loader.config({ monaco })
    // 暴露到 window，供外部读取 model（编辑器实例由 @monaco-editor/react 持有）
    ;(
      window as unknown as { monaco: typeof import('monaco-editor') }
    ).monaco = monaco
  })()
  return promise
}
