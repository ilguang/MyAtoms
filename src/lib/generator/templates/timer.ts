/**
 * 生成引擎：番茄专注钟应用模板。
 */
import type { GenSpec } from '../types'
import { page } from '../theme'

const body = `
<div class="card timer-card">
  <div class="timer-modes">
    <button class="mode active" data-min="25">专注</button>
    <button class="mode" data-min="5">短休</button>
    <button class="mode" data-min="15">长休</button>
  </div>
  <div class="timer-display" id="display">25:00</div>
  <div class="timer-actions">
    <button class="btn btn-primary" id="startBtn">开始</button>
    <button class="btn" id="resetBtn">重置</button>
  </div>
  <div class="caption muted">保持专注，每完成一轮记得起身活动一下。</div>
</div>`

const css = `
.timer-card{display:flex;flex-direction:column;align-items:center;gap:26px;padding:40px 20px}
.timer-modes{display:flex;gap:6px;background:var(--bg2);padding:5px;border-radius:12px;border:1px solid var(--line)}
.mode{border:none;background:transparent;color:var(--muted);padding:8px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s}
.mode.active{background:var(--accent);color:#111}
.timer-display{font-size:80px;font-weight:800;letter-spacing:.01em;font-variant-numeric:tabular-nums;line-height:1;color:var(--text)}
.timer-actions{display:flex;gap:12px}`

const js = `
var total=25*60;
var left=total;
var running=false;
var timer=null;
var display=document.getElementById('display');
var startBtn=document.getElementById('startBtn');
function fmt(s){var m=Math.floor(s/60);var sec=s%60;return (m<10?'0':'')+m+':'+(sec<10?'0':'')+sec}
function tick(){left--;if(left<=0){left=0;stop()}display.textContent=fmt(left)}
function stop(){running=false;if(timer){clearInterval(timer);timer=null}startBtn.textContent='开始'}
function start(){if(running)return;running=true;startBtn.textContent='暂停';timer=setInterval(tick,1000)}
startBtn.addEventListener('click',function(){if(running){stop()}else{start()}});
document.getElementById('resetBtn').addEventListener('click',function(){stop();left=total;display.textContent=fmt(left)});
var modes=document.querySelectorAll('.mode');
Array.prototype.forEach.call(modes,function(m){
  m.addEventListener('click',function(){
    for(var i=0;i<modes.length;i++){modes[i].classList.remove('active')}
    m.classList.add('active');
    stop();
    total=parseInt(m.getAttribute('data-min'),10)*60;
    left=total;
    display.textContent=fmt(left);
  });
});
display.textContent=fmt(left);`

export default function timerPage(spec: GenSpec): string {
  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}