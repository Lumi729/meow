import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleAutoParts,detectAutoTags,mountAutoDraw} from '../auto-draw.js';
test('balanced exclusions preserve offsets, nesting, repeats and unmatched text',()=>{
 const text='a<x>secret<x>nested</x></x>b<x>other</x>c<x>open';
 const parts=visibleAutoParts(text,[{start:'<x>',end:'</x>'}]);
 assert.equal(parts.map(p=>p.text).join(''),'abc<x>open');
 for(const p of parts)assert.equal(text.slice(p.start,p.start+p.text.length),p.text);
 assert.deepEqual(visibleAutoParts('<x>all</x>',[{start:'<x>',end:'</x>'}]),[]);
 assert.throws(()=>visibleAutoParts('text',[{start:'',end:''}]));
 assert.deepEqual(detectAutoTags('<正文>a<状态栏>secret</状态栏></正文><状态栏>x</状态栏><open>'),[{start:'<正文>',end:'</正文>'},{start:'<状态栏>',end:'</状态栏>'}]);
 assert.deepEqual(detectAutoTags('plain'),[]);
});
test('automatic pipeline only runs once after completed output; cancellation and busy skip',async()=>{
 let enabled=true,busy=false,calls=0,cancelled=0;const queue=[],ctx={chat:[{mes:'body'}],getCurrentChatId:()=> 'chat',event_types:{},eventSource:{on(){}}};
 const {handlers:h}=mountAutoDraw({context:()=>ctx,enabled:()=>enabled,isBusy:()=>busy,generate:async()=>{calls++;},cancel:()=>cancelled++,report:()=>{},schedule:fn=>queue.push(fn)});
 const finish=async()=>{h.GENERATION_ENDED();while(queue.length)await queue.shift()();};
 h.MESSAGE_RECEIVED(0);await finish();assert.equal(calls,0);
 h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);await finish();await finish();assert.equal(calls,1);
 h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.GENERATION_STOPPED();await finish();assert.equal(calls,1);
 h.GENERATION_STARTED('quiet');h.MESSAGE_RECEIVED(0);await finish();assert.equal(calls,1);
 h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.GENERATION_STOPPED();await finish();assert.equal(calls,1);
 busy=true;h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);await finish();assert.equal(calls,1);
 busy=false;h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);enabled=false;await finish();assert.equal(calls,1);
});

test('exclusion scan includes nested and HTML pairs but ignores code and comments',()=>{
 const text='<div><正文>body<strong>bold</strong><opt id="1">choice</opt></正文></div>'
 +'<状态栏><opt id="2">nested</opt></状态栏><状态栏>again</状态栏>'
 +'<!-- <commented>no</commented> -->'+'```xml\n<example>no</example>\n```'
 +'<script>const s="<fake>no</fake>";</script><style><fake>no</fake></style>'
 +'<p>paragraph</p><button>button</button><unclosed>';
 assert.deepEqual(detectAutoTags(text).map(p=>p.start),['<div>','<正文>','<strong>','<opt id="1">','<状态栏>','<opt id="2">','<p>','<button>']);
 assert.deepEqual(detectAutoTags('<Arc role="selection_only"><opt id="1">one</opt><opt id="2">two</opt></Arc>'),[{start:'<Arc role="selection_only">',end:'</Arc>'},{start:'<opt id="1">',end:'</opt>'},{start:'<opt id="2">',end:'</opt>'}]);
 assert.deepEqual(detectAutoTags('<x><x>nested</x></x><x>repeat</x>'),[{start:'<x>',end:'</x>'}]);
 assert.deepEqual(detectAutoTags('~~~xml\n<demo>x</demo>\n~~~'),[]);
});

for(const [type,dryRun] of [['quiet',false],['impersonate',false],['normal',true]]){
 test(`background ${type} (dryRun=${dryRun}) preserves queued and running drawings`,async()=>{
  const queue=[];let calls=0,cancelled=0,valid,release;
  const ctx={chat:[{mes:'body'}],getCurrentChatId:()=> 'chat',event_types:{},eventSource:{on(){}}};
  const {handlers:h}=mountAutoDraw({context:()=>ctx,enabled:()=>true,isBusy:()=>false,
   generate:async(i,m,v)=>{calls++;valid=v;await new Promise(resolve=>release=resolve);},
   cancel:()=>cancelled++,report:()=>{},schedule:fn=>queue.push(fn)});
  h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.GENERATION_ENDED();
  h.GENERATION_STARTED(type,{},dryRun);h.GENERATION_ENDED();
  assert.equal(queue.length,1);
  const running=queue.shift()();
  assert.equal(calls,1);
  try{
   h.GENERATION_STARTED(type,{},dryRun);h.GENERATION_ENDED();
   assert.equal(cancelled,0);assert.equal(valid(),true);assert.equal(queue.length,0);
  }finally{release();await running;}
 });
}
for(const [event,args,reason] of [
 ['GENERATION_STARTED',['normal'],'新的正文生成已开始'],

 ['reset',[],'自动生图已关闭或重置'],
]){
 test(`${event} still cancels an active drawing and explains why`,async()=>{
  const queue=[],reports=[];let valid,release,cancelled=0;
  const ctx={chat:[{mes:'body'}],getCurrentChatId:()=> 'chat',event_types:{},eventSource:{on(){}}};
  const mounted=mountAutoDraw({context:()=>ctx,enabled:()=>true,isBusy:()=>false,
   generate:async(i,m,v)=>{valid=v;await new Promise(resolve=>release=resolve);throw new DOMException('cancelled','AbortError');},
   cancel:()=>cancelled++,report:message=>reports.push(message),schedule:fn=>queue.push(fn)});
  const h=mounted.handlers;
  h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.GENERATION_ENDED();
  const running=queue.shift()();
  try{
   (event==='reset'?mounted.reset:h[event])(...args);
   assert.equal(cancelled,1);assert.equal(valid(),false);
  }finally{release();await running;}
  assert.ok(reports[0].includes(reason));
 });
}

test('late stop and identical chat reload keep active request; real edits and switches invalidate it',async()=>{
 const queue=[];let release,valid,cancelled=0,chatId='chat';
 const ctx={chat:[{mes:'body',swipe_id:0}],getCurrentChatId:()=>chatId,event_types:{},eventSource:{on(){}}};
 const {handlers:h}=mountAutoDraw({context:()=>ctx,enabled:()=>true,isBusy:()=>false,generate:async(i,m,v)=>{valid=v;await new Promise(r=>release=r);},cancel:()=>cancelled++,report:()=>{},schedule:fn=>queue.push(fn)});
 h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.GENERATION_ENDED();const running=queue.shift()();
 try{
  h.GENERATION_STOPPED();assert.equal(cancelled,0);assert.equal(valid(),true);
  ctx.chat=structuredClone(ctx.chat);h.CHAT_CHANGED();assert.equal(cancelled,0);assert.equal(valid(),true);
  ctx.chat[0].mes='edited';assert.equal(valid(),false);ctx.chat[0].mes='body';
  ctx.chat[0].swipe_id=1;assert.equal(valid(),false);ctx.chat[0].swipe_id=0;
  chatId='different';h.CHAT_CHANGED();assert.equal(cancelled,1);assert.equal(valid(),false);
 }finally{release();await running;}
});

test('manual resend works with automatic switch off and rejects busy jobs',async()=>{
 const queue=[];let calls=0,busy=false;
 const ctx={chat:[{mes:'body'}],getCurrentChatId:()=> 'chat',event_types:{},eventSource:{on(){}}};
 const app=mountAutoDraw({context:()=>ctx,enabled:()=>false,isBusy:()=>busy,generate:async(i,m,valid)=>{assert.equal(valid(),true);calls++;},cancel(){},report(){},schedule:fn=>queue.push(fn)});
 app.resend(0);await queue.shift()();assert.equal(calls,1);
 busy=true;assert.throws(()=>app.resend(0),/等待/);busy=false;
 assert.throws(()=>app.resend(1),/找不到/);
});
