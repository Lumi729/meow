import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { panelThemeCSS } from '../story-theme.js';
import { mountCorners } from '../corners.js';
import { inlineTheme } from '../inline-theme.js';

test('old imported theme preserves panel and leaves all story buttons to live tavern styling', async () => {
    const w = new Window(), doc = w.document;
    doc.body.innerHTML = '<div id="chat"><div class="mes_text"><span class="meow-inline-card"><button class="menu_button">生成</button></span><button class="meow-message-generate menu_button">配图</button></div></div>' + await readFile(new URL('../settings.html', import.meta.url), 'utf8');
    const tavern = doc.createElement('style'); tavern.textContent = '.menu_button { color:rgb(10, 20, 30); border-radius:7px; font-family:Tavern; }'; doc.head.append(tavern);
    inlineTheme(doc);
    const theme = JSON.parse(await readFile(new URL('../themes/黑白画室.json', import.meta.url), 'utf8'));
    const protectedCSS = panelThemeCSS(doc, theme.css);
    assert.match(protectedCSS, /#meow-panel button:not/);
    assert.match(protectedCSS, /\.meow-inline-card button:not/);
    assert.match(protectedCSS, /\.meow-message-generate:not/);
    // happy-dom cannot match complex selectors inside :not/:where.
    // Check the unmodified panel rules separately from the protected selector output.
    const style = doc.createElement('style'); style.textContent = theme.css.split('\n').filter(line => !line.startsWith('.meow-inline-card') && !line.startsWith('.meow-message-generate')).join('\n'); doc.head.append(style);
    mountCorners(doc, { meow_corners: { enabled:true, radius:24 } }, () => {});
    for (const button of doc.querySelectorAll('#chat button')) {
        assert.equal(w.getComputedStyle(button).color, 'rgb(10, 20, 30)');
        assert.equal(w.getComputedStyle(button).borderRadius, '7px');
        assert.equal(w.getComputedStyle(button).fontFamily, 'Tavern');
    }
    const panel = doc.querySelector('#meow-theme-save');
    assert.equal(w.getComputedStyle(panel).backgroundColor, '#fff');
    assert.equal(w.getComputedStyle(panel).borderRadius, '24px');
    tavern.textContent = '.menu_button { color:rgb(240, 220, 230); border-radius:3px; font-family:Night; }';
    for (const button of doc.querySelectorAll('#chat button')) assert.equal(w.getComputedStyle(button).color, 'rgb(240, 220, 230)');
    assert.equal(w.getComputedStyle(panel).backgroundColor, '#fff');
    await w.happyDOM.close();
});

test('theme guards survive groups, functional selectors and pseudo elements', async () => {
    const w = new Window();
    const css = panelThemeCSS(w.document, '@media (prefers-color-scheme:dark){:is(#meow-panel,.meow-inline-card) button,#meow-dialog::backdrop{color:red!important}} @keyframes pulse{from{opacity:0}to{opacity:1}}');
    assert.match(css, /@media/); assert.match(css, /:is\(#meow-panel,\s*.meow-inline-card\) button:not/);
    assert.match(css, /\)\)::backdrop/); assert.match(css, /@keyframes pulse/);
    await w.happyDOM.close();
});
