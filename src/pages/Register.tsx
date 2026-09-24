/**
 * 注册页。
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button, Field, Logo } from '@/components/ui'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuth((s) => s.setAuth)
  const [params] = useSearchParams()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await api.register(email, password)
      setAuth(res.token, res.user)
      const prompt = params.get('prompt')
      if (prompt) sessionStorage.setItem('atoms_next_prompt', prompt)
      navigate('/app/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid-bg noise relative flex min-h-screen items-center justify-center bg-ink px-6 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(600px 400px at 50% 0%, rgba(255,180,84,0.12), transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-sm">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-white"
        >
          <ArrowLeft size={15} /> 返回首页
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-8 shadow-2xl shadow-black/40">
          <Logo className="mb-8" />
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            创建账号
          </h1>
          <p className="mt-1 text-sm text-muted">开始构建你的第一个应用</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              label="邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Field
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
            />
            <Field
              label="确认密码"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              required
            />
            {error && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 size={15} className="animate-spin" />}
              注册并开始
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            已有账号？{' '}
            <Link
              to={`/login${params.get('prompt') ? '?prompt=' + encodeURIComponent(params.get('prompt')!) : ''}`}
              className="font-semibold text-accent hover:underline"
            >
              去登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}