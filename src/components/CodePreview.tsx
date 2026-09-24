/**
 * 代码预览面板：iframe 实时预览 + 代码编辑器（FileTree + Monaco） + 复制 / 下载 / 分享 + 运行时报错捕获。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Copy,
  Check,
  Download,
  Share2,
  Eye,
  Code2,
  Loader2,
  TriangleAlert,
  Bug,
  Save,
  FilePlus,
  Trash2,
  File as FileIcon,
  Folder as FolderIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui'
import type { AppFile } from '@/lib/types'
import { languageForPath } from '@/lib/htmlFiles'
import { ensureMonaco } from '@/lib/monaco-setup'

type Tab = 'preview' | 'code'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export interface PreviewError {
  kind: 'error' | 'unhandledrejection' | 'console-error'
  msg: string
  src?: string
  line?: number
  col?: number
  t: number
}

/** 注入到 iframe 内的探针：捕获 error / unhandledrejection / console.error，postMessage 回父窗口 */
const PROBE = `<script>(function(){
  function send(payload){try{parent.postMessage(Object.assign({__source:'atoms-preview'},payload),'*')}catch(e){}}
  window.addEventListener('error',function(e){
    send({type:'error',msg:e.message||String(e.message),src:e.filename||'',line:e.lineno||0,col:e.colno||0});
  });
  window.addEventListener('unhandledrejection',function(e){
    var r=e.reason;var msg=(r&&r.message)?r.message:String(r);
    send({type:'unhandledrejection',msg:'Unhandled rejection: '+msg,src:'',line:0,col:0});
  });
  var origErr=console.error;
  console.error=function(){
    try{
      var parts=Array.prototype.map.call(arguments,function(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(x){return String(a)}});
      send({type:'console-error',msg:parts.join(' '),src:'',line:0,col:0});
    }catch(x){}
    origErr.apply(console,arguments);
  };
})();<\/script>`

/** 把探针注入到 HTML 末尾（</body> 或 </html> 前） */
function injectProbe(html: string): string {
  if (!html) return html
  const lower = html.toLowerCase()
  const bodyEnd = lower.lastIndexOf('</body>')
  const htmlEnd = lower.lastIndexOf('</html>')
  if (bodyEnd >= 0) {
    return html.slice(0, bodyEnd) + PROBE + html.slice(bodyEnd)
  }
  if (htmlEnd >= 0) {
    return html.slice(0, htmlEnd) + PROBE + html.slice(htmlEnd)
  }
  return html + PROBE
}

interface CodePreviewProps {
  code: string | null
  version?: number
  appTitle?: string
  shareUrl?: string | null
  onShare?: () => void
  /** 父组件持有的报错列表（受控） */
  errors?: PreviewError[]
  /** 父组件清空报错的回调 */
  onClearErrors?: () => void
  /** 编辑器多文件视图 */
  files?: AppFile[]
  /** 编辑器保存回调（把编辑后的 files 传回父组件持久化） */
  onSaveFiles?: (files: AppFile[]) => void
}

export function CodePreview({
  code,
  version = 0,
  appTitle = '应用',
  shareUrl = null,
  onShare,
  errors,
  onClearErrors,
  files,
  onSaveFiles,
}: CodePreviewProps) {
  const [tab, setTab] = useState<Tab>('preview')
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [localErrors, setLocalErrors] = useState<PreviewError[]>([])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // 编辑器内部草稿：从 props.files 同步；用户编辑后变 dirty，保存后清 dirty
  const [draftFiles, setDraftFiles] = useState<AppFile[]>(files || [])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  // Monaco 本地包按需加载（首次打开代码 Tab 时）
  const [monacoReady, setMonacoReady] = useState(false)

  // 切到「代码」Tab 时初始化本地 Monaco（只加载一次）
  useEffect(() => {
    if (tab !== 'code' || monacoReady) return
    let cancelled = false
    ensureMonaco().then(() => {
      if (!cancelled) setMonacoReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [tab, monacoReady])

  // props files / version 变化（生成、修复、加载、保存后）时同步草稿
  useEffect(() => {
    setDraftFiles(files || [])
    setSelectedPath(files && files.length > 0 ? files[0].path : '')
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, version])

  const current = useMemo(
    () => draftFiles.find((f) => f.path === selectedPath),
    [draftFiles, selectedPath],
  )

  // 受控优先，否则用内部 state
  const errList = errors ?? localErrors
  const setErrList = onClearErrors ? undefined : setLocalErrors

  // 监听 iframe postMessage
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data
      if (!d || d.__source !== 'atoms-preview') return
      const item: PreviewError = {
        kind: d.type,
        msg: d.msg || '',
        src: d.src,
        line: d.line,
        col: d.col,
        t: Date.now(),
      }
      if (setErrList) {
        setErrList((prev) => [...prev.slice(-19), item])
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // 代码变化时清空旧报错
  useEffect(() => {
    if (onClearErrors) onClearErrors()
    else setLocalErrors([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, version])

  async function handleCopyCode() {
    if (!code) return
    await copyText(code)
    setCopied('code')
    setTimeout(() => setCopied(null), 1600)
  }

  async function handleCopyUrl() {
    if (!shareUrl) return
    await copyText(shareUrl)
    setCopied('url')
    setTimeout(() => setCopied(null), 1600)
  }

  function handleDownload() {
    if (!code) return
    const blob = new Blob([code], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${appTitle || 'app'}-atoms.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleShare() {
    if (!onShare) return
    setSharing(true)
    try {
      await onShare()
    } finally {
      setSharing(false)
    }
  }

  // 编辑器内容变化：更新对应文件的 content
  function handleEditorChange(value: string | undefined) {
    if (!current) return
    setDraftFiles((prev) =>
      prev.map((f) =>
        f.path === current.path ? { ...f, content: value || '' } : f,
      ),
    )
    setDirty(true)
  }

  async function handleSave() {
    if (!onSaveFiles || !dirty) return
    onSaveFiles(draftFiles)
    setDirty(false)
  }

  function handleNewFile() {
    const path = window.prompt('新建文件路径，例如 notes.md 或 src/util.js')
    if (!path) return
    const trimmed = path.trim()
    if (!trimmed) return
    if (draftFiles.some((f) => f.path === trimmed)) {
      window.alert('该文件已存在')
      return
    }
    setDraftFiles((prev) => [...prev, { path: trimmed, content: '' }])
    setSelectedPath(trimmed)
    setDirty(true)
  }

  function handleDeleteFile() {
    if (!current) return
    if (['index.html', 'style.css', 'script.js'].includes(current.path)) {
      window.alert('不能删除核心文件（index.html / style.css / script.js）')
      return
    }
    const next = draftFiles.filter((f) => f.path !== current.path)
    setDraftFiles(next)
    setSelectedPath(next[0]?.path || '')
    setDirty(true)
  }

  const srcDoc = code ? injectProbe(code) : null

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
      {/* 顶部：浏览器栏 + 切换 */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
          <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
          <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
        </div>
        <div className="flex-1 truncate text-center font-mono text-xs text-muted">
          {appTitle}
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
          <button
            onClick={() => setTab('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
              tab === 'preview' ? 'bg-surface text-white' : 'text-muted hover:text-white',
            )}
          >
            <Eye size={13} /> 预览
          </button>
          <button
            onClick={() => setTab('code')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
              tab === 'code' ? 'bg-surface text-white' : 'text-muted hover:text-white',
            )}
          >
            <Code2 size={13} /> 代码
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="relative min-h-0 flex-1 bg-white">
        {tab === 'preview' ? (
          srcDoc ? (
            <iframe
              key={version}
              ref={iframeRef}
              title={appTitle}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div className="grid h-full place-items-center bg-surface-2 px-8 text-center">
              <div className="max-w-xs">
                <p className="font-mono text-sm text-muted">
                  在左侧输入你的想法，智能体团队将在这里生成应用预览。
                </p>
              </div>
            </div>
          )
        ) : code ? (
          <div className="absolute inset-0 flex bg-[#0b0c0e]">
            {/* 文件树 */}
            <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-surface">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-line/60 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span>文件</span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={handleNewFile}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-white"
                    title="新建文件"
                    aria-label="新建文件"
                  >
                    <FilePlus size={13} />
                  </button>
                  <button
                    onClick={handleDeleteFile}
                    disabled={!current}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-white disabled:opacity-30"
                    title="删除当前文件"
                    aria-label="删除当前文件"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                <FileTree
                  files={draftFiles}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                />
              </div>
            </aside>
            {/* 编辑器区 */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-line/60 px-3">
                <span className="truncate font-mono text-xs text-muted">
                  {current?.path || '（无选中文件）'}
                </span>
                <button
                  onClick={handleSave}
                  disabled={!onSaveFiles || !dirty}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                    dirty
                      ? 'bg-accent text-[#141210] hover:opacity-90'
                      : 'bg-surface-2 text-muted',
                  )}
                  title={dirty ? '保存到项目' : '没有未保存的改动'}
                >
                  {dirty ? <Save size={12} /> : <Check size={12} />}
                  保存
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {!monacoReady ? (
                  <div className="grid h-full place-items-center text-center font-mono text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-accent" />
                      编辑器加载中...
                    </div>
                  </div>
                ) : current ? (
                  <Editor
                    height="100%"
                    path={current.path}
                    language={languageForPath(current.path)}
                    value={current.content}
                    theme="vs-dark"
                    onChange={(v) => handleEditorChange(v)}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      tabSize: 2,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-center font-mono text-xs text-muted">
                    选择左侧的文件开始编辑
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center bg-surface-2 text-center font-mono text-sm text-muted">
            暂无代码
          </div>
        )}
      </div>

      {/* 运行时报错列表（仅预览 tab 且有报错时显示） */}
      {tab === 'preview' && errList.length > 0 && (
        <div className="max-h-32 shrink-0 overflow-y-auto border-t border-danger/30 bg-danger/5 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <Bug size={12} /> 运行时报错 ({errList.length})
            </span>
            <button
              onClick={() => (onClearErrors ? onClearErrors() : setLocalErrors([]))}
              className="text-[11px] text-muted hover:text-white"
            >
              清空
            </button>
          </div>
          <ul className="space-y-1">
            {errList.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-danger/90">
                <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                <span className="break-all font-mono">
                  {e.msg}
                  {e.src && <span className="text-muted"> · {e.src}{e.line ? `:${e.line}` : ''}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-3">
        {shareUrl ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-xs text-muted">分享链接</span>
            <span className="truncate rounded-md bg-surface-2 px-2.5 py-1 font-mono text-xs text-[#6fe3a5]">
              {shareUrl}
            </span>
            <button
              onClick={handleCopyUrl}
              className="shrink-0 text-muted transition-colors hover:text-white"
            >
              {copied === 'url' ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyCode}
          disabled={!code}
        >
          {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
          复制
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!code}>
          <Download size={14} />
          导出
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleShare}
          disabled={!code || sharing || !onShare}
        >
          {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
          分享
        </Button>
      </div>
    </div>
  )
}

/**
 * 文件树：把扁平的 AppFile[] 按路径分段建成嵌套树渲染。
 * 文件夹默认展开，点击文件名选中。
 */
interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: Map<string, TreeNode>
}

function buildTree(files: AppFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let next = cur.children.get(name)
      if (!next) {
        next = { name, path, isDir: !isLast, children: new Map() }
        cur.children.set(name, next)
      }
      cur = next
    }
  }
  return root
}

function FileTree({
  files,
  selectedPath,
  onSelect,
}: {
  files: AppFile[]
  selectedPath: string
  onSelect: (path: string) => void
}) {
  const tree = useMemo(() => buildTree(files), [files])
  return (
    <ul className="px-1">
      <TreeChildren
        node={tree}
        depth={0}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </ul>
  )
}

function TreeChildren({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode
  depth: number
  selectedPath: string
  onSelect: (path: string) => void
}) {
  // 目录优先级低于文件，但同类型按字典序
  const children = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return (
    <>
      {children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode
  depth: number
  selectedPath: string
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(true)
  const padLeft = 8 + depth * 12
  if (node.isDir) {
    return (
      <li>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs text-muted transition-colors hover:bg-surface-2 hover:text-white"
          style={{ paddingLeft: padLeft }}
        >
          <FolderIcon size={13} className="shrink-0 text-[#9ca0a8]" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && (
          <ul>
            <TreeChildren
              node={node}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          </ul>
        )}
      </li>
    )
  }
  const selected = selectedPath === node.path
  return (
    <li>
      <button
        onClick={() => onSelect(node.path)}
        className={cn(
          'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs transition-colors',
          selected
            ? 'bg-accent/15 text-accent'
            : 'text-muted hover:bg-surface-2 hover:text-white',
        )}
        style={{ paddingLeft: padLeft }}
      >
        <FileIcon size={13} className="shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  )
}
