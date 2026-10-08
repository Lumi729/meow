import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { galleryStore } from '../storage.js';

test('cursor reading preserves the v1 database and scopes; recovery never overwrites originals', async () => {
 globalThis.indexedDB = new IDBFactory();
 const a = galleryStore('a'), b = galleryStore('b');
 await a.put({ id:'original',src:'original bytes',created:2,scene:{prompt:'edited'} });
 await b.put({ id:'other',src:'other bytes',created:3 });
 await a.put({ id:'first',src:'first bytes',created:1 });
 const getAll = IDBObjectStore.prototype.getAll;
 IDBObjectStore.prototype.getAll = () => { throw new Error('bulk read must not be used'); };
 let progress = [];
 try { const entries = await a.list({onProgress:(partial,scanned)=>progress.push([partial.length,scanned])}); assert.deepEqual(entries.map(e=>e.id),['original','first']); }
 finally { IDBObjectStore.prototype.getAll = getAll; }
 assert.ok(progress.length >= 2); assert.deepEqual(progress.at(-1),[2,3]);
 const duplicate = await a.putIfAbsent({ id:'original',src:'replacement' }); assert.equal(duplicate.added,false); assert.equal(duplicate.entry.scene.prompt,'edited');
 await assert.rejects(a.putIfAbsent({id:'other',src:'replacement'}), /另一个图库分组/);
 assert.equal((await b.get('other')).src,'other bytes'); assert.equal(await a.get('other'),undefined);
 assert.equal((await a.putIfAbsent({id:'restored',src:'recovered',created:4})).added,true);
 assert.equal((await a.get('original')).src,'original bytes'); assert.equal((await a.list()).length,3);
});

test('a progressing cursor may take longer than the idle timeout', async () => {
 // Simulate slow per-record disk callbacks, without depending on browser scheduling.
 let opens = 0, closed = 0;
 const database = {close(){closed++;},transaction(){
  const tx = {abort(){tx.onabort?.();},objectStore(){return {openCursor(){
   const req = {}; let i = 0;
   const next = () => setTimeout(()=>{req.result = i < 5 ? { value:{id:String(i++),scope:'slow',created:i},continue:next } : null;req.onsuccess();if(!req.result)setTimeout(()=>tx.oncomplete?.(),0);},30);
   next();return req;
  }};}};return tx;
 }};
 globalThis.indexedDB = {open(){opens++;const req={result:database};setTimeout(()=>req.onsuccess(),0);return req;}};
 const start=Date.now();const result=await galleryStore('slow',{timeoutMs:100}).list();
 assert.equal(result.length,5);assert.ok(Date.now()-start>100);assert.equal(opens,1);assert.equal(closed,0);
});

test('stalled transaction times out without clearing data and reopens on retry', async () => {
 let opens=0, closes=0, aborted=0, requests=0;
 const database={close(){closes++;},transaction(){const tx={abort(){aborted++;},objectStore(){return {openCursor(){const req={};if(++requests>1)setTimeout(()=>{req.result=null;req.onsuccess();tx.oncomplete();},0);return req;}};}};return tx;}};
 globalThis.indexedDB={open(){opens++;const req={result:database};setTimeout(()=>req.onsuccess(),0);return req;}};
 const store=galleryStore('x',{timeoutMs:30});await assert.rejects(store.list(),/已有图片未删除/);assert.equal(aborted,1);assert.equal(closes,1);
 assert.deepEqual(await store.list(),[]);assert.equal(opens,2);
});
