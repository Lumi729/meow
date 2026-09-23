import { applyTools, toolsActive, encodeVibe, directorTool, pngText, stealthText, parseNaiMetadata, parseVibeFile, buildVibeFile, fitImage, sizeFor, padReference, maskFromStrokes, loadImage, fromBase64, shrinkImage, isV4Family, REFERENCE_TYPES, DIRECTOR_TOOLS, EMOTIONS } from './nai-tools.js';
import { REVERSE_PROMPT, cleanTags } from './context.js';
import { directRequest } from './advanced.js';
import { characterParameters } from './characters.js';
import { MODELS, SAMPLERS, SCHEDULERS } from './core.js';

const blank=()=>({mode:'generate',image:'',imageW:0,imageH:0,strength:0.7,noise:0,add_original:true,maskStrokes:'',vibes:[],references:[],meta:null,bad:false,reverseImage:'',reverseResult:'',vibeOn:true});
const readFile=file=>new Promise((resolve,reject)=>{if(file.size>20000000){reject(new Error('图片太大（上限 20 MB）。'));return;}const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('读取图片失败。'));r.readAsDataURL(file);});

export function mountTools({root,el,store,settings,secondary,advanced,drawFields,save,status,run,getToken,makeEntry,addImage,openTools,reverseTags,listImages=()=>[]}){
 let state=blank(),saveTimer=0,library=[];
 const persist=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{store.put({id:'meow-tools-state',created:0,state}).catch(()=>{});},400);};
 const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
 const guard=fn=>async(...a)=>{try{await fn(...a);}catch(e){status(e.message||'操作失败。');}};
 const on=(id,fn,ev='click')=>el(id).addEventListener(ev,guard(fn));
 const number=(label,value,min,max,step,set)=>{const l=node('label',label),i=document.createElement('input');i.type='number';i.min=min;i.max=max;i.step=step;i.value=value;i.addEventListener('input',()=>{set(Number(i.value));persist();badge();});l.append(i);return l;};
 const thumb=src=>{const img=new Image();img.src=src;img.alt='';img.className='meow-tool-thumb';return img;};

 for(const [v,t] of Object.entries(DIRECTOR_TOOLS))el('director-tool').add(new Option(t,v));
 for(const [v,t] of Object.entries(EMOTIONS))el('director-emotion').add(new Option(t,v));

 function badge(){const on=[];if(state.mode==='img2img')on.push('图生图');if(state.mode==='inpaint')on.push('局部重绘');const v=state.vibeOn===false?0:state.vibes.filter(x=>x.enabled!==false).length,r=state.references.filter(x=>x.enabled!==false).length;if(v)on.push(`氛围×${v}`);if(r)on.push(`精确参考×${r}`);const text=on.length?`（已开：${on.join('、')}）`:'（都没开，生图时不会用）';el('tools-badge').textContent=text;el('tools-badge-page').textContent=text;}
 function render(){
  el('tool-mode').value=state.mode;el('tool-strength').value=state.strength;el('tool-noise').value=state.noise;el('tool-original').checked=state.add_original!==false;el('tools-bad').checked=!!state.bad;
  const box=el('tool-preview');box.replaceChildren();
  if(state.image){const wrap=node('div','','meow-tool-stack');wrap.append(thumb(state.image));if(state.maskStrokes){const m=thumb(state.maskStrokes);m.className='meow-tool-mask';wrap.append(m);}box.append(wrap,node('small',`${state.imageW} × ${state.imageH}${state.maskStrokes?' · 已画蒙版':''}`));}
  else box.append(node('small','还没有基础图。'));
  const vibes=el('vibe-list');vibes.replaceChildren();
  state.vibes.forEach((v,i)=>{const card=node('div','','meow-tool-item'),on=document.createElement('input');on.type='checkbox';on.checked=v.enabled!==false;on.addEventListener('change',()=>{v.enabled=on.checked;persist();badge();});const head=node('label','启用');head.prepend(on);
   const remove=node('button','移除');remove.type='button';remove.addEventListener('click',()=>{state.vibes.splice(i,1);persist();render();});
   card.append(thumb(v.image),head,number('信息提取（0.01–1）',v.info,0.01,1,0.01,x=>{v.info=x;}),number('参考强度（0–1）',v.strength,0,1,0.01,x=>{v.strength=x;}),node('small',v.libId?`来自氛围库：${v.name||''}`:(Object.keys(v.tokens||{}).length||v.token?'已编码，可重复使用':'第一次生成时编码')),...(v.libId?[]:[saveButton(v)]),remove);vibes.append(card);});
  renderLibrary();
  const refs=el('ref-list');refs.replaceChildren();
  state.references.forEach((r,i)=>{const card=node('div','','meow-tool-item'),on=document.createElement('input');on.type='checkbox';on.checked=r.enabled!==false;on.addEventListener('change',()=>{r.enabled=on.checked;persist();badge();});const head=node('label','启用');head.prepend(on);
   const typeLabel=node('label','参考内容'),type=document.createElement('select');for(const [k,t] of Object.entries(REFERENCE_TYPES))type.add(new Option(t,k));type.value=r.type;type.addEventListener('change',()=>{r.type=type.value;persist();});typeLabel.append(type);
   const remove=node('button','移除');remove.type='button';remove.addEventListener('click',()=>{state.references.splice(i,1);persist();render();});
   card.append(thumb(r.image),head,typeLabel,number('参考强度（0–1）',r.strength,0,1,0.01,x=>{r.strength=x;}),number('保真度（0–1）',r.fidelity,0,1,0.01,x=>{r.fidelity=x;}),remove);refs.append(card);});
  el('meta-view').value=state.meta?describe(state.meta):'';
  const rp=el('reverse-preview');rp.replaceChildren();if(state.reverseImage){const w=node('div','','meow-tool-stack');w.append(thumb(state.reverseImage));rp.append(w);}
  if(el('reverse-result').value!==state.reverseResult)el('reverse-result').value=state.reverseResult||'';badge();
 }
 const toolText=m=>{const t=m.tools||{},out=[];if(t.mode)out.push(`${t.mode==='inpaint'?'局部重绘':'图生图'}（强度 ${t.strength}${t.mode==='img2img'?`，噪声 ${t.noise}`:''}）`);
  if(t.vibes?.length)out.push(`氛围迁移 ×${t.vibes.length}（${t.vibes.map(v=>`强度 ${v.strength} / 信息提取 ${v.info}${v.token?'，带编码':v.image?'，带原图':''}`).join('；')}）`);
  if(t.references?.length)out.push(`精确参考 ×${t.references.length}（${t.references.map(r=>`${REFERENCE_TYPES[r.type]||r.type}，强度 ${r.strength}，保真度 ${r.fidelity}${r.image?'':'，没存原图'}`).join('；')}）`);
  const e=m.extras||{};if(e.decrisper)out.push('Decrisper');if(e.variety_boost)out.push('Variety Boost');if(e.quality)out.push('质量标签');
  return out.length?`官网功能：${out.join('、')}`:'官网功能：没有用（普通文生图）';};
 const describe=m=>[`正面：${m.prompt}`,`负面：${m.negative}`,toolText(m),m.characters.length?`角色：\n${m.characters.map(c=>`· ${c.prompt}（位置 ${c.x}, ${c.y}）`).join('\n')}`:'',`模型：${m.model?MODELS[m.model]||m.model:'未识别'} · ${m.settings.width}×${m.settings.height} · ${m.settings.steps} 步 · 引导 ${m.settings.scale} · ${m.settings.sampler} · 种子 ${m.seed}`].filter(Boolean).join('\n\n');

 async function setBase(src,mode){const img=await loadImage(src);state.image=src;state.imageW=img.naturalWidth;state.imageH=img.naturalHeight;state.maskStrokes='';if(mode)state.mode=mode;persist();render();}
 const saveButton=v=>{const b=node('button','存进氛围库');b.type='button';b.addEventListener('click',guard(async()=>{const name=prompt('给这个氛围起个名字',`氛围 ${library.length+1}`);if(!name)return;const item=await addLibrary({name,image:v.image,info:v.info,strength:v.strength,tokens:{...(v.tokens||{}),...(v.token&&v.tokenKey?{[v.tokenKey]:v.token}:{})}});v.libId=item.id;v.name=item.name;persist();render();status(`已存进氛围库：${item.name}`);}));return b;};
 async function addLibrary(data){const item={id:`vibe:${crypto.randomUUID()}`,created:Date.now(),kind:'vibe',name:String(data.name||'氛围').slice(0,80),image:data.image||'',thumbnail:data.thumbnail||'',info:data.info??1,strength:data.strength??0.6,tokens:data.tokens||{}};await store.put(item);library.unshift(item);return item;}
 const saveLibrary=item=>store.put(item).catch(()=>status('氛围库保存失败。'));
 const slotFor=item=>state.vibes.find(v=>v.libId===item.id);
 function toggleLibrary(item,on){const slot=slotFor(item);if(on){if(slot)slot.enabled=true;else{if(state.vibes.length>=8)throw new Error('氛围最多同时用 8 张。');state.vibes.push({id:crypto.randomUUID(),libId:item.id,name:item.name,image:item.image,info:item.info,strength:item.strength,enabled:true,tokens:{...item.tokens}});}state.vibeOn=true;}else if(slot)state.vibes=state.vibes.filter(v=>v!==slot);persist();render();}
 const download=(name,text)=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
 function renderLibrary(){
  el('vibe-on').checked=state.vibeOn!==false;
  const used=library.filter(item=>slotFor(item)?.enabled!==false&&slotFor(item)),extra=state.vibes.filter(v=>!v.libId&&v.enabled!==false).length;
  el('vibe-summary').textContent=state.vibeOn===false?'这次不用':used.length||extra?[...used.map(i=>i.name),...(extra?[`官网页另有 ${extra} 张`]:[])].join('、'):'没选';
  const draw=el('vibe-lib-draw'),manage=el('vibelib-list');draw.replaceChildren();manage.replaceChildren();
  if(!library.length){draw.append(node('small','氛围库还是空的，点下面去添加。'));manage.append(node('small','还没有保存的氛围。'));}
  for(const item of library){
   const slot=slotFor(item),row=node('div','','meow-vibe-row'),pick=node('label'),check=document.createElement('input');check.type='checkbox';check.checked=!!slot&&slot.enabled!==false;check.addEventListener('change',guard(()=>toggleLibrary(item,check.checked)));
   pick.append(check,thumb(item.thumbnail||item.image),node('span',item.name));row.append(pick);
   if(slot)row.append(number('强度',slot.strength,0,1,0.01,x=>{slot.strength=x;}));
   draw.append(row);
   const card=node('div','','meow-tool-item'),nameLabel=node('label','名字'),name=document.createElement('input');name.value=item.name;name.addEventListener('change',()=>{item.name=name.value.trim()||item.name;if(slot)slot.name=item.name;saveLibrary(item);renderLibrary();});nameLabel.append(name);
   const buttons=node('div','','meow-row'),use=node('button',slot?'正在用':'用这个');use.type='button';use.addEventListener('click',guard(()=>toggleLibrary(item,true)));
   const exp=node('button','导出');exp.type='button';exp.addEventListener('click',()=>download(`${item.name}.naiv4vibe`,buildVibeFile(item)));
   const del=node('button','删除');del.type='button';del.addEventListener('click',guard(async()=>{if(!confirm(`从氛围库删除「${item.name}」？`))return;await store.remove(item.id);library=library.filter(x=>x!==item);state.vibes=state.vibes.filter(v=>v.libId!==item.id);persist();render();}));
   buttons.append(use,exp,del);
   card.append(thumb(item.thumbnail||item.image),nameLabel,number('默认信息提取',item.info,0.01,1,0.01,x=>{item.info=x;saveLibrary(item);}),number('默认参考强度',item.strength,0,1,0.01,x=>{item.strength=x;saveLibrary(item);}),node('small',item.image?`已编码 ${Object.keys(item.tokens||{}).length} 种设置`:'只有编码（没有原图），只能用在编码时的模型'),buttons);manage.append(card);
  }
 }
 on('vibe-on',()=>{state.vibeOn=el('vibe-on').checked;persist();render();},'change');
 on('vibelib-file',async()=>{const f=el('vibelib-file').files[0];if(!f)return;let item;
  if(/\.(naiv4vibe|json)$/i.test(f.name))item=await addLibrary(parseVibeFile(await f.text(),f.name.replace(/\.[^.]+$/,'')));
  else{const name=prompt('给这个氛围起个名字',f.name.replace(/\.[^.]+$/,'')||`氛围 ${library.length+1}`);if(!name){el('vibelib-file').value='';return;}item=await addLibrary({name,image:await readFile(f)});}
  el('vibelib-file').value='';render();status(`已加进氛围库：${item.name}。在星绘页的「氛围」里勾选就能用。`);},'change');
 async function addVibe(src){if(state.vibes.length>=8)throw new Error('氛围参考最多 8 张。');state.vibes.push({id:crypto.randomUUID(),image:src,info:1,strength:0.6,enabled:true,token:'',tokenKey:''});persist();render();}
 async function addReference(src){if(state.references.length>=4)throw new Error('精确参考最多 4 张。');state.references.push({id:crypto.randomUUID(),image:src,padded:await padReference(src),type:'character&style',strength:1,fidelity:1,enabled:true});persist();render();}
 async function readMeta(src){let texts={};try{texts=await pngText(fromBase64(src));}catch{}
  if(!texts.Comment){const hidden=await stealthText(src).catch(()=>null);if(hidden)texts={...hidden,...texts,Comment:hidden.Comment};}
  if(!texts.Comment)throw new Error('这张图里没有 NovelAI 生成信息（被压缩、截图或转存过的图读不到）。');
  state.meta=parseNaiMetadata(texts);persist();render();}
 async function setReverse(src){state.reverseImage=await shrinkImage(src);state.reverseResult='';persist();render();}
 el('reverse-prompt').value=secondary.reverse_prompt||REVERSE_PROMPT;
 on('reverse-prompt',()=>{secondary.reverse_prompt=el('reverse-prompt').value;save();},'input');
 on('reverse-result',()=>{state.reverseResult=el('reverse-result').value;persist();},'input');
 on('reverse-file',async()=>{const f=el('reverse-file').files[0];if(!f)return;await setReverse(await readFile(f));el('reverse-file').value='';status('图片已放好，点“用副 API 反推 tags”。');},'change');
 on('reverse-run',()=>run(async signal=>{if(!state.reverseImage)throw new Error('请先从相册选一张图。');status('正在让副 API 看图写 tags…');state.reverseResult=cleanTags(await reverseTags(state.reverseImage,el('reverse-prompt').value,signal));if(!state.reverseResult)throw new Error('副 API 没有返回 tags。');persist();render();const box=el('reverse-result').closest('details');if(box)box.open=true;status('反推完成，可以修改后填进「这次想画什么」。');}));
 const putPrompt=append=>{const tags=el('reverse-result').value.trim();if(!tags)throw new Error('还没有反推结果。');settings.prompt=append&&String(settings.prompt||'').trim()?`${String(settings.prompt).trim()}, ${tags}`:tags;drawFields();save();status(append?'已追加到「这次想画什么」。':'已填进「这次想画什么」。');};
 on('reverse-replace',()=>putPrompt(false));on('reverse-append',()=>putPrompt(true));
 // Quick buttons on the drawing page jump here and open the album picker when a picture is still needed.
 const pickers={vibe:'vibe-file',reference:'ref-file',reverse:'reverse-file',meta:'meta-file'};
 root.querySelectorAll('[data-tool-jump]').forEach(b=>b.addEventListener('click',guard(async()=>{const kind=b.dataset.toolJump;
  if(kind==='img2img'||kind==='inpaint'){state.mode=kind;persist();render();openTools('base');if(!state.image)el('tool-image-file').click();else if(kind==='inpaint')await openMask();return;}
  openTools(kind);if(pickers[kind])el(pickers[kind]).click();})));

 on('tool-mode',()=>{state.mode=el('tool-mode').value;persist();badge();},'change');
 on('tool-strength',()=>{state.strength=Number(el('tool-strength').value);persist();},'input');
 on('tool-noise',()=>{state.noise=Number(el('tool-noise').value);persist();},'input');
 on('tool-original',()=>{state.add_original=el('tool-original').checked;persist();},'change');
 on('tools-bad',()=>{state.bad=el('tools-bad').checked;persist();},'change');
 on('tool-image-file',async()=>{const f=el('tool-image-file').files[0];if(!f)return;await setBase(await readFile(f),state.mode==='generate'?'img2img':state.mode);el('tool-image-file').value='';status('基础图已放好。');if(state.mode==='inpaint')await openMask();},'change');
 on('vibe-file',async()=>{const f=el('vibe-file').files[0];if(!f)return;await addVibe(await readFile(f));el('vibe-file').value='';},'change');
 on('ref-file',async()=>{const f=el('ref-file').files[0];if(!f)return;await addReference(await readFile(f));el('ref-file').value='';},'change');
 on('meta-file',async()=>{const f=el('meta-file').files[0];if(!f)return;await readMeta(await readFile(f));el('meta-file').value='';status('已读取图片信息，勾选后点“导入到星绘”。');},'change');
 on('tool-clear',()=>{state.image='';state.maskStrokes='';state.mode='generate';persist();render();});
 on('tool-size',()=>{if(!state.image)throw new Error('请先选择基础图。');const s=sizeFor(state.imageW,state.imageH);settings.width=s.width;settings.height=s.height;drawFields();save();status(`尺寸改为 ${s.width} × ${s.height}。`);});
 on('tools-reset',()=>{if(!confirm('清空基础图、蒙版、氛围参考和精确参考？'))return;state=blank();persist();render();});
 on('meta-import',async()=>{const m=state.meta;if(!m)throw new Error('请先读取一张 NovelAI 原图。');
  if(el('meta-prompt').checked)settings.prompt=m.prompt;if(el('meta-negative').checked)settings.extra_negative=m.negative;
  if(el('meta-settings').checked){const s=m.settings;for(const k of ['width','height','steps','scale','cfg_rescale'])if(Number.isFinite(Number(s[k]))&&s[k]!==undefined)settings[k]=Number(s[k]);if(SAMPLERS.includes(s.sampler))settings.sampler=s.sampler;if(SCHEDULERS.includes(s.scheduler))settings.scheduler=s.scheduler;if(Object.hasOwn(MODELS,m.model))settings.model=m.model;}
  if(el('meta-seed').checked&&Number.isFinite(Number(m.seed)))settings.seed=Number(m.seed);
  if(el('meta-settings').checked&&m.extras){settings.decrisper=!!m.extras.decrisper;settings.variety_boost=!!m.extras.variety_boost;}
  const notes=[];
  if(el('meta-tools').checked&&m.tools){const t=m.tools,model=m.model||settings.model;
   if(t.mode){state.mode=t.mode;state.strength=t.strength;state.noise=t.noise;notes.push(`${t.mode==='inpaint'?'局部重绘':'图生图'}的强度已导入，基础图请到官网页选`);}
   t.vibes?.forEach((v,i)=>{if(state.vibes.length>=8)return;const key=`${model}|${Math.round(v.info*100)/100}`;state.vibes.push({id:crypto.randomUUID(),name:`图片里的氛围 ${i+1}`,image:v.image,info:v.info,strength:v.strength,enabled:true,tokens:v.token?{[key]:v.token}:{}});});
   if(t.vibes?.length){state.vibeOn=true;notes.push(`氛围 ${t.vibes.length} 个已加上（可以在官网页存进氛围库）`);}
   for(const r of t.references||[]){if(r.image&&state.references.length<4)state.references.push({id:crypto.randomUUID(),image:r.image,padded:await padReference(r.image),type:r.type,strength:r.strength,fidelity:r.fidelity,enabled:true});}
   if(t.references?.length)notes.push(t.references.some(r=>r.image)?'精确参考已加上':'精确参考的原图没有存在图片信息里，只能看到设置，请自己选参考图');
   persist();render();}
  if(el('meta-characters').checked&&m.characters.length){let extra={};try{extra=JSON.parse(advanced.parameters||'{}');}catch{}Object.assign(extra,characterParameters(m.characters,settings.model));advanced.parameters=JSON.stringify(extra,null,2);el('direct-params').value=advanced.parameters;}
  drawFields();save();status(`已导入到星绘。固定正面 / 固定负面没有改动；负面放进了「本次补充负面」。${notes.length?` ${notes.join('；')}。`:''}`);});

 // Mask painter: white strokes mark what gets repainted.
 const editor=document.createElement('dialog');editor.id='meow-mask-editor';editor.setAttribute('aria-label','画蒙版');document.body.append(editor);
 on('tool-mask',async()=>{if(!state.image)throw new Error('请先选择基础图。');await openMask();});
 async function openMask(){
  const img=await loadImage(state.image),w=img.naturalWidth,h=img.naturalHeight;editor.replaceChildren();
  const stage=node('div','','meow-mask-stage'),base=document.createElement('canvas'),paint=document.createElement('canvas');base.width=paint.width=w;base.height=paint.height=h;base.getContext('2d').drawImage(img,0,0);
  const g=paint.getContext('2d');if(state.maskStrokes)g.drawImage(await loadImage(state.maskStrokes),0,0,w,h);
  stage.append(base,paint);
  let size=Math.round(Math.max(w,h)/18),erase=false,last=null;
  const sizeLabel=node('label','笔刷大小'),range=document.createElement('input');range.type='range';range.min=8;range.max=Math.round(Math.max(w,h)/4);range.value=size;range.addEventListener('input',()=>size=Number(range.value));sizeLabel.append(range);
  const mode=node('button','现在：画笔');mode.type='button';mode.addEventListener('click',()=>{erase=!erase;mode.textContent=erase?'现在：橡皮':'现在：画笔';});
  const clear=node('button','全部清空');clear.type='button';clear.addEventListener('click',()=>g.clearRect(0,0,w,h));
  const done=node('button','完成');done.type='button';done.addEventListener('click',()=>{state.maskStrokes=paint.toDataURL('image/png');if(state.mode==='generate')state.mode='inpaint';persist();render();editor.close();status('蒙版已保存：涂到的地方会重画。');});
  const cancel=node('button','取消');cancel.type='button';cancel.addEventListener('click',()=>editor.close());
  const point=e=>{const r=paint.getBoundingClientRect();return {x:(e.clientX-r.left)*w/r.width,y:(e.clientY-r.top)*h/r.height};};
  const stroke=(a,b)=>{g.globalCompositeOperation=erase?'destination-out':'source-over';g.strokeStyle=g.fillStyle='#fff';g.lineWidth=size;g.lineCap=g.lineJoin='round';g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();};
  paint.addEventListener('pointerdown',e=>{paint.setPointerCapture(e.pointerId);last=point(e);stroke(last,last);});
  paint.addEventListener('pointermove',e=>{if(!last)return;const p=point(e);stroke(last,p);last=p;});
  const end=()=>last=null;paint.addEventListener('pointerup',end);paint.addEventListener('pointercancel',end);
  const row=node('div','','meow-row');row.append(mode,clear,done,cancel);
  editor.append(node('h3','画蒙版：涂白的地方会重画'),stage,sizeLabel,row);editor.showModal();
 }

 on('director-run',()=>run(async signal=>{if(!state.image)throw new Error('请先选择基础图（可以在图库大图里点“用这张图… → 导演工具”）。');
  const tool=el('director-tool').value,token=await getToken(),s=sizeFor(state.imageW,state.imageH),image=await fitImage(state.image,s.width,s.height);
  status(`正在使用「${DIRECTOR_TOOLS[tool]}」…`);
  const out=await directorTool(tool,{image,width:s.width,height:s.height,prompt:el('director-prompt').value.trim(),level:el('director-level').value,emotion:el('director-emotion').value},token,signal);
  const entry=makeEntry(`data:image/png;base64,${out}`,{prompt:`导演工具：${DIRECTOR_TOOLS[tool]}`,negative_prompt:'',seed:0,model:tool,director:true},[],DIRECTOR_TOOLS[tool]);await addImage(entry);status(`「${DIRECTOR_TOOLS[tool]}」完成，已存入图库。`);}));

 /** Adds the website features to a generation payload (forces the official direct request). */
 async function withTools(payload,signal,{forBad=false,parameters='{}',model=''}={}){
  if(forBad&&!state.bad)return payload;
  const vibes=state.vibeOn===false?[]:state.vibes,use=forBad?{vibes,references:state.references}:{...state,vibes};
  if(!toolsActive(use))return payload;
  payload.direct??=directRequest(payload,parameters,model);
  const body=payload.direct,opts={...use,vibes:use.vibes.filter(v=>v.enabled!==false),references:use.references.filter(r=>r.enabled!==false)};
  if(!forBad&&state.mode!=='generate'){
   opts.image=await fitImage(state.image,payload.width,payload.height);
   if(state.mode==='inpaint'){if(!state.maskStrokes)throw new Error('局部重绘需要先点“画蒙版”。');opts.mask=maskFromStrokes(await loadImage(state.maskStrokes),payload.width,payload.height);}
  }
  if(opts.vibes.length&&isV4Family(body.model)&&!/^nai-diffusion-5/.test(body.model)){
   const token=await getToken();
   for(const v of opts.vibes){const key=`${body.model}|${Math.round(v.info*100)/100}`,item=library.find(x=>x.id===v.libId);v.tokens??={};
    let tok=v.tokens[key]||item?.tokens?.[key]||(v.tokenKey===key?v.token:'');
    if(!tok){if(!v.image)throw new Error(`氛围「${v.name||''}」只有别的模型的编码，没有原图，换回编码时的模型再用。`);status('正在编码氛围参考图…');tok=await encodeVibe(v.image,v.info,body.model,token,signal);}
    v.token=tok;v.tokenKey=key;v.tokens[key]=tok;if(item&&item.tokens?.[key]!==tok){(item.tokens??={})[key]=tok;saveLibrary(item);}persist();}
  }
  applyTools(body,opts);return payload;
 }
 async function useImage(src,kind){
  if(kind==='img2img'||kind==='inpaint'||kind==='director')await setBase(src,kind==='director'?null:kind);
  else if(kind==='vibe')await addVibe(src);else if(kind==='reference')await addReference(src);else if(kind==='meta')await readMeta(src);else if(kind==='reverse')await setReverse(src);else if(kind==='vibelib'){const name=prompt('给这个氛围起个名字',`氛围 ${library.length+1}`);if(!name)return;await addLibrary({name,image:src});render();}
  openTools({img2img:'base',inpaint:'base',director:'director'}[kind]||kind);if(kind==='inpaint')await openMask();
  status({img2img:'已设为图生图的基础图。',inpaint:'已设为局部重绘的基础图，涂好蒙版后点「完成」。',director:'已放进基础图，选好导演工具后点「对基础图使用这个工具」。',vibe:'已加进氛围参考。',reference:'已加进精确参考。',reverse:'图片已放好，点“用副 API 反推 tags”。',vibelib:'已加进氛围库，在星绘页的「氛围」里勾选就能用。',meta:'已读取图片信息，勾选后点「导入到星绘」。'}[kind]);
 }
 store.list().then(list=>{const saved=list.find(x=>x.id==='meow-tools-state')?.state;if(saved)state={...blank(),...saved};library=list.filter(x=>x.kind==='vibe').sort((a,b)=>b.created-a.created);render();}).catch(()=>render());
 render();
 // Gallery picker: choose any picture already saved in Meow's gallery.
 const picker=document.createElement('dialog');picker.id='meow-gallery-picker';picker.setAttribute('aria-label','从猫猫图库选图');document.body.append(picker);
 const pickTitles={vibelib:'选一张图存进氛围库',base:'选基础图',vibe:'选氛围参考图',reference:'选精确参考图',reverse:'选要反推 tags 的图',meta:'选 NovelAI 原图'};
 function openPicker(kind){
  const list=listImages();picker.replaceChildren();
  const head=node('div','','meow-row'),close=node('button','关闭');close.type='button';close.addEventListener('click',()=>picker.close());head.append(node('h3',pickTitles[kind]||'选图'),close);
  const grid=node('div','','meow-pick-grid');
  if(!list.length)grid.append(node('p','图库里还没有图片。'));
  for(const entry of list){const b=node('button','','meow-pick-item');b.type='button';b.setAttribute('aria-label',entry.title);const img=new Image();img.src=entry.src;img.alt=entry.title;img.loading='lazy';b.append(img,node('small',entry.title));
   b.addEventListener('click',guard(async()=>{picker.close();const target=kind==='base'?(state.mode==='generate'?'img2img':state.mode):kind;await useImage(entry.src,target);}));grid.append(b);}
  picker.append(head,grid);picker.showModal();
 }
 root.querySelectorAll('[data-gallery-pick]').forEach(b=>b.addEventListener('click',()=>openPicker(b.dataset.galleryPick)));
 return {withTools,useImage,active:()=>toolsActive(state)};
}
