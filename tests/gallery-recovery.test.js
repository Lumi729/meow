import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { galleryStore } from '../storage.js';
import { chatGalleryCandidates, recoverChatGallery } from '../gallery-recovery.js';
const message = { mes:'正文',extra:{meow_inline:[{source:{anchorText:'正文',anchorStart:0},snapshot:'正文',variants:[{id:'kept',path:'/user/images/kept.png',payload:{seed:1},title:'旧图'},{id:'lost',path:'/user/images/lost.png',payload:{seed:2},title:'找回图',scene:{prompt:'blue eyes'}}]}]} };
const blob=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});

test('recovery reads only missing local files and keeps saved tags, originals and chat intact', async () => {
 globalThis.indexedDB = new IDBFactory();const store=galleryStore('recover');
 await store.put({id:'kept',src:'original',scene:{prompt:'saved edits'}});const before=JSON.stringify(message),calls=[],shown=[];
 const options={chat:[message],key:'chat',store,fetcher:async path=>{calls.push(path);return {ok:true,blob:async()=>blob()};},toDataURL:async(_,mime)=>{assert.equal(mime,'image/png');return 'data:image/png;base64,recovered';},onEntry:e=>shown.push(e)};
 const result=await recoverChatGallery(options);assert.equal(result.restored,1);assert.equal(result.existing,1);assert.equal(result.failed,0);assert.deepEqual(calls,['/user/images/lost.png']);
 assert.equal((await store.get('kept')).scene.prompt,'saved edits');assert.equal((await store.get('kept')).src,'original');assert.equal((await store.get('lost')).scene.prompt,'blue eyes');assert.equal((await store.get('lost')).source[0].messageIndex,0);
 assert.equal(JSON.stringify(message),before);assert.equal(shown.length,2);
 const again=await recoverChatGallery(options);assert.equal(again.restored,0);assert.equal(again.existing,2);assert.equal(calls.length,1);
});

test('missing files, non-images and unsafe URLs never become saved originals', async () => {
 globalThis.indexedDB = new IDBFactory();const store=galleryStore('fail');const chat=structuredClone([message]);
 chat[0].extra.meow_inline[0].variants.push({id:'remote',path:'https://outside.test/image.png',payload:{}});
 assert.equal(chatGalleryCandidates(chat,'c').length,2);
 const result=await recoverChatGallery({chat,key:'c',store,fetcher:async path=>path.includes('kept')?{ok:false,status:404}:{ok:true,blob:async()=>new Blob(['login page'])}});
 assert.equal(result.failed,2);assert.equal((await store.list()).length,0);
 const controller=new AbortController();controller.abort();await assert.rejects(recoverChatGallery({chat,key:'c',store,signal:controller.signal}),{name:'AbortError'});
});
