import test from 'node:test';
import assert from 'node:assert/strict';
import {attachVariant,selectVariant,removeVariant,stripInline,anchorEnd} from '../inline.js';
const source={text:'1',anchorText:'1',anchorStart:0,messageSnapshot:'1xxxx2',messageIndex:0};
test('inline placement, variants, reload and deletion preserve original text',()=>{
 const message={mes:'1xxxx2'};
 const group=attachVariant(message,source,{id:'a',path:'/user/images/a.png'});
 assert.ok(message.mes.startsWith('1\n\n![Meow-'));assert.ok(message.mes.endsWith('xxxx2'));assert.equal(stripInline(message.mes),'1xxxx2');
 attachVariant(message,source,{id:'b',path:'/user/images/b.png'});assert.equal(group.variants.length,2);assert.ok(message.mes.includes('/b.png'));
 const restored=JSON.parse(JSON.stringify(message)),g=restored.extra.meow_inline[0];selectVariant(restored,g,0);assert.ok(restored.mes.includes('/a.png'));
 removeVariant(restored,g);assert.ok(restored.mes.includes('/b.png'));removeVariant(restored,g);assert.equal(restored.mes,'1xxxx2');
});
test('stale or ambiguous sources cannot modify message',()=>{
 assert.throws(()=>anchorEnd({mes:'changed'},source),/编辑/);
 assert.throws(()=>anchorEnd({mes:'1 and 1'},{text:'1'}),/唯一/);
 assert.throws(()=>attachVariant({mes:'1xxxx2'},source,{id:'a',path:'https://outside/image.png'}),/地址/);
});
test('two separate anchors remain correct after earlier insertion',()=>{
 const message={mes:'1xxxx2'};attachVariant(message,source,{id:'a',path:'/a.png'});
 attachVariant(message,{...source,text:'2',anchorText:'2',anchorStart:5},{id:'b',path:'/b.png'});
 assert.equal(stripInline(message.mes),'1xxxx2');assert.ok(message.mes.indexOf('/a.png')<message.mes.indexOf('xxxx2'));assert.ok(message.mes.indexOf('/b.png')>message.mes.indexOf('xxxx2'));
});
