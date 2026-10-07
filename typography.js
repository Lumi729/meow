// Only Meow consumes these variables. Story typography is sampled, never changed.
export const FONT_DEFAULTS = { mode: 'sans', custom: '', url: '', size: 16 };
const FALLBACK = 'Arial,"Noto Sans","PingFang SC","Microsoft YaHei",sans-serif';
const FONTS = { sans: FALLBACK, serif: '"Noto Serif SC","Songti SC",SimSun,serif', kai: 'KaiTi,STKaiti,"Kaiti SC",serif', mono: 'ui-monospace,Consolas,"Microsoft YaHei",monospace' };
const quote = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ') + '"';
const remoteURL = (value, base) => { const url = new URL(value, base); if (url.protocol !== 'https:') throw new Error('字体链接请使用 https:// 开头的地址。'); return url.href; };
export function fontSettings(value = {}) {
    value ||= {};
    const size = Number(value.size);
    return { mode: [...Object.keys(FONTS), 'follow', 'custom', 'linked'].includes(value.mode) ? value.mode : 'sans', custom: String(value.custom || '').trim().slice(0, 160), url: String(value.url || '').trim().slice(0, 4000), size: Number.isFinite(size) ? Math.min(28, Math.max(12, size)) : 16 };
}
export async function linkedFontCSS(doc, address) {
    const url = remoteURL(address);
    if (/\.(?:woff2?|ttf|otf)$/i.test(new URL(url).pathname)) return `@font-face{font-family:"MeowLinkedFont";src:url(${quote(url)});font-display:swap;}`;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`字体 CSS 下载失败（HTTP ${response.status}）。`);
        if (/^(?:font\/|application\/(?:font|x-font|octet-stream))/i.test(response.headers.get('content-type') || '')) return `@font-face{font-family:"MeowLinkedFont";src:url(${quote(url)});font-display:swap;}`;
        const text = await response.text(); if (text.length > 1000000) throw new Error('字体 CSS 太大，请使用单一字体的链接。');
        // Constructed sheets ignore @import. Only font-face rules are kept: linked CSS cannot restyle the tavern.
        const sheet = new doc.defaultView.CSSStyleSheet(); sheet.replaceSync(text);
        const faces = [...sheet.cssRules].filter(rule => rule.type === 5 && rule.style.getPropertyValue('src'));
        const family = faces[0]?.style.getPropertyValue('font-family');
        if (!family) throw new Error('链接中没有找到 @font-face，请填写字体 CSS 或 ttf / woff / woff2 / otf 文件链接。');
        return faces.filter(rule => rule.style.getPropertyValue('font-family') === family).map(rule => {
            const src = rule.style.getPropertyValue('src').replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (_, a, b, c) => `url(${quote(remoteURL(a ?? b ?? c, response.url || url))})`);
            rule.style.setProperty('font-family', '"MeowLinkedFont"'); rule.style.setProperty('src', src); rule.style.setProperty('font-display', 'swap');
            return `@font-face{${rule.style.cssText}}`;
        }).join('\n');
    } finally { clearTimeout(timer); }
}
export function mountTypography(doc, ext, save) {
    const el = id => doc.getElementById(`meow-font-${id}`);
    const style = doc.getElementById('meow-font-faces') || Object.assign(doc.createElement('style'), { id: 'meow-font-faces' }); doc.head.append(style);
    let current = fontSettings(ext.meow_typography), busy = false, queued = false;
    const variable = (key, value) => { if (doc.documentElement.style.getPropertyValue(key) !== value) doc.documentElement.style.setProperty(key, value); };
    const follow = () => {
        const source = doc.querySelector('#chat .mes:not([is_user="true"]) .mes_text') || doc.querySelector('#chat .mes_text') || doc.body;
        variable('--meow-font-family', doc.defaultView.getComputedStyle(source).fontFamily || FALLBACK);
    };
    const observer = new doc.defaultView.MutationObserver(() => {
        if (queued || current.mode !== 'follow') return; queued = true;
        doc.defaultView.setTimeout(() => { queued = false; if (current.mode === 'follow') follow(); }, 60);
    });
    const fields = () => {
        for (const key of ['mode', 'custom', 'url', 'size']) el(key).value = current[key];
        visibility();
    };
    function visibility() {
        el('custom-row').hidden = el('mode').value !== 'custom'; el('url-row').hidden = el('mode').value !== 'linked';
        el('size-value').textContent = `${el('size').value} px`;
    }
    function apply(settings, css = '') {
        observer.disconnect(); current = settings; style.textContent = css;
        variable('--meow-font-size', `${current.size}px`);
        if (current.mode === 'follow') { follow(); observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true }); }
        else variable('--meow-font-family', current.mode === 'linked' ? `"MeowLinkedFont",${FALLBACK}` : current.mode === 'custom' ? `${quote(current.custom)},${FALLBACK}` : FONTS[current.mode]);
    }
    async function commit(reset = false, restore = false) {
        if (busy) return;
        busy = true; el('apply').disabled = el('reset').disabled = true;
        const next = reset ? { ...FONT_DEFAULTS } : restore ? current : fontSettings(Object.fromEntries(['mode', 'custom', 'url', 'size'].map(key => [key, el(key).value])));
        el('status').textContent = next.mode === 'linked' ? '正在载入字体链接…' : '';
        try {
            if (next.mode === 'custom' && !next.custom) throw new Error('请填写字体名称。');
            if (next.mode === 'linked' && !next.url) throw new Error('请填写字体文件或字体 CSS 链接。');
            const css = next.mode === 'linked' ? await linkedFontCSS(doc, next.url) : '';
            apply(next, css); ext.meow_typography = { ...current }; if (!restore) save(); fields();
            el('status').textContent = next.mode === 'follow' ? '已跟随正文字体；猫猫字号使用下方设置。' : '猫猫字体已应用，刷新后仍会保留。';
            // The browser downloads only needed Unicode subsets; never preload a whole CJK font stylesheet.
            if (next.mode === 'linked' && doc.fonts?.load) doc.fonts.load('16px "MeowLinkedFont"', '猫猫星绘 Aa').catch(() => {
                if (current === next) el('status').textContent = '字体文件加载失败，暂用默认字体；请检查链接是否允许跨域访问。';
            });
        } catch (error) { el('status').textContent = error.name === 'AbortError' ? '字体链接加载超时，请重试。' : `未应用字体：${error.message}（远程链接需允许跨域访问。）`; }
        finally { busy = false; el('apply').disabled = el('reset').disabled = false; }
    }
    el('mode').addEventListener('change', visibility); el('size').addEventListener('input', visibility);
    el('apply').addEventListener('click', () => commit()); el('reset').addEventListener('click', () => commit(true));
    fields(); variable('--meow-font-family', FALLBACK); variable('--meow-font-size', `${current.size}px`); commit(false, true);
    return { destroy: () => observer.disconnect() };
}
