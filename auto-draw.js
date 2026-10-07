import { stripInline } from './inline.js';
import { balancedMessageTags, captureContext } from './context.js';
// Only new, completed assistant generations can start an automatic paid job.
export function mountAutoDraw({context,enabled,isBusy,generate,cancel,report,schedule=fn=>setTimeout(fn,0)}){
 let pending=null,active=null,epoch=0;
 const key=()=>JSON.stringify([context().groupId,context().characterId,context().getCurrentChatId()]);
 let knownKey=key();
 const reset=(reason='自动生图已关闭或重置')=>{pending=null;epoch++;if(active){active.reason??=reason;cancel();}};
 const handlers={
  GENERATION_STARTED(type,options={},dryRun=false){
   // Background generations and prompt previews do not replace the story.
   // Ignore them before touching the queued or running automatic job.
   if(dryRun||['quiet','impersonate'].includes(type))return;
   knownKey=key();reset('新的正文生成已开始');
   if(enabled())pending={key:key(),epoch,index:null};
  },
  MESSAGE_RECEIVED(index,type){if(pending&&type!=='first_message'&&Number.isInteger(index))pending.index=index;},
  // Once the story has ended, its late stop events do not own the image request.
  GENERATION_STOPPED:()=>{if(pending)reset('正文生成被停止');},
  CHAT_CHANGED:()=>{const next=key();if(next!==knownKey){knownKey=next;reset('聊天已切换');}else if(active?.valid&&!active.valid())reset(active.reason||'原文已变化');},
  GENERATION_ENDED(){
   const job=pending;pending=null;
   if(!job||job.index===null)return;
   schedule(async()=>{
    const current=context(),message=current.chat?.[job.index];
    if((!job.manual&&!enabled())||job.epoch!==epoch||job.key!==key()||!message||message.is_user||message.is_system||message.extra?.meow||!message.mes?.trim())return;
    if(isBusy()){report('本条自动生图已跳过：猫猫正在执行其他任务。');return;}
    const text=stripInline(message.mes),swipe=message.swipe_id??0;
    const valid=()=>{
     const latest=context().chat?.[job.index];
     const reason=!job.manual&&!enabled()?'自动生图已关闭':job.epoch!==epoch?(job.reason||'任务已重置'):job.key!==key()?'聊天已切换':!latest||latest.is_user||latest.is_system?'来源回复已删除或替换':(latest.swipe_id??0)!==swipe?'已切换回复分支':stripInline(latest.mes)!==text?'来源正文已变化':null;
     if(reason)job.reason??=reason;return !reason;
    };
    job.valid=valid;
    active=job;
    try{await generate(job.index,message,valid);}catch(error){report(`自动生图停止：${error.name==='AbortError'?`${job.reason||'任务被停止、请求超时或原文已变化'}；已发出的请求仍可能计费`:error.message}`);}finally{if(active===job)active=null;}
   });
  },
 };
 for(const [name,handler] of Object.entries(handlers)){const event=context().event_types[name];if(event)context().eventSource.on(event,handler);}
 function resend(index){
  if(pending||active||isBusy())throw new Error('请等待当前正文或猫猫任务结束后再发送。');
  const message=context().chat?.[index];
  if(!message||message.is_user||message.is_system||message.extra?.meow||!message.mes?.trim())throw new Error('找不到可重新发送的角色回复。');
  knownKey=key();pending={key:key(),epoch,index,manual:true};handlers.GENERATION_ENDED();
 }
 return {reset,handlers,resend};
}

// Literal paired delimiters; only balanced ranges are removed. Retain source offsets.
export function visibleAutoParts(text,pairs=[]){
 const ranges=[];
 for(const {start,end} of pairs){
  if(!start||!end||start===end)throw new Error('屏蔽标签需要填写不同的开始和结束标签。');
  let pos=0;const stack=[];
  while(pos<text.length){
   const a=text.indexOf(start,pos),b=text.indexOf(end,pos);
   if(a<0&&b<0)break;
   if(a>=0&&(b<0||a<b)){stack.push(a);pos=a+start.length;}
   else{const from=stack.pop();if(from!==undefined)ranges.push([from,b+end.length]);pos=b+end.length;}
  }
 }
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
 const result=[];let cursor=0;
 for(const [a,b] of merged){if(a>cursor&&text.slice(cursor,a).trim())result.push({text:text.slice(cursor,a),start:cursor});cursor=b;}
 if(text.slice(cursor).trim())result.push({text:text.slice(cursor),start:cursor});return result;
}

// Capture the current reply exactly as manual capture does, then apply only the
// automatic exclusions. Never read or modify the manual checkboxes/draft.
export function captureAutoContext(chat,index,rules,pairs=[]){
 const message=chat[index];if(!message)return [];
 const snapshot=stripInline(message.mes),visible=visibleAutoParts(snapshot,pairs);
 return captureContext(chat.slice(0,index+1),1,rules).flatMap(part=>{
  const start=part.anchorStart,end=start+part.text.length;
  const fragments=visible.map(range=>({start:Math.max(start,range.start),end:Math.min(end,range.start+range.text.length)})).filter(range=>range.end>range.start&&snapshot.slice(range.start,range.end).trim());
  return fragments.map((range,i)=>({...part,id:fragments.length===1?part.id:`${part.id}s${i}`,selected:true,text:snapshot.slice(range.start,range.end),anchorText:snapshot.slice(range.start,range.end),anchorStart:range.start}));
 });
}

export function mountAutoExclusions({root,settings,save,context}){
 const list=root.querySelector('#meow-auto-exclusions');settings.auto_exclusions??=[];
 const candidates=root.querySelector('#meow-auto-exclusion-candidates'),scanStatus=root.querySelector('#meow-auto-exclusion-status');
 let scanned=[];
 const summary=root.querySelector('#meow-auto-exclusion-summary');
 const sync=()=>{for(const input of candidates.querySelectorAll('input')){const pair=scanned[Number(input.dataset.pair)];input.checked=settings.auto_exclusions.some(p=>p.start===pair.start&&p.end===pair.end);}summary.textContent=`扫描标签（已选 ${scanned.filter(pair=>settings.auto_exclusions.some(p=>p.start===pair.start&&p.end===pair.end)).length} / ${scanned.length}）`;};
 const render=()=>{list.replaceChildren();settings.auto_exclusions.forEach((pair,index)=>{
  const row=document.createElement('div');row.className='meow-row';
  for(const [key,label] of [['start','开始标签'],['end','结束标签']]){
   const input=document.createElement('input');input.placeholder=key==='start'?'<状态栏>':'</状态栏>';input.setAttribute('aria-label',`${label} ${index+1}`);input.value=pair[key];input.addEventListener('input',()=>{pair[key]=input.value;save();sync();});row.append(input);
  }
  const remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.addEventListener('click',()=>{settings.auto_exclusions.splice(index,1);save();render();});row.append(remove);list.append(row);
 });sync();};
 root.querySelector('#meow-auto-exclusion-scan').addEventListener('click',()=>{
  candidates.replaceChildren();scanned=[];sync();
  const message=context().chat?.findLast(m=>!m.is_user&&!m.is_system&&!m.extra?.meow&&m.mes?.trim());
  if(!message){scanStatus.textContent='没有已有正文，请先生成一条角色回复。';return;}
  const found=detectAutoTags(stripInline(message.mes));
  scanStatus.textContent=found.length?'已扫描最近一条角色回复，勾选需要屏蔽的标签：':'已有正文中没有找到闭合标签，可以手动填写。';
  scanned=found;
  for(const [index,pair] of found.entries()){
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.pair=String(index);
   const matches=p=>p.start===pair.start&&p.end===pair.end;
   input.checked=settings.auto_exclusions.some(matches);
   input.addEventListener('change',()=>{if(input.checked&&!settings.auto_exclusions.some(matches))settings.auto_exclusions.push({...pair});else if(!input.checked)settings.auto_exclusions=settings.auto_exclusions.filter(p=>!matches(p));save();render();});
   const text=document.createElement('span');text.textContent=`${pair.start} … ${pair.end}`;label.append(input,text);candidates.append(label);
  }
  sync();
 });
 root.querySelector('#meow-auto-exclusion-add').addEventListener('click',()=>{settings.auto_exclusions.push({start:'',end:''});save();render();});render();
}

// Exclusion choices deliberately include nested pairs; manual capture stays outermost.
export function detectAutoTags(value){
 const text=String(value??''),pairs=[],seen=new Set();
 const ranges=balancedMessageTags(text).sort((a,b)=>a.a-b.a||b.b-a.b);
 for(const range of ranges){
  const pair={start:text.slice(range.a,range.openEnd),end:text.slice(range.closeStart,range.b)};
  const key=JSON.stringify(pair);if(!seen.has(key)){seen.add(key);pairs.push(pair);}
 }
 return pairs;
}
