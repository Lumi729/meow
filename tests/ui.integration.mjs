process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(x=>!x.includes('data:text')).join('\n'));process.exit(1)});
import { Window } from 'happy-dom';
import { indexedDB, IDBDatabase } from 'fake-indexeddb';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root=new URL('../',import.meta.url).pathname;
const window=new Window({url:'https://local.test'});
for(const key of ['document','HTMLElement','HTMLDialogElement','Image','Option','Event','MouseEvent','Blob'])globalThis[key]=window[key];
globalThis.Option=function(text,value){const o=window.document.createElement('option');o.textContent=text;o.value=value;return o;};
globalThis.window=window;globalThis.localStorage=window.localStorage;globalThis.innerWidth=390;globalThis.innerHeight=844;globalThis.indexedDB=indexedDB;
window.Image.prototype.decode=async()=>{};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
globalThis.confirm=()=>true;globalThis.prompt=()=>'测试氛围';
const events={};
const extensionSettings={meow_secondary:{url:'https://aux.test/v1',model:'aux-model',secret_id:'mock-id',preset:'tags',context_count:5,image_count:1,rules:JSON.stringify([{name:'正文',start:'<正文>',end:'</正文>'},{name:'状态栏',start:'<状态栏>',end:'</状态栏>'}]),output:'journal'}};
let current='chat-a';
const context={extensionSettings,getCurrentChatId:()=>current,characterId:0,name1:'User',chat:[{name:'Char',mes:'<正文>white cat</正文><状态栏>do not send private</状态栏>'}],event_types:{APP_READY:'ready',SECRET_WRITTEN:'written',SECRET_DELETED:'deleted',CHAT_CHANGED:'chat'},eventSource:{on:(e,fn)=>events[e]=fn},saveSettingsDebounced:()=>{},getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'mock'}),renderExtensionTemplateAsync:()=>fs.readFile(root+'settings.html','utf8'),addOneMessage:()=>{},saveChat:async()=>{}};
globalThis.SillyTavern={getContext:()=>context};
window.document.body.innerHTML='<div id="top-settings-holder"></div><div id="extensionsMenu"></div><div id="extensions_settings2"></div>';
let src=await fs.readFile(root+'index.js','utf8');
const secretMock='export const SECRET_KEYS={NOVEL:"novel",CUSTOM:"custom"}; export const secret_state={novel:true};export async function findSecret(){return null};export async function writeSecret(){return "mock-id"}';
const utilsMock='export async function saveBase64AsFile(){return "/user/images/test.png"}';
src=src.replace("'../../../../script.js'",JSON.stringify('data:text/javascript,export async function saveSettings(){}'));
src=src.replaceAll("'../../../secrets.js'",JSON.stringify('data:text/javascript,'+encodeURIComponent(secretMock))).replace("'../../../utils.js'",JSON.stringify('data:text/javascript,'+encodeURIComponent(utilsMock)));
src=src.replace(/from '(\.\/[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(root+p.slice(2)).href));
src=src.replace(/const folder=.*?;/, "const folder='third-party/meow';");
const module=await import('data:text/javascript,'+encodeURIComponent(src));
await module.init();
const $=id=>document.querySelector('#meow-'+id);
const click=id=>$(id).click();
const field=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,5));};
assert.ok($('floating'));assert.ok($('top-button'));assert.ok(!$('panel').querySelector('details[open]'));
click('wand-button');assert.ok($('dialog').open);click('close');assert.ok(!$('dialog').open);
click('floating');assert.ok($('dialog').open);
click('close-top');assert.ok(!$('dialog').open);click('top-button');assert.ok($('dialog').open);
for(const [control,entry,key] of [['top-enabled','top-button','top_enabled'],['floating-enabled','floating','enabled']]){
 $(control).checked=false;$(control).dispatchEvent(new Event('input'));assert.ok($(entry).hidden);assert.equal(extensionSettings.meow_ui[key],false);
 $(control).checked=true;$(control).dispatchEvent(new Event('input'));assert.ok(!$(entry).hidden);
}
const launcherImage=$('floating').querySelector('img');assert.ok(launcherImage.src.endsWith('pet-phone.png'));launcherImage.dispatchEvent(new Event('error'));assert.ok(!$('floating').querySelector('span').hidden);launcherImage.dispatchEvent(new Event('load'));assert.ok($('floating').querySelector('span').hidden);
click('launcher-reset');assert.ok(!$('floating').hidden);

for(const page of ['bad','draw']){
 document.querySelector(`[data-page="${page}"]`).click();
 for(const size of [40,110]){field(page==='bad'?'bad-size':'floating-size',String(size));assert.equal($('floating').style.width,`${size}px`);assert.equal($('floating').querySelector('img').style.width,`${size}px`);assert.equal($('floating').querySelector('img').width,size);assert.equal($('floating').querySelector('img').style.getPropertyPriority('width'),'important');}
 assert.ok($('floating').querySelector('img').src.includes(page==='bad'?'love-transparent.png':'pet-phone.png'));
}
field('floating-size','50');field('bad-size','90');
for(const [page,size] of [['bad',90],['draw',50]]){document.querySelector(`[data-page="${page}"]`).click();assert.equal($('floating').querySelector('img').width,size);}
$('top-image').value='https://example.com/icon.png';$('top-image').dispatchEvent(new Event('change'));
assert.equal($('top-button').querySelector('img').src,'https://example.com/icon.png');
$('top-button').querySelector('img').dispatchEvent(new Event('error'));assert.ok(!$('top-button').querySelector('span').hidden);
$('top-image').value='';$('top-image').dispatchEvent(new Event('change'));assert.ok(!$('top-button').querySelector('span').hidden);
assert.equal([...$('sampler').options].find(o=>o.value==='k_euler_ancestral').textContent,'Euler Ancestral');
field('prompt','white cat');field('fixed_positive','pastel');field('preset-name','test config');click('preset-save');await settle();assert.equal(extensionSettings.meow_presets.length,1);
globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/status');const body=JSON.parse(options.body);assert.equal(body.secret_id,'mock-id');assert.equal(body.custom_url,'https://aux.test/v1');assert.ok(!body.messages);return new Response(JSON.stringify({data:[{id:'model-b'},{id:'model-a'},{id:'model-a'}]}));};
click('fetch-models');await settle();assert.equal($('secondary-model-list').options.length,3);
$('secondary-model-list').value='model-a';$('secondary-model-list').dispatchEvent(new Event('change'));assert.equal(extensionSettings.meow_secondary.model,'model-a');assert.equal($('secondary-model').value,'model-a');
globalThis.fetch=async()=>new Response(JSON.stringify({error:true}));click('fetch-models');await settle();assert.equal($('fetch-models').disabled,false);assert.match($('models-state').textContent,/未返回模型列表/);assert.equal(extensionSettings.meow_secondary.model,'model-a');
let calls=[];
globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(url.includes('chat-completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'a white cat',source_ids:['m0p0'],anchor_source_id:'m0p0',anchor_quote:'white cat'}]})}}]}));return new Response('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');};
click('capture');await settle();assert.equal($('context-list').querySelectorAll('input[type=checkbox]').length,2);assert.ok(!$('send-preview').value.includes('private'));
const choice=$('context-list').querySelector('input');choice.checked=true;choice.dispatchEvent(new Event('change'));
click('tags');await settle();assert.equal(calls.length,1);assert.ok(!JSON.stringify(calls[0]).includes('do not send private'));assert.equal($('scenes').querySelectorAll('textarea').length,3);
click('bad-generate');await settle();assert.equal(calls.length,2);assert.equal(calls[1].body.prompt,'pastel, a white cat');assert.equal($('gallery').querySelectorAll('article').length,1);
$('gallery').querySelector('button').click();await settle();assert.ok($('viewer').open);assert.ok($('viewer').textContent.includes('white cat'));assert.ok(!$('viewer').textContent.includes('private'));
click('close');assert.equal($('prompt').value,'white cat');
current='chat-b';await events.chat();click('bad-generate');await settle();assert.equal(calls.length,2);assert.match($('status').textContent,/聊天已切换/);
const {galleryStore}=await import('../storage.js');const persisted=await galleryStore(extensionSettings.meow_gallery_scope).list();assert.equal(persisted.length,1);assert.equal(persisted[0].source[0].text,'<正文>white cat</正文>');await galleryStore(extensionSettings.meow_gallery_scope).remove(persisted[0].id);assert.equal((await galleryStore(extensionSettings.meow_gallery_scope).list()).length,0);
$('viewer').close();
click('generate');await settle();assert.equal(calls.length,3);assert.equal($('generate').disabled,false);
click('generate');await settle();assert.equal(calls.length,4);assert.equal($('generate').disabled,false);
const originalTransaction=IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction=function(){throw new Error('simulated storage failure');};
click('generate');await settle();assert.equal(calls.length,5);assert.equal($('generate').disabled,false);assert.match($('status').textContent,/存储失败/);
IDBDatabase.prototype.transaction=originalTransaction;
click('generate');await settle();assert.equal(calls.length,6);assert.equal($('generate').disabled,false);
// Full multi-character UI flow, with local mock credentials and no paid requests.
field('transport','bridge');field('token','test-only');click('save-token');await settle();
$('character-mode').checked=true;$('character-mode').dispatchEvent(new Event('change'));
click('capture');await settle();const section=$('context-list').querySelector('input');section.checked=true;section.dispatchEvent(new Event('change'));
const characters=[{name:'A',prompt:'white hair',negative_prompt:'black hair',x:0.2,y:0.5},{name:'B',prompt:'black hair',negative_prompt:'white hair',x:0.8,y:0.5}];
let directBody;
globalThis.fetch=async(url,options)=>{if(url.includes('chat-completions')){assert.match(JSON.parse(options.body).messages[0].content,/characters/);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'2people',source_ids:['m0p0'],anchor_source_id:'m0p0',anchor_quote:'white cat',characters}]})}}]}));}directBody=JSON.parse(options.body);return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
click('tags');await settle();assert.equal($('scenes').querySelectorAll('input[type=number]').length,4);assert.match($('tags-status').textContent,/tags 已返回/);field('transport','direct');
const x=$('scenes').querySelector('input');x.value='0.3';x.dispatchEvent(new Event('input'));
click('bad-generate');await settle();assert.ok(directBody);assert.equal(directBody.parameters.v4_prompt.caption.char_captions[0].centers[0].x,0.3);assert.equal(directBody.parameters.v4_negative_prompt.caption.char_captions[1].char_caption,'white hair');assert.match(directBody.parameters.v4_prompt.caption.base_caption,/pastel/);
const sceneEntry=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.payload.direct);assert.equal(sceneEntry.payload.direct.parameters.v4_prompt.caption.char_captions.length,2);
field('transport','bridge');field('cfg_rescale','0.18');field('sampler','k_dpmpp_2m_sde');
$('variety_boost').checked=true;$('variety_boost').dispatchEvent(new Event('input'));$('decrisper').checked=true;$('decrisper').dispatchEvent(new Event('input'));
click('generate');await settle();assert.equal(directBody.parameters.sampler,'k_dpmpp_2m_sde');assert.equal(directBody.parameters.cfg_rescale,0.18);assert.equal(directBody.parameters.skip_cfg_above_sigma,58);assert.equal(directBody.parameters.dynamic_thresholding,true);assert.equal($('generate').disabled,false);
let pendingTx;
IDBDatabase.prototype.transaction=function(){pendingTx={objectStore:()=>({put:()=>({})}),abort:()=>{}};return pendingTx;};
$('latest').replaceChildren();click('generate');await settle();assert.ok($('latest').querySelector('img'));assert.equal($('generate').disabled,true);
pendingTx.oncomplete();await settle();assert.equal($('generate').disabled,false);IDBDatabase.prototype.transaction=originalTransaction;
assert.match($('generation-timing').textContent,/请求及下载.*解码.*保存/);
// Both page previews retain viewer swipes after closing, and have their own carousel.
assert.ok($('bad-latest').querySelector('img'));
$('latest').querySelector('.meow-thumb').click();await settle();
[...$('viewer').querySelectorAll('button')].find(x=>x.textContent==='下一张 ›').click();await settle();
const chosenPreview=extensionSettings.meow_preview.draw;$('viewer').close();
assert.equal(extensionSettings.meow_preview.draw,chosenPreview);assert.ok($('latest').textContent.includes('2 /'));
$('latest').querySelector('.meow-row button').click();await settle();assert.ok($('latest').textContent.includes('1 /'));
// Saved appearance profiles survive chat changes and require explicit save of edits.
click('appearance-new');field('appearance-name','陈野');field('appearance-text','银发，蓝眼');click('appearance-save');await settle();
const personId=$('appearance-profile').value;assert.ok(personId);assert.match($('appearance-preview').value,/银发/);
current='another-chat-same-character';await events.chat();assert.equal($('appearance-profile').value,personId);assert.equal($('appearance-text').value,'银发，蓝眼');
field('appearance-text','银发，绿眼');click('appearance-save');await settle();assert.equal(extensionSettings.meow_people[personId].text,'银发，绿眼');
$('appearance-use').checked=false;$('appearance-use').dispatchEvent(new Event('change'));await settle();assert.ok(!$('appearance-preview').value.includes('银发'));
// Typed preview goes straight to the secondary API; captured text, preview and tags survive chat switches.
assert.equal(extensionSettings.meow_last_preset,extensionSettings.meow_presets[0].id);
current='chat-manual';await events.chat();$('character-mode').checked=false;$('character-mode').dispatchEvent(new Event('change'));
let manualBody;globalThis.fetch=async(url,options)=>{if(url.includes('chat-completions')){manualBody=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'girl in rain',source_ids:['manual']}]})}}]}));}return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
field('send-preview','她站在雨里');click('tags');await settle();assert.match(manualBody.messages[1].content,/她站在雨里/);assert.equal($('scenes').querySelectorAll('select').length,0);assert.match($('tags-status').textContent,/图文相册/);
await new Promise(r=>setTimeout(r,400));current='chat-other';await events.chat();assert.equal($('scenes').children.length,0);assert.equal($('send-preview').value,'');
current='chat-manual';await events.chat();assert.equal($('send-preview').value,'她站在雨里');assert.equal($('scenes').querySelector('textarea').value,'girl in rain');
click('bad-generate');await settle();const manualEntry=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.source[0]?.id==='manual');assert.ok(manualEntry);
// Big boxes fold into one-line summaries that preview their content.
assert.ok($('prompt').closest('details.meow-fold'));$('prompt').value='folded preview text';assert.match($('prompt').closest('details').querySelector('.meow-fold-preview').textContent,/folded preview/);
// "Use this image" → vibe reference: encoded once, then sent with the official request.
field('model','nai-diffusion-4-5-full');field('transport','bridge');field('cfg_rescale','0');
let vibeCalls=[],genBody;globalThis.fetch=async(url,options)=>{if(String(url).includes('encode-vibe')){vibeCalls.push(JSON.parse(options.body));return new Response(new Uint8Array([1,2,3]));}if(String(url).includes('generate-image')){genBody=JSON.parse(options.body);return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));}return new Response('{}');};
$('latest').querySelector('.meow-thumb').click();await settle();
[...$('viewer').querySelectorAll('.meow-use button')].find(b=>b.textContent==='氛围参考').click();await settle();assert.ok(!$('viewer').open);assert.match($('tools-badge').textContent,/氛围×1/);
click('generate');await settle();assert.equal(vibeCalls.length,1);assert.equal(vibeCalls[0].model,'nai-diffusion-4-5-full');assert.deepEqual(genBody.parameters.reference_image_multiple,['AQID']);
click('generate');await settle();assert.equal(vibeCalls.length,1);
// Website tools live on their own page; the drawing page keeps quick buttons.
click('close');click('floating');document.querySelector('[data-page="draw"]').click();document.querySelector('[data-tool-jump="director"]').click();await settle();assert.ok(!document.querySelector('[data-view="tools"]').hidden);assert.ok(document.querySelector('[data-view="draw"]').hidden);
// Website tools can take pictures straight from Meow's gallery.
document.querySelector('[data-gallery-pick="vibe"]').click();await settle();assert.ok($('gallery-picker')?.open||document.querySelector('#meow-gallery-picker').open);document.querySelector('#meow-gallery-picker .meow-pick-item').click();await settle();assert.match($('tools-badge').textContent,/氛围×2/);
// Vibe library: save once, switch on/off from the drawing page, reuse the saved encoding.
[...$('vibe-list').querySelectorAll('button')].find(b=>b.textContent==='存进氛围库').click();await settle();assert.match($('vibe-lib-draw').textContent,/测试氛围/);
$('vibe-on').checked=false;$('vibe-on').dispatchEvent(new Event('change'));await settle();assert.match($('vibe-summary').textContent,/不用/);
genBody=null;document.querySelector('[data-page="draw"]').click();click('generate');await settle();assert.ok(genBody);assert.equal(genBody.parameters.reference_image_multiple,undefined);
click('tools-reset');await settle();assert.equal($('vibe-list').children.length,0);
const libCheck=$('vibe-lib-draw').querySelector('input[type=checkbox]');libCheck.checked=true;libCheck.dispatchEvent(new Event('change'));await settle();assert.ok($('vibe-on').checked);
const before=vibeCalls.length;genBody=null;click('generate');await settle();assert.equal(vibeCalls.length,before);assert.deepEqual(genBody.parameters.reference_image_multiple,['AQID']);
// Explanations fold into small round hints.
const dot=document.querySelector('#meow-panel .meow-hint-dot');assert.ok(document.querySelectorAll('#meow-panel .meow-hint-dot').length>5);assert.ok(dot.closest('.meow-hint-row'));const hint=dot.closest('.meow-hint-row').nextElementSibling;assert.ok(hint.hidden);dot.click();assert.ok(!hint.hidden);
// Reverse-tag prompt restores to default and exports like the tag preset.
field('reverse-prompt','my reverse rules');assert.equal(extensionSettings.meow_secondary.reverse_prompt,'my reverse rules');click('reverse-default');await settle();assert.notEqual($('reverse-prompt').value,'my reverse rules');
// Global theme {name, css} applies immediately and survives in settings.
field('theme-title','黑白画室');$('theme-css').value='#meow-panel{background:#fff}';click('theme-apply');await settle();assert.equal(document.getElementById('meow-theme-style').textContent,'#meow-panel{background:#fff}');assert.equal(extensionSettings.meow_theme.name,'黑白画室');
$('theme-css').value='</style><script>';click('theme-apply');await settle();assert.equal(extensionSettings.meow_theme.css,'#meow-panel{background:#fff}');
click('theme-reset');await settle();assert.equal(document.getElementById('meow-theme-style').textContent,'');
// 书摘 bridge: a "画图" button joins the selection bar; the selected sentence goes to tags and then to a picture.
current='chat-a';await events.chat();
const chatBox=document.createElement('div');chatBox.id='chat';chatBox.innerHTML='<div class="mes" mesid="0"><div class="mes_text"><p>white cat</p></div></div>';document.body.append(chatBox);
const fbar=document.createElement('div');fbar.id='be-float-bar';fbar.className='show';fbar.innerHTML='<button class="be-fbtn" data-act="highlight">划线</button>';document.body.append(fbar);await settle();
const meowBtn=fbar.querySelector('.meow-be-btn');assert.ok(meowBtn);assert.match(meowBtn.textContent,/画图/);
const range=document.createRange();range.selectNodeContents(chatBox.querySelector('p').firstChild);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
let selBodies=[];globalThis.fetch=async(url,options)=>{const b=JSON.parse(options.body);selBodies.push({url:String(url),b});if(String(url).includes('chat-completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'a white cat',source_ids:['m0sel'],anchor_source_id:'m0sel',anchor_quote:'white cat'}]})}}]}));return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
meowBtn.click();await settle();const selDialog=document.getElementById('meow-selection-dialog');assert.ok(selDialog.open);assert.match(selDialog.textContent,/white cat/);assert.ok(!selDialog.querySelector('option[value=chat]').disabled);
[...selDialog.querySelectorAll('button')].find(b=>b.textContent.startsWith('开始')).click();await settle();await settle();
assert.ok(selBodies.some(x=>x.url.includes('chat-completions')&&JSON.stringify(x.b).includes('white cat')));assert.ok(!fbar.classList.contains('show'));
const selEntry=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.source[0]?.id==='m0sel');assert.ok(selEntry);assert.equal(selEntry.insertionSource.anchorText,'white cat');
console.log('UI integration: entries, persistent dialog, presets, selected-only context, tags, NAI composition, gallery with source, stale-chat guard passed.');process.exit(0);
await window.happyDOM.abort();
