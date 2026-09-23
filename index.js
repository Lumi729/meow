import { mountCamera } from './camera.js';
import { tokenVault } from './credentials.js';
import { scanAppearance, appearanceScope, mergeAppearanceScan, pruneAppearanceScan, formatAppearanceProfiles } from './appearance.js';
import { mountInline, migrateLegacy, bindSwipe, stripInline } from './inline.js';
import { mountExcerptBridge } from './excerpt-bridge.js';
import { saveSettings } from '../../../../script.js';
import { updateSelf, checkUpdate } from './updater.js';
import { mountTools } from './tools-ui.js';
import { foldAll, foldHints } from './fold.js';
import { isV5 } from './nai-tools.js';
import { validateCharacters, characterParameters } from './characters.js';
import { directRequest, requestDirect } from './advanced.js';
import { DEFAULTS, MODELS, SAMPLERS, SAMPLER_LABELS, SCHEDULERS, buildRequest, requestImage, cleanPreset, numberIn, combine } from './core.js';
import { mountPanel } from './panel.js';
import { galleryStore } from './storage.js';
import { DEFAULT_RULES, TAG_PRESET, captureContext, parseTagPreset, parseScenes, apiBase, buildTagRequest, sceneAnchor, buildReverseRequest } from './context.js';
import { SECRET_KEYS, secret_state, writeSecret, findSecret } from '../../../secrets.js';
import * as secretsModule from '../../../secrets.js';
import { saveBase64AsFile } from '../../../utils.js';
const ctx=()=>SillyTavern.getContext();
const folder=new URL('.',import.meta.url).pathname.split('/').filter(Boolean).slice(-2).join('/');

export async function init(){
 if(document.getElementById('meow-panel'))return;
 const ext=ctx().extensionSettings;
 const saved=ext.meow||{};
 ext.meow={...DEFAULTS,...saved};
 const settings=ext.meow;
 ext.meow_ui??={enabled:true,size:64,normal_image:'',bad_image:''};
 ext.meow_secondary??={url:'',model:'',secret_id:'',preset:TAG_PRESET,context_count:5,image_count:1,rules:JSON.stringify(DEFAULT_RULES,null,2),output:'journal'};
 ext.meow_presets??=[];ext.meow_gallery_scope??=crypto.randomUUID();
 ext.meow_advanced??={transport:'bridge',model:'',parameters:'{}'};
 const advanced=ext.meow_advanced; const vault=tokenVault(ext.meow_gallery_scope);let directToken='';try{directToken=await vault.get();}catch{}
 const secondary=ext.meow_secondary,ui=ext.meow_ui;
 ui.normal_size??=ui.size||64;ui.bad_size??=ui.size||64;ui.top_image??='';
 const save=()=>ctx().saveSettingsDebounced();save();
 const panel=mountPanel(await ctx().renderExtensionTemplateAsync(folder,'settings'),ui,save);
 const root=document.getElementById('meow-panel'),el=id=>root.querySelector(`#meow-${id}`);
 const status=message=>{el('status').textContent=message;el('tags-status').textContent=message;};
 const store=galleryStore(ext.meow_gallery_scope);let images=[],parts=[],scenes=[],capture=null,captureTarget=null,busy=false,controller=null,stopping=false;
 const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){status(e.name==='AbortError'?'已停止等待；已发送的任务仍可能计费，请勿立即重复提交。':e.message||'操作失败。');}};
 const on=(id,fn,event='click')=>el(id).addEventListener(event,guard(fn));
 const textNode=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
 const button=(text,fn)=>{const b=textNode('button',text);b.type='button';b.addEventListener('click',guard(fn));return b;};
 const chatKey=()=>JSON.stringify([ctx().groupId??null,ctx().characterId??null,ctx().getCurrentChatId()??null]);
 const checkChat=()=>{if(!capture||capture.key!==chatKey())throw new Error('聊天已切换，请重新捕捉上下文。');};
 const page=name=>{root.querySelectorAll('[data-view]').forEach(e=>e.hidden=e.dataset.view!==name);root.querySelectorAll('[data-page]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.page===name)));panel.setMode(name);if(name==='gallery')renderGallery();};
 root.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
 for(const [value,label] of Object.entries(MODELS))el('model').add(new Option(label,value));
 SAMPLERS.forEach(v=>el('sampler').add(new Option(SAMPLER_LABELS[v]||v,v)));SCHEDULERS.forEach(v=>el('scheduler').add(new Option(v,v)));
 const drawFields=()=>Object.entries(DEFAULTS).forEach(([k,v])=>{if(typeof v==='boolean')el(k).checked=!!settings[k];else el(k).value=String(settings[k]);});
 drawFields();
 for(const [key,defaultValue] of Object.entries(DEFAULTS))on(key,()=>{settings[key]=typeof defaultValue==='boolean'?el(key).checked:typeof defaultValue==='number'?Number(el(key).value):el(key).value;save();},'input');
 on('size',()=>{const [w,h]=el('size').value.split('x').map(Number);if(w&&h){settings.width=w;settings.height=h;drawFields();save();}},'change');
 const config=()=>Object.fromEntries(Object.entries(DEFAULTS).map(([key,v])=>[key,typeof v==='boolean'?el(key).checked:typeof v==='number'?Number(el(key).value):el(key).value]));
 const download=(name,data,type='application/json')=>{const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
 const advancedPreset=()=>({transport:advanced.transport,model:advanced.model,parameters:advanced.parameters});
 const restoreAdvanced=value=>{if(!value||typeof value!=='object')return;advanced.transport=value.transport==='direct'?'direct':'bridge';advanced.model=typeof value.model==='string'?value.model:'';advanced.parameters=typeof value.parameters==='string'?value.parameters:'{}';for(const [id,k] of [['transport','transport'],['direct-model','model'],['direct-params','parameters']])el(id).value=advanced[k];};
 const presets=()=>{el('preset-list').replaceChildren(new Option('当前配置',''));ext.meow_presets.forEach(p=>el('preset-list').add(new Option(p.name,p.id)));const last=ext.meow_presets.find(p=>p.id===ext.meow_last_preset);if(last){el('preset-list').value=last.id;el('preset-name').value=last.name;}};presets();
 on('preset-save',()=>{const name=el('preset-name').value.trim();if(!name)throw new Error('先给配置起个名字。');if(name.length>80)throw new Error('配置名称请控制在 80 字内。');let p=ext.meow_presets.find(p=>p.name===name);if(!p){p={id:crypto.randomUUID(),name};ext.meow_presets.push(p);}p.settings=cleanPreset(config());p.advanced=advancedPreset();ext.meow_last_preset=p.id;presets();save();status('配置已保存，包括固定正负面和参数。');});
 on('preset-list',()=>{const p=ext.meow_presets.find(p=>p.id===el('preset-list').value);ext.meow_last_preset=p?.id||'';if(p){Object.assign(settings,cleanPreset(p.settings));restoreAdvanced(p.advanced);drawFields();el('preset-name').value=p.name;}save();},'change');
 on('preset-delete',()=>{const id=el('preset-list').value;if(!id)return;ext.meow_presets=ext.meow_presets.filter(p=>p.id!==id);if(ext.meow_last_preset===id){ext.meow_last_preset='';el('preset-name').value='';}presets();save();status('配置已删除。');});
 on('preset-export',()=>download('meow-preset.json',JSON.stringify({version:1,name:el('preset-name').value||'猫猫配置',settings:cleanPreset(config()),advanced:advancedPreset()},null,2)));
 on('preset-import',async()=>{const file=el('preset-import').files[0];if(!file)return;if(file.size>200000)throw new Error('配置文件太大。');const raw=JSON.parse(await file.text());Object.assign(settings,cleanPreset(raw));restoreAdvanced(raw.advanced);drawFields();el('preset-name').value=String(raw.name||'导入配置').slice(0,80);el('preset-import').value='';save();status('配置已导入，点击保存配置可加入列表。');},'change');
 const keyStatus=()=>{el('key-status').textContent=secret_state[SECRET_KEYS.NOVEL]?'已配置本地 NovelAI Token':'尚未配置 NovelAI Token';el('secondary-state').textContent=secondary.secret_id?'副 API 已绑定本地密钥 ID':'尚未绑定副 API 密钥';};keyStatus();
 ctx().eventSource.on(ctx().event_types.SECRET_WRITTEN,keyStatus);ctx().eventSource.on(ctx().event_types.SECRET_DELETED,keyStatus);
 on('save-token',async()=>{if(busy)throw new Error('请等待当前任务完成。');const value=el('token').value.trim();if(!value)throw new Error('请先填写 Token。');el('save-token').disabled=true;try{const id=await writeSecret(SECRET_KEYS.NOVEL,value,'Meow NovelAI');if(!id)throw new Error('Token 保存失败。');directToken=value;if(el('remember-token').checked)await vault.set(value);else await vault.clear();keyStatus();status('Token 已保存到本地酒馆。');}finally{el('token').value='';el('save-token').disabled=false;}});
 el('remember-token').checked=ext.meow_remember_token!==false;on('remember-token',async()=>{ext.meow_remember_token=el('remember-token').checked;if(!ext.meow_remember_token)await vault.clear();else if(directToken)await vault.set(directToken);save();},'change');
 on('forget-token',async()=>{directToken='';await vault.clear();status('已清除本浏览器的直连 Token；酒馆服务器保存的密钥仍保留。');});
 const fields=[['secondary-url','url'],['secondary-model','model'],['tag-preset','preset'],['context-count','context_count'],['image-count','image_count'],['rules','rules'],['output','output']];
 el('character-mode').checked=!!secondary.character_mode;on('character-mode',()=>{secondary.character_mode=el('character-mode').checked;save();selectionPreview();},'change');
 const destination=()=>{let url;try{url=apiBase(secondary.url);}catch{url='尚未配置副 API 地址';}el('destination').textContent=`发送目标：${url} · 模型：${secondary.model||'未填写'}`;};
 fields.forEach(([id,k])=>{el(id).value=secondary[k];on(id,()=>{secondary[k]=el(id).value;save();destination();},'input');});destination();
 let modelsLoading=false;
 on('secondary-model-list',()=>{const value=el('secondary-model-list').value;if(value){el('secondary-model').value=value;secondary.model=value;save();destination();}},'change');
 on('fetch-models',async()=>{
  if(modelsLoading)return;
  const url=apiBase(secondary.url),key=secondary.secret_id;
  if(!key)throw new Error('请先保存副 API 密钥，再拉取模型。');
  modelsLoading=true;el('fetch-models').disabled=true;el('models-state').textContent='正在拉取模型…';
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
  try{
   const response=await fetch('/api/backends/chat-completions/status',{method:'POST',headers:ctx().getRequestHeaders(),signal:abort.signal,body:JSON.stringify({chat_completion_source:'custom',custom_url:url,secret_id:key})});
   if(!response.ok)throw new Error(`拉取模型失败（HTTP ${response.status}），可手动填写模型。`);
   const data=await response.json();
   if(data.error||!Array.isArray(data.data))throw new Error('服务商未返回模型列表，请检查地址和密钥，或手动填写模型。');
   if(url!==apiBase(secondary.url)||key!==secondary.secret_id)throw new Error('地址或密钥已变化，请重新拉取模型。');
   const ids=[...new Set(data.data.map(x=>x?.id).filter(x=>typeof x==='string'&&x.trim()))].sort();
   el('secondary-model-list').replaceChildren(new Option('请选择模型',''),...ids.map(id=>new Option(id,id)));
   if(ids.includes(secondary.model))el('secondary-model-list').value=secondary.model;
   el('models-state').textContent=ids.length?`已拉取 ${ids.length} 个模型，请选择；也可手动填写。`:'模型列表为空，可手动填写。';
  }catch(error){el('models-state').textContent=error.name==='AbortError'?'拉取超时，请重试或手动填写模型。':error.message;}
  finally{clearTimeout(timer);modelsLoading=false;el('fetch-models').disabled=false;}
 });
 const activeCustomId=()=>{const list=secret_state[SECRET_KEYS.CUSTOM];return Array.isArray(list)?(list.find(x=>x?.active)?.id||''):'';};
 const restoreCustom=async id=>{if(typeof secretsModule.rotateSecret==='function'){await secretsModule.rotateSecret(SECRET_KEYS.CUSTOM,id);return activeCustomId()?activeCustomId()===id:true;}const r=await fetch('/api/secrets/rotate',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({key:SECRET_KEYS.CUSTOM,id})});return r.ok;};
 on('save-secondary',async()=>{if(busy)throw new Error('请等待当前任务完成。');apiBase(secondary.url);const value=el('secondary-key').value.trim();if(!value)throw new Error('请填写副 API 密钥。');el('save-secondary').disabled=true;try{const previous=activeCustomId();const id=await writeSecret(SECRET_KEYS.CUSTOM,value,'Meow secondary');if(!id)throw new Error('副 API 密钥保存失败。');secondary.secret_id=id;save();let kept=true;if(previous&&previous!==id){try{kept=await restoreCustom(previous);}catch{kept=false;}}keyStatus();status(kept?'副 API 密钥已单独保存，酒馆主 API 密钥保持不变。':'副 API 密钥已保存，但没能切回酒馆原来的主密钥：请在酒馆「API 连接配置」点钥匙图标，手动选回原来的密钥。');}finally{el('secondary-key').value='';el('save-secondary').disabled=false;}});
 on('tag-import',async()=>{const f=el('tag-import').files[0];if(!f)return;if(f.size>200000)throw new Error('预设文件太大。');secondary.preset=parseTagPreset(await f.text(),f.name);if(!secondary.preset.trim())throw new Error('预设没有可用文本。');el('tag-preset').value=secondary.preset;save();el('tag-import').value='';status('tags 预设已导入，可继续编辑。');},'change');
 on('tag-export',()=>download('meow-tags-preset.json',JSON.stringify({system_prompt:secondary.preset},null,2)));
 for(const [id,k] of [['transport','transport'],['direct-model','model'],['direct-params','parameters']]){el(id).value=advanced[k];on(id,()=>{advanced[k]=el(id).value;save();},'input');}
 on('advanced-example',()=>{advanced.parameters=JSON.stringify({cfg_rescale:0,v4_prompt:{caption:{char_captions:[{char_caption:'1girl, white hair, pink dress',centers:[{x:0.5,y:0.5}]}]},use_coords:true,use_order:true},v4_negative_prompt:{caption:{char_captions:[]}}},null,2);el('direct-params').value=advanced.parameters;save();});
 on('advanced-import',async()=>{const f=el('advanced-import').files[0];if(!f)return;if(f.size>10000000)throw new Error('请求 JSON 太大。');const raw=JSON.parse(await f.text());if(raw.action&&raw.action!=='generate')throw new Error('当前直连仅支持 generate 文生图请求。');const params=raw.parameters??raw;directRequest(buildRequest({...config(),prompt:'validation',upscale_ratio:1,variety_boost:false}),JSON.stringify(params));advanced.parameters=JSON.stringify(params,null,2);if(typeof raw.model==='string')advanced.model=raw.model;if(typeof raw.input==='string')settings.prompt=raw.input;for(const key of ['width','height','steps','scale','cfg_rescale','seed','sampler'])if(typeof params[key]===typeof DEFAULTS[key])settings[key]=params[key];if(typeof params.noise_schedule==='string')settings.scheduler=params.noise_schedule;if(typeof params.negative_prompt==='string')settings.extra_negative=params.negative_prompt;el('direct-params').value=advanced.parameters;el('direct-model').value=advanced.model;drawFields();save();el('advanced-import').value='';status('已导入 parameters；顶层凭证和地址不会导入。');},'change');
 const launcherFields=[['top-enabled','top_enabled','check'],['floating-enabled','enabled','check'],['floating-size','normal_size','number'],['bad-size','bad_size','number'],['top-image','top_image','text'],['normal-image','normal_image','text'],['bad-image','bad_image','text']];
 const launcherValues=()=>{launcherFields.forEach(([id,k,t])=>{if(t==='check')el(id).checked=ui[k]!==false;else el(id).value=ui[k]??'';});el('size-output').textContent=`${ui.normal_size||64}px`;el('bad-size-output').textContent=`${ui.bad_size||64}px`;};launcherValues();
 launcherFields.forEach(([id,k,t])=>on(id,()=>{if(t==='text'&&el(id).value.trim()&&!el(id).value.startsWith('https://'))throw new Error('图片链接需以 https:// 开头。');ui[k]=t==='check'?el(id).checked:t==='number'?Number(el(id).value):el(id).value.trim();save();panel.refresh();launcherValues();},t==='text'?'change':'input'));
 // Global theme: {name, css}; the CSS is layered after Meow's own stylesheet and follows every page and dialog.
 ext.meow_theme??={name:'',css:''};
 const THEME_SAMPLE=`/* 猫猫星绘 常用选择器（删掉不需要的，改颜色即可） */
#meow-dialog { background:#fff8fb; }              /* 整个面板外框 */
#meow-panel { background:#fff8fb; color:#674350; } /* 面板底色、文字 */
#meow-panel .meow-tabs button { }                  /* 顶部标签 */
#meow-panel .meow-tabs button[aria-pressed=true] { } /* 当前标签 */
#meow-panel button { }                             /* 所有按钮 */
#meow-panel .meow-primary { }                      /* 主按钮（开始画画等） */
#meow-panel input, #meow-panel select, #meow-panel textarea { } /* 输入框 */
#meow-panel details.meow-fold { }                  /* 折叠框 */
#meow-panel .meow-hint-dot { }                     /* 小圆「!」 */
#meow-panel small { }                              /* 说明文字 */
#meow-viewer { }                                   /* 大图查看 */
#meow-gallery-picker, #meow-mask-editor { }        /* 选图 / 画蒙版窗口 */
#meow-floating { }                                 /* 悬浮按钮 */
.meow-inline-card { }                              /* 正文里的插图卡片 */
`;
 const themeStyle=document.getElementById('meow-theme-style')||Object.assign(document.createElement('style'),{id:'meow-theme-style'});document.head.append(themeStyle);
 const cleanCss=css=>{css=String(css??'');if(css.length>500000)throw new Error('CSS 太大（上限 500 KB）。');if(/<\/?style|<script/i.test(css))throw new Error('CSS 里不能有 <style> 或 <script> 标签。');return css;};
 const applyTheme=()=>{themeStyle.textContent=ext.meow_theme.css||'';el('theme-title').value=ext.meow_theme.name||'';el('theme-css').value=ext.meow_theme.css||'';el('theme-state').textContent=ext.meow_theme.css?`当前美化：${ext.meow_theme.name||'未命名'}`:'当前是默认样式';};
 const setTheme=(name,css)=>{ext.meow_theme={name:String(name||'').slice(0,80),css:cleanCss(css)};save();applyTheme();};
 applyTheme();
 on('theme-apply',()=>{setTheme(el('theme-title').value.trim(),el('theme-css').value);status('美化已应用。');});
 on('theme-sample',()=>{if(el('theme-css').value.trim()&&!confirm('把选择器示例加到现在的 CSS 后面？'))return;el('theme-css').value=`${el('theme-css').value.trim()?`${el('theme-css').value.trim()}\n\n`:''}${THEME_SAMPLE}`;status('示例已填入，改好后点“应用 CSS”。');});
 on('theme-reset',()=>{if(!confirm('恢复默认样式？当前美化会被清空（建议先导出）。'))return;setTheme('','');status('已恢复默认样式。');});
 on('theme-export',()=>{const name=el('theme-title').value.trim()||ext.meow_theme.name||'猫猫星绘美化';download(`${name}.json`,JSON.stringify({name,css:el('theme-css').value},null,2));});
 on('theme-import',async()=>{const f=el('theme-import').files[0];if(!f)return;if(f.size>600000)throw new Error('美化文件太大（上限 500 KB）。');const text=await f.text();let name=f.name.replace(/\.[^.]+$/,''),css=text;
  if(/\.json$/i.test(f.name)){let raw;try{raw=JSON.parse(text);}catch{throw new Error('美化文件不是有效的 JSON。');}if(!raw||typeof raw.css!=='string')throw new Error('美化文件里要有 css 字段：{"name":"名字","css":"…"}');name=typeof raw.name==='string'&&raw.name.trim()?raw.name.trim():name;css=raw.css;}
  setTheme(name,css);el('theme-import').value='';status(`已导入并应用美化：${name}`);},'change');
 on('launcher-reset',()=>{panel.reset();launcherValues();status('已恢复小动物手机和爱字图片，悬浮按钮回到右侧。');});
 ext.meow_people??={};ext.meow_cast_profiles??={};
 const archive=ext.meow_people;
 const appearanceKey=()=>appearanceScope(ctx());
 const castProfiles=()=>ext.meow_cast_profiles[appearanceKey()]??={ids:[],scanned:false};
 let editingProfile='',profileDrafts=new Map();
 const rememberDraft=()=>{if(editingProfile)profileDrafts.set(editingProfile,{name:el('appearance-name').value,text:el('appearance-text').value});};
 const loadProfile=id=>{editingProfile=id;const draft=profileDrafts.get(id),p=archive[id];el('appearance-name').value=draft?.name??p?.name??'';el('appearance-text').value=draft?.text??p?.text??'';el('appearance-use').checked=castProfiles().ids.includes(id);el('appearance-use').disabled=!p;el('appearance-source').textContent=p?.source||'填写姓名与外貌后，点击保存人物档案。';};
 const showAppearance=()=>{const state=castProfiles(),legacy=ext.meow_appearance?.[chatKey()];if(!state.scanned&&!state.ids.length&&legacy?.text){const id=`legacy:${appearanceKey()}`;archive[id]??={id,name:'旧版合并资料（可拆分）',text:legacy.text,source:'从旧版已保存资料迁移'};state.ids=[id];state.scanned=true;state.summary='旧版修改已保留。可以扫描并拆分为各个人物档案。';save();}const list=el('appearance-profile'),ids=Object.keys(archive),preferred=castProfiles().ids.find(id=>archive[id]?.text?.trim())||castProfiles().ids.find(id=>archive[id]);list.replaceChildren(new Option('＋ 新建人物档案',''),...ids.map(id=>new Option(`${castProfiles().ids.includes(id)?'✓ ':''}${archive[id].name}`,id)));const id=archive[editingProfile]?editingProfile:preferred||'';list.value=id;loadProfile(id);el('appearance-state').textContent=castProfiles().summary||'首次生成 tags 前会扫描；已保存档案跨聊天复用，不自动覆盖你的修改。';el('appearance-preview').value=formatAppearanceProfiles(archive,castProfiles().ids);};
 const refreshAppearance=async()=>{rememberDraft();const key=appearanceKey();let settings={};try{const module=await import('../../../world-info.js');settings=module.getWorldInfoSettings();}catch{}let persona={};try{const module=await import('../../../personas.js');persona={avatar:module.user_avatar};}catch{}const result=await scanAppearance(ctx(),settings,persona);if(key!==appearanceKey())throw new Error('扫描时切换了人物，请重新扫描。');const state=castProfiles(),known=new Set(Object.keys(archive)),ids=mergeAppearanceScan(archive,result.records);for(const id of ids)if(!known.has(id)||!state.scanned)if(!state.ids.includes(id))state.ids.push(id);const removed=pruneAppearanceScan(archive,ext.meow_cast_profiles,state,ids);state.scanned=true;state.summary=result.summary+(removed.length?` 已移除 ${removed.length} 个旧的非人物条目。`:'')+' 已有档案保持不变；可选择档案检查、修改并保存。';save();showAppearance();return formatAppearanceProfiles(archive,state.ids);};
 const getAppearance=async()=>{if(!el('appearance-enabled').checked)return '';rememberDraft();if([...profileDrafts].some(([id,d])=>castProfiles().ids.includes(id)&&(d.text!==archive[id]?.text||d.name!==archive[id]?.name)))throw new Error('人物档案有未保存修改，请先点“保存人物档案”。');if(!castProfiles().scanned)await refreshAppearance();const text=formatAppearanceProfiles(archive,castProfiles().ids);if(text.length>80000)throw new Error('人物资料超过 8 万字，请减少勾选档案或删减内容。');return text;};
 el('appearance-enabled').checked=secondary.appearance_enabled!==false;showAppearance();
 on('appearance-enabled',()=>{secondary.appearance_enabled=el('appearance-enabled').checked;save();},'change');
 on('appearance-scan',()=>run(refreshAppearance));
 on('appearance-profile',()=>{rememberDraft();loadProfile(el('appearance-profile').value);},'change');
 on('appearance-save',()=>{const name=el('appearance-name').value.trim(),text=el('appearance-text').value.trim();if(!name||!text)throw new Error('请填写人物姓名与外貌资料。');const id=editingProfile||`manual:${crypto.randomUUID()}`;archive[id]={...archive[id],id,name,text,edited:true,updated:Date.now()};if(!editingProfile||el('appearance-use').checked){if(!castProfiles().ids.includes(id))castProfiles().ids.push(id);}editingProfile=id;profileDrafts.delete(id);save();showAppearance();status('人物档案已保存；同一人物在新聊天中可直接复用。');});
 on('appearance-use',()=>{const state=castProfiles();state.ids=el('appearance-use').checked?[...new Set([...state.ids,editingProfile])]:state.ids.filter(id=>id!==editingProfile);save();el('appearance-preview').value=formatAppearanceProfiles(archive,state.ids);},'change');
 on('appearance-new',()=>{rememberDraft();el('appearance-profile').value='';loadProfile('');});
 on('appearance-latest',()=>{const p=archive[editingProfile];if(!p?.scannedText)throw new Error('此档案没有扫描候选，请先重新扫描。');el('appearance-text').value=p.scannedText;status('已载入扫描候选，检查后点“保存人物档案”才会覆盖。');});
 on('appearance-delete',()=>{const id=editingProfile;if(!archive[id])return;if(!confirm('删除此人物档案？其他聊天也不再使用它。'))return;delete archive[id];profileDrafts.delete(id);for(const state of Object.values(ext.meow_cast_profiles))state.ids=state.ids.filter(x=>x!==id);editingProfile='';save();showAppearance();});
 const setBusy=value=>{busy=value;for(const id of ['generate','tags','bad-generate','capture','save-token','save-secondary','update-self'])el(id).disabled=value;el('stop').hidden=!value;el('tags').textContent=value?'正在处理，请稍候…':'② 只发送勾选内容，生成 tags';root.setAttribute('aria-busy',String(value));};
 const run=async fn=>{if(busy)throw new Error('猫猫正在忙，请等待当前任务完成。');stopping=false;controller=new AbortController();setBusy(true);try{await fn(controller.signal);}finally{setBusy(false);controller=null;}};
 on('repair-inline',()=>run(async()=>{let changed=false;for(const message of ctx().chat)changed=migrateLegacy(message)||changed;if(changed){await ctx().saveChat();window.location.reload();}else status('当前聊天没有旧版插图标记，无需修复。');}));
 on('update-self',()=>run(async()=>{if(modelsLoading)throw new Error('请等待模型列表拉取完成。');status('正在更新 Meow，成功后自动刷新酒馆…');await updateSelf(folder,ctx().getRequestHeaders(),saveSettings,()=>window.location.reload());}));
 on('stop',()=>{stopping=true;controller?.abort();status('已停止后续任务；已经发出的请求仍可能计费。');});
 let lastTiming=null;
 const seconds=ms=>(ms/1000).toFixed(1);
 const timing=message=>{el('generation-timing').textContent=message;};
 const getToken=async()=>{if(!directToken){directToken=await findSecret(SECRET_KEYS.NOVEL)||'';if(directToken&&el('remember-token').checked)await vault.set(directToken);}if(!directToken){document.querySelector('[data-page="config"]').click();el('token').focus();throw new Error('这些参数或官网功能需要直连 NovelAI。请在设置里填写并保存 NovelAI Token，然后回去点生成。');}return directToken;};
 const png=async(payload,signal)=>{
 if(payload.direct)await getToken();
 if(!payload.direct&&!secret_state[SECRET_KEYS.NOVEL])throw new Error('请先在设置里配置 NovelAI Token。');
 const started=performance.now(),route=payload.direct?'浏览器直连':'酒馆服务器转发';let stage='等待图片返回';
 const show=()=>timing(`${route} · ${stage} · 已用 ${seconds(performance.now()-started)} 秒`);show();
 const interval=setInterval(show,500),timeout=setTimeout(()=>controller?.abort(),180000);
 try{
 const src=payload.direct?await requestDirect(payload.direct,directToken,signal):await requestImage(payload,ctx().getRequestHeaders(),signal);
 const received=performance.now();stage='图片已返回，正在解码';show();
 const check=new Image();check.src=src;await check.decode();
 lastTiming={requestMs:received-started,decodeMs:performance.now()-received,route};
 timing(`${route} · 请求及下载 ${seconds(lastTiming.requestMs)} 秒 · 解码 ${seconds(lastTiming.decodeMs)} 秒`);return src;
 }catch(error){timing(`${route} · 未完成 · 已用 ${seconds(performance.now()-started)} 秒`);throw error;}
 finally{clearTimeout(timeout);clearInterval(interval);}
 };

 const prepare=cfg=>{const payload=buildRequest(cfg);if(advanced.transport==='direct'||isV5(payload.model)||payload.cfg_rescale!==0||payload.variety_boost||advanced.model.trim()||Object.keys(JSON.parse(advanced.parameters||'{}')).length)payload.direct=directRequest(payload,advanced.parameters,advanced.model);return payload;};
 const addImage=async entry=>{
 images.unshift(entry);
 // Show the returned image immediately; persistence must not delay its preview.
 previewIds[entry.bad?'bad':'draw']=entry.id;renderPreviews();save();
 const started=performance.now(),measured=lastTiming?{...lastTiming}:null;
 try{await store.put(entry);}catch{entry.unsaved=true;status('图片已生成，但浏览器存储失败，请立即下载保存。');}
 const saved=performance.now();renderGallery();
 if(measured)timing(`${measured.route} · 请求及下载 ${seconds(measured.requestMs)} 秒 · 解码 ${seconds(measured.decodeMs)} 秒 · 保存 ${seconds(saved-started)} 秒${entry.unsaved?'（失败，请下载）':''}`);
 };

 const makeEntry=(src,payload,source=[],title='星绘',key=chatKey())=>({id:crypto.randomUUID(),created:Date.now(),src,payload:structuredClone(payload),source:structuredClone(source),title,chatKey:key,bad:source.length>0});
 on('generate',()=>run(async signal=>{const payload=prepare(config()),key=chatKey();await tools.withTools(payload,signal,{parameters:advanced.parameters,model:advanced.model});status('猫猫正在画画…');const src=await png(payload,signal);const title={img2img:'图生图',infill:'局部重绘'}[payload.direct?.action]||'星绘';const entry=makeEntry(src,payload,[],title,key);await addImage(entry);if(!entry.unsaved)status('图片已保存到图库。');}));
 const previewIds=ext.meow_preview??={};let viewerOrigin=null;
 const previewList=mode=>images.filter(x=>mode==='bad'?x.bad&&x.chatKey===chatKey():!x.bad);
 function movePreview(mode,delta){const list=previewList(mode);if(!list.length)return;const i=list.findIndex(x=>x.id===previewIds[mode]);previewIds[mode]=list[(Math.max(0,i)+delta+list.length)%list.length].id;renderPreviews();save();}
 function renderPreviews(){for(const mode of ['draw','bad']){const box=el(mode==='draw'?'latest':'bad-latest'),list=previewList(mode);box.replaceChildren();if(!list.length){box.append(textNode('small','还没有图片，生成后会显示在这里。'));continue;}const item=list.find(x=>x.id===previewIds[mode])||list[0];previewIds[mode]=item.id;const b=button('',()=>{if(!b.dataset.meowSwiped)showImage(item.id,mode);});b.className='meow-thumb';b.setAttribute('aria-label','放大当前图片');const img=new Image();img.src=item.src;img.alt=item.title;b.append(img);bindSwipe(b,delta=>movePreview(mode,delta));const row=textNode('div','','meow-row');row.append(button('‹',()=>movePreview(mode,-1)),textNode('span',`${list.indexOf(item)+1} / ${list.length}`),button('›',()=>movePreview(mode,1)));box.append(b,row);}}
 const filtered=()=>images.filter(x=>el('gallery-filter').value==='chat'?x.chatKey===chatKey():el('gallery-filter').value==='bad'?x.bad:true);
 const thumbnail=entry=>{const b=button('',()=>showImage(entry.id));b.className='meow-thumb';b.setAttribute('aria-label',`放大预览 ${entry.title}`);const img=new Image();img.src=entry.src;img.alt=entry.title;img.loading='lazy';b.append(img);return b;};
 function renderGallery(){const grid=el('gallery');grid.replaceChildren();const list=filtered();if(!list.length)grid.append(textNode('p','还没有图片，去画一张吧。'));for(const entry of list){const card=document.createElement('article');card.append(thumbnail(entry),textNode('p',`${entry.title}${entry.unsaved?'（未持久保存）':''}`),textNode('small',new Date(entry.created).toLocaleString()));grid.append(card);}}
 on('gallery-filter',renderGallery,'change');on('gallery-refresh',async()=>{images=await store.list();renderGallery();renderPreviews();});
 const viewer=document.createElement('dialog');viewer.id='meow-viewer';viewer.setAttribute('aria-label','图片大图预览');document.body.append(viewer);let viewing=null,zoom=false;
 const viewerList=()=>{if(viewerOrigin==='camera'){const key=images.find(x=>x.id===viewing)?.cameraKey;return images.filter(x=>x.cameraKey&&x.cameraKey===key);}return viewerOrigin?previewList(viewerOrigin):filtered();};
 function showImage(id,origin=null){const entry=images.find(x=>x.id===id);if(!entry)return;viewing=id;viewerOrigin=origin;if(origin&&origin!=='camera'){previewIds[origin]=id;renderPreviews();save();}zoom=false;renderViewer(entry);if(!viewer.open)viewer.showModal();}
 const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reseed=entry=>{const payload=structuredClone(entry.payload);payload.seed=crypto.getRandomValues(new Uint32Array(1))[0];if(payload.direct)payload.direct.parameters.seed=payload.seed;return payload;};
 async function redrawEntry(entry,signal){if(entry.payload.director)throw new Error('导演工具的结果不能重绘，请对原图再用一次工具。');const payload=reseed(entry);status('正在重绘…');const src=await png(payload,signal);const next=makeEntry(src,payload,entry.source,entry.title,entry.chatKey);next.insertionSource=entry.insertionSource;next.cameraKey=entry.cameraKey;await addImage(next);camera?.notify(next.cameraKey);status('重绘完成，已存入图库。');return next;}
 async function removeEntry(entry){const list=viewer.open&&viewing===entry.id?viewerList().filter(x=>x.id!==entry.id):null;await store.remove(entry.id);images=images.filter(x=>x.id!==entry.id);renderGallery();renderPreviews();if(list){if(list.length)showImage(list[0].id,viewerOrigin);else viewer.close();}camera?.notify(entry.cameraKey);}
 let camera=null,tools=null;
 const inline=mountInline({context:ctx,chatKey,report:status,upload:entry=>saveBase64AsFile(entry.src.split(',')[1],'meow',entry.id,'png'),generate:index=>{if(busy)throw new Error('猫猫正在忙，请稍后再生成。');secondary.output='chat';el('output').value='chat';save();captureTarget=index;panel.open();document.querySelector('[data-page="bad"]').click();el('capture').click();},redraw:async(variant,source,key)=>{let result;await run(async signal=>{const payload=structuredClone(variant.payload);payload.seed=crypto.getRandomValues(new Uint32Array(1))[0];if(payload.direct)payload.direct.parameters.seed=payload.seed;const src=await png(payload,signal);result=makeEntry(src,payload,[source],variant.title,key);await addImage(result);});return result;}});
 async function insert(entry){return inline.insert(entry);}

 function renderViewer(entry){viewer.replaceChildren();const photo=new Image();photo.src=entry.src;photo.alt=entry.title;photo.className='meow-full-image';photo.addEventListener('click',()=>{zoom=!zoom;photo.classList.toggle('zoomed',zoom);});let touch;
 photo.addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});photo.addEventListener('touchend',e=>{if(!touch||zoom)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))moveImage(dx<0?1:-1);touch=null;},{passive:true});
 const row=textNode('div','','meow-row');row.append(button('‹ 上一张',()=>moveImage(-1)),button('下一张 ›',()=>moveImage(1)),button('关闭',()=>viewer.close()));
 const actions=textNode('div','','meow-row');const link=document.createElement('a');link.textContent='下载 PNG';link.href=entry.src;link.download=`meow-${entry.payload.seed}.png`;const linked=(entry.insertionSource||entry.source[0])&&Number.isInteger((entry.insertionSource||entry.source[0]).messageIndex);
 actions.append(link,...(entry.payload.director?[]:[button('重绘（新种子）',()=>run(async signal=>{const next=await redrawEntry(entry,signal);showImage(next.id,viewerOrigin);}))]),...(linked?[button('插入对应原文',()=>insert(entry))]:[]),button('删除图片',async()=>{if(!confirm('删除图库中的这张图片和对应记录？已插入聊天的副本不会删除。'))return;await removeEntry(entry);}));
 const use=textNode('details','','meow-use');use.append(textNode('summary','用这张图…（图生图 / 局部重绘 / 氛围 / 精确参考 / 反推 tags / 读信息 / 导演工具）'));const useRow=textNode('div','','meow-row');for(const [kind,label] of [['img2img','图生图'],['inpaint','局部重绘'],['vibe','氛围参考'],['reference','精确参考'],['reverse','看图反推 tags'],['meta','读原图信息'],['director','导演工具 / 放大']])useRow.append(button(label,()=>tools.useImage(entry.src,kind)));use.append(useRow);
 viewer.append(row,photo,textNode('h3',entry.title),actions,use,textNode('small',`Seed ${entry.payload.seed} · ${entry.payload.model}`));
 const prompt=textNode('details','');prompt.append(textNode('summary','实际正负提示词'),textNode('pre',`正面：${entry.payload.prompt}\n\n负面：${entry.payload.negative_prompt}`));viewer.append(prompt);
 if(entry.source.length){const where=s=>Number.isInteger(s.messageIndex)?`${s.name} · 第 ${s.messageIndex+1} 条 · ${s.part}`:`${s.name} · ${s.part}`;const main=entry.insertionSource||entry.source[0];const quote=entry.insertionSource?.anchorText||(entry.cameraKey?main.text:'');
 viewer.append(textNode('h4','这张图来自这句原文'),textNode('small',where(main)),textNode('pre',quote||(main.text.length>160?main.text.slice(0,160)+'…':main.text)));
 const full=textNode('details','');full.append(textNode('summary','查看完整原文'));entry.source.forEach(s=>full.append(textNode('small',where(s)),textNode('pre',s.text)));viewer.append(full);}}
 function moveImage(delta){const list=viewerList();if(!list.length)return;const i=list.findIndex(x=>x.id===viewing);showImage(list[(Math.max(0,i)+delta+list.length)%list.length].id,viewerOrigin);}
 viewer.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();moveImage(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveImage(-1);}});
 const selected=()=>parts.filter(p=>p.selected&&p.text.trim());
 let manualPreview=false,draftTimer=0,draftKey=null;
 const DRAFTS='meow-bad-drafts';
 const readDrafts=()=>{try{return JSON.parse(localStorage.getItem(DRAFTS)||'{}')||{};}catch{return {};}};
 // Captured text, typed preview and returned tags survive closing the panel, switching apps or reloading.
 const flushDraft=()=>{clearTimeout(draftTimer);draftTimer=0;const key=draftKey;if(!key)return;try{const all=readDrafts(),preview=el('send-preview').value;if(!parts.length&&!scenes.length&&!preview.trim())delete all[key];else all[key]={at:Date.now(),parts,scenes,manual:manualPreview,preview,raw:el('raw-tags').value};for(const k of Object.keys(all).sort((a,b)=>all[b].at-all[a].at).slice(8))delete all[k];localStorage.setItem(DRAFTS,JSON.stringify(all));}catch{}};
 const saveDraft=()=>{draftKey??=chatKey();clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,300);};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&draftTimer)flushDraft();});
 const loadDraft=()=>{draftKey=chatKey();const d=readDrafts()[draftKey];parts=Array.isArray(d?.parts)?d.parts:[];scenes=Array.isArray(d?.scenes)?d.scenes:[];manualPreview=!!d?.manual;capture=parts.length||manualPreview?{key:chatKey()}:null;renderParts();el('context-count').textContent=parts.length?`已选 ${selected().length} / ${parts.length} 段`:'还没有捕捉';el('send-preview').value=d?.preview??'';el('raw-tags').value=d?.raw??'';renderScenes();if(scenes.length||parts.length)status(scenes.length?'已恢复上次的 tags，可直接生成图片。':'已恢复上次捕捉的原文。');};
 const selectionPreview=()=>{manualPreview=false;el('context-count').textContent=parts.length?`已选 ${selected().length} / ${parts.length} 段`:'还没有捕捉';el('send-preview').value=selected().map(p=>`[${p.id}] ${p.name} · ${p.part}\n${p.text}`).join('\n\n');scenes=[];el('scenes').replaceChildren();saveDraft();};
 el('send-preview').addEventListener('input',()=>{manualPreview=!!el('send-preview').value.trim();saveDraft();});
 el('scenes').addEventListener('input',saveDraft);el('scenes').addEventListener('change',saveDraft);
 function renderParts(){el('context-box').open=false;el('context-list').replaceChildren();for(const p of parts){const card=textNode('div','','meow-source');const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=p.selected;input.addEventListener('change',()=>{p.selected=input.checked;selectionPreview();});label.append(input,document.createTextNode(`${p.name} · 第 ${p.messageIndex+1} 条 · ${p.part}`));const body=document.createElement('textarea');body.value=p.text;body.rows=4;body.setAttribute('aria-label',`${p.id} 待发送原文`);const originalAnchor=p.originalAnchor??=p.anchorText,originalStart=p.originalStart??=p.anchorStart;body.addEventListener('input',()=>{p.text=body.value;const chosen=p.text.trim(),at=originalAnchor.indexOf(chosen);if(chosen&&at>=0&&originalAnchor.indexOf(chosen,at+1)<0){p.anchorText=chosen;p.anchorStart=originalStart+at;}else{p.anchorText=originalAnchor;p.anchorStart=originalStart;}selectionPreview();});card.append(label,body);el('context-list').append(card);}}
 on('capture',()=>{if(!ctx().getCurrentChatId())throw new Error('请先打开一个聊天。');const count=numberIn(secondary.context_count,1,50,'上下文条数');let rules;try{rules=JSON.parse(secondary.rules);}catch{throw new Error('分区规则不是有效 JSON。');}if(!Array.isArray(rules)||rules.length>20||rules.some(r=>typeof r.name!=='string'||typeof r.start!=='string'||typeof r.end!=='string'))throw new Error('每条规则需要 name、start 和 end，最多 20 条。');parts=captureContext(ctx().chat,captureTarget===null?count:ctx().chat.length,rules);if(captureTarget!==null){parts=parts.filter(p=>p.messageIndex===captureTarget);captureTarget=null;}capture={key:chatKey()};renderParts();selectionPreview();status(parts.length?'已捕捉。请勾选要发送的部分；可在框内删去不想发送的文字。':'没有可用原文。');});
 const runTags=async(signal,countOverride)=>{const typed=el('send-preview').value.trim(),manual=manualPreview&&!!typed;if(manual)capture={key:chatKey()};else if(!capture)throw new Error('请先点①捕捉聊天，或直接在「将发送的原文预览」里写内容。');checkChat();if(!secondary.secret_id)throw new Error('请先配置副 API 密钥。');const count=numberIn(countOverride??secondary.image_count,1,8,'图片数');const withCharacters=!!secondary.character_mode;
 const chosen=manual?[{id:'manual',messageIndex:null,name:'手写',part:'预览框内容',text:typed}]:structuredClone(selected());const request=buildTagRequest({...secondary,appearance:await getAppearance()},chosen,count);if(JSON.stringify(request).length>150000)throw new Error('选中上下文太长，请减少条数或删减内容（最多 150 KB）。');status('正在把勾选原文发给副 API…');const timeout=setTimeout(()=>controller?.abort(),120000);let data;try{const r=await fetch('/api/backends/chat-completions/generate',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(request),signal});if(!r.ok)throw new Error(`副 API 失败（HTTP ${r.status}），请检查地址、密钥和模型。`);data=await r.json();}finally{clearTimeout(timeout);}const raw=data.choices?.[0]?.message?.content;if(data.choices?.[0]?.finish_reason==='length'){el('raw-tags').value=typeof raw==='string'?raw:'';throw new Error('副 API 输出被截断，JSON 不完整。请减少本轮图片数或缩短预设要求后重试。');}if(typeof raw!=='string')throw new Error('副 API 返回缺少 choices[0].message.content。');el('raw-tags').value=raw;checkChat();scenes=parseScenes(raw,chosen.map(p=>p.id),count,withCharacters).map(s=>({...s,source:chosen.filter(p=>s.source_ids.includes(p.id))}));renderScenes();saveDraft();status(manual?'tags 已返回。预览框手写内容生成的图会放进图文相册，不插入正文。':'tags 已返回，检查或修改后再点生成图片。');};
 on('tags',()=>run(signal=>runTags(signal)));
 function renderScenes(){el('scenes').replaceChildren();scenes.forEach((s,i)=>{const box=textNode('div','','meow-scene');box.append(textNode('h4',`${i+1}. ${s.title}`));const positive=document.createElement('textarea');positive.value=s.prompt;positive.rows=4;positive.setAttribute('aria-label',`第 ${i+1} 幅 tags`);positive.addEventListener('input',()=>s.prompt=positive.value);const negative=document.createElement('textarea');negative.value=s.negative_prompt;negative.rows=2;negative.setAttribute('aria-label',`第 ${i+1} 幅补充负面`);negative.addEventListener('input',()=>s.negative_prompt=negative.value);box.append(positive,negative,textNode('small',`引用原文：${s.source_ids.join(', ')}`));const linked=s.source.some(p=>Number.isInteger(p.messageIndex));const anchorLabel=textNode('label','插图跟在哪一句后（逐字原文）');const anchorInput=document.createElement('textarea');anchorInput.value=s.anchor_quote;anchorInput.rows=2;anchorInput.addEventListener('input',()=>s.anchor_quote=anchorInput.value);const anchorSelect=document.createElement('select');s.source.forEach(p=>anchorSelect.add(new Option(p.id+' · '+p.part,p.id)));anchorSelect.value=s.anchor_source_id||s.source_ids[0];s.anchor_source_id=anchorSelect.value;anchorSelect.addEventListener('change',()=>s.anchor_source_id=anchorSelect.value);anchorLabel.append(anchorSelect,anchorInput);if(linked)box.append(anchorLabel);if(s.characters){
 box.append(textNode('h4','角色 tags 与位置（左上 0,0；右下 1,1）'));
 s.characters.forEach((c,j)=>{const card=textNode('div','','meow-source');card.append(textNode('h4',c.name||`角色 ${j+1}`));
 for(const [key,title] of [['prompt','角色正面'],['negative_prompt','角色负面'],['x','横向位置 x'],['y','纵向位置 y']]){const label=textNode('label',title);const input=document.createElement(key==='x'||key==='y'?'input':'textarea');if(key==='x'||key==='y'){input.type='number';input.min='0';input.max='1';input.step='0.05';}else input.rows=2;input.value=c[key];input.setAttribute('aria-label',`角色 ${j+1} ${title}`);input.addEventListener('input',()=>c[key]=key==='x'||key==='y'?(input.value===''?NaN:Number(input.value)):input.value);label.append(input);card.append(label);}
 card.append(button('删除此角色',()=>{s.characters.splice(j,1);renderScenes();saveDraft();}));box.append(card);});
 box.append(button('添加角色',()=>{if(s.characters.length>=6)throw new Error('最多 6 个角色。');s.characters.push({name:`角色 ${s.characters.length+1}`,prompt:'',negative_prompt:'',x:0.5,y:0.5});renderScenes();saveDraft();}));
 }el('scenes').append(box);});}
 const runBadGenerate=async signal=>{checkChat();if(!scenes.length)throw new Error('请先捕捉原文并生成 tags。');const batch=structuredClone(scenes).map(s=>({...s,insertionSource:s.source.some(p=>Number.isInteger(p.messageIndex))?sceneAnchor(s,s.source):null})),base=config(),key=capture.key,output=secondary.output;const payloads=batch.map(s=>{const cfg={...base,prompt:s.prompt,extra_negative:combine(base.extra_negative,s.negative_prompt)};if(!s.characters)return prepare(cfg);

 const characters=validateCharacters(s.characters),payload=buildRequest(cfg);const extra=JSON.parse(advanced.parameters||'{}');if(!extra||typeof extra!=='object'||Array.isArray(extra))throw new Error('高级 parameters 必须是对象。');payload.direct=directRequest(payload,JSON.stringify({...extra,...characterParameters(characters,advanced.model||payload.model)}),advanced.model);return payload;});for(const p of payloads)await tools.withTools(p,signal,{forBad:true,parameters:advanced.parameters,model:advanced.model});for(let i=0;i<batch.length;i++){if(stopping)break;checkChat();status(`坏猫猫正在画第 ${i+1}/${batch.length} 张…`);const src=await png(payloads[i],signal);const entry=makeEntry(src,payloads[i],batch[i].source,batch[i].title,key);entry.insertionSource=batch[i].insertionSource;await addImage(entry);if(output==='chat'&&entry.insertionSource){if(key!==chatKey()){status('聊天已切换，图片已存入图文相册，未插入其他聊天。');break;}await insert(entry);}if(entry.unsaved)break;}status(stopping?'已停止后续图片。':'本轮完成，在图库筛选“坏猫猫图文”可查看原文和图片。');};
 on('bad-generate',()=>run(runBadGenerate));
 // 书摘 bridge: selected / highlighted text → 坏猫猫 → tags → picture, after asking where the picture goes.
 const pick=document.createElement('dialog');pick.id='meow-selection-dialog';pick.setAttribute('aria-label','用猫猫星绘画这段');document.body.append(pick);
 const selectionPart=(text,index)=>{const message=Number.isInteger(index)?ctx().chat[index]:null;if(!message||message.is_system)return null;const snapshot=stripInline(message.mes);
  for(const quote of [text,text.replace(/\s+/g,' ')]){const at=snapshot.indexOf(quote);if(at>=0&&snapshot.indexOf(quote,at+1)<0)return {id:`m${index}sel`,messageIndex:index,name:message.name||'角色',part:'划线',text:quote,anchorText:quote,anchorStart:at,messageSnapshot:snapshot,selected:true};}
  return null;};
 async function drawSelection({text,messageIndex}){
  if(!text)throw new Error('没有读到选中的文字，请重新选一下再点「画图」。');
  if(busy)throw new Error('猫猫正在忙，请等当前任务完成。');
  const part=selectionPart(text,messageIndex),linked=!!part;
  pick.replaceChildren();
  const title=textNode('h3','ฅ 把这段画出来'),quote=textNode('pre',text.length>300?`${text.slice(0,300)}…`:text);
  const where=textNode('label','生成后放在哪里'),select=document.createElement('select');select.add(new Option('只放进图库（坏猫猫图文相册）','journal'));const insertOpt=new Option(linked?'图库 + 插入原文这句后面':'图库 + 插入原文（这段在原文里找不到，不能插入）','chat');insertOpt.disabled=!linked;select.add(insertOpt);select.value=linked&&secondary.output==='chat'?'chat':'journal';where.append(select);
  const countLabel=textNode('label','画几张'),count=document.createElement('input');count.type='number';count.min=1;count.max=8;count.value=1;countLabel.append(count);
  const row=textNode('div','','meow-row'),go=textNode('button','开始：生成 tags 再画图'),cancel=textNode('button','取消');go.type=cancel.type='button';row.append(go,cancel);
  pick.append(title,quote,where,countLabel,row,textNode('small','会先把这段发给副 API 写 tags，写好直接用当前绘图配置生图。'));
  const choice=await new Promise(resolve=>{go.onclick=()=>resolve({output:select.value,count:Number(count.value)||1});cancel.onclick=()=>resolve(null);pick.onclose=()=>resolve(null);pick.showModal();});
  if(pick.open)pick.close();if(!choice)return;
  secondary.output=choice.output;el('output').value=choice.output;save();
  capture={key:chatKey()};
  if(part){parts=[part];renderParts();selectionPreview();}else{parts=[];renderParts();selectionPreview();el('send-preview').value=text;manualPreview=true;saveDraft();}
  panel.open();page('bad');
  await run(async signal=>{await runTags(signal,Math.min(8,Math.max(1,choice.count)));status('tags 写好了，开始画图…');await runBadGenerate(signal);});
 }
 mountExcerptBridge(document,info=>guard(drawSelection)(info));
 camera=mountCamera({root,context:ctx,chatKey,panel,page,secondary,run,isBusy:()=>busy,config,prepare,png,makeEntry,addImage,listImages:()=>images,getAppearance,stop:()=>{stopping=true;controller?.abort();},redrawEntry,removeEntry,viewEntry:id=>showImage(id,'camera')});
 ctx().eventSource.on(ctx().event_types.CHAT_CHANGED,()=>{rememberDraft();editingProfile='';showAppearance();renderPreviews();if(draftTimer)flushDraft();capture=null;loadDraft();renderGallery();});
 const reverseTags=async(image,instruction,signal)=>{if(!secondary.secret_id)throw new Error('请先在设置里保存副 API 密钥。');const timeout=setTimeout(()=>controller?.abort(),120000);try{const r=await fetch('/api/backends/chat-completions/generate',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(buildReverseRequest(secondary,image,instruction)),signal});if(!r.ok)throw new Error(`副 API 失败（HTTP ${r.status}）。请确认模型能看图，并检查地址和密钥。`);const data=await r.json();const text=data.choices?.[0]?.message?.content;if(typeof text!=='string')throw new Error('副 API 没有返回文字。');return text;}finally{clearTimeout(timeout);}};
 tools=mountTools({root,el,store:galleryStore(`${ext.meow_gallery_scope}:tools`),settings,secondary,advanced,drawFields,save,status,run,getToken,makeEntry,addImage,reverseTags,listImages:()=>images,openTools:section=>{if(viewer.open)viewer.close();panel.open();page('tools');el(`sec-${section}`)?.scrollIntoView?.({block:'start'});}});
 on('tools-generate',()=>{page('draw');el('generate').click();});
 foldAll(root);foldHints(root);
 Promise.resolve().then(()=>fetch(new URL('manifest.json',import.meta.url))).then(r=>r.json()).then(m=>{if(m.version)el('version').textContent=m.version;}).catch(()=>{});
 // Checks the repository through SillyTavern (git fetch): on load, every time Settings opens (at most once a minute), every 30 minutes, and on demand.
 let updateChecked=0,updateBusy=false,announced=false;
 const updateCheck=async(force=false)=>{if(updateBusy||(!force&&Date.now()-updateChecked<60000))return;updateBusy=true;updateChecked=Date.now();el('update-state').textContent='正在检查仓库有没有新版本…';
  try{const r=await checkUpdate(folder,ctx().getRequestHeaders());const at=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
   if(!r.known){el('update-state').textContent=`暂时查不到有没有新版本（${at}，网络或酒馆没回应），可以直接点更新。`;return;}
   el('update-dot').hidden=r.upToDate;el('update-state').textContent=r.upToDate?`已经是最新版 ♡（${at} 检查${r.commit?` · ${r.commit}`:''}）`:`发现新版本${r.latest?` ${r.latest}`:''}！点下面「更新 Meow 并刷新酒馆」就能装上。（${at} 检查）`;
   if(!r.upToDate&&!announced){announced=true;status(`猫猫有新版本${r.latest?` ${r.latest}`:''}，去「设置」点更新吧。`);}
  }finally{updateBusy=false;}};
 setTimeout(()=>updateCheck(true).catch(()=>{}),4000);setInterval(()=>updateCheck(true).catch(()=>{}),1800000);
 root.querySelector('[data-page="config"]').addEventListener('click',()=>updateCheck().catch(()=>{}));
 on('check-update',()=>updateCheck(true));
 loadDraft();
 try{images=await store.list();renderGallery();renderPreviews();}catch{status('当前浏览器无法打开图库存储，生成后请及时下载。');}
}
ctx().eventSource.on(ctx().event_types.APP_READY,()=>init().catch(error=>{console.error('Meow initialization failed:',error);const target=document.querySelector('#meow-status')||document.querySelector('#extensions_settings2');if(target){const message=document.createElement('p');message.textContent='猫猫星绘初始化失败，请更新扩展并刷新；若仍失败，请提供浏览器控制台错误。';target.append(message);}}));
