import { validateCharacters, characterParameters } from './characters.js';
import { directRequest, requestDirect } from './advanced.js';
import { DEFAULTS, MODELS, SAMPLERS, SAMPLER_LABELS, SCHEDULERS, buildRequest, requestImage, cleanPreset, numberIn, combine } from './core.js';
import { mountPanel } from './panel.js';
import { galleryStore } from './storage.js';
import { DEFAULT_RULES, TAG_PRESET, captureContext, parseTagPreset, parseScenes, apiBase, buildTagRequest } from './context.js';
import { SECRET_KEYS, secret_state, writeSecret } from '../../../secrets.js';
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
 const advanced=ext.meow_advanced; let directToken='';
 const secondary=ext.meow_secondary,ui=ext.meow_ui;
 const save=()=>ctx().saveSettingsDebounced();save();
 const panel=mountPanel(await ctx().renderExtensionTemplateAsync(folder,'settings'),ui,save);
 const root=document.getElementById('meow-panel'),el=id=>root.querySelector(`#meow-${id}`);
 const status=message=>{el('status').textContent=message;};
 const store=galleryStore(ext.meow_gallery_scope);let images=[],parts=[],scenes=[],capture=null,busy=false,controller=null,stopping=false;
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
 const presets=()=>{el('preset-list').replaceChildren(new Option('当前配置',''));ext.meow_presets.forEach(p=>el('preset-list').add(new Option(p.name,p.id)));};presets();
 on('preset-save',()=>{const name=el('preset-name').value.trim();if(!name)throw new Error('先给配置起个名字。');if(name.length>80)throw new Error('配置名称请控制在 80 字内。');let p=ext.meow_presets.find(p=>p.name===name);if(!p){p={id:crypto.randomUUID(),name};ext.meow_presets.push(p);}p.settings=cleanPreset(config());p.advanced=advancedPreset();presets();el('preset-list').value=p.id;save();status('配置已保存，包括固定正负面和参数。');});
 on('preset-list',()=>{const p=ext.meow_presets.find(p=>p.id===el('preset-list').value);if(p){Object.assign(settings,cleanPreset(p.settings));restoreAdvanced(p.advanced);drawFields();el('preset-name').value=p.name;save();}},'change');
 on('preset-delete',()=>{const id=el('preset-list').value;if(!id)return;ext.meow_presets=ext.meow_presets.filter(p=>p.id!==id);presets();save();status('配置已删除。');});
 on('preset-export',()=>download('meow-preset.json',JSON.stringify({version:1,name:el('preset-name').value||'猫猫配置',settings:cleanPreset(config()),advanced:advancedPreset()},null,2)));
 on('preset-import',async()=>{const file=el('preset-import').files[0];if(!file)return;if(file.size>200000)throw new Error('配置文件太大。');const raw=JSON.parse(await file.text());Object.assign(settings,cleanPreset(raw));restoreAdvanced(raw.advanced);drawFields();el('preset-name').value=String(raw.name||'导入配置').slice(0,80);el('preset-import').value='';save();status('配置已导入，点击保存配置可加入列表。');},'change');
 const keyStatus=()=>{el('key-status').textContent=secret_state[SECRET_KEYS.NOVEL]?'已配置本地 NovelAI Token':'尚未配置 NovelAI Token';el('secondary-state').textContent=secondary.secret_id?'副 API 已绑定本地密钥 ID':'尚未绑定副 API 密钥';};keyStatus();
 ctx().eventSource.on(ctx().event_types.SECRET_WRITTEN,keyStatus);ctx().eventSource.on(ctx().event_types.SECRET_DELETED,keyStatus);
 on('save-token',async()=>{if(busy)throw new Error('请等待当前任务完成。');const value=el('token').value.trim();if(!value)throw new Error('请先填写 Token。');el('save-token').disabled=true;try{const id=await writeSecret(SECRET_KEYS.NOVEL,value,'Meow NovelAI');if(!id)throw new Error('Token 保存失败。');directToken=value;keyStatus();status('Token 已保存到本地酒馆。');}finally{el('token').value='';el('save-token').disabled=false;}});
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
 on('save-secondary',async()=>{if(busy)throw new Error('请等待当前任务完成。');apiBase(secondary.url);const value=el('secondary-key').value.trim();if(!value)throw new Error('请填写副 API 密钥。');el('save-secondary').disabled=true;try{const id=await writeSecret(SECRET_KEYS.CUSTOM,value,'Meow secondary');if(!id)throw new Error('副 API 密钥保存失败。');secondary.secret_id=id;save();keyStatus();status('副 API 密钥已保存。');}finally{el('secondary-key').value='';el('save-secondary').disabled=false;}});
 on('tag-import',async()=>{const f=el('tag-import').files[0];if(!f)return;if(f.size>200000)throw new Error('预设文件太大。');secondary.preset=parseTagPreset(await f.text(),f.name);if(!secondary.preset.trim())throw new Error('预设没有可用文本。');el('tag-preset').value=secondary.preset;save();el('tag-import').value='';status('tags 预设已导入，可继续编辑。');},'change');
 on('tag-export',()=>download('meow-tags-preset.json',JSON.stringify({system_prompt:secondary.preset},null,2)));
 for(const [id,k] of [['transport','transport'],['direct-model','model'],['direct-params','parameters']]){el(id).value=advanced[k];on(id,()=>{advanced[k]=el(id).value;save();},'input');}
 on('advanced-example',()=>{advanced.parameters=JSON.stringify({cfg_rescale:0,v4_prompt:{caption:{char_captions:[{char_caption:'1girl, white hair, pink dress',centers:[{x:0.5,y:0.5}]}]},use_coords:true,use_order:true},v4_negative_prompt:{caption:{char_captions:[]}}},null,2);el('direct-params').value=advanced.parameters;save();});
 on('advanced-import',async()=>{const f=el('advanced-import').files[0];if(!f)return;if(f.size>10000000)throw new Error('请求 JSON 太大。');const raw=JSON.parse(await f.text());if(raw.action&&raw.action!=='generate')throw new Error('当前直连仅支持 generate 文生图请求。');const params=raw.parameters??raw;directRequest(buildRequest({...config(),prompt:'validation',upscale_ratio:1,variety_boost:false}),JSON.stringify(params));advanced.parameters=JSON.stringify(params,null,2);if(typeof raw.model==='string')advanced.model=raw.model;if(typeof raw.input==='string')settings.prompt=raw.input;for(const key of ['width','height','steps','scale','cfg_rescale','seed','sampler'])if(typeof params[key]===typeof DEFAULTS[key])settings[key]=params[key];if(typeof params.noise_schedule==='string')settings.scheduler=params.noise_schedule;if(typeof params.negative_prompt==='string')settings.extra_negative=params.negative_prompt;el('direct-params').value=advanced.parameters;el('direct-model').value=advanced.model;drawFields();save();el('advanced-import').value='';status('已导入 parameters；顶层凭证和地址不会导入。');},'change');
 const launcherFields=[['top-enabled','top_enabled','check'],['floating-enabled','enabled','check'],['floating-size','size','number'],['normal-image','normal_image','text'],['bad-image','bad_image','text']];
 const launcherValues=()=>{launcherFields.forEach(([id,k,t])=>{if(t==='check')el(id).checked=ui[k]!==false;else el(id).value=ui[k]??'';});el('size-output').textContent=`${ui.size||64}px`;};launcherValues();
 launcherFields.forEach(([id,k,t])=>on(id,()=>{if(t==='text'&&el(id).value.trim()&&!el(id).value.startsWith('https://'))throw new Error('图片链接需以 https:// 开头。');ui[k]=t==='check'?el(id).checked:t==='number'?Number(el(id).value):el(id).value.trim();save();panel.refresh();el('size-output').textContent=`${ui.size}px`;},t==='text'?'change':'input'));
 on('launcher-reset',()=>{panel.reset();launcherValues();status('已恢复小动物手机和爱字图片，悬浮按钮回到右侧。');});
 const setBusy=value=>{busy=value;for(const id of ['generate','tags','bad-generate','capture','save-token','save-secondary'])el(id).disabled=value;el('stop').hidden=!value;root.setAttribute('aria-busy',String(value));};
 const run=async fn=>{if(busy)throw new Error('猫猫正在忙，请等待当前任务完成。');stopping=false;controller=new AbortController();setBusy(true);try{await fn(controller.signal);}finally{setBusy(false);controller=null;}};
 on('stop',()=>{stopping=true;controller?.abort();status('已停止后续任务；已经发出的请求仍可能计费。');});
 const png=async(payload,signal)=>{if(!secret_state[SECRET_KEYS.NOVEL])throw new Error('请先在设置里配置 NovelAI Token。');const timeout=setTimeout(()=>controller?.abort(),180000);try{const src=payload.direct?await requestDirect(payload.direct,directToken,signal):await requestImage(payload,ctx().getRequestHeaders(),signal);const check=new Image();check.src=src;await check.decode();return src;}finally{clearTimeout(timeout);}};
 const prepare=cfg=>{const payload=buildRequest(cfg);if(advanced.transport==='direct')payload.direct=directRequest(payload,advanced.parameters,advanced.model);return payload;};
 const addImage=async entry=>{images.unshift(entry);try{await store.put(entry);}catch{entry.unsaved=true;status('图片已生成，但浏览器存储失败，请立即下载保存。');}renderGallery();el('latest').replaceChildren(textNode('p','画好啦，点击放大查看 ♡'),thumbnail(entry));};
 const makeEntry=(src,payload,source=[],title='星绘',key=chatKey())=>({id:crypto.randomUUID(),created:Date.now(),src,payload:structuredClone(payload),source:structuredClone(source),title,chatKey:key,bad:source.length>0});
 on('generate',()=>run(async signal=>{const payload=prepare(config()),key=chatKey();status('猫猫正在画画…');const src=await png(payload,signal);const entry=makeEntry(src,payload,[],'星绘',key);await addImage(entry);if(!entry.unsaved)status('图片已保存到图库。');}));
 const filtered=()=>images.filter(x=>el('gallery-filter').value==='chat'?x.chatKey===chatKey():el('gallery-filter').value==='bad'?x.bad:true);
 const thumbnail=entry=>{const b=button('',()=>showImage(entry.id));b.className='meow-thumb';b.setAttribute('aria-label',`放大预览 ${entry.title}`);const img=new Image();img.src=entry.src;img.alt=entry.title;img.loading='lazy';b.append(img);return b;};
 function renderGallery(){const grid=el('gallery');grid.replaceChildren();const list=filtered();if(!list.length)grid.append(textNode('p','还没有图片，去画一张吧。'));for(const entry of list){const card=document.createElement('article');card.append(thumbnail(entry),textNode('p',`${entry.title}${entry.unsaved?'（未持久保存）':''}`),textNode('small',new Date(entry.created).toLocaleString()));grid.append(card);}}
 on('gallery-filter',renderGallery,'change');on('gallery-refresh',async()=>{images=await store.list();renderGallery();});
 const viewer=document.createElement('dialog');viewer.id='meow-viewer';viewer.setAttribute('aria-label','图片大图预览');document.body.append(viewer);let viewing=null,zoom=false;
 function showImage(id){const entry=images.find(x=>x.id===id);if(!entry)return;viewing=id;zoom=false;renderViewer(entry);if(!viewer.open)viewer.showModal();}
 const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function insert(entry){if(!ctx().getCurrentChatId())throw new Error('请先打开一个聊天。');if(entry.chatKey!==chatKey())throw new Error('图片来源不是当前聊天，请切回来源聊天后插入。');const key=chatKey();const path=await saveBase64AsFile(entry.src.split(',')[1],'meow',entry.id,'png');if(key!==chatKey())throw new Error('上传时切换了聊天，已停止插入。');const message={name:'猫猫星绘',is_user:false,is_system:false,send_date:new Date().toISOString(),mes:`${escapeText(entry.title)}\n${entry.source.map(s=>`<blockquote>${escapeText(s.text)}</blockquote>`).join('\n')}`,extra:{image:path,inline_image:false,meow:true}};ctx().chat.push(message);ctx().addOneMessage(message);await ctx().saveChat();status('已作为图文新消息插入聊天，原正文保留。');}
 function renderViewer(entry){viewer.replaceChildren();const photo=new Image();photo.src=entry.src;photo.alt=entry.title;photo.className='meow-full-image';photo.addEventListener('click',()=>{zoom=!zoom;photo.classList.toggle('zoomed',zoom);});let touch;
 photo.addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});photo.addEventListener('touchend',e=>{if(!touch||zoom)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy))moveImage(dx<0?1:-1);touch=null;},{passive:true});
 const row=textNode('div','','meow-row');row.append(button('‹ 上一张',()=>moveImage(-1)),button('下一张 ›',()=>moveImage(1)),button('关闭',()=>viewer.close()));
 const actions=textNode('div','','meow-row');const link=document.createElement('a');link.textContent='下载 PNG';link.href=entry.src;link.download=`meow-${entry.payload.seed}.png`;actions.append(link,button('重绘（新种子）',()=>run(async signal=>{const payload=structuredClone(entry.payload);payload.seed=crypto.getRandomValues(new Uint32Array(1))[0];if(payload.direct)payload.direct.parameters.seed=payload.seed;status('正在重绘…');const src=await png(payload,signal);const next=makeEntry(src,payload,entry.source,entry.title,entry.chatKey);await addImage(next);showImage(next.id);})),button('插入聊天',()=>insert(entry)),button('删除图片',async()=>{if(!confirm('删除图库中的这张图片和对应记录？已插入聊天的副本不会删除。'))return;await store.remove(entry.id);images=images.filter(x=>x.id!==entry.id);renderGallery();if(images.length)showImage(images[0].id);else viewer.close();el('latest').replaceChildren();}));
 viewer.append(row,photo,textNode('h3',entry.title),actions,textNode('small',`Seed ${entry.payload.seed} · ${entry.payload.model}`));
 const prompt=textNode('details','');prompt.append(textNode('summary','实际正负提示词'),textNode('pre',`正面：${entry.payload.prompt}\n\n负面：${entry.payload.negative_prompt}`));viewer.append(prompt);
 if(entry.source.length){viewer.append(textNode('h4','这张图来自这些原文'));entry.source.forEach(s=>viewer.append(textNode('small',`${s.name} · 第 ${s.messageIndex+1} 条 · ${s.part}`),textNode('pre',s.text)));}}
 function moveImage(delta){const list=filtered();if(!list.length)return;const i=list.findIndex(x=>x.id===viewing);showImage(list[(Math.max(0,i)+delta+list.length)%list.length].id);}
 viewer.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();moveImage(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveImage(-1);}});
 const selected=()=>parts.filter(p=>p.selected&&p.text.trim());
 const selectionPreview=()=>{el('send-preview').value=selected().map(p=>`[${p.id}] ${p.name} · ${p.part}\n${p.text}`).join('\n\n');scenes=[];el('scenes').replaceChildren();};
 on('capture',()=>{if(!ctx().getCurrentChatId())throw new Error('请先打开一个聊天。');const count=numberIn(secondary.context_count,1,50,'上下文条数');let rules;try{rules=JSON.parse(secondary.rules);}catch{throw new Error('分区规则不是有效 JSON。');}if(!Array.isArray(rules)||rules.length>20||rules.some(r=>typeof r.name!=='string'||typeof r.start!=='string'||typeof r.end!=='string'))throw new Error('每条规则需要 name、start 和 end，最多 20 条。');parts=captureContext(ctx().chat,count,rules);capture={key:chatKey()};el('context-list').replaceChildren();for(const p of parts){const card=textNode('div','','meow-source');const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=p.selected;input.addEventListener('change',()=>{p.selected=input.checked;selectionPreview();});label.append(input,document.createTextNode(`${p.name} · 第 ${p.messageIndex+1} 条 · ${p.part}`));const body=document.createElement('textarea');body.value=p.text;body.rows=4;body.setAttribute('aria-label',`${p.id} 待发送原文`);body.addEventListener('input',()=>{p.text=body.value;selectionPreview();});card.append(label,body);el('context-list').append(card);}selectionPreview();status(parts.length?'已捕捉。请勾选要发送的部分；可在框内删去不想发送的文字。':'没有可用原文。');});
 on('tags',()=>run(async signal=>{checkChat();if(!secondary.secret_id)throw new Error('请先配置副 API 密钥。');const count=numberIn(secondary.image_count,1,8,'图片数');const withCharacters=!!secondary.character_mode;if(withCharacters){if(advanced.transport!=='direct')throw new Error('多角色模式请先在设置中选择官网直连。');characterParameters([],advanced.model||config().model);}
 const chosen=structuredClone(selected());const request=buildTagRequest(secondary,chosen,count);if(JSON.stringify(request).length>150000)throw new Error('选中上下文太长，请减少条数或删减内容（最多 150 KB）。');status('正在把勾选原文发给副 API…');const timeout=setTimeout(()=>controller?.abort(),120000);let data;try{const r=await fetch('/api/backends/chat-completions/generate',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(request),signal});if(!r.ok)throw new Error(`副 API 失败（HTTP ${r.status}），请检查地址、密钥和模型。`);data=await r.json();}finally{clearTimeout(timeout);}const raw=data.choices?.[0]?.message?.content;if(typeof raw!=='string')throw new Error('副 API 返回缺少 choices[0].message.content。');el('raw-tags').value=raw;checkChat();scenes=parseScenes(raw,chosen.map(p=>p.id),count,withCharacters).map(s=>({...s,source:chosen.filter(p=>s.source_ids.includes(p.id))}));renderScenes();status('tags 已返回，检查或修改后再点生成图片。');}));
 function renderScenes(){el('scenes').replaceChildren();scenes.forEach((s,i)=>{const box=textNode('div','','meow-scene');box.append(textNode('h4',`${i+1}. ${s.title}`));const positive=document.createElement('textarea');positive.value=s.prompt;positive.rows=4;positive.setAttribute('aria-label',`第 ${i+1} 幅 tags`);positive.addEventListener('input',()=>s.prompt=positive.value);const negative=document.createElement('textarea');negative.value=s.negative_prompt;negative.rows=2;negative.setAttribute('aria-label',`第 ${i+1} 幅补充负面`);negative.addEventListener('input',()=>s.negative_prompt=negative.value);box.append(positive,negative,textNode('small',`引用原文：${s.source_ids.join(', ')}`));if(s.characters){
 box.append(textNode('h4','角色 tags 与位置（左上 0,0；右下 1,1）'));
 s.characters.forEach((c,j)=>{const card=textNode('div','','meow-source');card.append(textNode('h4',c.name||`角色 ${j+1}`));
 for(const [key,title] of [['prompt','角色正面'],['negative_prompt','角色负面'],['x','横向位置 x'],['y','纵向位置 y']]){const label=textNode('label',title);const input=document.createElement(key==='x'||key==='y'?'input':'textarea');if(key==='x'||key==='y'){input.type='number';input.min='0';input.max='1';input.step='0.05';}else input.rows=2;input.value=c[key];input.setAttribute('aria-label',`角色 ${j+1} ${title}`);input.addEventListener('input',()=>c[key]=key==='x'||key==='y'?(input.value===''?NaN:Number(input.value)):input.value);label.append(input);card.append(label);}
 card.append(button('删除此角色',()=>{s.characters.splice(j,1);renderScenes();}));box.append(card);});
 box.append(button('添加角色',()=>{if(s.characters.length>=6)throw new Error('最多 6 个角色。');s.characters.push({name:`角色 ${s.characters.length+1}`,prompt:'',negative_prompt:'',x:0.5,y:0.5});renderScenes();}));
 }el('scenes').append(box);});}
 on('bad-generate',()=>run(async signal=>{checkChat();if(!scenes.length)throw new Error('请先捕捉原文并生成 tags。');const batch=structuredClone(scenes),base=config(),key=capture.key,output=secondary.output;const payloads=batch.map(s=>{const cfg={...base,prompt:s.prompt,extra_negative:combine(base.extra_negative,s.negative_prompt)};if(!s.characters)return prepare(cfg);
 if(advanced.transport!=='direct')throw new Error('角色参数需要官网直连，请切换通道后再生成。');
 const characters=validateCharacters(s.characters),payload=buildRequest(cfg);const extra=JSON.parse(advanced.parameters||'{}');if(!extra||typeof extra!=='object'||Array.isArray(extra))throw new Error('高级 parameters 必须是对象。');payload.direct=directRequest(payload,JSON.stringify({...extra,...characterParameters(characters,advanced.model||payload.model)}),advanced.model);return payload;});for(let i=0;i<batch.length;i++){if(stopping)break;checkChat();status(`坏猫猫正在画第 ${i+1}/${batch.length} 张…`);const src=await png(payloads[i],signal);const entry=makeEntry(src,payloads[i],batch[i].source,batch[i].title,key);await addImage(entry);if(output==='chat'){if(key!==chatKey()){status('聊天已切换，图片已存入图文相册，未插入其他聊天。');break;}await insert(entry);}if(entry.unsaved)break;}status(stopping?'已停止后续图片。':'本轮完成，在图库筛选“坏猫猫图文”可查看原文和图片。');}));
 ctx().eventSource.on(ctx().event_types.CHAT_CHANGED,()=>{capture=null;parts=[];scenes=[];el('context-list').replaceChildren();el('scenes').replaceChildren();el('send-preview').value='';renderGallery();});
 try{images=await store.list();renderGallery();}catch{status('当前浏览器无法打开图库存储，生成后请及时下载。');}
}
ctx().eventSource.on(ctx().event_types.APP_READY,()=>init().catch(error=>{console.error('Meow initialization failed:',error);const target=document.querySelector('#meow-status')||document.querySelector('#extensions_settings2');if(target){const message=document.createElement('p');message.textContent='猫猫星绘初始化失败，请更新扩展并刷新；若仍失败，请提供浏览器控制台错误。';target.append(message);}}));
