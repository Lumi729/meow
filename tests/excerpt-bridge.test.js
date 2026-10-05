import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {highlightInfo,excerptPart} from '../excerpt-bridge.js';
import {attachVariant,placeAfterQuote} from '../inline.js';
import {sceneAnchor} from '../context.js';

test('existing multi-node highlights generate and insert through the scene pipeline',async()=>{
 const w=new Window(),d=w.document;
 d.body.innerHTML='<div class="mes" mesid="0"><div class="mes_text"><p><span class="be-highlight" data-be-id="a">第一句。</span></p><p><span class="be-highlight" data-be-id="a"><em>第二句。</em></span>尾句。</p></div></div>';
 const message={mes:'<p>第一句。</p>\n<p><em>第二句。</em>尾句。</p>'};
 const info=highlightInfo(d,'a'),part=excerptPart(info.text,info.messageIndex,message);
 assert.ok(part);
 const scene={source_ids:[part.id],anchor_source_id:part.id,anchor_quote:info.text};
 const source=sceneAnchor(scene,[part]);
 const group=attachVariant(message,source,{id:'a',path:'/images/a.png'});
 const card=d.createElement('span');card.className='meow-inline-card';card.textContent='重绘 删除';
 assert.ok(placeAfterQuote(d.querySelector('.mes_text'),group.anchorText,card,group));
 assert.equal(card.closest('.be-highlight'),null);
 assert.equal(card.previousElementSibling.dataset.beId,'a');
 assert.equal(highlightInfo(d,'a').text,info.text);
 assert.equal(message.mes,'<p>第一句。</p>\n<p><em>第二句。</em>尾句。</p>');
 const single=sceneAnchor({...scene,anchor_quote:'第二句。'},[part]);
 assert.equal(single.renderedText,'第二句。');
 await w.happyDOM.abort();
});
test('highlight extraction is scoped to clicked message and excludes nested copies and image controls',async()=>{
 const w=new Window(),d=w.document;
 d.body.innerHTML='<div class="mes" mesid="0"><span class="be-highlight" data-be-id="a">别处</span></div><div class="mes" mesid="1"><span class="be-highlight" data-be-id="a">这<span class="be-highlight" data-be-id="a">句</span><span class="meow-inline-card">删除</span></span></div>';
 const info=highlightInfo(d,'a',d.querySelector('[mesid="1"] span'));
 assert.deepEqual(info,{text:'这句',messageIndex:1});await w.happyDOM.abort();
});
test('whitespace maps to original offsets and ambiguous or changed text stays rejected',()=>{
 const message={mes:'前文 第一段\n\n第二段 后文'};
 const part=excerptPart('第一段第二段',0,message);
 assert.equal(part.anchorText,'第一段\n\n第二段');
 assert.equal(excerptPart('重复',0,{mes:'重复\n重复'}),null);
 assert.equal(excerptPart('不存在',0,message),null);
 assert.throws(()=>attachVariant({...message,mes:'已修改'},part,{id:'a',path:'/images/a.png'}),/原文已编辑/);
});
