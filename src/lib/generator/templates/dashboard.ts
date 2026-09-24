/**
 * 生成引擎：数据看板应用模板。
 * 包含真实交互：时间段切换（7天/30天/90天）、可点击柱状图显示详情、数字滚动动画、动态刷新。
 */
import type { GenSpec } from '../types'
import { page, escapeHtml } from '../theme'

export default function dashboardPage(spec: GenSpec): string {
  const c = spec.content
  // 用领域名定制指标标签
  const domain = c.domain
  const statLabels = [
    { label: `${domain}用户`, base: 12480, delta: '+12.4%', up: true },
    { label: '今日活跃', base: 3215, delta: '+8.1%', up: true },
    { label: '转化率', base: 486, delta: '−0.3%', up: false, suffix: '%', div: 100 },
    { label: `${domain}营收`, base: 84, delta: '+21.7%', up: true, prefix: '¥', suffix: 'k' },
  ]

  const body = `
<div class="dash-controls">
  <div class="range-tabs" id="rangeTabs">
    <button class="range-tab active" data-range="7">近 7 天</button>
    <button class="range-tab" data-range="30">近 30 天</button>
    <button class="range-tab" data-range="90">近 90 天</button>
  </div>
  <button class="btn btn-ghost" id="refreshBtn">🔄 刷新数据</button>
</div>
<div class="stats-grid">
  ${statLabels
    .map(
      (s, i) => `
  <div class="stat-card">
    <div class="s-label">${escapeHtml(s.label)}</div>
    <div class="s-value" data-base="${s.base}" data-div="${s.div || 1}" data-prefix="${s.prefix || ''}" data-suffix="${s.suffix || ''}">0</div>
    <div class="s-delta ${s.up ? 'up' : 'down'}">${s.delta}</div>
  </div>`,
    )
    .join('')}
</div>
<div class="panel">
  <div class="panel-head">
    <h3 class="panel-title">${escapeHtml(domain)}访问趋势</h3>
    <span class="panel-hint">点击柱子查看详情</span>
  </div>
  <div class="bars" id="bars"></div>
  <div class="bars-scale muted caption" id="barsScale"></div>
  <div class="bar-detail" id="barDetail" hidden></div>
</div>
<div class="panel">
  <h3 class="panel-title">最近动态</h3>
  <ul class="feed" id="feed"></ul>
</div>`

  const css = `
.dash-controls{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.range-tabs{display:flex;gap:4px;background:var(--bg2);padding:4px;border-radius:10px;border:1px solid var(--line)}
.range-tab{border:none;background:transparent;color:var(--muted);padding:7px 14px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.range-tab.active{background:var(--accent);color:#111}
.range-tab:not(.active):hover{color:var(--text)}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.s-label{font-size:12px;color:var(--muted);margin-bottom:8px}
.s-value{font-size:28px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.s-delta{font-size:12px;font-weight:700;margin-top:6px}
.s-delta.up{color:#4dd7c0}
.s-delta.down{color:#ff6b8a}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:20px}
.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.panel-title{font-size:16px;font-weight:700}
.panel-hint{font-size:11px;color:var(--muted)}
.bars{display:flex;align-items:flex-end;gap:10px;height:180px}
.bar{flex:1;background:linear-gradient(180deg,var(--accent),transparent 130%);border-radius:6px 6px 0 0;position:relative;cursor:pointer;transition:filter .15s,height .5s cubic-bezier(.22,1,.36,1);min-height:6px}
.bar:hover{filter:brightness(1.12)}
.bar.active{outline:2px solid var(--accent);outline-offset:2px}
.bar::after{content:attr(data-value);position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--muted);opacity:0;transition:opacity .15s;white-space:nowrap}
.bar:hover::after{opacity:1}
.bars-scale{display:flex;justify-content:space-between;margin-top:10px;font-size:11px}
.bar-detail{margin-top:14px;padding:12px 16px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;font-size:13px}
.bar-detail strong{color:var(--accent)}
.feed{list-style:none}
.feed li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px}
.feed li:last-child{border-bottom:none}
.feed .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0}
.feed time{margin-left:auto;color:var(--muted);font-size:12px;flex-shrink:0}
@media(max-width:760px){.stats-grid{grid-template-columns:repeat(2,1fr)}}`

  const js = `
var currentRange=7;
var seed=Math.floor(Math.random()*1000);
function rng(){seed=(seed*9301+49297)%233280;return seed/233280}
function genBars(range){
  var n=range<=7?7:range<=30?12:15;
  var labels=range<=7?['周一','周二','周三','周四','周五','周六','周日']:[];
  var bars=[];
  for(var i=0;i<n;i++){
    var base=1000+Math.floor(rng()*2500);
    bars.push({value:base,label:labels[i]||('第'+(i+1)+'期')});
  }
  return bars;
}
function genFeed(){
  var names=['林小满','陈子昂','王大力','赵一一','周野','孙悦','吴桐'];
  var actions=['完成注册','发布了新动态','完成了一笔订单','升级了会员','邀请了好友'];
  var times=['刚刚','2 分钟前','5 分钟前','12 分钟前','30 分钟前','1 小时前','3 小时前'];
  var list=[];
  for(var i=0;i<5;i++){
    list.push({name:names[Math.floor(rng()*names.length)],action:actions[Math.floor(rng()*actions.length)],time:times[i]});
  }
  return list;
}
function animateNum(el){
  var base=parseFloat(el.getAttribute('data-base'));
  var div=parseFloat(el.getAttribute('data-div'))||1;
  var prefix=el.getAttribute('data-prefix')||'';
  var suffix=el.getAttribute('data-suffix')||'';
  var target=base/div;
  var steps=30;var cur=0;
  var t=setInterval(function(){
    cur++;
    var val=target*cur/steps;
    var txt=val>=1000?Math.round(val).toLocaleString():val.toFixed(val<10?1:0);
    el.textContent=prefix+txt+suffix;
    if(cur>=steps){clearInterval(t);el.textContent=prefix+(target>=1000?Math.round(target).toLocaleString():target.toFixed(target<10?1:0))+suffix}
  },20);
}
function renderAll(){
  // 指标动画
  document.querySelectorAll('.s-value').forEach(animateNum);
  // 柱状图
  var bars=genBars(currentRange);
  var max=Math.max.apply(null,bars.map(function(b){return b.value}));
  var barsEl=document.getElementById('bars');
  var scaleEl=document.getElementById('barsScale');
  barsEl.innerHTML='';
  scaleEl.innerHTML='';
  bars.forEach(function(b){
    var div=document.createElement('div');
    div.className='bar';
    div.style.height=(b.value/max*100)+'%';
    div.setAttribute('data-value',b.value.toLocaleString());
    div.setAttribute('data-label',b.label);
    div.addEventListener('click',function(){
      document.querySelectorAll('.bar').forEach(function(x){x.classList.remove('active')});
      div.classList.add('active');
      var detail=document.getElementById('barDetail');
      detail.hidden=false;
      detail.innerHTML='<strong>'+b.label+'</strong> · 访问量 <strong>'+b.value.toLocaleString()+'</strong> 次，环比 '+(rng()>0.5?'+':'-')+Math.floor(rng()*30)+'%';
    });
    barsEl.appendChild(div);
    var lbl=document.createElement('span');lbl.textContent=b.label;scaleEl.appendChild(lbl);
  });
  // 动态列表
  var feedEl=document.getElementById('feed');
  feedEl.innerHTML='';
  genFeed().forEach(function(item){
    var li=document.createElement('li');
    li.innerHTML='<span class="dot"></span><span><strong>'+item.name+'</strong> '+item.action+'</span><time>'+item.time+'</time>';
    feedEl.appendChild(li);
  });
}
// 时间段切换
document.querySelectorAll('.range-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    document.querySelectorAll('.range-tab').forEach(function(t){t.classList.remove('active')});
    tab.classList.add('active');
    currentRange=parseInt(tab.getAttribute('data-range'),10);
    document.getElementById('barDetail').hidden=true;
    renderAll();
  });
});
// 刷新
document.getElementById('refreshBtn').addEventListener('click',function(){
  seed=Math.floor(Math.random()*1000);
  document.getElementById('barDetail').hidden=true;
  renderAll();
});
renderAll();`

  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}