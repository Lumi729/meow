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
 assert.deepEqual(detectAutoTags('<正文>a<状态栏>secret</状态栏></正文><状态栏>x</状态栏><open>'),[{start:'<状态栏>',end:'</状态栏>'},{start:'<正文>',end:'</正文>'}]);
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
 h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);h.CHAT_CHANGED();await finish();assert.equal(calls,1);
 busy=true;h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);await finish();assert.equal(calls,1);
 busy=false;h.GENERATION_STARTED('normal');h.MESSAGE_RECEIVED(0);enabled=false;await finish();assert.equal(calls,1);
});
