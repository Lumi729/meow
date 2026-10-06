import { stripInline } from './inline.js';
// Only new, completed assistant generations can start an automatic paid job.
export function mountAutoDraw({context,enabled,isBusy,generate,cancel,report,schedule=fn=>setTimeout(fn,0)}){
 let pending=null,active=false,epoch=0;
 const key=()=>JSON.stringify([context().groupId,context().characterId,context().getCurrentChatId()]);
 const reset=()=>{pending=null;epoch++;if(active)cancel();};
 const handlers={
  GENERATION_STARTED(type,options={},dryRun=false){reset();if(enabled()&&!dryRun&&!['quiet','impersonate'].includes(type))pending={key:key(),epoch,index:null};},
  MESSAGE_RECEIVED(index,type){if(pending&&type!=='first_message'&&Number.isInteger(index))pending.index=index;},
  GENERATION_STOPPED:reset,
  CHAT_CHANGED:reset,
  GENERATION_ENDED(){
   const job=pending;pending=null;
   if(!job||job.index===null)return;
   schedule(async()=>{
    const current=context(),message=current.chat?.[job.index];
    if(!enabled()||job.epoch!==epoch||job.key!==key()||!message||message.is_user||message.is_system||message.extra?.meow||!message.mes?.trim())return;
    if(isBusy()){report('本条自动生图已跳过：猫猫正在执行其他任务。');return;}
    const text=message.mes;
    const valid=()=>enabled()&&job.epoch===epoch&&job.key===key()&&context().chat?.[job.index]===message&&message.mes===text;
    active=true;
    try{await generate(job.index,message,valid);}catch(error){report(`自动生图停止：${error.name==='AbortError'?'已取消，已发出的请求仍可能计费':error.message}`);}finally{active=false;}
   });
  },
 };
 for(const [name,handler] of Object.entries(handlers)){const event=context().event_types[name];if(event)context().eventSource.on(event,handler);}
 return {reset,handlers};
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

export function mountAutoExclusions({root,settings,save,context}){
 const list=root.querySelector('#meow-auto-exclusions');settings.auto_exclusions??=[];
 const candidates=root.querySelector('#meow-auto-exclusion-candidates'),scanStatus=root.querySelector('#meow-auto-exclusion-status');
 const render=()=>{list.replaceChildren();settings.auto_exclusions.forEach((pair,index)=>{
  const row=document.createElement('div');row.className='meow-row';
  for(const [key,label] of [['start','开始标签'],['end','结束标签']]){
   const input=document.createElement('input');input.placeholder=key==='start'?'<状态栏>':'</状态栏>';input.setAttribute('aria-label',`${label} ${index+1}`);input.value=pair[key];input.addEventListener('input',()=>{pair[key]=input.value;save();});row.append(input);
  }
  const remove=document.createElement('button');remove.type='button';remove.textContent='删除';remove.addEventListener('click',()=>{settings.auto_exclusions.splice(index,1);save();render();});row.append(remove);list.append(row);
 });};
 root.querySelector('#meow-auto-exclusion-scan').addEventListener('click',()=>{
  candidates.replaceChildren();
  const message=context().chat?.findLast(m=>!m.is_user&&!m.is_system&&!m.extra?.meow&&m.mes?.trim());
  if(!message){scanStatus.textContent='没有已有正文，请先生成一条角色回复。';return;}
  const found=detectAutoTags(stripInline(message.mes));
  scanStatus.textContent=found.length?'已扫描最近一条角色回复，勾选需要屏蔽的标签：':'已有正文中没有找到闭合标签，可以手动填写。';
  for(const pair of found){
   const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';
   const matches=p=>p.start===pair.start&&p.end===pair.end;
   input.checked=settings.auto_exclusions.some(matches);
   input.addEventListener('change',()=>{if(input.checked&&!settings.auto_exclusions.some(matches))settings.auto_exclusions.push({...pair});else if(!input.checked)settings.auto_exclusions=settings.auto_exclusions.filter(p=>!matches(p));save();render();});
   label.append(input,document.createTextNode(`${pair.start} … ${pair.end}`));candidates.append(label);
  }
 });
 root.querySelector('#meow-auto-exclusion-add').addEventListener('click',()=>{settings.auto_exclusions.push({start:'',end:''});save();render();});render();
}

export function detectAutoTags(text){
 const stack=[],pairs=[],seen=new Set();
 const tokens=/<(\/?)([\p{L}_][\p{L}\p{N}_.:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*?)?\s*(\/?)>/gu;
 for(const match of text.matchAll(tokens)){
  const [raw,closing,name,self]=match;if(self)continue;
  if(!closing){stack.push({name,start:raw});continue;}
  const index=stack.findLastIndex(item=>item.name===name);if(index<0)continue;
  const pair={start:stack[index].start,end:raw};stack.length=index;
  const key=JSON.stringify(pair);if(!seen.has(key)){seen.add(key);pairs.push(pair);}
 }
 return pairs;
}
