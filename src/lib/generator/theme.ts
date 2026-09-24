/**
 * 生成引擎：通用主题（基础 CSS + 页面骨架）。
 */

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function baseCss(accent: string): string {
  return `
:root{
  --accent:${accent};
  --bg:#0e1013;
  --bg2:#14171c;
  --card:#171b21;
  --line:#262b33;
  --text:#ecedf1;
  --muted:#8e94a0;
}
*{box-sizing:border-box;margin:0;padding:0}
html{color-scheme:dark}
body{
  font-family:'Manrope','PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  background:radial-gradient(1100px 560px at 82% -12%, ${hexToRgba(accent, 0.14)}, transparent 60%), var(--bg);
  color:var(--text);
  min-height:100vh;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:920px;margin:0 auto;padding:40px 20px 72px}
.app-header{margin-bottom:28px}
.app-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:10px}
.app-title{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.app-sub{color:var(--muted);margin-top:8px;font-size:14px;line-height:1.6}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--line);background:var(--bg2);color:var(--text);padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s ease}
.btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--accent);color:#111;border-color:transparent;font-weight:700}
.btn-primary:hover{border-color:transparent;filter:brightness(1.06)}
.btn-ghost{background:transparent}
.input{background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:11px 13px;font-size:14px;width:100%;transition:border-color .15s}
.input::placeholder{color:var(--muted)}
.input:focus{outline:none;border-color:var(--accent)}
.muted{color:var(--muted)}
.caption{font-size:12px}
.footer{margin-top:40px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;align-items:center}
.badge{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);background:${hexToRgba(accent, 0.12)};border:1px solid ${hexToRgba(accent, 0.28)};padding:4px 8px;border-radius:6px}
`
}

interface PageOptions {
  title: string
  subtitle: string
  accent: string
  body: string
  extraCss?: string
  extraJs?: string
}

export function page(opts: PageOptions): string {
  const css = baseCss(opts.accent) + (opts.extraCss || '')
  const js = opts.extraJs || ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <header class="app-header">
    <div class="app-eyebrow">Atoms Generated</div>
    <h1 class="app-title">${escapeHtml(opts.title)}</h1>
    <p class="app-sub">${escapeHtml(opts.subtitle)}</p>
  </header>
  ${opts.body}
  <footer class="footer">
    <span>由 <strong style="color:var(--accent)">Atoms Demo</strong> 智能体生成</span>
    <span>${escapeHtml(opts.title)}</span>
  </footer>
</div>
<script>${js}</script>
</body>
</html>`
}