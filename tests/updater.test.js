import test from 'node:test';
import assert from 'node:assert/strict';
import {updateSelf} from '../updater.js';
test('updates only its own local/global folder and saves before refreshing',async()=>{
 for(const type of ['local','global']){
  const calls=[],events=[];
  await updateSelf('third-party/meow',{},async()=>events.push('save'),()=>events.push('reload'),async(url,options)=>{
   calls.push(url);
   if(url.endsWith('discover'))return new Response(JSON.stringify([{name:'third-party/other',type:'local'},{name:'third-party/meow',type}]));
   assert.deepEqual(JSON.parse(options.body),{extensionName:'meow',global:type==='global'});
   return new Response(JSON.stringify({shortCommitHash:'abc1234',isUpToDate:false}));
  });
  assert.deepEqual(calls,['/api/extensions/discover','/api/extensions/update']);assert.deepEqual(events,['save','save','reload']);
 }
});
test('failed update does not reload or retry',async()=>{
 let reloaded=false,calls=0;
 await assert.rejects(updateSelf('third-party/meow',{},async()=>{},()=>reloaded=true,async url=>{calls++;return url.endsWith('discover')?new Response(JSON.stringify([{name:'third-party/meow',type:'local'}])):new Response('failed',{status:500});}),/更新失败/);
 assert.equal(reloaded,false);assert.equal(calls,2);
});
