const pattern=/\n\n!\[Meow-([a-zA-Z0-9-]+)\]\(([^\s)]+)\)\n\n/g;
export const stripInline=text=>String(text??'').replace(pattern,'');
const safePath=path=>{if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\s()"<>\\]/.test(path))throw new Error('图片存储地址无效。');return path;};
export const inlineMarker=(id,path)=>`\n\n![Meow-${id}](${safePath(path)})\n\n`;
export function anchorEnd(message,source){
 const clean=stripInline(message.mes),anchor=source.anchorText??source.text;
 if(!anchor)throw new Error('没有可定位的原文，请重新捕捉。');
 if(source.messageSnapshot!==undefined&&clean!==source.messageSnapshot)throw new Error('原文已编辑或切换回复，请重新捕捉；图片已保留在图库。');
 let start=source.anchorStart;
 if(!Number.isInteger(start)||clean.slice(start,start+anchor.length)!==anchor){start=clean.indexOf(anchor);if(start<0||clean.indexOf(anchor,start+1)>=0)throw new Error('无法唯一定位原文，请重新捕捉。');}
 const end=start+anchor.length;let offset=0;
 for(const match of String(message.mes).matchAll(pattern)){const cleanStart=match.index-offset;if(cleanStart>end)break;offset+=match[0].length;}
 return end+offset;
}
export function attachVariant(message,source,variant){
 safePath(variant.path);
 const end=anchorEnd(message,source);
 message.extra??={};message.extra.meow_inline??=[];
 let group=message.extra.meow_inline.find(g=>g.anchorStart===source.anchorStart&&g.anchorText===(source.anchorText??source.text)&&message.mes.includes(`![Meow-${g.id}](`));
 if(group){if(group.variants.some(v=>v.id===variant.id))return group;const previous=inlineMarker(group.id,group.variants[group.active].path);if(!message.mes.includes(previous))throw new Error('插图位置已修改，请重新捕捉。');group.variants.push(variant);group.active=group.variants.length-1;message.mes=message.mes.replace(previous,inlineMarker(group.id,variant.path));}
 else{group={id:crypto.randomUUID(),anchorText:source.anchorText??source.text,anchorStart:source.anchorStart,source:structuredClone(source),variants:[variant],active:0};message.mes=message.mes.slice(0,end)+inlineMarker(group.id,variant.path)+message.mes.slice(end);message.extra.meow_inline.push(group);}
 return group;
}
export function selectVariant(message,group,index){
 const previous=inlineMarker(group.id,group.variants[group.active].path);
 if(!message.mes.includes(previous))throw new Error('原文已切换或插图已被编辑。');
 group.active=(index+group.variants.length)%group.variants.length;
 message.mes=message.mes.replace(previous,inlineMarker(group.id,group.variants[group.active].path));
}
export function removeVariant(message,group){
 const previous=inlineMarker(group.id,group.variants[group.active].path);
 if(!message.mes.includes(previous))throw new Error('插图已被编辑。');
 group.variants.splice(group.active,1);group.active=Math.min(group.active,group.variants.length-1);
 message.mes=message.mes.replace(previous,group.variants.length?inlineMarker(group.id,group.variants[group.active].path):'');
 if(!group.variants.length)message.extra.meow_inline=message.extra.meow_inline.filter(g=>g!==group);
}
export function mountInline({context,chatKey,upload,generate,redraw,report}){
 let viewing=null,mutating=false;
 const viewer=document.createElement('dialog');viewer.id='meow-inline-viewer';document.body.append(viewer);
 const button=(title,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',e=>{e.stopPropagation();Promise.resolve().then(fn).catch(error=>{report(error.message);const p=document.createElement('p');p.textContent=error.message;viewer.append(p);});});return b;};
 const checked=target=>{if(target.key!==chatKey())throw new Error('聊天已切换。');const message=context().chat[target.index];const group=message?.extra?.meow_inline?.find(g=>g.id===target.id);if(!group||!message.mes.includes(`![Meow-${group.id}](`))throw new Error('原文已切换或插图不存在。');return {message,group};};
 const persist=async(index,message)=>{if(typeof context().updateMessageBlock!=='function')throw new Error('酒馆缺少原文刷新接口，请更新酒馆。');if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id)&&message.swipe_id>=0)message.swipes[message.swipe_id]=message.mes;context().updateMessageBlock(index,message);await context().saveChat();decorate();};
 const change=async(target,delta)=>{if(mutating)return;mutating=true;try{const {message,group}=checked(target);selectVariant(message,group,group.active+delta);await persist(target.index,message);if(viewing)render();}finally{mutating=false;}};
 function render(){
  const target=viewing;if(!target)return;const {group}=checked(target),variant=group.variants[group.active];viewer.replaceChildren();
  const photo=document.createElement('img');photo.src=variant.path;photo.alt='正文插图';photo.className='meow-inline-large';
  const counter=document.createElement('p');counter.textContent=`${group.active+1} / ${group.variants.length} · 左右切换会同步正文图片`;
  const row=document.createElement('div');row.className='meow-inline-actions';row.append(button('‹ 上一张',()=>change(target,-1)),button('下一张 ›',()=>change(target,1)),button('重绘',()=>redrawVariant(target)),button('删除正文中的此图',async()=>{if(mutating)return;if(!confirm('从正文删除当前图片版本？图库中的原图仍保留。'))return;mutating=true;try{const {message,group}=checked(target);removeVariant(message,group);await persist(target.index,message);if(group.variants.length)render();else viewer.close();}finally{mutating=false;}}),button('关闭',()=>viewer.close()));
  viewer.append(row,photo,counter);bindSwipe(photo,delta=>change(target,delta));
 }
 const open=target=>{checked(target);viewing=target;render();if(!viewer.open)viewer.showModal();};
 async function redrawVariant(target){if(mutating)return;const {group}=checked(target);const variant=structuredClone(group.variants[group.active]);report('正文插图正在重绘…');const entry=await redraw(variant,group.source,target.key);checked(target);await insert(entry,[group.source]);if(viewing)render();}
 async function insert(entry,sources=entry.source){
  if(entry.chatKey!==chatKey())throw new Error('请切回图片来源聊天后插入。');
  if(!sources.length)throw new Error('这张图没有绑定原文；请从正文的生成图片按钮开始。');
  if(typeof context().updateMessageBlock!=='function')throw new Error('酒馆缺少原文刷新接口。');
  const key=chatKey();for(const source of sources){const message=context().chat[source.messageIndex];if(!message)throw new Error('来源消息已删除。');anchorEnd(message,source);}
  const path=await upload(entry);if(key!==chatKey())throw new Error('上传时切换了聊天，未插入其他正文。');
  const targets=sources.map(source=>{const message=context().chat[source.messageIndex];anchorEnd(message,source);return {message,source};});
  for(const {message,source} of targets)attachVariant(message,source,{id:entry.id,path,payload:structuredClone(entry.payload),title:entry.title});
  for(const index of new Set(sources.map(s=>s.messageIndex)))await persist(index,context().chat[index]);
  report('已插入对应原文后；可在正文重绘、放大、删除和切换图片。');return path;
 }
 function bindSwipe(element,move){let touch; element.addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});element.addEventListener('touchend',e=>{if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){element.dataset.meowSwiped='1';Promise.resolve(move(dx<0?1:-1)).catch(e=>report(e.message));setTimeout(()=>delete element.dataset.meowSwiped,350);}},{passive:true});}
 function decorate(){
  document.querySelectorAll('#chat .mes[mesid]').forEach(node=>{const index=Number(node.getAttribute('mesid')),message=context().chat[index];if(!message||message.is_system||message.extra?.meow)return;const body=node.querySelector('.mes_text');if(!body)return;
   if(!body.querySelector('.meow-message-generate')){const b=button('ฅ 给这段正文生成图片',()=>generate(index));b.className='meow-message-generate';body.append(b);}
   for(const group of message.extra?.meow_inline??[]){const photo=[...body.querySelectorAll('img')].find(img=>img.alt===`Meow-${group.id}`);if(!photo||photo.dataset.meowBound)continue;photo.dataset.meowBound='1';photo.classList.add('meow-inline-photo');const target={key:chatKey(),index,id:group.id};photo.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(!photo.dataset.meowSwiped)open(target);},true);bindSwipe(photo,delta=>change(target,delta));const row=document.createElement('span');row.className='meow-inline-actions';row.append(button('放大 / 管理',()=>open(target)),button('重绘',()=>redrawVariant(target)),button('‹',()=>change(target,-1)),button('›',()=>change(target,1)));photo.after(row);}
  });
 }
 viewer.addEventListener('close',()=>viewing=null);
 const events=context().event_types;for(const name of ['CHAT_CHANGED','MESSAGE_UPDATED','MESSAGE_SWIPED','USER_MESSAGE_RENDERED','CHARACTER_MESSAGE_RENDERED'])if(events[name])context().eventSource.on(events[name],()=>{if(name==='CHAT_CHANGED'&&viewer.open)viewer.close();decorate();});
 const chat=document.querySelector('#chat');if(chat){let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate();});}).observe(chat,{childList:true,subtree:true});}
 decorate();return {insert,decorate};
}
