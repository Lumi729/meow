import test from 'node:test';
import assert from 'node:assert/strict';
import {attachVariant,selectVariant,removeVariant,stripInline,anchorEnd,migrateLegacy,inlineMarker} from '../inline.js';
const source={text:'1',anchorText:'1',anchorStart:0,messageSnapshot:'1xxxx2',messageIndex:0};
test('insert, redraw variants and deletion never change raw message or code',()=>{
 const message={mes:'1xxxx2'};
 const group=attachVariant(message,source,{id:'a',path:'/a.png'});assert.equal(message.mes,'1xxxx2');
 attachVariant(message,source,{id:'b',path:'/b.png'});assert.equal(group.variants.length,2);assert.equal(message.mes,'1xxxx2');
 const restored=JSON.parse(JSON.stringify(message)),g=restored.extra.meow_inline[0];selectVariant(restored,g,0);assert.equal(g.variants[g.active].path,'/a.png');
 removeVariant(restored,g);assert.equal(g.variants[0].path,'/b.png');removeVariant(restored,g);assert.equal(restored.extra.meow_inline.length,0);assert.equal(restored.mes,'1xxxx2');
});
test('stale or ambiguous sources cannot modify message',()=>{
 assert.throws(()=>anchorEnd({mes:'changed'},source),/编辑/);assert.throws(()=>anchorEnd({mes:'1 and 1'},{text:'1'}),/唯一/);
 assert.throws(()=>attachVariant({mes:'1xxxx2'},source,{id:'a',path:'https://outside/image.png'}),/地址/);
});
test('multiple sentence anchors persist independently and all are removable',()=>{
 const message={mes:'1xxxx2'};const a=attachVariant(message,source,{id:'a',path:'/a.png'});
 const b=attachVariant(message,{...source,text:'2',anchorText:'2',anchorStart:5},{id:'b',path:'/b.png'});
 assert.equal(message.extra.meow_inline.length,2);removeVariant(message,b);removeVariant(message,a);assert.equal(message.extra.meow_inline.length,0);assert.equal(message.mes,'1xxxx2');
});
test('legacy cleanup restores code fences and every swipe without losing saved variants',()=>{
 const original='```html\n<html><body>1</body></html>\n```';const raw=original.replace('1','1'+inlineMarker('old','/a.png'));
 const message={mes:raw,swipes:[raw,original],extra:{meow_inline:[{id:'old',source:{messageSnapshot:original},variants:[{id:'a',path:'/a.png'}]}]}};
 assert.ok(migrateLegacy(message));assert.equal(message.mes,original);assert.deepEqual(message.swipes,[original,original]);assert.equal(message.extra.meow_inline[0].variants.length,1);assert.equal(stripInline(raw),original);
});
