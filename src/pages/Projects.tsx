/**
 * 工作台：项目列表页。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogOut, Trash2, Folder, ArrowRight, Loader2, X, Settings as SettingsIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Project } from '@/lib/types'
import { timeAgo } from '@/lib/utils'
import { Button, Field, Logo } from '@/components/ui'

export default function Projects() {
  const user = useAuth((s) => s.user)
  const clear = useAuth((s) => s.clear)
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [prompt, setPrompt] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.listProjects()
      setProjects(res.projects)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const pending = sessionStorage.getItem('atoms_next_prompt')
    if (pending) {
      sessionStorage.removeItem('atoms_next_prompt')
      autoCreate(pending)
    } else {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function autoCreate(p: string) {
    setBusy(true)
    try {
      const res = await api.createProject(p.slice(0, 30), p)
      navigate(`/app/projects/${res.project.id}?prompt=${encodeURIComponent(p)}`)
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    const trimmed = prompt.trim()
    const n = name.trim() || (trimmed ? trimmed.slice(0, 30) : '未命名项目')
    setBusy(true)
    try {
      const res = await api.createProject(n, desc.trim())
      setModal(false)
      setName('')
      setDesc('')
      setPrompt('')
      navigate(
        trimmed
          ? `/app/projects/${res.project.id}?prompt=${encodeURIComponent(trimmed)}`
          : `/app/projects/${res.project.id}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('确定删除该项目？此操作不可撤销')) return
    await api.deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  async function logout() {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    clear()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* 顶部栏 */}
      <header className="border-b border-line/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[200px] truncate font-mono text-xs text-muted sm:block">
              {user?.email}
            </span>
            <Link
              to="/app/settings"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-white"
              title="设置"
            >
              <SettingsIcon size={14} /> 设置
            </Link>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut size={14} /> 退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              我的项目
            </h1>
            <p className="mt-1 text-sm text-muted">
              每个项目都是一次智能体协作构建。
            </p>
          </div>
          <Button onClick={() => setModal(true)}>
            <Plus size={16} /> 新建项目
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-line bg-surface"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="grid-bg noise relative grid place-items-center rounded-2xl border border-line bg-surface px-8 py-24 text-center">
            <div className="relative">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent">
                <Folder size={26} />
              </span>
              <h2 className="mt-5 font-display text-xl font-semibold">
                还没有项目
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                创建一个项目，用一句话描述你想要的应用，让智能体团队帮你构建。
              </p>
              <Button className="mt-6" onClick={() => setModal(true)}>
                <Plus size={16} /> 创建第一个项目
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/app/projects/${p.id}`)}
                className="group relative cursor-pointer rounded-2xl border border-line bg-surface p-6 transition-all duration-200 hover:-translate-y-1 hover:border-accent/50"
              >
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-accent">
                    <Folder size={18} />
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(p.id)
                    }}
                    className="rounded-lg p-2 text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                    title="删除项目"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <h3 className="mt-4 text-base font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted">
                  {p.description || '暂无描述'}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-xs text-muted">
                    {timeAgo(p.updatedAt)}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    打开 <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 新建项目弹窗 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-6 backdrop-blur-sm"
          onClick={() => setModal(false)}
        >
          <div
            className="w-full max-w-md animate-scale-in rounded-2xl border border-line bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">新建项目</h2>
              <button
                onClick={() => setModal(false)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={create} className="space-y-4">
              <Field
                label="项目名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的番茄钟"
              />
              <Field
                label="初始需求（可选）"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="一句话描述你想要的应用，例如：做一个待办清单"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 size={15} className="animate-spin" />}
                创建并开始构建
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}