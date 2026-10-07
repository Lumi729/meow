process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(x=>!x.includes('data:text')).join('\n'));process.exit(1)});
import { Window } from 'happy-dom';
import { indexedDB, IDBDatabase } from 'fake-indexeddb';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
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
const context={extensionSettings,getCurrentChatId:()=>current,characterId:0,name1:'User',chat:[{name:'Char',mes:'<正文>white cat</正文><状态栏>do not send private</状态栏>'}],event_types:{GENERATION_STARTED:'generation-start',GENERATION_ENDED:'generation-end',GENERATION_STOPPED:'generation-stop',MESSAGE_RECEIVED:'message-received',APP_READY:'ready',SECRET_WRITTEN:'written',SECRET_DELETED:'deleted',CHAT_CHANGED:'chat'},eventSource:{on:(e,fn)=>events[e]=fn},saveSettingsDebounced:()=>{},getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'mock'}),renderExtensionTemplateAsync:()=>fs.readFile(root+'settings.html','utf8'),addOneMessage:()=>{},saveChat:async()=>{}};
globalThis.SillyTavern={getContext:()=>context};
window.document.body.innerHTML='<div id="top-settings-holder"></div><div id="extensionsMenu"></div><div id="extensions_settings2"></div>';
let src=await fs.readFile(root+'index.js','utf8');
const secretMock='export const SECRET_KEYS={NOVEL:"novel",CUSTOM:"custom"}; export const secret_state={novel:true};export async function findSecret(){return null};export async function writeSecret(){return "mock-id"}';
const utilsMock='export async function saveBase64AsFile(){return "/user/images/test.png"}';
src=src.replaceAll("'../../../../script.js'",JSON.stringify('data:text/javascript,export async function saveSettings(){};export function isGenerating(){return false}'));
src=src.replaceAll("'../../../secrets.js'",JSON.stringify('data:text/javascript,'+encodeURIComponent(secretMock))).replace("'../../../utils.js'",JSON.stringify('data:text/javascript,'+encodeURIComponent(utilsMock)));
src=src.replace(/from '(\.\/[^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(root+p.slice(2)).href));
src=src.replace(/const folder=.*?;/, "const folder='third-party/meow';");
const module=await import('data:text/javascript,'+encodeURIComponent(src));
await module.init();
const $=id=>document.querySelector('#meow-'+id);
const click=id=>$(id).click();
const field=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,5));};
const allIds=[...document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(allIds).size,allIds.length,'UI ids must be unique');
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
click('capture');await settle();assert.equal($('context-list').querySelectorAll('input[type=checkbox]').length,2);assert.match($('context-summary').textContent,/已捕捉 2 段/);assert.equal($('context-count').value,'5');assert.ok($('capture-original').value.includes(context.chat[0].mes));assert.ok(!$('send-preview').value.includes('private'));
const choice=$('context-list').querySelector('input');choice.checked=true;choice.dispatchEvent(new Event('change'));
click('tags');await settle();assert.equal(calls.length,1);assert.ok(!JSON.stringify(calls[0]).includes('do not send private'));assert.equal($('scenes').querySelectorAll('textarea').length,3);
const keptTags=$('scenes').querySelector('textarea');keptTags.value='edited white cat';keptTags.dispatchEvent(new Event('input',{bubbles:true}));
const keptFold=keptTags.closest('details');keptFold.open=true;
field('image-count','3');assert.equal(extensionSettings.meow_secondary.image_count,'3');
await events.chat();await settle();
assert.equal($('scenes').querySelector('textarea'),keptTags);assert.equal(keptTags.value,'edited white cat');assert.equal(keptFold.open,true);
const savedDraft=Object.values(JSON.parse(localStorage.getItem('meow-bad-drafts'))).find(d=>d.scenes?.length);
assert.equal(savedDraft.scenes[0].prompt,'edited white cat');
$('character-mode').checked=true;$('character-mode').dispatchEvent(new Event('change'));
$('character-mode').checked=false;$('character-mode').dispatchEvent(new Event('change'));
choice.dispatchEvent(new Event('change'));assert.equal($('scenes').querySelector('textarea'),keptTags);
const wrongAnchor=$('scenes').querySelectorAll('textarea')[2];wrongAnchor.value='a paraphrase absent from the story';wrongAnchor.dispatchEvent(new Event('input',{bubbles:true}));
field('output','chat');click('bad-generate');await settle();assert.equal(calls.length,1,'invalid insertion is blocked before a paid image call');
field('output','journal');
click('bad-generate');await settle();assert.equal(calls.length,2);assert.equal(calls[1].body.prompt,'pastel, edited white cat');assert.equal($('gallery').querySelectorAll('article').length,1);
const beforeCountFetch=globalThis.fetch;let nextCountBody;
globalThis.fetch=async(url,options)=>{nextCountBody=JSON.parse(options.body);return new Response(JSON.stringify({error:{message:'test failure'}}));};
click('tags');await settle();assert.match(nextCountBody.messages[0].content,/恰好 3 个/);
assert.equal($('scenes').querySelector('textarea'),keptTags);assert.equal(keptTags.value,'edited white cat');
globalThis.fetch=beforeCountFetch;field('image-count','1');
const originalPicker=$('scenes').querySelector('select[aria-label]');assert.ok(originalPicker);originalPicker.value='0';originalPicker.dispatchEvent(new Event('change'));assert.equal(wrongAnchor.value,'white cat');
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
click('theme-save');await settle();
assert.equal(extensionSettings.meow_themes.length,1);
const firstTheme=extensionSettings.meow_themes[0].id;
field('theme-title','第二套');$('theme-css').value='#meow-panel{color:pink}';click('theme-save');await settle();
assert.equal(extensionSettings.meow_themes.length,2);
$('theme-select').value=firstTheme;$('theme-select').dispatchEvent(new Event('change',{bubbles:true}));await settle();
assert.equal(extensionSettings.meow_theme.name,'黑白画室');
globalThis.confirm=()=>false;
$('theme-css').value='#meow-panel{color:red}';click('theme-save');await settle();
assert.equal(extensionSettings.meow_themes[0].css,'#meow-panel{background:#fff}');
globalThis.confirm=()=>true;
click('theme-save');await settle();assert.equal(extensionSettings.meow_themes.length,2);
assert.equal(extensionSettings.meow_themes[0].css,'#meow-panel{color:red}');
$('theme-css').value='#meow-panel{background:#fff}';click('theme-save');await settle();
click('theme-delete');await settle();assert.equal(extensionSettings.meow_themes.length,1);
assert.equal(extensionSettings.meow_theme.css,'#meow-panel{background:#fff}');
$('theme-css').value='</style><script>';click('theme-apply');await settle();assert.equal(extensionSettings.meow_theme.css,'#meow-panel{background:#fff}');
click('theme-reset');await settle();assert.equal(document.getElementById('meow-theme-style').textContent,'');assert.equal(extensionSettings.meow_themes.length,1);
context.chat[0].mes='<正文>她穿着礼服。white cat</正文>';
field('tag-preset','测试坏猫猫预设');
// 书摘 bridge: a "画图" button joins the selection bar; the selected sentence goes to tags and then to a picture.
current='chat-a';await events.chat();
const chatBox=document.createElement('div');chatBox.id='chat';chatBox.innerHTML='<div class="mes" mesid="0"><div class="mes_text"><p>white cat</p></div></div>';document.body.append(chatBox);
const fbar=document.createElement('div');fbar.id='be-float-bar';fbar.className='show';fbar.innerHTML='<button class="be-fbtn" data-act="highlight">划线</button>';document.body.append(fbar);await settle();const other=document.createElement('button');other.className='be-fbtn other-edit';other.textContent='修改';fbar.append(other);await new Promise(r=>setTimeout(r,400));
const meowBtn=fbar.querySelector('.meow-be-btn');assert.ok(meowBtn);assert.match(meowBtn.textContent,/画图/);assert.match(meowBtn.textContent,/画图/);
const range=document.createRange();range.selectNodeContents(chatBox.querySelector('p').firstChild);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
let selBodies=[];globalThis.fetch=async(url,options)=>{const b=JSON.parse(options.body);selBodies.push({url:String(url),b});if(String(url).includes('chat-completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'a white cat',source_ids:['m0sel'],anchor_source_id:'m0sel',anchor_quote:'white cat'}]})}}]}));return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
meowBtn.click();await settle();const selDialog=document.getElementById('meow-selection-dialog');assert.ok(selDialog.open);assert.match(selDialog.textContent,/white cat/);assert.ok(!selDialog.querySelector('option[value=chat]').disabled);
[...selDialog.querySelectorAll('button')].find(b=>b.textContent.startsWith('开始')).click();await settle();await settle();
assert.ok(selBodies.some(x=>x.url.includes('chat-completions')&&JSON.stringify(x.b).includes('white cat')));assert.ok(!fbar.classList.contains('show'));
const excerptRequest=selBodies.find(x=>x.url.includes('chat-completions')).b;
assert.match(excerptRequest.messages[0].content,/测试坏猫猫预设/);assert.match(excerptRequest.messages[0].content,/优先于人物档案/);
const excerptData=JSON.parse(excerptRequest.messages[1].content);assert.match(excerptData.original_context,/她穿着礼服/);assert.equal(excerptData.passages[0].text,'white cat');
const selEntry=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.source[0]?.id==='m0sel');assert.ok(selEntry);assert.equal(selEntry.insertionSource.anchorText,'white cat');
// Gift for 梨梨: welcome card once, letter after five taps on the title.
assert.ok(document.getElementById('meow-gift-welcome').textContent.includes('世界为梨梨诞生'));document.getElementById('meow-gift-welcome').close();assert.equal(extensionSettings.meow_gift_seen,true);
const giftTitle=document.querySelector('#meow-panel .meow-header h2');for(let i=0;i<5;i++)giftTitle.click();assert.ok(document.getElementById('meow-gift-letter').open);assert.match(document.getElementById('meow-gift-letter').textContent,/梨梨/);
// Redraws of story pictures follow the current 星绘 config (fixed positive changed after drawing).
document.querySelectorAll('dialog').forEach(d=>{if(d.open)d.close();});
let redrawBody;globalThis.fetch=async(url,options)=>{redrawBody=JSON.parse(options.body);return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
const withScene=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.scene);assert.ok(withScene);
click('close');click('floating');document.querySelector('[data-page="draw"]').click();field('fixed_positive','ink style');
document.querySelector('[data-page="gallery"]').click();$('gallery-filter').value='all';$('gallery-filter').dispatchEvent(new Event('change'));await settle();
[...$('gallery').querySelectorAll('button')].find(b=>b.querySelector('img')?.alt===withScene.title&&b.querySelector('img').src===withScene.src)?.click()??$('gallery').querySelector('button').click();await settle();
[...$('viewer').querySelectorAll('button')].find(b=>b.textContent.startsWith('重绘')).click();await settle();
const sentPrompt=redrawBody.input??redrawBody.prompt;assert.ok(sentPrompt.startsWith('ink style'),sentPrompt);assert.ok(sentPrompt.includes(withScene.scene.prompt),sentPrompt);
// The shared viewer edits structured scene/character tags, persists them and redraws without a tags API call.
const editorButton=(scope,label)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===label);
editorButton($('viewer'),'修改 tags').click();await settle();
let tagEditor=document.getElementById('meow-tag-editor');assert.ok(tagEditor.open);
const editField=(label,value)=>{const input=tagEditor.querySelector(`[aria-label="${label}"]`);assert.ok(input,label);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
editField('场景标题','编辑过的场景');editField('场景正面 tags','silver fox in garden');editField('场景负面 tags','blurry');
while(tagEditor.querySelector('.meow-editor-person'))editorButton(tagEditor,'删除此角色').click();
editorButton(tagEditor,'添加角色').click();editField('角色 1 名字','Fox');editField('角色 1 正面 tags','blue eyes, white hair');editField('角色 1 负面 tags','red eyes');editField('角色 1 横向位置 x','0.2');editField('角色 1 纵向位置 y','0.7');
let editorCalls=0;globalThis.fetch=async(url,options)=>{assert.ok(!String(url).includes('chat-completions'));editorCalls++;redrawBody=JSON.parse(options.body);return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
editorButton(tagEditor,'保存 tags').click();await settle();assert.equal(editorCalls,0);
const editedEntry=(await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.title==='编辑过的场景');assert.ok(editedEntry);assert.equal(editedEntry.scene.characters[0].x,0.2);assert.ok(!editedEntry.payload.prompt.includes('silver fox'));
editorButton(tagEditor,'关闭').click();editorButton($('viewer'),'修改 tags').click();await settle();assert.equal(tagEditor.querySelector('[aria-label="角色 1 正面 tags"]').value,'blue eyes, white hair');
editorButton(tagEditor,'保存并重绘').click();await settle();await settle();assert.equal(editorCalls,1);assert.equal(tagEditor.open,false);
assert.match(redrawBody.input??redrawBody.prompt,/silver fox/);assert.equal(redrawBody.parameters.v4_prompt.caption.char_captions[0].centers[0].x,0.2);assert.equal(redrawBody.parameters.v4_prompt.caption.char_captions[0].centers[0].y,0.7);
// Star drawing batches stay sequential and honor Stop before the next image.
let batchCalls=0;globalThis.fetch=async()=>{batchCalls++;if(batchCalls===2)click('stop');return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
field('draw-count','20');field('prompt','cat');click('generate');await settle();await settle();assert.equal(batchCalls,2);assert.equal($('generate').disabled,false);
field('draw-count','1');assert.equal($('image-count').max,'20');
// Secondary profiles preserve their own connection and secret ID, with preset isolation.
const sec=extensionSettings.meow_secondary,keptPreset=sec.preset;
field('secondary-url','https://one.test/v1');field('secondary-model','one');sec.secret_id='key-one';field('secondary-profile-name','一号');click('secondary-profile-save');await settle();
const firstConnection=extensionSettings.meow_secondary_profile_id;
field('secondary-url','https://two.test/v1');field('secondary-model','two');sec.secret_id='key-two';field('secondary-profile-name','二号');click('secondary-profile-save');await settle();
$('secondary-profile-list').value=firstConnection;$('secondary-profile-list').dispatchEvent(new Event('change'));await settle();
assert.equal(sec.secret_id,'key-one');assert.equal(sec.url,'https://one.test/v1');assert.equal(sec.model,'one');assert.equal(sec.preset,keptPreset);
const profileCount=extensionSettings.meow_secondary_profiles.length;
globalThis.confirm=()=>false;click('secondary-profile-delete');await settle();assert.equal(extensionSettings.meow_secondary_profiles.length,profileCount);
globalThis.confirm=()=>true;click('secondary-profile-delete');await settle();assert.equal(extensionSettings.meow_secondary_profiles.length,profileCount-1);assert.equal(sec.secret_id,'key-one');
assert.ok(extensionSettings.meow_secondary_profiles.some(p=>p.name==='二号'&&p.secret_id==='key-two'));
// Named tag presets preserve drafts, confirm destructive changes, and isolate connections.
const connectionBefore=JSON.stringify({url:sec.url,model:sec.model,secret_id:sec.secret_id});
assert.equal(extensionSettings.meow_tag_profiles[0].preset,'tags');
field('tag-preset','first instruction');field('tag-profile-name','第一套');click('tag-profile-save');await settle();
const firstTag=extensionSettings.meow_tag_profile_id;
field('tag-preset','second instruction');field('tag-profile-name','第二套');click('tag-profile-save');await settle();
const secondTag=extensionSettings.meow_tag_profile_id;
field('tag-preset','unsaved draft');globalThis.confirm=()=>false;
$('tag-profile-list').value=firstTag;$('tag-profile-list').dispatchEvent(new Event('change'));await settle();
assert.equal(sec.preset,'unsaved draft');assert.equal($('tag-profile-list').value,secondTag);
click('tag-profile-save');await settle();assert.equal(extensionSettings.meow_tag_profiles.find(p=>p.id===secondTag).preset,'second instruction');
globalThis.confirm=()=>true;
$('tag-profile-list').value=firstTag;$('tag-profile-list').dispatchEvent(new Event('change'));await settle();
assert.equal(sec.preset,'first instruction');assert.equal($('tag-preset').value,'first instruction');
assert.equal(JSON.stringify({url:sec.url,model:sec.model,secret_id:sec.secret_id}),connectionBefore);
field('tag-preset','updated first');click('tag-profile-save');await settle();
assert.equal(extensionSettings.meow_tag_profiles.find(p=>p.id===firstTag).preset,'updated first');
const tagCount=extensionSettings.meow_tag_profiles.length;
globalThis.confirm=()=>false;click('tag-profile-delete');await settle();assert.equal(extensionSettings.meow_tag_profiles.length,tagCount);
globalThis.confirm=()=>true;click('tag-profile-delete');await settle();assert.equal(extensionSettings.meow_tag_profiles.length,tagCount-1);assert.equal(sec.preset,'updated first');
$('tag-profile-list').value=secondTag;$('tag-profile-list').dispatchEvent(new Event('change'));await settle();
field('tag-preset','draft survives reopen');
// Reinitializing the UI must restore the remembered token without server key exposure.
window.document.body.innerHTML='<div id="top-settings-holder"></div><div id="extensionsMenu"></div><div id="extensions_settings2"></div>';
await module.init();
assert.ok([...$('secondary-profile-list').options].some(p=>p.textContent==='二号'));assert.equal($('theme-select').options.length,2);assert.equal(extensionSettings.meow_themes[0].name,'第二套');
assert.equal($('tag-profile-list').value,secondTag);assert.equal($('tag-preset').value,'draft survives reopen');assert.equal(extensionSettings.meow_tag_profiles.find(p=>p.id===secondTag).preset,'second instruction');
assert.match($('key-status').textContent,/直连 Token 可用/);
let restoredAuth='';globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://image.novelai.net/'));restoredAuth=options.headers.Authorization;return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));};
field('transport','direct');field('prompt','cat');click('generate');await settle();
assert.equal(restoredAuth,'Bearer test-only');
// Automatic full-reply drawing filters selected tags without altering chat or manual drafts.
assert.equal($('auto-draw').checked,false);assert.equal($('auto-image-count').value,'1');assert.equal($('auto-generate-images').checked,true);
context.chat=[{name:'Char',mes:'<正文>white cat</正文><状态栏>hidden secret</状态栏>'}];
click('auto-exclusion-scan');
const candidates=[...$('auto-exclusion-candidates').querySelectorAll('label')];
const exclusion=candidates.find(label=>label.textContent.includes('状态栏')).querySelector('input');
exclusion.checked=true;exclusion.dispatchEvent(new Event('change'));
assert.equal(extensionSettings.meow_secondary.auto_exclusions[0].start,'<状态栏>');
assert.equal($('auto-exclusion-disclosure').open,false);
assert.match($('auto-exclusion-summary').textContent,/已选 1 \/ 2/);
$('auto-exclusion-disclosure').open=true;
$('auto-exclusions').querySelector('button').click();
assert.equal(exclusion.checked,false);
exclusion.checked=true;exclusion.dispatchEvent(new Event('change'));
click('auto-exclusion-scan');
assert.equal($('auto-exclusion-disclosure').open,true);
assert.equal($('auto-exclusion-candidates').querySelectorAll('input:checked').length,1);
assert.equal(extensionSettings.meow_secondary.auto_exclusions.length,1);
$('auto-exclusion-disclosure').open=false;

const draftBefore=$('send-preview').value;let autoRequests=[],autoImages=0;
field('image-count','7');field('output','journal');
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){
  const body=JSON.parse(options.body);autoRequests.push(body);
  assert.ok(body.messages[0].content.startsWith(extensionSettings.meow_secondary.preset+'\n'));assert.match(body.messages[0].content,/恰好 1 个/);
  const passages=JSON.parse(body.messages[1].content).passages;
  assert.equal(passages.length,1);assert.equal(passages[0].text,'<正文>white cat</正文>');assert.ok(!JSON.stringify(body).includes('hidden secret'));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:[{title:'cat',prompt:'white cat',negative_prompt:'',source_ids:[passages[0].id],anchor_source_id:passages[0].id,anchor_quote:'white cat'}]})}}]}));
 }
 autoImages++;return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
$('auto-draw').checked=true;$('auto-draw').dispatchEvent(new Event('change'));
events['generation-start']('normal');events['message-received'](0);events['generation-end']();await settle();await settle();
assert.equal(autoRequests.length,1);assert.equal(autoImages,1);assert.equal($('send-preview').value,draftBefore);assert.ok(context.chat[0].mes.includes('hidden secret'));
events['generation-end']();await settle();assert.equal(autoRequests.length,1);
$('auto-image-count').value='3';$('auto-image-count').dispatchEvent(new Event('change'));await settle();
assert.equal(extensionSettings.meow_secondary.auto_image_count,3);assert.equal(extensionSettings.meow_secondary.image_count,'7');
$('auto-image-count').value='0';$('auto-image-count').dispatchEvent(new Event('change'));await settle();assert.equal($('auto-image-count').value,'3');
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){const body=JSON.parse(options.body);assert.match(body.messages[0].content,/恰好 3 个/);const id=JSON.parse(body.messages[1].content).passages[0].id;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:Array.from({length:3},()=>({title:'cat',prompt:'white cat',negative_prompt:'',source_ids:[id],anchor_source_id:id,anchor_quote:'white cat'}))})}}]}));}
 autoImages++;return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
events['generation-start']('normal');events['message-received'](0);events['generation-end']();await settle();await settle();assert.equal(autoImages,4);
// A failed second picture retries without regenerating tags or the first picture.
assert.equal($('auto-retries').value,'2');
$('auto-retries').value='1';$('auto-retries').dispatchEvent(new Event('change'));await settle();
assert.equal(extensionSettings.meow_secondary.auto_retries,1);
const chatHost=document.createElement('div');chatHost.id='chat';chatHost.innerHTML='<div class="mes" mesid="0"><div class="mes_text">white cat</div></div>';document.body.append(chatHost);
let retryTags=0,retryImages=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){retryTags++;const id=JSON.parse(JSON.parse(options.body).messages[1].content).passages[0].id;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:Array.from({length:3},()=>({title:'cat',prompt:'white cat',negative_prompt:'',source_ids:[id],anchor_source_id:id,anchor_quote:'white cat'}))})}}]}));}
 if(!String(url).includes('generate-image'))return new Response('{}');
 retryImages++;if(retryImages===2)return new Response('',{status:503});
 return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
events['generation-start']('normal');events['message-received'](0);events['generation-end']();await settle();await settle();
assert.equal(retryImages,2);assert.equal(chatHost.querySelectorAll('.meow-inline-pending').length,2);assert.ok([...chatHost.querySelectorAll('.meow-inline-pending')].every(card=>card.children.length===2&&card.querySelector('[role=status]').textContent==='cat'));
await new Promise(resolve=>setTimeout(resolve,2200));await settle();
assert.equal(retryTags,1);assert.equal(retryImages,4);assert.equal(chatHost.querySelectorAll('.meow-inline-pending').length,0);assert.ok(chatHost.querySelector('.meow-inline-photo'));
assert.ok($('auto-request').value.includes('messages'));assert.ok(!$('auto-request').value.includes('secret_id'));
assert.ok($('auto-raw').value.includes('scenes'));assert.equal($('auto-resend').disabled,false);
$('auto-retries').value='0';$('auto-retries').dispatchEvent(new Event('change'));
let resendCalls=0;
globalThis.fetch=async(url)=>{if(String(url).includes('chat-completions')){resendCalls++;return new Response(JSON.stringify({choices:[{message:{content:'不是 JSON 的 tags'}}]}));}return new Response('{}');};
assert.equal($('auto-resend-bad'),null);assert.ok($('auto-resend').closest('#meow-config-auto-draw'));
const manualDraftBeforeResend=$('send-preview').value;
click('auto-resend');await settle();await settle();assert.equal($('send-preview').value,manualDraftBeforeResend);
assert.equal(resendCalls,1);assert.equal($('auto-raw').value,'不是 JSON 的 tags');assert.match($('auto-draw-status').textContent,/JSON/);
// A failed picture can be retried in place without re-requesting tags or earlier pictures.
let singleTags=0,singleImages=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){singleTags++;const id=JSON.parse(JSON.parse(options.body).messages[1].content).passages[0].id;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:Array.from({length:3},()=>({prompt:'white cat',source_ids:[id],anchor_source_id:id,anchor_quote:'white cat'}))})}}]}));}
 if(!String(url).includes('generate-image'))return new Response('{}');
 singleImages++;if(singleImages===2)return new Response('',{status:503});
 return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
click('auto-resend');await settle();await settle();
assert.equal(singleTags,1);assert.equal(singleImages,3,'third picture runs after the second fails');
assert.match($('auto-draw-status').textContent,/已完成 2 张.*跳过 1 张/);
const retryButtons=()=>[...chatHost.querySelectorAll('.meow-inline-pending button')].filter(b=>b.textContent==='重新生这张图');
assert.equal(retryButtons().length,1);
retryButtons()[0].click();await settle();await settle();
assert.equal(singleTags,1);assert.equal(singleImages,4);assert.equal(retryButtons().length,0);
// Reproduce the reported sixth-anchor failure: all later images still run, strictly serial.
$('auto-image-count').value='12';$('auto-image-count').dispatchEvent(new Event('change'));
let skippedTags=0,queuedImages=0,inFlight=0,maxInFlight=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){
  skippedTags++;const id=JSON.parse(JSON.parse(options.body).messages[1].content).passages[0].id;
  const scenes=Array.from({length:12},(_,i)=>({prompt:`white cat scene ${i+1}`,source_ids:[id],anchor_source_id:id,anchor_quote:i===5?'not in the original':'white cat'}));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes})}}]}));
 }
 if(!String(url).includes('generate-image'))return new Response('{}');
 queuedImages++;maxInFlight=Math.max(maxInFlight,++inFlight);
 await new Promise(resolve=>setTimeout(resolve,5));inFlight--;
 return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
click('auto-resend');await settle();await settle();await settle();
assert.equal(skippedTags,1);assert.equal(queuedImages,11);assert.equal(maxInFlight,1);assert.equal(inFlight,0);
assert.match($('auto-draw-status').textContent,/已完成 11 张.*跳过 1 张.*第 6 张/);
// Failed anchor scenes can be repaired without another tags request or redrawing successes.
assert.equal($('auto-pending-list').querySelectorAll('[data-pending-id]').length,1);
const pendingCard=()=>$('auto-pending-list').querySelector('[data-pending-id]');
assert.match(pendingCard().textContent,/第 6 张/);
editorButton(pendingCard(),'生成这一张并插入').click();await settle();assert.equal(queuedImages,11,'bad anchor is rejected before spending');
tagEditor=document.getElementById('meow-tag-editor');editorButton(pendingCard(),'修改 tags').click();await settle();
editField('场景正面 tags','orange cat repaired scene');editorButton(tagEditor,'保存 tags').click();await settle();editorButton(tagEditor,'关闭').click();
const repairPicker=pendingCard().querySelector('select');repairPicker.value='0';repairPicker.dispatchEvent(new Event('change'));await settle();
const pendingSaved=JSON.parse(localStorage.getItem(`meow-auto-pending:${extensionSettings.meow_gallery_scope}`));
assert.equal(pendingSaved.length,1);assert.equal(pendingSaved[0].item.prompt,'orange cat repaired scene');assert.equal(pendingSaved[0].item.anchor_quote,'white cat');
const normalSave=context.saveChat;context.saveChat=async()=>{throw new Error('test insert save failed');};
editorButton(pendingCard(),'生成这一张并插入').click();await settle();await settle();
assert.equal(skippedTags,1);assert.equal(queuedImages,12);assert.ok(pendingCard());
assert.ok(JSON.parse(localStorage.getItem(`meow-auto-pending:${extensionSettings.meow_gallery_scope}`))[0].entryId);
context.saveChat=normalSave;editorButton(pendingCard(),'插入已生成的图片').click();await settle();await settle();
assert.equal(queuedImages,12,'insertion retry reuses the image already paid for');assert.equal(skippedTags,1);
assert.equal($('auto-pending-list').querySelectorAll('[data-pending-id]').length,0);
assert.equal(maxInFlight,1);
$('auto-image-count').value='3';$('auto-image-count').dispatchEvent(new Event('change'));
// Stream the first scene while the provider is still working on the second.
let streamWriter,streamTags=0,streamImages=0,streamId,releaseStreamImage;
const sse=content=>new TextEncoder().encode('data: '+JSON.stringify({choices:[{index:0,delta:{content}}]})+'\n\n');
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){
  streamTags++;const body=JSON.parse(options.body);assert.equal(body.stream,true);
  streamId=JSON.parse(body.messages[1].content).passages[0].id;
  return new Response(new ReadableStream({start(c){streamWriter=c;}}),{headers:{'Content-Type':'text/event-stream'}});
 }
 if(!String(url).includes('generate-image'))return new Response('{}');
 streamImages++;
 if(streamImages===1)return new Promise(resolve=>{releaseStreamImage=()=>resolve(new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]})));});
 return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
const streamingScene=()=>JSON.stringify({prompt:'white cat',source_ids:[streamId],anchor_source_id:streamId,anchor_quote:'white cat'});
click('auto-resend');await settle();
streamWriter.enqueue(sse('{"scenes":['+streamingScene()));await settle();await settle();
assert.equal(streamImages,1,'first picture starts before the rest of the tags arrives');
assert.equal($('auto-resend').disabled,true,'stream job remains busy until reception and images finish');
assert.match($('auto-raw').value,/white cat/);
streamWriter.enqueue(sse(','+streamingScene()+','+streamingScene()+']}'));
streamWriter.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
await settle();assert.equal(streamImages,1,'image requests remain serial while tags keep arriving');
assert.equal(JSON.parse($('auto-raw').value).scenes.length,3);
releaseStreamImage();
await settle();await settle();assert.equal(streamTags,1);assert.equal(streamImages,3);assert.equal($('auto-resend').disabled,false);
// A broken later response retains the first picture and never restarts all tags.
$('auto-retries').value='1';$('auto-retries').dispatchEvent(new Event('change'));
click('auto-resend');await settle();
streamWriter.enqueue(sse('{"scenes":['+streamingScene()));await settle();await settle();
assert.equal(streamImages,4);
streamWriter.error(new Error('connection lost'));await settle();await settle();
assert.equal(streamTags,2);assert.equal(streamImages,4);assert.match($('auto-draw-status').textContent,/已保留 1\/3/);
assert.equal($('auto-resend').disabled,false);
// Stopping an open stream must release the busy state and schedule no new pictures.
click('auto-resend');await settle();click('stop');await settle();await settle();
assert.equal(streamTags,3);assert.equal(streamImages,4);assert.equal($('auto-resend').disabled,false);
// In-story fullscreen viewer uses the same editor and synchronizes gallery metadata.
const inlinePhoto=chatHost.querySelector('.meow-inline-photo');assert.ok(inlinePhoto);inlinePhoto.click();await settle();
const inlineViewer=document.getElementById('meow-inline-viewer');assert.ok(inlineViewer.open);tagEditor=document.getElementById('meow-tag-editor');editorButton(inlineViewer,'修改 tags').click();await settle();assert.ok(tagEditor.open,inlineViewer.querySelector('[role=status]')?.textContent+' | '+$('status').textContent);
editField('场景正面 tags','cat with green eyes');editorButton(tagEditor,'保存 tags').click();await settle();
const variants=context.chat.flatMap(m=>(m.extra?.meow_inline??[]).flatMap(g=>g.variants));
const editedInline=variants.find(v=>v.scene?.prompt==='cat with green eyes');assert.ok(editedInline);
assert.equal((await galleryStore(extensionSettings.meow_gallery_scope).list()).find(e=>e.id===editedInline.id).scene.prompt,'cat with green eyes');
editorButton(tagEditor,'关闭').click();editorButton(inlineViewer,'关闭').click();
// Tags-only mode must never request an image until the user explicitly clicks.
const imageToggle=value=>{$('auto-generate-images').checked=value;$('auto-generate-images').dispatchEvent(new Event('change'));};
const readyButtons=()=>[...chatHost.querySelectorAll('.meow-inline-pending button')].filter(b=>b.textContent==='生成这张图');
let toggleTags=0,toggleImages=0,holdImage=false,releaseToggleImage;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('chat-completions')){
  toggleTags++;const id=JSON.parse(JSON.parse(options.body).messages[1].content).passages[0].id;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenes:Array.from({length:3},()=>({prompt:'white cat',source_ids:[id],anchor_source_id:id,anchor_quote:'white cat'}))})}}]}));
 }
 if(!String(url).includes('generate-image'))return new Response('{}');
 toggleImages++;
 if(holdImage){holdImage=false;return new Promise(resolve=>{releaseToggleImage=()=>resolve(new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]})));});}
 return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));
};
imageToggle(false);assert.equal(extensionSettings.meow_secondary.auto_generate_images,false);
click('auto-resend');await settle();await settle();
assert.equal(toggleTags,1);assert.equal(toggleImages,0);assert.equal(readyButtons().length,3);assert.match($('auto-draw-status').textContent,/3 张 tags 已就绪/);
// The source-bound manual button works even if the automatic trigger is disabled.
$('auto-draw').checked=false;$('auto-draw').dispatchEvent(new Event('change'));
readyButtons()[0].click();await settle();await settle();
assert.equal(toggleTags,1);assert.equal(toggleImages,1);assert.equal(readyButtons().length,2);
imageToggle(true);await settle();assert.equal(toggleImages,1,'re-enabling must not send pending images');
const simultaneous=readyButtons();simultaneous[0].click();simultaneous[1].click();await settle();await settle();
assert.equal(toggleImages,2,'busy guard prevents simultaneous manual image requests');assert.equal(readyButtons().length,1);
readyButtons()[0].click();await settle();await settle();assert.equal(toggleImages,3);assert.equal(toggleTags,1);
// Turning the switch off mid-job lets the active image finish, deferring the rest.
holdImage=true;click('auto-resend');await settle();assert.equal(toggleImages,4);
imageToggle(false);imageToggle(true);releaseToggleImage();await settle();await settle();
assert.equal(toggleImages,4);assert.equal(toggleTags,2);assert.equal(readyButtons().length,2);
imageToggle(true);await settle();assert.equal(toggleImages,4);
for(let i=0;i<2;i++){readyButtons()[0].click();await settle();await settle();}
assert.equal(toggleImages,6);assert.equal(toggleTags,2);assert.equal(readyButtons().length,0);
context.chat=[];click('auto-exclusion-scan');assert.match($('auto-exclusion-status').textContent,/没有已有正文/);
context.chat=[{mes:'plain'}];click('auto-exclusion-scan');assert.match($('auto-exclusion-status').textContent,/没有找到闭合标签/);
$('auto-draw').checked=false;$('auto-draw').dispatchEvent(new Event('change'));
click('forget-token');await settle();assert.match($('key-status').textContent,/没有可用的直连 Token/);
restoredAuth='';click('generate');await settle();assert.equal(restoredAuth,'');assert.match($('status').textContent,/浏览器没有可用/);
console.log('UI integration: entries, persistent dialog, presets, selected-only context, tags, NAI composition, gallery with source, stale-chat guard passed.');process.exit(0);
await window.happyDOM.abort();
