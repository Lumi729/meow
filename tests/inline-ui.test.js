import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountInline,stripInline} from '../inline.js';
test('message entry, inline variants and viewer selection/delete persist without a new message',async()=>{
 const window=new Window({url:'https://local.test'});globalThis.document=window.document;globalThis.MutationObserver=window.MutationObserver;globalThis.confirm=()=>true;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 document.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';
 const chat=[{mes:'1xxxx2',extra:{},swipes:['1xxxx2'],swipe_id:0}];let saves=0,generated=null;
 const context={chat,event_types:{},eventSource:{on(){}},saveChat:async()=>{saves++;},updateMessageBlock:(index,message)=>{
  const body=document.querySelector('.mes_text');body.replaceChildren();body.append(document.createTextNode(stripInline(message.mes)));
  for(const m of message.mes.matchAll(/!\[(Meow-[\w-]+)\]\(([^)]+)\)/g)){const img=document.createElement('img');img.alt=m[1];img.src=m[2];body.append(img);}
 }};
 const source={text:'1',anchorText:'1',anchorStart:0,messageSnapshot:'1xxxx2',messageIndex:0};
 const entry=id=>({id,chatKey:'chat',src:'data:image/png;base64,mock',payload:{seed:1},title:'pic',source:[source]});
 const app=mountInline({context:()=>context,chatKey:()=> 'chat',upload:async e=>`/images/${e.id}.png`,generate:i=>generated=i,redraw:async()=>entry('c'),report:()=>{}});
 const settle=async()=>{await new Promise(r=>setTimeout(r,20));};
 document.querySelector('.meow-message-generate').click();await settle();assert.equal(generated,0);
 await app.insert(entry('a'));await app.insert(entry('b'));await settle();assert.equal(chat.length,1);assert.equal(chat[0].swipes[0],chat[0].mes);
 document.querySelector('.meow-inline-photo').click();await settle();const viewer=document.querySelector('#meow-inline-viewer');assert.ok(viewer.open);
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='‹ 上一张').click();await settle();assert.ok(chat[0].mes.includes('/a.png'));
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='重绘').click();await settle();assert.ok(chat[0].mes.includes('/c.png'));
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='删除正文中的此图').click();await settle();assert.ok(!chat[0].mes.includes('/c.png'));assert.equal(stripInline(chat[0].mes),'1xxxx2');assert.ok(saves>=5);
 await window.happyDOM.abort();
});
