/**
 * 落地页：营销首页。
 */
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Sparkles, Eye, Download, Share2, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { AGENTS } from '@/lib/agents'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Button, Logo } from '@/components/ui'

const FEATURES = [
  {
    icon: Eye,
    title: '实时可视化预览',
    desc: '生成的应用即时在 iframe 中渲染，所见即所得，随时调整。',
  },
  {
    icon: Download,
    title: '源码一键导出',
    desc: '导出自包含的 HTML 文件，可直接部署到任意静态托管。',
  },
  {
    icon: Share2,
    title: '公开分享链接',
    desc: '生成专属分享链接，让任何人打开链接即可体验你的应用。',
  },
]

export default function Landing() {
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)

  function start(nextPrompt?: string) {
    const p = (nextPrompt ?? prompt).trim()
    if (p) sessionStorage.setItem('atoms_next_prompt', p)
    navigate(user ? '/app/projects' : '/register')
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* 导航 */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="animate-fade">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
            <a href="#agents" className="transition-colors hover:text-white">
              智能体团队
            </a>
            <a href="#features" className="transition-colors hover:text-white">
              功能亮点
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button onClick={() => navigate('/app/projects')}>
                进入工作台 <ArrowRight size={15} />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  登录
                </Button>
                <Button onClick={() => navigate('/register')}>立即开始</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="grid-bg noise relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(700px 420px at 50% -10%, rgba(255,180,84,0.16), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-20 text-center md:pt-28">
          <div className="animate-rise" style={{ animationDelay: '0ms' }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs text-accent">
              <Sparkles size={13} /> AI 智能体 · 从想法到应用
            </span>
          </div>
          <h1
            className="animate-rise mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl"
            style={{ animationDelay: '80ms' }}
          >
            把想法变成
            <br />
            <em className="accent-gradient not-italic">可运行的产品</em>
          </h1>
          <p
            className="animate-rise mx-auto mt-6 max-w-xl text-base leading-7 text-muted md:text-lg"
            style={{ animationDelay: '160ms' }}
          >
            像 Atoms 一样，通过智能体团队协作，用一句话生成可运行、可分享的网页应用——无需编写一行代码。
          </p>

          <div
            className="animate-rise mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-line bg-surface/80 p-2 shadow-2xl shadow-black/40 backdrop-blur"
            style={{ animationDelay: '240ms' }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') start()
              }}
              placeholder="例如：帮我做一个番茄钟计时器"
              className="h-12 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-muted/70 focus:outline-none"
            />
            <Button size="lg" onClick={() => start()} className="shrink-0">
              开始构建 <ArrowRight size={16} />
            </Button>
          </div>

          <div
            className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-xs text-muted"
            style={{ animationDelay: '320ms' }}
          >
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-accent" /> 真实交互
            </span>
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-accent" /> 数据持久化
            </span>
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-accent" /> 多轮迭代
            </span>
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-accent" /> 一键分享
            </span>
          </div>
        </div>
      </section>

      {/* 智能体团队 */}
      <section id="agents" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Your AI Team
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            你的智能体团队
          </h2>
          <p className="mt-3 text-muted">
            一个完整的团队各司其职：从研究、规划到构建与测试，协作把想法落地。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {AGENTS.map((agent, i) => (
            <div
              key={agent.id}
              className="group rounded-2xl border border-line bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:border-accent/50"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <AgentAvatar agentId={agent.id} size="lg" />
              <div className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted">
                {agent.name}
              </div>
              <div className="mt-1 text-sm font-semibold">{agent.role}</div>
              <p className="mt-2 text-xs leading-5 text-muted">{agent.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 功能亮点 */}
      <section id="features" className="border-t border-line/60 bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Highlights
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              构建、预览与增长，尽在一处
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-line bg-surface p-8 transition-colors hover:border-accent/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent">
                  <f.icon size={20} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid-bg noise relative overflow-hidden rounded-3xl border border-line bg-surface px-8 py-16 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(500px 300px at 50% 0%, rgba(255,180,84,0.18), transparent 60%)',
            }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-5xl">
              准备好开始了吗？
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              几分钟内，让智能体团队帮你构建第一个可运行的应用。
            </p>
            <Button size="lg" className="mt-8" onClick={() => start()}>
              立即体验 <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted md:flex-row">
          <Logo />
          <span className="font-mono text-xs">
            Atoms Demo · 复刻核心体验的工程原型
          </span>
        </div>
      </footer>
    </div>
  )
}