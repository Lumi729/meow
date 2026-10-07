import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Window } from 'happy-dom';
import { linkedFontCSS, mountTypography } from '../typography.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 100));

test('font CSS keeps only the chosen font, its subsets and resolved URLs', async () => {
    const window = new Window(), original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        assert.equal(options.credentials, 'omit');
        return new Response('@font-face{font-family:"My Font";src:url(../fonts/a.woff2);unicode-range:U+4E00-9FFF;font-weight:400} @font-face{font-family:"My Font";src:url("./latin.woff2");unicode-range:U+0-FF;font-weight:700} @font-face{font-family:Other;src:url(other.woff2)} body{font-family:Other!important;color:red}', { headers: { 'content-type': 'text/css' } });
    };
    try {
        const css = await linkedFontCSS(window.document, 'https://fonts.test/css/family.css');
        assert.match(css, /https:\/\/fonts.test\/fonts\/a.woff2/); assert.match(css, /https:\/\/fonts.test\/css\/latin.woff2/);
        assert.match(css, /unicode-range: U\+4E00-9FFF/i); assert.match(css, /font-weight: 700/);
        assert.equal((css.match(/@font-face/g) || []).length, 2); assert.ok(!css.includes('body')); assert.ok(!css.includes('Other'));
        assert.match(await linkedFontCSS(window.document, 'https://fonts.test/a.ttf?download=1'), /MeowLinkedFont/);
        await assert.rejects(linkedFontCSS(window.document, 'javascript:alert(1)'), /https/);
        globalThis.fetch = async () => new Response('body{font-family:serif}');
        await assert.rejects(linkedFontCSS(window.document, 'https://fonts.test/no-font.css'), /@font-face/);
    } finally { globalThis.fetch = original; await window.happyDOM.close(); }
});

test('all Meow surfaces share saved typography, follow story changes and reset independently', async () => {
    const window = new Window({ url: 'https://local.test' }), doc = window.document;
    doc.body.innerHTML = '<div id="chat"><div class="mes"><div class="mes_text" style="font-family:StoryFont">正文</div></div></div>' + await fs.readFile(new URL('../settings.html', import.meta.url), 'utf8');
    const sheet = doc.createElement('style'); sheet.textContent = await fs.readFile(new URL('../style.css', import.meta.url), 'utf8'); doc.head.append(sheet);
    const ext = {}; let saves = 0, handle = mountTypography(doc, ext, () => saves++);
    const el = id => doc.getElementById(`meow-font-${id}`), apply = async () => { el('apply').click(); await tick(); };
    try {
        el('mode').value = 'custom'; el('custom').value = 'My Font'; el('size').value = '22'; await apply();
        assert.equal(ext.meow_typography.custom, 'My Font'); assert.equal(ext.meow_typography.size, 22); assert.equal(saves, 1);
        const roots = ['meow-viewer', 'meow-inline-viewer', 'meow-tag-editor', 'meow-selection-dialog', 'meow-mask-editor', 'meow-gallery-picker'];
        for (const id of roots) { const dialog = doc.createElement('dialog'); dialog.id = id; dialog.innerHTML = '<button>按钮</button><textarea>tags</textarea>'; doc.body.append(dialog); }
        const inline = doc.createElement('span'); inline.className = 'meow-inline-card'; inline.innerHTML = '<button>正文猫猫按钮</button>'; doc.querySelector('.mes_text').append(inline);
        for (const node of [doc.getElementById('meow-panel'), ...roots.map(id => doc.getElementById(id)), inline]) {
            assert.match(window.getComputedStyle(node).fontFamily, /My Font/);
            assert.equal(window.getComputedStyle(node).fontSize, '22px');
            for (const child of node.querySelectorAll('button,textarea,input,select')) assert.match(window.getComputedStyle(child).fontFamily, /My Font/);
        }
        assert.equal(window.getComputedStyle(doc.querySelector('.mes_text')).fontFamily, 'StoryFont');
        handle.destroy(); handle = mountTypography(doc, ext, () => saves++); await tick();
        assert.equal(el('custom').value, 'My Font'); assert.equal(el('size').value, '22');
        el('mode').value = 'follow'; await apply();
        assert.equal(window.getComputedStyle(inline).fontFamily, 'StoryFont');
        doc.querySelector('.mes_text').style.fontFamily = 'NewStory'; await tick();
        assert.equal(window.getComputedStyle(doc.getElementById('meow-tag-editor')).fontFamily, 'NewStory');
        el('mode').value = 'linked'; el('url').value = 'http://invalid.test/font.ttf'; await apply();
        assert.equal(ext.meow_typography.mode, 'follow'); assert.match(el('status').textContent, /未应用字体/);
        el('reset').click(); await tick(); assert.equal(ext.meow_typography.mode, 'sans'); assert.equal(el('size').value, '16');
        assert.equal(window.getComputedStyle(doc.querySelector('.mes_text')).fontFamily, 'NewStory');
    } finally { handle.destroy(); await window.happyDOM.close(); }
});
