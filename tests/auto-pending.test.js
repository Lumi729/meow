import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { mountAutoPending } from '../auto-pending.js';

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
