import { DEFAULTS, MODELS, buildRequest, requestImage } from './core.js';
import { SECRET_KEYS, secret_state, writeSecret } from '../../secrets.js';

const context = () => SillyTavern.getContext();
const folder = new URL('.', import.meta.url).pathname.split('/').filter(Boolean).slice(-2).join('/');
async function init() {
    if (document.getElementById('meow-panel')) return;
    const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!host) return;
    const markup = await context().renderExtensionTemplateAsync(folder, 'settings');
    host.insertAdjacentHTML('beforeend', markup);
    const root = document.getElementById('meow-panel');
    const el = id => root.querySelector(`#meow-${id}`);
    const settings = context().extensionSettings.meow = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, context().extensionSettings.meow?.[key] ?? value]));
    const status = message => { el('status').textContent = message; };
    for (const [value, label] of Object.entries(MODELS)) el('model').add(new Option(label, value));
    for (const key of Object.keys(DEFAULTS)) {
        el(key).value = settings[key];
        el(key).addEventListener('input', () => {
            settings[key] = el(key).value;
            context().saveSettingsDebounced();
        });
    }
    const keyStatus = () => { el('key-status').textContent = secret_state[SECRET_KEYS.NOVEL] ? '已配置本地 Token（有效性以生图结果为准）' : '尚未配置 Token'; };
    keyStatus();
    context().eventSource.on(context().event_types.SECRET_WRITTEN, keyStatus);
    context().eventSource.on(context().event_types.SECRET_DELETED, keyStatus);
    let busy = false;
    el('save-token').addEventListener('click', async () => {
        if (busy) return;
        const token = el('token').value.trim();
        if (!token) { status('请先粘贴 Persistent API Token。'); return; }
        busy = true;
        el('save-token').disabled = el('generate').disabled = true;
        try {
            const id = await writeSecret(SECRET_KEYS.NOVEL, token, 'Meow NovelAI');
            if (!id) throw new Error('Token 保存失败，请检查酒馆连接。');
            status('Token 已存入本地酒馆的密钥管理。');
            keyStatus();
        } catch { status('Token 保存失败，请检查酒馆连接。'); }
        finally {
            el('token').value = '';
            busy = false;
            el('save-token').disabled = el('generate').disabled = false;
        }
    });
    el('form').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        if (el('token').value.trim()) { status('请先保存刚输入的 Token。'); return; }
        if (!secret_state[SECRET_KEYS.NOVEL]) { status('请先配置本地 NovelAI Token。'); return; }
        let payload;
        try { payload = buildRequest(Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, el(key).value]))); }
        catch (error) { status(error.message); return; }
        busy = true;
        el('generate').disabled = el('save-token').disabled = true;
        root.setAttribute('aria-busy', 'true');
        status('猫猫正在画画…请勿重复提交。');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000);
        try {
            const src = await requestImage(payload, context().getRequestHeaders(), controller.signal);
            const preview = new Image();
            preview.src = src;
            await preview.decode();
            el('preview').src = src;
            el('download').href = src;
            el('download').download = `meow-${payload.seed}.png`;
            el('result').hidden = false;
            el('seed-used').textContent = `本次种子：${payload.seed}`;
            status('画好啦 ✦ 下载保存这张图片吧。');
        } catch (error) {
            status(error.name === 'AbortError' ? '等待超时，上游可能仍在生成并计费；请查看酒馆日志后再决定是否重试。' : error instanceof TypeError ? '网络连接失败，请检查酒馆服务器连接。' : error.message);
        } finally {
            clearTimeout(timeout);
            busy = false;
            el('generate').disabled = el('save-token').disabled = false;
            root.setAttribute('aria-busy', 'false');
        }
    });
}
context().eventSource.on(context().event_types.APP_READY, init);
