import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { inlineTheme } from '../inline-theme.js';

test('story cards use live tavern colors and scoped theme styles also reach iframe cards', async () => {
    const w = new Window(), doc = w.document;
    doc.body.innerHTML = '<p id="story">原文</p><span class="meow-inline-card meow-inline-pending"><span>场景</span><button>生成</button></span><iframe></iframe>';
    doc.documentElement.style.setProperty('--SmartThemeBodyColor', 'rgb(240, 240, 240)');
    doc.documentElement.style.setProperty('--SmartThemeChatTintColor', 'rgb(20, 30, 40)');
    inlineTheme(doc);
    const card = doc.querySelector('.meow-inline-card');
    assert.equal(w.getComputedStyle(card).backgroundColor, 'rgb(20, 30, 40)');
    assert.equal(w.getComputedStyle(card.querySelector('button')).color, 'rgb(240, 240, 240)');
    doc.documentElement.style.setProperty('--SmartThemeChatTintColor', 'rgb(210, 220, 230)');
    assert.equal(w.getComputedStyle(card).backgroundColor, 'rgb(210, 220, 230)');
    const framed = doc.querySelector('iframe').contentDocument;
    framed.body.innerHTML = '<p>框内原文</p><span class="meow-inline-card"><img hidden src="/test.png"></span>';
    inlineTheme(framed, doc);
    assert.equal(framed.querySelector('.meow-inline-card').style.getPropertyValue('--SmartThemeChatTintColor'), 'rgb(210, 220, 230)');
    assert.equal(framed.defaultView.getComputedStyle(framed.querySelector('img')).display, 'none');
    assert.equal(doc.querySelector('#story').textContent, '原文'); assert.equal(framed.querySelector('p').textContent, '框内原文');
    await w.happyDOM.close();
});

test('story controls stay horizontal under narrow tavern button rules without replacing colors', async () => {
    const w = new Window(), doc = w.document;
    doc.body.innerHTML = '<span class="meow-inline-card"><span class="meow-inline-heading"><span class="meow-inline-title">场景</span><button class="menu_button">收起图片</button></span></span><button class="menu_button" id="panel">面板按钮</button>';
    const style = doc.createElement('style');
    style.textContent = '.menu_button {width:1em; writing-mode:vertical-rl; white-space:normal; color:rgb(12, 34, 56); border-radius:9px;}';doc.head.append(style);
    inlineTheme(doc);
    const css = w.getComputedStyle(doc.querySelector('.meow-inline-card button'));
    assert.equal(css.width,'auto'); assert.equal(css.writingMode,'horizontal-tb'); assert.equal(css.whiteSpace,'nowrap');
    assert.equal(css.color,'rgb(12, 34, 56)');assert.equal(css.borderRadius,'9px');
    assert.equal(w.getComputedStyle(doc.getElementById('panel')).width,'16px');
    await w.happyDOM.close();
});
