import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { mountAutoPending } from '../auto-pending.js';
import { mountInline } from '../inline.js';

test('deleting an earlier reply keeps pending tags on their original message and survives restart', async () => {
    const w = new Window(), d = w.document;
    globalThis.document=d; globalThis.localStorage=w.localStorage;
    globalThis.Option=function(text,value){const e=d.createElement('option');e.textContent=text;e.value=value;return e;};
    d.body.innerHTML=await fs.readFile(new URL('../settings.html',import.meta.url),'utf8');
    const before={mes:'前一条。'}, message={mes:'她走进花园。'}, after={mes:'后面一条。'};
    const c={chat:[before,message,after],saveChat:async()=>{}};
    const options={root:d.getElementById('meow-panel'),scope:'move',context:()=>c,chatKey:()=> 'chat',isBusy:()=>false,editTags:()=>{},generate:async(_,verify)=>verify(),report:()=>{}};
    const app=mountAutoPending(options);
    const source={id:'m1p0',messageIndex:1,text:message.mes,anchorText:message.mes,anchorStart:0,messageSnapshot:message.mes};
    const record=app.add({key:'chat',index:1,snapshot:message.mes,swipe:0,ordinal:1,item:{prompt:'garden',source:[source],source_ids:[source.id],anchor_source_id:source.id,anchor_quote:message.mes}});
    c.chat.splice(0,1);app.render();
    assert.equal(record.index,0,'pending scene follows its message after earlier deletion');
    app.entry(record,{id:'already-generated'});
    assert.equal(message.extra.meow_pending[0].entryId,'already-generated');
    assert.equal(after.extra?.meow_pending?.length||0,0,'never attach pending tags to the next reply');
    c.chat=structuredClone(c.chat);app.entry(record,{id:'newly-saved'});
    assert.equal(c.chat[0].extra.meow_pending[0].entryId,'newly-saved','save can run before a renderer reload event');
    localStorage.clear();mountAutoPending(options);
    assert.equal(d.querySelectorAll('[data-pending-id]').length,1,'chat alone retains the record');
    assert.match(d.querySelector('[data-pending-id] h4').textContent,/第 1 条/);
    await w.happyDOM.close();
});

test('deleted source never lends its pending record to an identical replacement reply', async()=>{
    const w=new Window(),d=w.document;globalThis.document=d;globalThis.localStorage=w.localStorage;
    globalThis.Option=function(text,value){const e=d.createElement('option');e.textContent=text;e.value=value;return e;};
    d.body.innerHTML=await fs.readFile(new URL('../settings.html',import.meta.url),'utf8');
    const message={mes:'同一句正文。'},replacement={mes:message.mes},c={chat:[message,replacement],saveChat:async()=>{}};
    let sends=0;
    const app=mountAutoPending({root:d.getElementById('meow-panel'),scope:'deleted',context:()=>c,chatKey:()=> 'chat',isBusy:()=>false,editTags:()=>{},generate:async(_,verify)=>{verify();sends++;},report:()=>{}});
    const source={id:'m0p0',messageIndex:0,text:message.mes,anchorStart:0,messageSnapshot:message.mes};
    const record=app.add({key:'chat',index:0,snapshot:message.mes,swipe:0,item:{prompt:'cat',source:[source],source_ids:[source.id],anchor_source_id:source.id,anchor_quote:message.mes}});
    c.chat.splice(0,1);app.entry(record,{id:'saved'});app.render();
    assert.equal(replacement.extra?.meow_pending?.length||0,0);
    await assert.rejects(app.resume(record),/来源正文/);assert.equal(sends,0);
    assert.equal(JSON.parse(localStorage.getItem('meow-auto-pending:deleted'))[0].item.prompt,'cat','retain tags for manual recovery');
    await w.happyDOM.close();
});

test('pending automatic anchors survive reload, keep manual drafts separate and guard changed sources', async () => {
    const w = new Window(), doc = w.document;
    globalThis.document = doc; globalThis.localStorage = w.localStorage; globalThis.Option = function (text, value) { const option = doc.createElement('option'); option.textContent = text; option.value = value; return option; };
    doc.body.innerHTML = await fs.readFile(new URL('../settings.html', import.meta.url), 'utf8');
    const root = doc.getElementById('meow-panel'), message = { mes: '第一句。第二句。', swipe_id: 0 }, context = { chat: [message] };
    const source = { id: 'm0p0', messageIndex: 0, text: message.mes, anchorText: message.mes, anchorStart: 0, messageSnapshot: message.mes };
    let key = 'a', sends = 0, error = '', editing;
    const options = { root, scope: 'test', context: () => context, chatKey: () => key, isBusy: () => false, editTags: value => editing = value, generate: async (_, verify) => { verify(); sends++; }, report: text => error = text };
    const app = mountAutoPending(options), item = { title: '场景', prompt: 'cat', negative_prompt: '', source: [source], source_ids: ['m0p0'], anchor_source_id: 'm0p0', anchor_quote: '模型改写过的句子' };
    localStorage.setItem('meow-bad-drafts', 'manual stays');
    app.add({ item, key, index: 0, snapshot: message.mes, swipe: 0, ordinal: 2, total: 3, reason: '定位失败' });
    const click = text => [...root.querySelectorAll('#meow-auto-pending-list button')].find(b => b.textContent === text).click();
    const settle = () => new Promise(resolve => setTimeout(resolve, 10));
    click('生成这一张并插入'); await settle(); assert.equal(sends, 0); assert.match(error, /原文不一致/);
    click('修改 tags'); await editing.onSave({ ...editing.scene, prompt: 'blue-eyed cat' });
    const picker = root.querySelector('#meow-auto-pending-list select'); picker.value = '1'; picker.dispatchEvent(new w.Event('change'));
    const restored = mountAutoPending(options); assert.equal(sends, 0, 'restoring never generates');
    assert.equal(root.querySelector('#meow-auto-pending-list textarea').value, '第二句。');
    assert.match(root.querySelector('#meow-auto-pending-list pre').textContent, /blue-eyed cat/);
    key = 'b'; restored.render(); assert.equal(root.querySelectorAll('[data-pending-id]').length, 0);
    key = 'a'; restored.render(); message.mes = '修改后的正文'; click('生成这一张并插入'); await settle(); assert.equal(sends, 0); assert.match(error, /正文已修改/);
    message.mes = source.messageSnapshot; click('生成这一张并插入'); await settle(); assert.equal(sends, 1); assert.equal(root.querySelectorAll('[data-pending-id]').length, 0);
    assert.equal(localStorage.getItem('meow-bad-drafts'), 'manual stays');
    await w.happyDOM.close();
});

test('ready scenes restore inline without requests, survive chat/swipe changes and reuse saved image IDs', async () => {
    const w = new Window(), doc = w.document;
    globalThis.document = doc; globalThis.localStorage = w.localStorage;
    globalThis.Option = function(text, value) { const e = doc.createElement('option'); e.textContent = text; e.value = value; return e; };
    doc.body.innerHTML = await fs.readFile(new URL('../settings.html', import.meta.url), 'utf8');
    const root = doc.getElementById('meow-panel');
    const message = { mes: '她走进花园。', swipe_id: 0 };
    const source = { id: 'm0p0', messageIndex: 0, text: message.mes, anchorText: message.mes, anchorStart: 0, messageSnapshot: message.mes };
    const item = { title: '花园', prompt: 'garden', source: [source], source_ids: [source.id], anchor_source_id: source.id, anchor_quote: message.mes, anchor_occurrence: 1 };
    let key = 'a', sends = 0, failInsert = true;
    const slots = [], handlers = {};
    const inline = { placeholder(anchor, chat, title) {
        const slot = { active: true, anchor, chat, title, alive(){return this.active;}, remove(){this.active=false;}, update(text){this.text=text;}, retry(fn,label){this.click=fn;this.label=label;} };
        slots.push(slot); return slot;
    } };
    const options = { root, scope: 'ready-test', context: () => ({chat:[message], event_types:{MESSAGE_SWIPED:'swipe'}, eventSource:{on:(event,fn)=>handlers[event]=fn}}), chatKey:()=>key, isBusy:()=>false, editTags:()=>{}, report:()=>{}, inline,
        generate:async(record, verify, onEntry)=>{verify(); if(!record.entryId){sends++;onEntry({id:'saved-image'});} if(failInsert)throw new Error('插图失败');} };
    const app = mountAutoPending(options);
    const first = app.add({item,key,index:0,snapshot:message.mes,swipe:0,ordinal:1,total:2,inline:true});
    app.add({item:{...item,title:'第二张'},key,index:0,snapshot:message.mes,swipe:0,ordinal:2,total:2,inline:true});
    assert.equal(slots.filter(s=>s.active).length,2);
    assert.equal(app.slot(first), slots[0], 'adding another scene preserves the in-flight handle');
    for(const s of slots)s.remove(); // Browser/page is closed.
    const restored = mountAutoPending(options);
    assert.equal(sends,0);
    assert.equal(slots.filter(s=>s.active).length,2);
    await assert.rejects(slots.filter(s=>s.active)[0].click(), /插图失败/);
    assert.equal(sends,1);
    assert.equal(JSON.parse(localStorage.getItem('meow-auto-pending:ready-test'))[0].entryId,'saved-image');
    key='other';restored.render();assert.equal(slots.filter(s=>s.active).length,0);
    key='a';restored.render();assert.equal(slots.filter(s=>s.active).length,2);
    message.swipe_id=1;handlers.swipe();assert.equal(slots.filter(s=>s.active).length,0);
    message.swipe_id=0;handlers.swipe();assert.equal(slots.filter(s=>s.active).length,2);
    message.mes='修改了正文';restored.render();assert.equal(slots.filter(s=>s.active).length,0);
    message.mes=source.messageSnapshot;restored.render();
    failInsert=false;
    await slots.filter(s=>s.active)[0].click();
    assert.equal(sends,1,'saved image is inserted without another image request');
    assert.equal(JSON.parse(localStorage.getItem('meow-auto-pending:ready-test')).length,1);
    await w.happyDOM.close();
});


test('pending cards survive a real restart using saved chat, even without browser cache or the old character index', async () => {
    let disk, sends = 0;
    async function boot(chat, characterId, cached) {
        const w = new Window({url:'https://tavern.test'}), d = w.document;
        globalThis.document = d; globalThis.localStorage = w.localStorage;
        globalThis.Option = function(text,value){const e=d.createElement('option');e.textContent=text;e.value=value;return e;};
        if(cached) localStorage.setItem('meow-auto-pending:restart',cached);
        d.body.innerHTML = '<div id="chat"></div>' + await fs.readFile(new URL('../settings.html', import.meta.url),'utf8');
        const handlers = {}, c = {chat,characterId,characters:[],getCurrentChatId:()=> 'story',event_types:{CHAT_CHANGED:'chat'},eventSource:{on(event,fn){(handlers[event]??=[]).push(fn);}},saveChat:async()=>{disk=JSON.parse(JSON.stringify(c.chat));}};
        c.characters[characterId]={avatar:'cat.png'};
        const key=()=>JSON.stringify([null,c.characterId,'story']);
        const inline=mountInline({context:()=>c,chatKey:key,report:()=>{},generate:()=>{sends++;},redraw:()=>{sends++;},upload:()=>{throw new Error('no image request expected');}});
        const app=mountAutoPending({root:d.getElementById('meow-panel'),scope:'restart',context:()=>c,chatKey:key,isBusy:()=>false,editTags:()=>{},inline,report:()=>{},generate:async(_,verify)=>{verify();sends++;}});
        const draw=()=>{d.getElementById('chat').innerHTML=c.chat.map((m,i)=>`<div class="mes" mesid="${i}"><div class="mes_text">${m.mes}</div></div>`).join('');};
        return {w,d,c,key,app,draw,emit:()=>{for(const fn of handlers.chat||[])fn();}};
    }
    const settle=()=>new Promise(r=>setTimeout(r,20));
    const first=await boot([{mes:'她走进花园。',swipe_id:0}],0);
    first.draw();
    const source={id:'m0p0',messageIndex:0,text:first.c.chat[0].mes,anchorText:first.c.chat[0].mes,anchorStart:0,messageSnapshot:first.c.chat[0].mes};
    const item={title:'花园',prompt:'garden',source:[source],source_ids:[source.id],anchor_source_id:source.id,anchor_quote:source.text};
    first.app.add({item,key:first.key(),index:0,snapshot:source.text,swipe:0,ordinal:1,total:1,inline:true});
    await settle();
    assert.equal(first.d.querySelectorAll('.meow-inline-pending').length,1);
    assert.equal(disk[0].extra.meow_pending[0].item.prompt,'garden');
    assert.equal(disk[0].mes,source.text);
    await first.w.happyDOM.close();
    // New browser storage and reordered character list. The chat arrives after mount.
    const second=await boot([],7);
    second.c.chat=structuredClone(disk);second.emit();second.draw();await settle();
    assert.equal(second.d.querySelectorAll('.meow-inline-pending').length,1);
    assert.equal(sends,0,'restoring saved tags never spends on image generation');
    // Renderer reloads message objects after its event, without another chat event.
    second.c.chat=structuredClone(second.c.chat);second.draw();await settle();
    assert.equal(second.d.querySelectorAll('.meow-inline-pending').length,1);
    second.c.chat[0].mes='正文被修改';second.draw();await settle();
    assert.equal(second.d.querySelectorAll('.meow-inline-pending').length,0);
    second.c.chat[0].mes=source.text;second.draw();await settle();
    assert.equal(second.d.querySelectorAll('.meow-inline-pending').length,1);
    second.d.querySelector('.meow-inline-pending button').click();await settle();
    assert.equal(sends,1);assert.equal(disk[0].extra.meow_pending.length,0);
    await second.w.happyDOM.close();
    const third=await boot(structuredClone(disk),7);third.draw();await settle();
    assert.equal(third.d.querySelectorAll('.meow-inline-pending').length,0,'completed pending cards do not reappear after restart');
    await third.w.happyDOM.close();
});

test('legacy browser records tolerate numeric character ID serialization and migrate to chat without requests', async()=>{
    const w=new Window(), d=w.document;globalThis.document=d;globalThis.localStorage=w.localStorage;
    globalThis.Option=function(text,value){const e=d.createElement('option');e.textContent=text;e.value=value;return e;};
    d.body.innerHTML=await fs.readFile(new URL('../settings.html',import.meta.url),'utf8');
    const message={mes:'旧正文。'},source={id:'m0p0',messageIndex:0,text:message.mes,messageSnapshot:message.mes,anchorStart:0};
    const old={id:'old',key:JSON.stringify([null,0,'story']),index:0,snapshot:message.mes,swipe:0,inline:true,item:{prompt:'cat',source:[source],anchor_source_id:source.id,anchor_quote:source.text},ordinal:1,total:1};
    localStorage.setItem('meow-auto-pending:legacy',JSON.stringify([old]));
    let saves=0;const c={chat:[message],characterId:'0',characters:[{avatar:'cat.png'}],getCurrentChatId:()=> 'story',saveChat:async()=>{saves++;}};
    const app=mountAutoPending({root:d.getElementById('meow-panel'),scope:'legacy',context:()=>c,chatKey:()=>JSON.stringify([null,'0','story']),isBusy:()=>false,editTags:()=>{},generate:()=>{throw new Error('unexpected generation');},report:()=>{}});
    assert.equal(d.querySelectorAll('[data-pending-id]').length,1);assert.equal(message.extra.meow_pending[0].item.prompt,'cat');assert.equal(saves,1);
    c.characters[0]={avatar:'different.png'};app.render();assert.equal(d.querySelectorAll('[data-pending-id]').length,0,'stable owner prevents matching a different character at the old index');
    await w.happyDOM.close();
});
