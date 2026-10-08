import { sceneAnchor, sceneQuoteOptions } from './context.js';
import { stripInline } from './inline.js';

// Independent of the manual Bad Cat draft. Never sends tags or images on restore.
export function mountAutoPending({ root, scope, context, chatKey, isBusy, editTags, generate, report, inline }) {
    const storageKey = `meow-auto-pending:${scope}`, list = root.querySelector('#meow-auto-pending-list');
    let records = [], storageError = '';
    const slots = new Map(), hydrated = new WeakSet(), messages = new Map();
    const validRecord = r => r?.id && typeof r.item?.prompt === 'string' && Array.isArray(r.item.source);
    const identity = () => {
        const c = context(), chat = c.getCurrentChatId?.();
        if (!chat) return null;
        const owner = c.groupId != null ? ['group', String(c.groupId)] : c.characters?.[c.characterId]?.avatar ? ['character', c.characters[c.characterId].avatar] : null;
        return owner ? JSON.stringify([...owner, String(chat)]) : null;
    };
    const sameLegacyKey = key => {
        if (key === chatKey()) return true;
        try { const a = JSON.parse(key), b = JSON.parse(chatKey()); return Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3 && a.every((v, i) => v == null ? b[i] == null : b[i] != null && String(v) === String(b[i])); } catch { return false; }
    };
    const belongs = r => r.owner ? r.owner === identity() : sameLegacyKey(r.key);
    const relocate = () => {
        const chat = context().chat || [];
        for (const record of records.filter(belongs)) {
            const message = messages.get(record.id), index = message ? chat.indexOf(message) : -1;
            if (index < 0 || index === record.index) continue;
            const previous = record.index; record.index = index;
            for (const source of record.item.source) if (source.messageIndex === previous) source.messageIndex = index;
        }
    };
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) records = saved.filter(validRecord); } catch { storageError = '旧的待处理记录无法读取。'; }
    const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
    let chatSaveError = '';
    const showStorage = () => { const target = root.querySelector('#meow-auto-pending-storage'); if (target) target.textContent = [storageError, chatSaveError].filter(Boolean).join(' '); };
    const save = () => {
        hydrate(false);
        relocate();
        // Keep a durable copy beside the reply, just like completed illustrations.
        const c = context(), key = chatKey();
        for (const r of records.filter(belongs)) { r.key = key; r.owner ||= identity(); }
        let changed = false;
        for (const [index, message] of (c.chat || []).entries()) {
            const saved = records.filter(r => belongs(r) && r.index === index &&
                (messages.has(r.id) ? messages.get(r.id) === message : stripInline(message.mes) === r.snapshot)).map(r => structuredClone(r));
            if (!saved.length && !message.extra?.meow_pending) continue;
            if (JSON.stringify(message.extra?.meow_pending || []) === JSON.stringify(saved)) continue;
            message.extra ??= {}; message.extra.meow_pending = saved; changed = true;
        }
        if (changed && c.saveChat) {
            try { Promise.resolve(c.saveChat()).then(() => { chatSaveError = ''; showStorage(); }, () => { chatSaveError = '待生图框未能保存到聊天，请检查酒馆连接；本地 tags 仍保留。'; showStorage(); }); }
            catch { chatSaveError = '待生图框未能保存到聊天，请检查酒馆连接；本地 tags 仍保留。'; }
        }
        try { localStorage.setItem(storageKey, JSON.stringify(records)); storageError = ''; }
        catch { storageError = '待处理记录暂存失败，请先处理或复制 tags；刷新后可能丢失。'; }
        showStorage();
    };
    const exists = record => { if (!records.includes(record)) throw new Error('这组待处理 tags 已移除，请重新打开。'); if (!belongs(record)) throw new Error('请切回这组 tags 的来源聊天。'); };
    const verify = record => {
        exists(record); const message = context().chat[record.index];
        if (!message || messages.has(record.id) && messages.get(record.id) !== message || stripInline(message.mes) !== record.snapshot || (message.swipe_id ?? 0) !== record.swipe) throw new Error('来源正文已修改或切换版本，不能插回旧位置；已保留 tags。');
    };
    const button = (text, fn) => { const el = node('button', text); el.type = 'button'; el.addEventListener('click', async () => { try { await fn(); } catch (error) { report(error.message); } }); return el; };
    const idle = record => { exists(record); if (isBusy()) throw new Error('猫猫正在忙，请等当前任务结束后处理。'); };
    function remove(record) {
        slots.get(record.id)?.remove(); slots.delete(record.id);
        records = records.filter(r => r !== record); save(); render();
        messages.delete(record.id);
    }
    async function resume(record) {
        idle(record);
        try {
            verify(record); sceneAnchor(record.item, record.item.source);
            await generate(record, () => verify(record), entry => { record.entryId = entry.id; save(); });
            remove(record); report('这张图已完成；其他图片和 tags 没有重新生成。');
        } catch (error) { record.reason = error.message; save(); render(); throw error; }
    }
    function hydrate(persist = true) {
        let changed = false;
        for (const [index, message] of (context().chat || []).entries()) {
            if (hydrated.has(message)) continue;
            hydrated.add(message);
            for (const saved of Array.isArray(message.extra?.meow_pending) ? message.extra.meow_pending : []) {
                if (!validRecord(saved)) continue;
                let record = records.find(r => r.id === saved.id && belongs(r));
                if (!record) {
                    record = structuredClone(saved);
                    if (records.some(r => r.id === record.id)) record.id = crypto.randomUUID();
                    records.push(record);
                }
                const oldIndex = record.index;
                messages.set(record.id, message);
                record.key = chatKey(); record.owner = identity(); record.index = index;
                for (const source of record.item.source) if (source.messageIndex === oldIndex) source.messageIndex = index;
                changed = true;
            }
            // Upgrade old browser-only records without changing message text.
            for (const record of records.filter(r => belongs(r) && r.index === index && !messages.has(r.id) && stripInline(message.mes) === r.snapshot)) {
                messages.set(record.id, message); changed = true;
            }
        }
        for (const record of records) if (belongs(record) && record.key !== chatKey()) { record.key = chatKey(); changed = true; }
        if (changed && persist) save();
    }
    function restoreInline() {
        relocate();
        hydrate();
        if (!inline) return;
        for (const record of records) {
            // Recreate handles after a chat switch, message edit or reply branch change.
            if (!record.inline || !belongs(record)) { slots.get(record.id)?.remove(); slots.delete(record.id); continue; }
            try {
                verify(record);
                if (slots.get(record.id)?.alive()) continue;
                slots.get(record.id)?.remove(); slots.delete(record.id);
                const anchor = sceneAnchor(record.item, record.item.source);
                const slot = inline.placeholder(anchor, record.key, record.item.title || `第 ${record.ordinal} 张图片`);
                slot.update(record.reason || 'tags 已保存，等待手动生成。');
                slot.retry(() => resume(record), record.entryId ? '插入已生成图片' : '生成这张图');
                slots.set(record.id, slot);
            } catch { slots.get(record.id)?.remove(); slots.delete(record.id); /* Keep tags for explicit repair. */ }
        }
    }
    function render() {
        restoreInline();
        list.replaceChildren(); const visible = records.filter(belongs);
        root.querySelector('#meow-auto-pending-count').textContent = `${visible.length} 张`;
        showStorage();
        if (!visible.length) { list.append(node('p', '没有未完成的场景。')); return; }
        for (const record of visible) {
            const box = node('section'); box.className = 'meow-source'; box.dataset.pendingId = record.id;
            box.append(node('h4', `第 ${record.index + 1} 条回复 · 第 ${record.ordinal} 张 · ${record.item.title || '未命名场景'}`), node('p', record.reason));
            const details = node('details'); details.append(node('summary', '已保留的 tags 与原文'), node('pre', JSON.stringify(record.item, null, 2))); box.append(details);
            const picker = node('select'); picker.setAttribute('aria-label', '从原文选择新的插图句子'); picker.add(new Option('请选择真实原文中的一句…', ''));
            const options = sceneQuoteOptions(record.item.source);
            options.forEach((choice, i) => picker.add(new Option(`${choice.sourceId} · ${choice.quote.slice(0, 80)}`, String(i))));
            const selected = options.findIndex(c => c.sourceId === record.item.anchor_source_id && c.quote === record.item.anchor_quote && c.occurrence === (record.item.anchor_occurrence || 1));
            picker.value = selected < 0 ? '' : String(selected);
            const quote = node('textarea'); quote.readOnly = true; quote.rows = 3; quote.value = record.item.anchor_quote || ''; quote.setAttribute('aria-label', '当前插图句子');
            picker.addEventListener('change', () => {
                try { idle(record); if (picker.value === '') return; const choice = options[Number(picker.value)];
                    Object.assign(record.item, { anchor_source_id: choice.sourceId, anchor_quote: choice.quote, anchor_occurrence: choice.occurrence });
                    sceneAnchor(record.item, record.item.source); quote.value = choice.quote; record.reason = '已修正位置，可单独生成并插入。'; record.inline = true; slots.get(record.id)?.remove(); slots.delete(record.id); save(); render();
                } catch (error) { report(error.message); render(); }
            });
            box.append(node('label', '重新选择插图位置（不会重新请求 tags）'), picker, quote);
            const actions = node('div'); actions.className = 'meow-row';
            actions.append(button('修改 tags', () => { idle(record); editTags({ scene: record.item, onRedraw: null, onSave: async edited => {
                idle(record); record.item = structuredClone(edited); delete record.entryId; slots.get(record.id)?.remove(); slots.delete(record.id); save(); render();
            } }); }), button(record.entryId ? '插入已生成的图片' : '生成这一张并插入', () => resume(record)), button('移除这组待处理 tags', () => { idle(record); if (!confirm('移除这组待处理 tags？已生成的图库图片不会删除。')) return; remove(record); }));
            box.append(actions); list.append(box);
        }
    }
    const events = context().event_types || {};
    for (const name of ['CHAT_CHANGED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED']) {
        if (events[name]) context().eventSource.on(events[name], restoreInline);
    }
    // The chat renderer may replace message objects after its initial event.
    const chat = document.querySelector('#chat');
    if (chat) {
        let queued = false;
        new document.defaultView.MutationObserver(() => {
            if (queued) return; queued = true;
            queueMicrotask(() => { queued = false; restoreInline(); });
        }).observe(chat, { childList: true, subtree: true });
    }
    render();
    return {
        add(data) { hydrate(); const record = { ...structuredClone(data), owner: identity(), id: crypto.randomUUID() }; records.push(record); const message = context().chat?.[record.index]; if (message) messages.set(record.id, message); save(); render(); root.querySelector('#meow-auto-pending').open = true; return record; },
        render, remove, resume,
        slot: record => slots.get(record.id),
        entry(record, entry) { record.entryId = entry.id; save(); },
    };
}
