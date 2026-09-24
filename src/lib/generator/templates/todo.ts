/**
 * 生成引擎：待办清单应用模板。
 */
import type { GenSpec } from '../types'
import { page } from '../theme'

const body = `
<div class="card">
  <div class="todo-add">
    <input id="todoInput" class="input" placeholder="添加一个新任务，回车确认..." />
    <button id="addBtn" class="btn btn-primary">添加</button>
  </div>
  <ul id="todoList" class="todo-list"></ul>
  <div class="todo-foot">
    <span class="caption muted" id="count">0 项待完成</span>
    <button id="clearBtn" class="btn btn-ghost caption">清除已完成</button>
  </div>
</div>`

const css = `
.todo-add{display:flex;gap:10px;margin-bottom:16px}
.todo-add .input{flex:1}
.todo-list{list-style:none}
.todo-item{display:flex;align-items:center;gap:12px;padding:13px 4px;border-bottom:1px solid var(--line)}
.todo-item:last-child{border-bottom:none}
.todo-item input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent);cursor:pointer;flex-shrink:0}
.todo-text{flex:1;font-size:15px;word-break:break-word}
.todo-item.done .todo-text{text-decoration:line-through;color:var(--muted)}
.del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:6px;transition:.15s}
.del:hover{color:#ff6b6b;background:rgba(255,107,107,.12)}
.todo-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px}`

const js = `
var KEY='atoms_todo';
var items=[];
function load(){try{items=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){items=[]}}
function save(){localStorage.setItem(KEY,JSON.stringify(items))}
function updateCount(){var left=items.filter(function(i){return !i.done}).length;document.getElementById('count').textContent=left+' 项待完成'}
function render(){
  var list=document.getElementById('todoList');
  list.innerHTML='';
  items.forEach(function(item,index){
    var li=document.createElement('li');
    li.className='todo-item'+(item.done?' done':'');
    var cb=document.createElement('input');
    cb.type='checkbox';cb.checked=!!item.done;
    cb.addEventListener('change',function(){items[index].done=cb.checked;save();render()});
    var span=document.createElement('span');
    span.className='todo-text';span.textContent=item.text;
    var del=document.createElement('button');
    del.className='del';del.textContent='✕';
    del.addEventListener('click',function(){items.splice(index,1);save();render()});
    li.appendChild(cb);li.appendChild(span);li.appendChild(del);
    list.appendChild(li);
  });
  updateCount();
}
function addItem(){
  var input=document.getElementById('todoInput');
  var text=input.value.trim();
  if(!text)return;
  items.push({text:text,done:false});
  input.value='';
  save();render();input.focus();
}
document.getElementById('addBtn').addEventListener('click',addItem);
document.getElementById('todoInput').addEventListener('keydown',function(e){if(e.key==='Enter')addItem()});
document.getElementById('clearBtn').addEventListener('click',function(){items=items.filter(function(i){return !i.done});save();render()});
load();render();`

export default function todoPage(spec: GenSpec): string {
  return page({ title: spec.title, subtitle: spec.subtitle, accent: spec.accent, body, extraCss: css, extraJs: js })
}