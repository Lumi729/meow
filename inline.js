import { inlineTheme } from './inline-theme.js';
// v0.5 stores illustrations beside message text, never inside regex/code fences.
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
 return start+anchor.length;
}
export function migrateLegacy(message){
 let changed=false;
 for(const g of message.extra?.meow_inline??[]){if(!g.snapshot){g.snapshot=g.source?.messageSnapshot??stripInline(message.mes);changed=true;}}
 const clean=stripInline(message.mes);if(clean!==message.mes){message.mes=clean;changed=true;}
 if(Array.isArray(message.swipes))message.swipes=message.swipes.map(x=>{const clean=stripInline(x);if(clean!==x)changed=true;return clean;});
 return changed;
}
const active=(message,g)=>g.snapshot===stripInline(message.mes)&&(g.swipe===undefined||g.swipe===(message.swipe_id??0));
export function attachVariant(message,source,variant){
 safePath(variant.path);const end=anchorEnd(message,source),snapshot=stripInline(message.mes),anchorText=source.anchorText??source.text,anchorStart=end-anchorText.length;
 message.extra??={};message.extra.meow_inline??=[];
 let group=message.extra.meow_inline.find(g=>active(message,g)&&g.anchorStart===anchorStart&&g.anchorText===anchorText);
 if(group){if(group.variants.some(v=>v.id===variant.id))return group;group.variants.push(variant);group.active=group.variants.length-1;}
 else{group={id:crypto.randomUUID(),snapshot,swipe:message.swipe_id??0,anchorText,anchorStart,source:structuredClone({...source,anchorStart,messageSnapshot:snapshot}),variants:[variant],active:0};message.extra.meow_inline.push(group);}
 return group;
}
export function selectVariant(message,group,index){if(!active(message,group))throw new Error('原文已切换。');group.active=(index+group.variants.length)%group.variants.length;}
export function removeVariant(message,group){
 if(!active(message,group))throw new Error('原文已切换。');group.variants.splice(group.active,1);group.active=Math.min(group.active,group.variants.length-1);
 if(!group.variants.length)message.extra.meow_inline=message.extra.meow_inline.filter(g=>g!==group);
}
export function bindSwipe(element,move){let touch;element.addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});element.addEventListener('touchend',e=>{if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)){element.dataset.meowSwiped='1';Promise.resolve(move(dx<0?1:-1)).catch(()=>{});setTimeout(()=>delete element.dataset.meowSwiped,350);}},{passive:true});}
// Anchor in rendered text only. Never insert into a code block, HTML source or script.
function normalizedText(text,compact=false){
 let value='',positions=[];for(let i=0;i<text.length;i++){if(compact&&/\s/.test(text[i]))continue;const c=/\s/.test(text[i])?' ':text[i];if(c===' '&&value.endsWith(' ')){positions[positions.length-1]=i+1;continue;}value+=c;positions.push(i+1);}return {value,positions};
}
export function placeAfterQuote(body,quote,card,source={}){
 const doc=body.ownerDocument,walk=doc.createTreeWalker(body,4),nodes=[];let all='',n;
 while((n=walk.nextNode())){if(n.parentElement?.closest('script,style,pre,code,textarea,button,.meow-inline-card,[hidden]'))continue;nodes.push({n,start:all.length});all+=n.textContent;}
 const excerpt=source.source?.excerpt||source.excerpt;quote=source.source?.renderedText??source.renderedText??quote;
 const normalized=normalizedText(all,excerpt),target=normalizedText(quote,excerpt).value;if(!target)return false;
 const matches=[];for(let at=normalized.value.indexOf(target);at>=0;at=normalized.value.indexOf(target,at+target.length))matches.push(at);
 if(!matches.length)return false;let occurrence=0;
 if(matches.length>1){
  // Resolve duplicate sentences only when the raw and rendered occurrence counts agree.
  const raw=source.snapshot??source.messageSnapshot;if(typeof raw!=='string'||!Number.isInteger(source.anchorStart))return false;
  const occurrences=[];for(let at=raw.indexOf(quote);at>=0;at=raw.indexOf(quote,at+quote.length))occurrences.push(at);
  occurrence=occurrences.indexOf(source.anchorStart);if(occurrences.length!==matches.length||occurrence<0)return false;
 }
 const end=normalized.positions[matches[occurrence]+target.length-1],hit=nodes.find(x=>end>x.start&&end<=x.start+x.n.length);if(!hit)return false;
 const range=doc.createRange();range.setStart(hit.n,end-hit.start);range.collapse(true);
 const highlight=hit.n.parentElement?.closest('.be-highlight');
 if(highlight){const tail=doc.createRange();tail.setStart(hit.n,end-hit.start);tail.setEnd(highlight,highlight.childNodes.length);if(!tail.toString().trim()){highlight.after(card);return true;}}
 range.insertNode(card);return true;
}
export function mountInline({context,chatKey,upload,generate,redraw,editTags,report}){
 const placeholders=new Map();inlineTheme(document);
 let viewing=null,mutating=false;const mounted=new Map(),redrawing=new Set();
 const viewer=document.createElement('dialog');viewer.id='meow-inline-viewer';document.body.append(viewer);
 const button=(title,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.addEventListener('click',async e=>{e.stopPropagation();b.disabled=true;try{await fn();}catch(error){report(error.message);const p=b.closest('.meow-inline-card')?.querySelector('[role=status]')||viewer.querySelector('[role=status]');if(b.closest('.meow-inline-pending'))b.closest('.meow-inline-pending').title=error.message;else if(p){p.textContent=error.message;p.hidden=false;}}finally{b.disabled=false;}});return b;};
 const checked=target=>{if(target.key!==chatKey())throw new Error('聊天已切换。');const message=context().chat[target.index],group=message?.extra?.meow_inline?.find(g=>g.id===target.id);if(!group||!active(message,group))throw new Error('原文已切换或插图不存在。');return {message,group};};
 const persist=async()=>{await context().saveChat();decorate();};
 const change=async(target,delta)=>{if(mutating)return;mutating=true;try{const {message,group}=checked(target);selectVariant(message,group,group.active+delta);await persist();if(viewing)render();}finally{mutating=false;}};
 const toggleFold=async target=>{if(mutating)return;mutating=true;let group,previous;try{({group}=checked(target));previous=group.collapsed;group.collapsed=!group.collapsed;decorate();await context().saveChat();}catch(error){if(group){group.collapsed=previous;decorate();}throw error;}finally{mutating=false;}};
 const remove=async target=>{if(mutating)return;if(!confirm('从正文删除当前图片版本？图库原图仍保留。'))return;mutating=true;try{const {message,group}=checked(target);removeVariant(message,group);await persist();if(viewing){if(group.variants.length)render();else viewer.close();}}finally{mutating=false;}};
 function render(){const target=viewing;if(!target)return;const {group}=checked(target),variant=group.variants[group.active];viewer.replaceChildren();
  const photo=document.createElement('img');photo.src=variant.path;photo.alt='正文插图';photo.className='meow-inline-large';
  const counter=document.createElement('p');counter.textContent=`${group.active+1} / ${group.variants.length} · 切换会同步正文图片`;counter.setAttribute('role','status');
  const row=document.createElement('div');row.className='meow-inline-actions';row.append(button('‹ 上一张',()=>change(target,-1)),button('下一张 ›',()=>change(target,1)),button(redrawing.has(target.id)?'正在重绘…':'重绘',()=>redrawVariant(target)),...(editTags?[button('修改 tags',()=>{const {group}=checked(target);return editTags(structuredClone(group.variants[group.active]),structuredClone(group.source),target.key);})]:[]),button('删除正文中的此图',()=>remove(target)),button('关闭',()=>viewer.close()));viewer.append(row,photo,counter);bindSwipe(photo,delta=>change(target,delta));
 }
 const open=target=>{checked(target);viewing=target;render();if(!viewer.open)viewer.showModal();};
 async function redrawVariant(target){if(redrawing.has(target.id))return;const {group}=checked(target);redrawing.add(target.id);decorate();if(viewing)render();try{report('正文插图正在重绘…');const entry=await redraw(structuredClone(group.variants[group.active]),group.source,target.key);if(!entry)return;checked(target);await insert(entry,[group.source]);}finally{redrawing.delete(target.id);decorate();if(viewing)render();}}
 async function insert(entry,sources=entry.insertionSource?[entry.insertionSource]:entry.source?.slice(0,1)){
  if(entry.chatKey!==chatKey())throw new Error('请切回图片来源聊天后插入。');
  const source=sources?.[0];if(!source)throw new Error('这张图没有绑定原文。');
  const key=chatKey(),message=context().chat[source.messageIndex];if(!message)throw new Error('来源消息已删除。');anchorEnd(message,source);
  const path=await upload(entry);if(key!==chatKey()||context().chat[source.messageIndex]!==message)throw new Error('上传时切换了聊天，未插入其他正文。');
  const group=attachVariant(message,source,{id:entry.id,path,payload:structuredClone(entry.payload),title:entry.title,...(entry.scene?{scene:structuredClone(entry.scene)}:{})});await persist();report(mounted.get(group.id)?.isConnected?'图片已插在标签内对应句子后，标签与折叠状态保持不变。':'图片和句子位置已保存；目标句暂未显示，显示后会插入原位，不移到楼层外。');return path;
 }
 function placeholder(source,key,title='待生成图片'){
  if(key!==chatKey())throw new Error('聊天已切换。');
  const message=context().chat[source.messageIndex];anchorEnd(message,source);
  const id=crypto.randomUUID(),item={source:structuredClone(source),key,message,swipe:message.swipe_id??0,title,card:null};placeholders.set(id,item);decorate();
  return {hasRetry:()=>!!item.retry,retry(fn,label='重新生这张图'){item.retry=fn;item.retryLabel=label;item.card?.remove();item.card=null;decorate();},update(text){item.status=text;if(item.card){item.card.title=text;if(!item.retry)item.card.querySelector('button').textContent=/重试/.test(text)?'重试中…':/正在/.test(text)?'生成中…':'等待生成';}},remove(){item.card?.remove();placeholders.delete(id);}};
 }
 function decorate(){
  for(const [id,item] of placeholders){
   const {source,message,key,swipe}=item;
   if(key!==chatKey()||context().chat[source.messageIndex]!==message||(message.swipe_id??0)!==swipe||stripInline(message.mes)!==source.messageSnapshot){item.card?.remove();placeholders.delete(id);continue;}
   if(item.card?.isConnected)continue;
   const body=document.querySelector(`#chat .mes[mesid="${source.messageIndex}"] .mes_text`);if(!body)continue;
   const card=document.createElement('span');card.className='meow-inline-card meow-inline-pending';
   const note=document.createElement('span');note.setAttribute('role','status');note.textContent=item.title;card.title=item.status||'';const retryButton=button(item.retryLabel||(/正在/.test(item.status||'')?'生成中…':'等待生成'),async()=>{if(!item.retry||item.retrying)return;item.retrying=true;try{await item.retry();}finally{item.retrying=false;}});retryButton.disabled=!item.retry||!!item.retrying;card.append(note,retryButton);
   let placed=placeAfterQuote(body,source.anchorText??source.text,card,source);
   if(!placed)for(const frame of body.querySelectorAll('iframe')){try{if(frame.contentDocument?.body&&placeAfterQuote(frame.contentDocument.body,source.anchorText??source.text,card,source)){inlineTheme(frame.contentDocument,document);placed=true;break;}}catch{}}
   if(placed)item.card=card;
  }
  for(const [id,card] of mounted){const message=context().chat[Number(card.dataset.message)],g=message?.extra?.meow_inline?.find(x=>x.id===id);if(!card.isConnected||card.dataset.chat!==chatKey()||!g||!active(message,g)){card.remove();mounted.delete(id);}}
  document.querySelectorAll('#chat .mes[mesid]').forEach(node=>{const index=Number(node.getAttribute('mesid')),message=context().chat[index];if(!message||message.is_system||message.extra?.meow)return;const body=node.querySelector('.mes_text');if(!body)return;
   // Keep the text container untouched on messages without images: iframe renderers depend on it.
   const host=body.parentElement;if(!host.querySelector(':scope > .meow-message-generate')){const b=button('ฅ 给这段正文生成图片',()=>generate(index));b.className='menu_button meow-message-generate';host.append(b);}
   const groups=(message.extra?.meow_inline??[]).filter(g=>active(message,g));
   for(const group of groups){let card=mounted.get(group.id);const variant=group.variants[group.active];if(!variant)continue;
    if(!card){const target={key:chatKey(),index,id:group.id};card=document.createElement('span');card.className='meow-inline-card';card.dataset.message=index;card.dataset.chat=chatKey();card.dataset.group=group.id;
     const photo=document.createElement('img');photo.className='meow-inline-photo';photo.alt='正文插图';photo.addEventListener('click',()=>{if(!photo.dataset.meowSwiped)open(target);});bindSwipe(photo,delta=>change(target,delta));
     const heading=document.createElement('span');heading.className='meow-inline-heading';const title=document.createElement('span');title.className='meow-inline-title';const fold=button('收起图片',()=>toggleFold(target));fold.dataset.fold='1';photo.id=`meow-photo-${group.id}`;fold.setAttribute('aria-controls',photo.id);heading.append(title,fold);const note=document.createElement('span');note.setAttribute('role','status');card.append(heading,photo,note);
     let placed=placeAfterQuote(body,group.anchorText,card,group);
     if(!placed){for(const frame of body.querySelectorAll('iframe')){try{const frameBody=frame.contentDocument?.body;if(frameBody&&placeAfterQuote(frameBody,group.anchorText,card,group)){inlineTheme(frame.contentDocument,document);placed=true;break;}}catch{}}}
     if(!placed)continue;
     mounted.set(group.id,card);
    }
    const photo=card.querySelector('img');if(photo.getAttribute('src')!==variant.path)photo.src=variant.path;
    const busy=redrawing.has(group.id),fold=card.querySelector('[data-fold]'),label=group.collapsed?'展开图片':'收起图片';if(fold.textContent!==label)fold.textContent=label;fold.setAttribute('aria-expanded',String(!group.collapsed));photo.hidden=!!group.collapsed;const title=card.querySelector('.meow-inline-title'),name=`${variant.title||'正文插图'}${group.variants.length>1?` · ${group.active+1}/${group.variants.length}`:''}`;if(title.textContent!==name)title.textContent=name;const note=card.querySelector('[role=status]'),text=busy?'正在生成新版本…':'';if(note.textContent!==text)note.textContent=text;note.hidden=!busy;
   }
   for(const frame of body.querySelectorAll('iframe'))if(!frame.dataset.meowLoad){frame.dataset.meowLoad='1';frame.addEventListener('load',()=>{for(const g of groups){mounted.get(g.id)?.remove();mounted.delete(g.id);}decorate();});}
  });
 }
 const syncFrames=()=>{for(const frame of document.querySelectorAll('#chat .mes_text iframe')){try{if(frame.contentDocument?.querySelector('.meow-inline-card'))inlineTheme(frame.contentDocument,document);}catch{}}};
 const themeObserver=new document.defaultView.MutationObserver(syncFrames);themeObserver.observe(document.documentElement,{attributes:true});themeObserver.observe(document.body,{attributes:true});themeObserver.observe(document.head,{childList:true,subtree:true,characterData:true});
 viewer.addEventListener('close',()=>viewing=null);
 const events=context().event_types;for(const name of ['CHAT_CHANGED','MESSAGE_UPDATED','MESSAGE_SWIPED','USER_MESSAGE_RENDERED','CHARACTER_MESSAGE_RENDERED'])if(events[name])context().eventSource.on(events[name],()=>{if(name==='CHAT_CHANGED'&&viewer.open)viewer.close();decorate();});
 const chat=document.querySelector('#chat');if(chat){let queued=false;new document.defaultView.MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate();});}).observe(chat,{childList:true,subtree:true});}
 async function updateTags(id,scene,key){
  if(key!==chatKey())return false;
  const changed=[];
  for(const message of context().chat)for(const group of message.extra?.meow_inline??[])for(const variant of group.variants){
   if(variant.id!==id)continue;changed.push({variant,scene:variant.scene,title:variant.title});variant.scene=structuredClone(scene);variant.title=scene.title;
  }
  if(!changed.length)return false;
  try{await context().saveChat();}catch(error){for(const old of changed){old.variant.scene=old.scene;old.variant.title=old.title;}throw error;}
  refresh();return true;
 }
 function refresh(){decorate();if(viewing)render();}
 decorate();return {insert,decorate,placeholder,updateTags,refresh};
}

