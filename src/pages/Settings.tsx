/**
 * 设置页：管理多个 LLM 配置（供应商/模型 + 独立 API Key）。
 * 可新增、编辑（Key 留空表示不变）、删除，并选择当前生效条目。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  LogOut,
  Loader2,
  Check,
  ExternalLink,
  KeyRound,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { LLMConfigItem, LLMPreset } from '@/lib/types'
import { Button, Field, Logo } from '@/components/ui'

type FormMode = { type: 'new' } | { type: 'edit'; id: string }

export default function Settings() {
  const user = useAuth((s) => s.user)
  const clear = useAuth((s) => s.clear)
  const navigate = useNavigate()

  const [configs, setConfigs] = useState<LLMConfigItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [presets, setPresets] = useState<LLMPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>({ type: 'new' })
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cfgRes, presetRes] = await Promise.all([
        api.getLLMConfigs(),
        api.listLLMPresets(),
      ])
      setConfigs(cfgRes.configs)
      setActiveId(cfgRes.activeId)
      setPresets(presetRes.presets)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : '加载配置失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const editingItem =
    formMode.type === 'edit' ? configs.find((c) => c.id === formMode.id) : undefined

  function resetForm() {
    setFormMode({ type: 'new' })
    setBaseUrl('')
    setModel('')
    setApiKey('')
  }

  function startEdit(cfg: LLMConfigItem) {
    setFormMode({ type: 'edit', id: cfg.id })
    setBaseUrl(cfg.baseUrl)
    setModel(cfg.model)
    setApiKey('')
    setMsg(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const b = baseUrl.trim()
    const m = model.trim()
    const k = apiKey.trim()
    if (!b || !m) {
      setMsg({ kind: 'err', text: 'baseUrl / 模型不能为空' })
      return
    }
    if (formMode.type === 'new' && !k) {
      setMsg({ kind: 'err', text: '新增配置必须填写 API Key' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res =
        formMode.type === 'new'
          ? await api.addLLMConfig(b, m, k)
          : await api.updateLLMConfig(formMode.id, {
              baseUrl: b,
              model: m,
              ...(k ? { apiKey: k } : {}),
            })
      setConfigs(res.configs)
      setActiveId(res.activeId)
      resetForm()
      setMsg({
        kind: 'ok',
        text: formMode.type === 'new' ? '配置已添加' : '配置已更新',
      })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  async function activate(cfg: LLMConfigItem) {
    setBusyId(cfg.id)
    setMsg(null)
    try {
      const res = await api.activateLLMConfig(cfg.id)
      setConfigs(res.configs)
      setActiveId(res.activeId)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : '切换失败' })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(cfg: LLMConfigItem) {
    if (!window.confirm(`确定删除配置「${cfg.model}」？此操作不可恢复。`)) return
    setBusyId(cfg.id)
    setMsg(null)
    try {
      const res = await api.deleteLLMConfig(cfg.id)
      setConfigs(res.configs)
      setActiveId(res.activeId)
      if (formMode.type === 'edit' && formMode.id === cfg.id) resetForm()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : '删除失败' })
    } finally {
      setBusyId(null)
    }
  }

  function applyPreset(p: LLMPreset) {
    setFormMode({ type: 'new' })
    setBaseUrl(p.baseUrl)
    setModel(p.model)
    setApiKey('')
    setMsg(null)
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

  const activeConfig = configs.find((c) => c.id === activeId)

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="border-b border-line/60">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link to="/app/projects" className="text-muted transition-colors hover:text-white">
              <ArrowLeft size={18} />
            </Link>
            <Logo />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[200px] truncate font-mono text-xs text-muted sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut size={14} /> 退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">设置</h1>
          <p className="mt-1 text-sm text-muted">
            可为不同模型分别配置 API Key，随时切换。Key 经 AES-256-GCM 加密存储，仅用于调用模型生成代码。
          </p>
        </div>

        {/* 当前生效状态 */}
        {!loading && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl ${
                activeConfig ? 'bg-accent/12 text-accent' : 'bg-danger/12 text-danger'
              }`}
            >
              <KeyRound size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {activeConfig ? `当前使用：${activeConfig.model}` : '尚未配置 API Key'}
              </div>
              <div className="truncate font-mono text-xs text-muted">
                {activeConfig
                  ? `${activeConfig.baseUrl} · ${activeConfig.apiKeyMasked}`
                  : '完成下方表单后即可生成应用'}
              </div>
            </div>
          </div>
        )}

        {/* 已配置列表 */}
        {!loading && configs.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="text-xs font-medium text-muted">
              已配置的模型（{configs.length}）
            </div>
            {configs.map((cfg) => {
              const isActive = cfg.id === activeId
              return (
                <div
                  key={cfg.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    isActive ? 'border-accent/60 bg-accent/5' : 'border-line bg-surface'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{cfg.model}</span>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                      {cfg.baseUrl} · {cfg.apiKeyMasked}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => activate(cfg)}
                        disabled={busyId === cfg.id}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                      >
                        使用
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(cfg)}
                      title="编辑"
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(cfg)}
                      disabled={busyId === cfg.id}
                      title="删除"
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      {busyId === cfg.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 供应商预设 */}
        {!loading && presets.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-xs font-medium text-muted">常用供应商（点击快选填表）</div>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid place-items-center py-20 text-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {formMode.type === 'new' ? (
                  <>
                    <Plus size={15} className="text-accent" /> 新增模型配置
                  </>
                ) : (
                  <>
                    <Pencil size={14} className="text-accent" /> 编辑配置
                  </>
                )}
              </div>
              {formMode.type === 'edit' && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-white"
                >
                  <X size={13} /> 取消编辑
                </button>
              )}
            </div>
            <Field
              label="API Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com 或 https://api.deepseek.com"
              autoComplete="off"
            />
            <Field
              label="模型名称 (Model)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini / deepseek-chat / qwen-plus 等"
              autoComplete="off"
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">
                API Key{formMode.type === 'edit' && '（留空保持不变）'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  editingItem ? `当前：${editingItem.apiKeyMasked}（留空保持不变）` : 'sk-...'
                }
                autoComplete="off"
                className="h-11 w-full rounded-[10px] border border-line bg-surface-2 px-3.5 text-sm text-white placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none"
              />
              <p className="text-[11px] text-muted">
                保存后将加密存储，仅用于调用模型。如不知道从哪里获取，可在供应商官网申请。
              </p>
            </div>

            {msg && (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                  msg.kind === 'ok'
                    ? 'bg-accent/10 text-accent'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {msg.kind === 'ok' && <Check size={14} />}
                {msg.text}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              {formMode.type === 'new' ? '添加配置' : '保存修改'}
            </Button>
          </form>
        )}

        {/* 供应商文档入口 */}
        {!loading && presets.length > 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
            <div className="mb-3 text-xs font-medium text-muted">各供应商 API Key 申请入口</div>
            <ul className="space-y-2">
              {presets.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-xs">
                  <span className="text-white">{p.name}</span>
                  <a
                    href={p.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    申请 Key <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
