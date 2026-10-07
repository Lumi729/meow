import { sceneAnchor, sceneQuoteOptions } from './context.js';
import { stripInline } from './inline.js';

// Independent of the manual Bad Cat draft. Never sends tags or images on restore.
export function mountAutoPending({ root, scope, context, chatKey, isBusy, editTags, generate, report }) {
    const storageKey = `meow-auto-pending:${scope}`, list = root.querySelector('#meow-auto-pending-list');
    let records = [], storageError = '';
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) records = saved.filter(r => r?.id && r.item?.prompt && Array.isArray(r.item.source)); } catch { storageError = '旧的待处理记录无法读取。'; }
    const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
    const save = () => {
        try { localStorage.setItem(storageKey, JSON.stringify(records)); storageError = ''; }
        catch { storageError = '待处理记录暂存失败，请先处理或复制 tags；刷新后可能丢失。'; }
        root.querySelector('#meow-auto-pending-storage').textContent = storageError;
    };
    const exists = record => { if (!records.includes(record)) throw new Error('这组待处理 tags 已移除，请重新打开。'); if (record.key !== chatKey()) throw new Error('请切回这组 tags 的来源聊天。'); };
    const verify = record => {
        exists(record); const message = context().chat[record.index];
        if (!message || stripInline(message.mes) !== record.snapshot || (message.swipe_id ?? 0) !== record.swipe) throw new Error('来源正文已修改或切换版本，不能插回旧位置；已保留 tags。');
    };
    const button = (text, fn) => { const el = node('button', text); el.type = 'button'; el.addEventListener('click', async () => { try { await fn(); } catch (error) { report(error.message); } }); return el; };
    const idle = record => { exists(record); if (isBusy()) throw new Error('猫猫正在忙，请等当前任务结束后处理。'); };
    function render() {
        list.replaceChildren(); const visible = records.filter(r => r.key === chatKey());
        root.querySelector('#meow-auto-pending-count').textContent = `${visible.length} 张`;
        root.querySelector('#meow-auto-pending-storage').textContent = storageError;
        if (!visible.length) { list.append(node('p', '没有待修正位置的场景。')); return; }
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
                    sceneAnchor(record.item, record.item.source); quote.value = choice.quote; record.reason = '已修正位置，可单独生成并插入。'; save(); render();
                } catch (error) { report(error.message); render(); }
            });
            box.append(node('label', '重新选择插图位置（不会重新请求 tags）'), picker, quote);
            const actions = node('div'); actions.className = 'meow-row';
            actions.append(button('修改 tags', () => { idle(record); editTags({ scene: record.item, onRedraw: null, onSave: async edited => {
                idle(record); record.item = structuredClone(edited); delete record.entryId; save(); render();
            } }); }), button(record.entryId ? '插入已生成的图片' : '生成这一张并插入', async () => {
                idle(record);
                try {
                    verify(record); sceneAnchor(record.item, record.item.source);
                    await generate(record, () => verify(record), entry => { record.entryId = entry.id; save(); });
                    records = records.filter(r => r !== record); save(); render(); report('这张图已完成；其他图片和 tags 没有重新生成。');
                } catch (error) { record.reason = error.message; save(); render(); throw error; }
            }), button('移除这组待处理 tags', () => { idle(record); if (!confirm('移除这组待处理 tags？已生成的图库图片不会删除。')) return; records = records.filter(r => r !== record); save(); render(); }));
            box.append(actions); list.append(box);
        }
    }
    render();
    return {
        add(data) { const record = { ...structuredClone(data), id: crypto.randomUUID() }; records.push(record); save(); render(); root.querySelector('#meow-auto-pending').open = true; return record; },
        render,
    };
}
