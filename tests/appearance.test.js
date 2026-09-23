import test from 'node:test';
import assert from 'node:assert/strict';
import {scanAppearance,appearanceScope,mergeAppearanceScan,formatAppearanceProfiles} from '../appearance.js';
import {buildTagRequest,captureContext,parseScenes,sceneAnchor,splitAutoMessage} from '../context.js';
import {tokenVault} from '../credentials.js';
import {indexedDB} from 'fake-indexeddb';
test('scan current character, user and associated books with stable identities and no unrelated books',async()=>{
 const loaded=[];const result=await scanAppearance({characters:[{name:'A',avatar:'A.png',description:'A：银色头发',data:{extensions:{world:'main'}}}],characterId:0,name1:'U',powerUserSettings:{persona_description:'U：粉色短发',persona_description_lorebook:'user'},chatMetadata:{world_info:'chat'},loadWorldInfo:async name=>{loaded.push(name);return {entries:{a:{comment:'B',content:'姓名：B\n外貌：黑发，蓝眼\n衣服：白衬衫'},b:{disable:true,content:'disabled hair'},c:{content:'服务器维护公告'}}};}},{world_info:{charLore:[{name:'A',extraBooks:['extra']}],globalSelect:['global']}});
 assert.deepEqual(new Set(loaded),new Set(['main','extra','chat','user','global']));assert.match(result.text,/A：银色头发/);assert.match(result.text,/U：粉色短发/);assert.match(result.text,/B/);assert.ok(!result.text.includes('服务器维护'));assert.ok(!result.text.includes('disabled'));
 const req=buildTagRequest({model:'mock',url:'https://api.example/v1',appearance:result.text},[{id:'a',text:'A走进客厅'}],1);assert.match(req.messages[1].content,/银色头发/);
});
test('content stays whole with malformed inner HTML, code fences and literal angle brackets',()=>{
 for(const text of ['<content>第一句<x>坏嵌套</other>第二句</content>','<content>第一句\n```html\n<div>代码</div>\n```\n第二句</content>','<content>开始 <notclosed> 结束</content>']){const parts=splitAutoMessage(text);assert.equal(parts.length,1);assert.equal(parts[0].text,text);assert.equal(parts[0].name,'正文');}
});
test('N scenes across passages use their own exact sentence, not every referenced paragraph',()=>{
 const parts=captureContext([{mes:'<content>甲句。乙句。</content>'},{mes:'<content>丙句。丁句。</content>'}],2);
 const scene={prompt:'scene',source_ids:parts.map(p=>p.id),anchor_source_id:parts[1].id,anchor_quote:'丙句。',anchor_occurrence:1};
 const anchor=sceneAnchor(scene,parts);assert.equal(anchor.messageIndex,1);assert.equal(anchor.anchorStart,9);assert.equal(anchor.anchorText,'丙句。');
 assert.throws(()=>sceneAnchor({...scene,anchor_quote:'编造'},parts),/不一致/);
 const parsed=parseScenes(JSON.stringify({scenes:[scene]}),parts.map(p=>p.id),1);assert.equal(parsed[0].anchor_quote,'丙句。');
});
test('local direct token survives a new vault instance but stays isolated by profile',async()=>{
 globalThis.indexedDB=indexedDB;await tokenVault('one').set('fake-local-token');assert.equal(await tokenVault('one').get(),'fake-local-token');assert.equal(await tokenVault('two').get(),'');await tokenVault('one').clear();assert.equal(await tokenVault('one').get(),'');
});

test('person archives reuse stable identity across chats and rescan never replaces saved edits',()=>{
 const c={characterId:0,characters:[{avatar:'chen.png',name:'陈野'}],name1:'黎千',getCurrentChatId:()=> 'first'};
 assert.equal(appearanceScope(c),appearanceScope({...c,getCurrentChatId:()=> 'second'}));
 assert.notEqual(appearanceScope(c),appearanceScope({...c,characters:[{avatar:'different.png',name:'陈野'}]}));
 const archive={};mergeAppearanceScan(archive,[{id:'card:chen.png',name:'陈野',text:'旧描述',source:'角色卡'}]);
 archive['card:chen.png'].text='我修改后的银发';
 mergeAppearanceScan(archive,[{id:'card:chen.png',name:'陈野',text:'新扫描黑发',source:'角色卡'}]);
 const restored=JSON.parse(JSON.stringify(archive));assert.equal(restored['card:chen.png'].text,'我修改后的银发');assert.equal(restored['card:chen.png'].scannedText,'新扫描黑发');
 assert.match(formatAppearanceProfiles(restored,['card:chen.png']),/我修改后的银发/);assert.equal(formatAppearanceProfiles(restored,[]),'');
});

test('scan keeps people and their named extras, skips world/rule entries, always offers the user',async()=>{
 const entries={a:{comment:'陈野',content:'外貌：黑色短发，灰色眼睛'},b:{comment:'陈野衣柜',content:'黑色皮夹克、工装裤'},c:{comment:'世界观',content:'这里的人头发很长，眼睛会发光'},d:{comment:'副本生成规则',content:'怪物红眼长发'},e:{content:'黑发，红眼'}};
 const r=await scanAppearance({characters:[{name:'陈野',avatar:'c.png',description:'陈野'}],characterId:0,name1:'黎千',powerUserSettings:{},chatMetadata:{world_info:'w'},loadWorldInfo:async()=>({entries})},{});
 const names=r.records.map(x=>x.name);assert.ok(names.includes('陈野衣柜'));assert.ok(names.includes('黎千'));
 for(const junk of ['世界观','副本生成规则','待整理人物'])assert.ok(!names.includes(junk));
});
