/**
 * 生成引擎：灵感便签应用模板。
 */
import type { GenSpec } from '../types'
import { page } from '../theme'

const body = `
<div class="notes-add">
  <input id="noteInput" class="input" placeholder="写下你的灵感..." />
  <button id="noteAdd" class="btn btn-primary">添加</button>
</div>
<div id="notesGrid" class="notes-grid"></div>`

const css = `
.notes-add{display:flex;gap:10px;margin-bottom:20px}
.notes-add .input{flex:1}
.notes-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.note{border-radius:14px;padding:16px;border:1px solid var(--line);min-height:120px;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;transition:transform .15s,border-color .15s;animation:rise .35s both}
.note:hover{transform:translateY(-2px)}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.note .body{font-size:15px;line-height:1.6;word-break:break-word}
.note .foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px}
.note .time{font-size:11px;color:var(--muted)}
.note .del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:4px 8px;border-radius:6px}
.note .del:hover{color:#ff6b6b;background:rgba(255,107,107,.12)}
.note.c0{background:rgba(255,180,84,.10);border-color:rgba(255,180,84,.25)}
.note.c1{background:rgba(111,227,165,.10);border-color:rgba(111,227,165,.25)}
.note.c2{background:rgba(94,162,255,.10);border-color:rgba(94,162,255,.25)}
.note.c3{background:rgba(181,140,255,.12);border-color:rgba(181,140,255,.28)}
.empty{grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)}
@media(max-width:720px){.notes-grid{grid-template-columns:1fr}}`

const js = `
var KEY='atoms_notes';
var colors=['c0','c1','c2','c3'];
var notes=[];
function pad(x){return x<10?'0'+x:''+x}
function load(){try{notes=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){notes=[]}}
function save(){localStorage.setItem(KEY,JSON.stringify(notes))}
function render(){
  var grid=document.getElementById('notesGrid');
  grid.innerHTML='';
  if(notes.length===0){grid.innerHTML='<div class="empty muted">还没有便签，写一条吧</div>';return}
  notes.forEach(function(n,index){
    var div=document.createElement('div');
    div.className='note '+n.color;
    var body=document.createElement('div');body.className='body';body.textContent=n.text;
    var foot=document.createElement('div');foot.className='foot';
    var time=document.createElement('span');time.className='time';time.textContent=n.time;
    var del=document.createElement('button');del.className='del';del.textContent='删除';
    del.addEventListener('click',function(e){e.stopPropagation();notes.splice(index,1);save();render()});
    foot.appendChild(time);foot.appendChild(del);
    div.appendChild(body);div.appendChild(foot);
    div.addEventListener('click',function(){n.color=colors[(colors.indexOf(n.color)+1)%colors.length];save();render()});
    grid.appendChild(div);
  });
}
function add(){
  var input=document.getElementById('noteInput');
  var text=input.value.trim();
  if(!text)return;
  var d=new Date();
  notes.unshift({text:text,color:colors[notes.length%colors.length],time:pad(d.getHours())+':'+pad(d.getMinutes())});
  input.value='';
  save();render();input.focus();
}
document.getElementById('noteAdd').addEventListener('click',add);
document.getElementById('noteInput').addEventListener('keydown',function(e){if(e.key==='Enter')add()});
load();render();`

export default function notesPage(spec: GenSpec): string {
  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}