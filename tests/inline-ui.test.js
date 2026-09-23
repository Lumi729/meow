import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountInline,placeAfterQuote} from '../inline.js';
test('one image for multiple sources, local redraw, preserved code/iframe and deletable variants',async()=>{
 const window=new Window({url:'https://local.test'});globalThis.document=window.document;globalThis.MutationObserver=window.MutationObserver;globalThis.confirm=()=>true;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 document.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"><p>1xxxx2</p><pre><code>HTML stays</code></pre><iframe></iframe></div></div><div class="mes" mesid="1"><div class="mes_text"><pre><code>untouched</code></pre></div></div></div>';
 const chat=[{mes:'1xxxx2',extra:{},swipes:['1xxxx2'],swipe_id:0},{mes:'untouched'}];let saves=0,generated=null,release;
 const body=document.querySelector('.mes_text'),frame=body.querySelector('iframe'),code=body.querySelector('pre');const noImage=document.querySelector('[mesid="1"] .mes_text').innerHTML;
 const context={chat,event_types:{},eventSource:{on(){}},saveChat:async()=>{saves++;},updateMessageBlock:()=>{throw new Error('Must not rerender message');}};
 const source={text:'1',anchorText:'1',anchorStart:0,messageSnapshot:'1xxxx2',messageIndex:0};const entry=id=>({id,chatKey:'chat',src:'data:image/png;base64,mock',payload:{seed:1},title:'pic',source:[source,{...source,text:'2',anchorText:'2',anchorStart:5}]});
 const app=mountInline({context:()=>context,chatKey:()=> 'chat',upload:async e=>`/images/${e.id}.png`,generate:i=>generated=i,redraw:async()=>{await new Promise(r=>release=r);return entry('c');},report:()=>{}});
 const settle=()=>new Promise(r=>setTimeout(r,20));
 document.querySelector('.meow-message-generate').click();await settle();assert.equal(generated,0);
 await app.insert(entry('a'));await app.insert(entry('b'));await settle();assert.equal(chat[0].extra.meow_inline.length,1);assert.equal(document.querySelectorAll('.meow-inline-card').length,1);assert.equal(chat[0].mes,'1xxxx2');
 assert.equal(document.querySelector('[mesid="1"] .mes_text').innerHTML,noImage);assert.equal(body.querySelector('iframe'),frame);assert.equal(body.querySelector('pre'),code);
 document.querySelector('.meow-inline-photo').click();await settle();const viewer=document.querySelector('#meow-inline-viewer');assert.ok(viewer.open);
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='‹ 上一张').click();await settle();assert.ok(document.querySelector('.meow-inline-photo').src.endsWith('/a.png'));
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='重绘').click();await settle();assert.match(document.querySelector('.meow-inline-card [role=status]').textContent,/正在/);release();await settle();assert.ok(document.querySelector('.meow-inline-photo').src.endsWith('/c.png'));
 [...viewer.querySelectorAll('button')].find(b=>b.textContent==='删除正文中的此图').click();await settle();assert.ok(!document.querySelector('.meow-inline-photo').src.endsWith('/c.png'));assert.equal(chat[0].mes,'1xxxx2');assert.equal(body.querySelector('iframe'),frame);assert.ok(saves>=5);
 await window.happyDOM.abort();
});

test('sentence pictures stay within paired content and closed details without restructuring or opening',async()=>{
 const w=new Window();const d=w.document;d.body.innerHTML='<div class="mes_text"><content>前文。<details><summary>折叠</summary><p>第一句。<em>第二句。</em>尾句。</p></details>末尾。</content></div>';
 const content=d.querySelector('content'),fold=d.querySelector('details'),em=d.querySelector('em'),p=d.querySelector('p');
 const card=d.createElement('span');card.className='meow-inline-card';card.textContent='image';
 assert.ok(placeAfterQuote(d.querySelector('.mes_text'),'第二句。',card));assert.equal(card.closest('content'),content);assert.equal(card.closest('details'),fold);assert.equal(card.parentElement,em);assert.equal(fold.open,false);assert.equal(p.textContent,'第一句。第二句。image尾句。');
 const bad=d.createElement('span');assert.equal(placeAfterQuote(d.querySelector('.mes_text'),'不存在',bad),false);assert.equal(bad.isConnected,false);await w.happyDOM.abort();
});
test('repeated sentence uses the captured occurrence instead of moving outside the text',async()=>{
 const w=new Window();w.document.body.innerHTML='<content><p>你好。开始。</p><p>你好。结束。</p></content>';const card=w.document.createElement('span');card.className='meow-inline-card';const snapshot='<content>你好。开始。你好。结束。</content>';
 assert.ok(placeAfterQuote(w.document.body,'你好。',card,{snapshot,anchorStart:snapshot.lastIndexOf('你好。')}));assert.equal(card.parentElement,w.document.querySelectorAll('p')[1]);await w.happyDOM.abort();
});
