/**
 * 公开分享页：根据 slug 展示生成的应用（无需登录）。
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, TriangleAlert, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Logo } from '@/components/ui'

interface ShareData {
  name: string
  code: string
  projectName: string
}

export default function Share() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<ShareData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    api
      .getShare(slug)
      .then((d) => setData({ name: d.name, code: d.code, projectName: d.projectName }))
      .catch((err) =>
        setError(err instanceof Error ? err.message : '分享链接不存在'),
      )
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="flex h-screen flex-col bg-ink text-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line/60 px-6">
        <Link to="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[260px] truncate font-mono text-xs text-muted sm:block">
            {data?.projectName ? `来自项目「${data.projectName}」` : ''}
          </span>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-accent hover:text-accent"
          >
            打开工作台 <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-4 sm:p-6">
        {loading ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-2 font-mono text-sm text-muted">
              <Loader2 size={15} className="animate-spin text-accent" />
              正在加载应用...
            </div>
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center">
            <div className="max-w-sm text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
                <TriangleAlert size={22} />
              </span>
              <p className="mt-4 font-semibold">{error}</p>
              <Link
                to="/"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                返回首页
              </Link>
            </div>
          </div>
        ) : data ? (
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
                <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
                <span className="h-3 w-3 rounded-full bg-[#3a3d43]" />
              </div>
              <span className="flex-1 truncate text-center font-mono text-xs text-muted">
                {data.name}
              </span>
            </div>
            <iframe
              title={data.name}
              srcDoc={data.code}
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : null}
      </main>
    </div>
  )
}