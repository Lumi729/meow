import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { mountAutoPending } from '../auto-pending.js';
import { mountInline } from '../inline.js';

const settings = await fs.readFile(new URL('../settings.html', import.meta.url), 'utf8');
const settle = () => new Promise(r => setTimeout(r, 20));
const STORE = 'meow-auto-pending:durable';

// One browser page: SillyTavern context, rendered chat, inline cards and the pending panel.
async function boot({ chats, chat = 'story', cached = null, saveFails = () => false, storageFull = false }) {
    const w = new Window({ url: 'https://tavern.test' }), d = w.document;
    globalThis.document = d; globalThis.localStorage = w.localStorage;
    globalThis.Option = function (text, value) { const e = d.createElement('option'); e.textContent = text; e.value = value; return e; };
    if (cached) for (const [k, v] of Object.entries(cached)) localStorage.setItem(k, v);
    if (storageFull) globalThis.localStorage = { getItem: k => w.localStorage.getItem(k), removeItem: k => w.localStorage.removeItem(k), setItem() { throw new Error('QuotaExceededError'); } };
    d.body.innerHTML = '<div id="chat"></div>' + settings;
    const handlers = {}, reports = [], c = {
        current: chat, characterId: 0, characters: [{ avatar: 'cat.png' }],
        get chat() { return chats[this.current]; }, set chat(v) { chats[this.current] = v; },
        getCurrentChatId() { return this.current; },
        event_types: { CHAT_CHANGED: 'chat' }, eventSource: { on(e, fn) { (handlers[e] ??= []).push(fn); } },
        saves: 0,
        saveChat: async () => { c.saves++; if (saveFails(c.current)) throw new Error('offline'); disk[c.current] = JSON.parse(JSON.stringify(chats[c.current])); },
    };
    const key = () => JSON.stringify([null, c.characterId, c.current]);
    const inline = mountInline({ context: () => c, chatKey: key, report: () => {}, generate: () => {}, redraw: () => {}, upload: () => { throw new Error('no image request expected'); } });
    const app = mountAutoPending({ root: d.getElementById('meow-panel'), scope: 'durable', context: () => c, chatKey: key, isBusy: () => false, editTags: () => {}, inline, report: t => reports.push(t), generate: async () => { throw new Error('no generation expected'); } });
    const draw = () => { d.getElementById('chat').innerHTML = (c.chat || []).map((m, i) => `<div class="mes" mesid="${i}"><div class="mes_text">${m.mes}</div></div>`).join(''); };
    const open = async name => { c.current = name; for (const fn of handlers.chat || []) fn(); draw(); await settle(); };
    const stored = () => JSON.parse(localStorage.getItem(STORE) || '[]');
    const cards = () => d.querySelectorAll('.meow-inline-pending').length;
    const panel = () => d.querySelectorAll('[data-pending-id]').length;
    return { w, d, c, app, draw, open, stored, cards, panel, reports, key, close: () => w.happyDOM.close() };
}
let disk = {};
const pending = (page, text) => {
    const source = { id: 'm0p0', messageIndex: 0, text, anchorText: text, anchorStart: 0, messageSnapshot: text };
    return page.app.add({ item: { title: '花园', prompt: 'garden', source: [source], source_ids: [source.id], anchor_source_id: source.id, anchor_quote: text }, key: page.key(), index: 0, snapshot: text, swipe: 0, ordinal: 1, total: 1, inline: true, reason: 'tags 已保存，等待生成。' });
};
const browser = page => { const out = {}; for (let i = 0; i < page.w.localStorage.length; i++) { const k = page.w.localStorage.key(i); out[k] = page.w.localStorage.getItem(k); } return out; };

test('a pending box survives a page refresh', async () => {
    disk = {};
    const first = await boot({ chats: { story: [{ mes: '她走进花园。', swipe_id: 0 }] } });
    first.draw(); pending(first, '她走进花园。'); await settle();
    assert.equal(first.cards(), 1);
    const cached = browser(first); await first.close();
    const second = await boot({ chats: structuredClone(disk), cached });
    second.draw(); await settle();
    assert.equal(second.cards(), 1, 'box is back in the story after refresh');
    assert.equal(second.panel(), 1);
    await second.close();
});

test('chat extra alone restores the box after browser storage is cleared, without the duplicated snapshot', async () => {
    disk = {};
    const first = await boot({ chats: { story: [{ mes: '她走进花园。', swipe_id: 0 }] } });
    first.draw(); pending(first, '她走进花园。'); await settle();
    const copy = disk.story[0].extra.meow_pending[0];
    assert.equal(copy.snapshot, '她走进花园。');
    assert.equal(copy.item.source[0].messageSnapshot, undefined, 'chat copy stores the text once');
    assert.equal(first.stored()[0].item.source[0].messageSnapshot, '她走进花园。', 'browser backup keeps the full record');
    await first.close();
    const second = await boot({ chats: structuredClone(disk) });
    second.draw(); await settle();
    assert.equal(second.cards(), 1, 'restored from the chat file only');
    assert.equal(second.stored()[0].item.source[0].messageSnapshot, '她走进花园。', 'snapshot is filled back in');
    await second.close();
});

test('failed chat saves never let browser records be cleaned, confirmed ones may leave and come back from chat', async () => {
    disk = {};
    const legacy = { id: 'legacy', key: JSON.stringify([null, 0, 'old']), index: 0, snapshot: '旧正文。', swipe: 0, item: { prompt: 'old', source: [] } };
    const chats = { a: [{ mes: '甲聊天。', swipe_id: 0 }], b: [{ mes: '乙聊天。', swipe_id: 0 }], c: [{ mes: '丙聊天。', swipe_id: 0 }] };
    const page = await boot({ chats, chat: 'a', cached: { [STORE]: JSON.stringify([legacy]) }, saveFails: chat => chat === 'a' });
    page.draw(); pending(page, '甲聊天。'); await settle();
    assert.match(page.reports.join(), /未能保存到聊天/, 'save failure is shown');
    assert.match(page.d.getElementById('meow-auto-pending-storage').textContent, /未能保存到聊天/);
    await page.open('b'); pending(page, '乙聊天。'); await settle();
    const ids = () => page.stored().map(r => r.item.prompt).sort();
    assert.deepEqual(ids(), ['garden', 'garden', 'old'], 'unsaved chat A record and legacy record stay in the browser');
    await page.open('c'); pending(page, '丙聊天。'); await settle();
    assert.equal(page.stored().filter(r => r.owner?.includes('"a"')).length, 1, 'chat A was never confirmed, still kept');
    assert.equal(page.stored().filter(r => r.owner?.includes('"b"')).length, 0, 'chat B was confirmed saved, browser copy cleaned');
    assert.ok(page.stored().some(r => r.id === 'legacy'), 'pre-0.9.45 browser-only record is never cleaned');
    chats.b = structuredClone(disk.b); // SillyTavern reloads the chat file when switching back
    await page.open('b');
    assert.equal(page.cards(), 1, 'cleaned record comes back from chat B');
    await page.close();
});

test('browser storage failure is reported instead of failing silently', async () => {
    disk = {};
    const page = await boot({ chats: { story: [{ mes: '她走进花园。', swipe_id: 0 }] }, storageFull: true });
    page.draw(); pending(page, '她走进花园。'); await settle();
    assert.match(page.reports.join(), /浏览器备份写入失败/);
    assert.match(page.d.getElementById('meow-auto-pending-storage').textContent, /浏览器备份写入失败/);
    assert.equal(disk.story[0].extra.meow_pending.length, 1, 'chat copy still saved');
    await page.close();
});

test('inline insert and tag sync accept 0 / "0" and moved character indices', async () => {
    const w = new Window(), d = w.document; globalThis.document = d;
    d.body.innerHTML = '<div id="chat"><div class="mes" mesid="0"><div class="mes_text">她走进花园。</div></div></div>';
    const message = { mes: '她走进花园。', swipe_id: 0 }, c = { chat: [message], characterId: '0', characters: [{ avatar: 'cat.png' }], getCurrentChatId: () => 'story', event_types: {}, eventSource: { on() {} }, saveChat: async () => {} };
    const inline = mountInline({ context: () => c, chatKey: () => JSON.stringify([null, c.characterId, 'story']), report: () => {}, generate: () => {}, redraw: () => {}, upload: async () => '/img/a.png' });
    const source = { id: 'm0p0', messageIndex: 0, text: message.mes, anchorText: message.mes, anchorStart: 0, messageSnapshot: message.mes };
    await inline.insert({ id: 'a', chatKey: JSON.stringify([null, 0, 'story']), payload: {}, title: 'a' }, [source]);
    assert.equal(message.extra.meow_inline[0].variants.length, 1, 'numeric and string character IDs match');
    c.characters = [{ avatar: 'new.png' }, { avatar: 'cat.png' }]; c.characterId = 1; // a card was added before this one
    await inline.insert({ id: 'b', chatKey: JSON.stringify([null, 0, 'story']), chatOwner: JSON.stringify(['character', 'cat.png', 'story']), payload: {}, title: 'b' }, [source]);
    assert.equal(message.extra.meow_inline[0].variants.length, 2, 'stable owner survives index change');
    assert.equal(await inline.updateTags('b', { title: '新', prompt: 'x' }, JSON.stringify([null, 0, 'story']), JSON.stringify(['character', 'cat.png', 'story'])), true);
    await assert.rejects(inline.insert({ id: 'c', chatKey: JSON.stringify([null, 0, 'story']), chatOwner: JSON.stringify(['character', 'other.png', 'story']), payload: {}, title: 'c' }, [source]), /切回/);
    await w.happyDOM.close();
});

test('a confirmed record whose reply was deleted stays in the browser for manual recovery', async () => {
    disk = {};
    const chats = { a: [{ mes: '甲聊天。', swipe_id: 0 }], b: [{ mes: '乙聊天。', swipe_id: 0 }] };
    const page = await boot({ chats, chat: 'a' });
    page.draw(); pending(page, '甲聊天。'); await settle();
    assert.ok(page.stored()[0].confirmed, 'saved to chat');
    chats.a.splice(0, 1); page.app.render(); page.app.add({ item: { prompt: 'x', source: [] }, key: page.key(), index: 5, snapshot: '', swipe: 0 }); await settle();
    await page.open('b'); pending(page, '乙聊天。'); await settle();
    assert.ok(page.stored().some(r => r.item.prompt === 'garden' && r.owner.includes('"a"')), 'not cleaned: the chat file no longer holds it');
    await page.close();
});
