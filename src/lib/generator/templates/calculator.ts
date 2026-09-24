/**
 * 生成引擎：计算器应用模板。
 */
import type { GenSpec } from '../types'
import { page } from '../theme'

const body = `
<div class="card calc-card">
  <div class="calc-display" id="calcDisplay">0</div>
  <div class="calc-keys">
    <button class="key k-fn" data-k="C">C</button>
    <button class="key k-fn" data-k="±">±</button>
    <button class="key k-fn" data-k="%">%</button>
    <button class="key k-op" data-k="÷">÷</button>
    <button class="key" data-k="7">7</button>
    <button class="key" data-k="8">8</button>
    <button class="key" data-k="9">9</button>
    <button class="key k-op" data-k="×">×</button>
    <button class="key" data-k="4">4</button>
    <button class="key" data-k="5">5</button>
    <button class="key" data-k="6">6</button>
    <button class="key k-op" data-k="−">−</button>
    <button class="key" data-k="1">1</button>
    <button class="key" data-k="2">2</button>
    <button class="key" data-k="3">3</button>
    <button class="key k-op" data-k="+">+</button>
    <button class="key k-zero" data-k="0">0</button>
    <button class="key" data-k=".">.</button>
    <button class="key k-eq" data-k="=">=</button>
  </div>
</div>`

const css = `
.calc-card{max-width:380px}
.calc-display{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:20px 16px;font-size:40px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;margin-bottom:14px;min-height:86px;display:flex;align-items:center;justify-content:flex-end}
.calc-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.key{border:1px solid var(--line);background:var(--bg2);color:var(--text);border-radius:12px;padding:16px 0;font-size:20px;font-weight:600;cursor:pointer;transition:all .12s ease}
.key:hover{border-color:var(--accent)}
.key:active{transform:scale(.95)}
.k-op{color:var(--accent);font-weight:700}
.k-fn{color:var(--muted)}
.k-eq{background:var(--accent);color:#111;font-weight:700}
.k-zero{grid-column:span 2}`

const js = `
var acc=null,op=null,current='0',fresh=true;
var display=document.getElementById('calcDisplay');
function normalize(v){if(!isFinite(v))return '错误';var s=String(v);if(s.length>12)s=String(parseFloat(v.toPrecision(10)));return s}
function show(){display.textContent=current}
function inputDigit(d){if(current==='错误'){current='0';fresh=true}if(fresh){current=d;fresh=false}else{if(current==='0')current=d;else current+=d}show()}
function inputDot(){if(current==='错误'){current='0';fresh=true}if(fresh){current='0.';fresh=false}else if(current.indexOf('.')===-1){current+='.'}show()}
function compute(a,b,o){if(o==='÷')return b===0?NaN:a/b;if(o==='×')return a*b;if(o==='−')return a-b;return a+b}
function applyOp(o){var v=parseFloat(current)||0;if(acc===null){acc=v}else if(!fresh){acc=compute(acc,v,op||'+')}op=o;current=normalize(acc);fresh=true;show()}
function equals(){if(acc!==null&&op!==null){var v=parseFloat(current)||0;current=fresh?normalize(acc):normalize(compute(acc,v,op));acc=null;op=null;fresh=true;show()}}
function negate(){if(current==='错误')return;current=normalize(-(parseFloat(current)||0));show()}
function percent(){if(current==='错误')return;current=normalize((parseFloat(current)||0)/100);show()}
function clearAll(){acc=null;op=null;current='0';fresh=true;show()}
Array.prototype.forEach.call(document.querySelectorAll('.key'),function(btn){
  btn.addEventListener('click',function(){
    var k=btn.getAttribute('data-k');
    if(k==='C')clearAll();
    else if(k==='±')negate();
    else if(k==='%')percent();
    else if(k==='÷'||k==='×'||k==='−'||k==='+')applyOp(k);
    else if(k==='=')equals();
    else if(k==='.')inputDot();
    else inputDigit(k);
  });
});
document.addEventListener('keydown',function(e){
  var k=e.key;
  if(k>='0'&&k<='9')inputDigit(k);
  else if(k==='.')inputDot();
  else if(k==='+')applyOp('+');
  else if(k==='-')applyOp('−');
  else if(k==='*')applyOp('×');
  else if(k==='/')applyOp('÷');
  else if(k==='Enter'||k==='=')equals();
  else if(k==='Backspace'||k==='Escape')clearAll();
});`

export default function calculatorPage(spec: GenSpec): string {
  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}