/**
 * 生成引擎：品牌落地页应用模板。
 * 包含真实交互：邮箱订阅（localStorage 持久化）、FAQ 手风琴、CTA 弹窗、平滑滚动。
 */
import type { GenSpec } from '../types'
import { page, escapeHtml } from '../theme'

export default function landingPage(spec: GenSpec): string {
  const c = spec.content
  const featuresHtml = c.features
    .map(
      (f, i) => `
  <div class="feature">
    <div class="f-idx">${String(i + 1).padStart(2, '0')}</div>
    <h3>${escapeHtml(f.title)}</h3>
    <p>${escapeHtml(f.desc)}</p>
  </div>`,
    )
    .join('')

  const statsHtml = c.stats
    .map(
      (s) => `
    <div class="stat"><div class="num">${escapeHtml(s.num)}</div><div class="label">${escapeHtml(s.label)}</div></div>`,
    )
    .join('')

  const body = `
<section class="hero">
  <span class="badge">${escapeHtml(c.domain)} · 全新上线</span>
  <h2 class="hero-title">${escapeHtml(spec.title)}</h2>
  <p class="hero-sub">${escapeHtml(c.highlight)}</p>
  <div class="hero-cta">
    <button class="btn btn-primary btn-lg" data-scroll="signup">${escapeHtml(c.ctaPrimary)}</button>
    <button class="btn btn-ghost btn-lg" data-scroll="features">${escapeHtml(c.ctaSecondary)}</button>
  </div>
  <div class="hero-stats">${statsHtml}
  </div>
</section>
<section class="features" id="features">
  <div class="sec-head">
    <span class="sec-eyebrow">核心功能</span>
    <h2 class="sec-title">为${escapeHtml(c.domain)}量身打造</h2>
  </div>
  <div class="features-grid">${featuresHtml}
  </div>
</section>
<section class="faq">
  <div class="sec-head">
    <span class="sec-eyebrow">常见问题</span>
    <h2 class="sec-title">你可能想知道</h2>
  </div>
  <div class="faq-list">
    <div class="faq-item">
      <button class="faq-q">如何开始使用？<span class="faq-icon">+</span></button>
      <div class="faq-a"><p>点击上方「${escapeHtml(c.ctaPrimary)}」按钮，输入邮箱即可免费开启。</p></div>
    </div>
    <div class="faq-item">
      <button class="faq-q">支持哪些设备？<span class="faq-icon">+</span></button>
      <div class="faq-a"><p>全平台覆盖：网页、iOS、Android，数据自动同步。</p></div>
    </div>
    <div class="faq-item">
      <button class="faq-q">数据安全吗？<span class="faq-icon">+</span></button>
      <div class="faq-a"><p>端到端加密，符合隐私合规标准，你的数据只属于你。</p></div>
    </div>
  </div>
</section>
<section class="signup" id="signup">
  <h2>准备好开始了吗？</h2>
  <p>输入邮箱，立刻免费体验。</p>
  <form class="signup-form" id="signupForm">
    <input type="email" id="emailInput" class="input" placeholder="your@email.com" required />
    <button type="submit" class="btn btn-primary btn-lg" id="submitBtn">${escapeHtml(c.ctaPrimary)}</button>
  </form>
  <div class="signup-result" id="signupResult" hidden></div>
  <p class="signup-note" id="signupNote"></p>
</section>`

  const css = `
.hero{text-align:center;padding:36px 0 20px}
.hero-title{font-size:48px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin:20px 0 14px}
.hero-sub{color:var(--muted);font-size:17px;max-width:540px;margin:0 auto 28px;line-height:1.7}
.hero-cta{display:flex;gap:12px;justify-content:center;margin-bottom:40px}
.btn-lg{padding:13px 24px;font-size:15px}
.hero-stats{display:flex;justify-content:center;gap:56px;padding:24px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hero-stats .num{font-size:28px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums}
.hero-stats .label{font-size:12px;color:var(--muted);margin-top:2px}
.sec-head{text-align:center;margin-bottom:28px}
.sec-eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}
.sec-title{font-size:30px;font-weight:800;letter-spacing:-.02em;margin-top:8px}
.features{margin-top:40px}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.feature{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;transition:border-color .15s,transform .15s}
.feature:hover{border-color:var(--accent);transform:translateY(-3px)}
.f-idx{font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.1em;margin-bottom:10px}
.feature h3{font-size:18px;font-weight:700;margin-bottom:6px}
.feature p{color:var(--muted);font-size:14px;line-height:1.6}
.faq{margin-top:40px}
.faq-list{max-width:640px;margin:0 auto}
.faq-item{border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden}
.faq-q{width:100%;background:var(--card);border:none;color:var(--text);padding:18px 20px;text-align:left;font-size:15px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .15s}
.faq-q:hover{background:var(--bg2)}
.faq-icon{font-size:20px;color:var(--accent);transition:transform .2s}
.faq-item.open .faq-icon{transform:rotate(45deg)}
.faq-a{max-height:0;overflow:hidden;transition:max-height .25s ease;padding:0 20px}
.faq-item.open .faq-a{max-height:200px;padding:0 20px 18px}
.faq-a p{color:var(--muted);font-size:14px;line-height:1.7}
.signup{margin-top:40px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:40px 28px;text-align:center}
.signup h2{font-size:26px;font-weight:800;margin-bottom:8px}
.signup p{color:var(--muted);margin-bottom:20px}
.signup-form{display:flex;gap:10px;max-width:420px;margin:0 auto;justify-content:center}
.signup-form .input{flex:1}
.signup-result{margin-top:14px;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:600}
.signup-result.ok{background:rgba(111,227,165,.12);color:#6fe3a5;border:1px solid rgba(111,227,165,.3)}
.signup-result.err{background:rgba(255,107,107,.12);color:#ff6b8a;border:1px solid rgba(255,107,107,.3)}
.signup-note{margin-top:10px;font-size:12px;color:var(--muted)}
@media(max-width:640px){.features-grid{grid-template-columns:1fr}.hero-stats{gap:24px;flex-wrap:wrap}.hero-title{font-size:36px}.signup-form{flex-direction:column}}`

  const js = `
// 邮箱订阅
var KEY='atoms_landing_email';
var form=document.getElementById('signupForm');
var emailInput=document.getElementById('emailInput');
var result=document.getElementById('signupResult');
var note=document.getElementById('signupNote');
var saved=localStorage.getItem(KEY);
if(saved){note.textContent='已订阅邮箱：'+saved}
form.addEventListener('submit',function(e){
  e.preventDefault();
  var v=emailInput.value.trim();
  if(!v){showResult('请输入邮箱地址','err');return}
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)){showResult('邮箱格式不正确','err');return}
  localStorage.setItem(KEY,v);
  showResult('订阅成功！欢迎加入 🎉','ok');
  emailInput.value='';
  note.textContent='已订阅邮箱：'+v;
});
function showResult(msg,kind){
  result.textContent=msg;
  result.className='signup-result '+kind;
  result.hidden=false;
  setTimeout(function(){result.hidden=true},4000);
}
// FAQ 手风琴
Array.prototype.forEach.call(document.querySelectorAll('.faq-item'),function(item){
  var q=item.querySelector('.faq-q');
  q.addEventListener('click',function(){item.classList.toggle('open')});
});
// 平滑滚动
Array.prototype.forEach.call(document.querySelectorAll('[data-scroll]'),function(btn){
  btn.addEventListener('click',function(){
    var target=document.getElementById(btn.getAttribute('data-scroll'));
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  });
});`

  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}