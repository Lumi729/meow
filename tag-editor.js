import { validateCharacters } from './characters.js';

export function validateEditedScene(scene) {
    if (typeof scene.prompt !== 'string' || !scene.prompt.trim() || scene.prompt.length > 16000) throw new Error('场景正面 tags 不能为空，最多 16000 字。');
    if (typeof scene.negative_prompt !== 'string' || scene.negative_prompt.length > 16000) throw new Error('场景负面 tags 最多 16000 字。');
    if (scene.characters != null && !Array.isArray(scene.characters)) throw new Error('人物 tags 必须是角色数组。');
    return { ...structuredClone(scene), title: String(scene.title || '未命名场景').slice(0, 200), prompt: scene.prompt.trim(), characters: scene.characters?.length ? validateCharacters(scene.characters) : null };
}

// One editor for gallery, previews, monitor and in-story image viewers.
export function mountTagEditor(doc) {
    const dialog = doc.createElement('dialog');
    dialog.id = 'meow-tag-editor'; dialog.setAttribute('aria-label', '修改图片 tags'); doc.body.append(dialog);
    let busy = false;
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    const node = (tag, text = '') => { const el = doc.createElement(tag); el.textContent = text; return el; };
    return {
        open({ scene, onSave, onRedraw, onStop }) {
            if (busy) throw new Error('请等待当前 tags 操作结束。');
            const draft = structuredClone(scene); draft.characters ||= [];
            dialog.replaceChildren();
            const heading = node('h3', '修改图片 tags');
            const hint = node('p', '保存只修改这张图下次重绘使用的 tags；保存并重绘会使用当前星绘参数生成新图，保留原图。');
            const note = node('p'); note.setAttribute('role', 'status');
            const content = node('fieldset');
            const field = (parent, title, object, key, type = 'textarea') => {
                const label = node('label', title), input = doc.createElement(type === 'textarea' ? 'textarea' : 'input');
                input.setAttribute('aria-label', title); input.dataset.field = key;
                if (type === 'number') { input.type = 'number'; input.min = '0'; input.max = '1'; input.step = '0.05'; }
                if (type === 'textarea') input.rows = 3;
                input.value = object[key] ?? '';
                input.addEventListener('input', () => { object[key] = type === 'number' ? (input.value === '' ? NaN : Number(input.value)) : input.value; });
                label.append(input); parent.append(label); return input;
            };
            const button = (text, action) => {
                const b = node('button', text); b.type = 'button'; b.addEventListener('click', action); return b;
            };
            field(content, '场景标题', draft, 'title', 'text');
            field(content, '场景正面 tags', draft, 'prompt');
            field(content, '场景负面 tags', draft, 'negative_prompt');
            if (draft.full_prompt) content.append(node('small', '这张图按完整提示词编辑，包含原有固定词。'));
            content.append(node('h4', '人物 tags 与位置'), node('small', '位置范围 0–1：x 从左到右，y 从上到下；最多 6 人。'));
            const people = node('div'); people.className = 'meow-editor-people'; content.append(people);
            const renderPeople = () => {
                people.replaceChildren();
                draft.characters.forEach((person, i) => {
                    const card = node('section'); card.className = 'meow-editor-person';
                    card.append(node('h4', `角色 ${i + 1}`));
                    field(card, `角色 ${i + 1} 名字`, person, 'name', 'text');
                    field(card, `角色 ${i + 1} 正面 tags`, person, 'prompt');
                    field(card, `角色 ${i + 1} 负面 tags`, person, 'negative_prompt');
                    const position = node('div'); position.className = 'meow-editor-position';
                    field(position, `角色 ${i + 1} 横向位置 x`, person, 'x', 'number');
                    field(position, `角色 ${i + 1} 纵向位置 y`, person, 'y', 'number'); card.append(position);
                    card.append(button('删除此角色', () => { draft.characters.splice(i, 1); renderPeople(); })); people.append(card);
                });
            };
            content.append(button('添加角色', () => {
                if (draft.characters.length >= 6) { note.textContent = '最多 6 个角色。'; return; }
                draft.characters.push({ name: `角色 ${draft.characters.length + 1}`, prompt: '', negative_prompt: '', x: 0.5, y: 0.5 }); renderPeople();
            })); renderPeople();
            const actions = node('div'); actions.className = 'meow-editor-actions';
            const save = button('保存 tags', () => commit(false)), redraw = button('保存并重绘', () => commit(true));
            redraw.disabled = !onRedraw;
            const close = button('关闭', () => dialog.close());
            const stop = button('停止重绘', () => onStop?.()); stop.hidden = true;
            async function commit(draw) {
                if (busy) return;
                let saved = false;
                try {
                    const result = validateEditedScene(draft);
                    busy = true; content.disabled = true; save.disabled = redraw.disabled = close.disabled = true;
                    note.textContent = '正在保存 tags…';
                    await onSave(result); saved = true;
                    if (draw) { note.textContent = 'tags 已保存，正在重绘…'; stop.hidden = !onStop; await onRedraw(); dialog.close(); }
                    else note.textContent = 'tags 已保存，下次重绘会使用修改后的内容。';
                } catch (error) { note.textContent = `${saved ? 'tags 已保存，重绘未完成：' : ''}${error.message}`; }
                finally { busy = false; content.disabled = false; save.disabled = close.disabled = false; redraw.disabled = !onRedraw; stop.hidden = true; }
            }
            actions.append(save, redraw, close, stop);
            dialog.append(heading, hint, content, note, actions);
            if (!dialog.open) dialog.showModal();
        },
    };
}
