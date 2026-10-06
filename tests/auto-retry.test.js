import test from 'node:test';
import assert from 'node:assert/strict';
import {retryAuto} from '../auto-retry.js';
test('retries are additional attempts and stop immediately after success',async()=>{
 let calls=0;const reports=[];
 assert.equal(await retryAuto(async()=>{if(++calls<3)throw new Error('network');return 'png';},{retries:2,delay:0,report:s=>reports.push(s)}),'png');
 assert.equal(calls,3);assert.equal(reports.length,2);
 calls=0;await assert.rejects(retryAuto(async()=>{calls++;throw new Error('failed');},{retries:0}),/failed/);assert.equal(calls,1);
 calls=0;await assert.rejects(retryAuto(async()=>{calls++;throw new Error('failed');},{retries:2,delay:0}),/failed/);assert.equal(calls,3);
});
test('stop during backoff prevents another paid request',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(retryAuto(async()=>{calls++;throw new Error('network');},{signal:controller.signal,retries:5,report:()=>controller.abort()}),{name:'AbortError'});
 assert.equal(calls,1);
});
test('attempt timeout retries without aborting the parent job',async()=>{
 const parent=new AbortController();let calls=0;
 const result=await retryAuto(async signal=>{if(++calls===2)return 'done';await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{signal:parent.signal,retries:1,timeout:5,delay:0});
 assert.equal(result,'done');assert.equal(parent.signal.aborted,false);
});
test('changed source prevents retry and AbortError is not retried',async()=>{
 let calls=0,valid=true;
 await assert.rejects(retryAuto(async()=>{calls++;valid=false;throw new Error('network');},{retries:5,check:()=>{if(!valid)throw new DOMException('changed','AbortError');}}),{name:'AbortError'});assert.equal(calls,1);
 calls=0;await assert.rejects(retryAuto(async()=>{calls++;throw new DOMException('stop','AbortError');},{retries:5}),{name:'AbortError'});assert.equal(calls,1);
});
