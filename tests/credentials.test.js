import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { tokenVault } from '../credentials.js';
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
globalThis.indexedDB=indexedDB;
test('saved token survives a new instance even when IndexedDB is unavailable; profiles stay isolated',async()=>{
 await tokenVault('reload').set('fake-token');
 globalThis.indexedDB={open(){throw new Error('blocked');}};
 try{assert.equal(await tokenVault('reload').get(),'fake-token');await assert.rejects(tokenVault('other').get());
 await tokenVault('fallback').set('fallback-token');assert.equal(await tokenVault('fallback').get(),'fallback-token');
 await tokenVault('reload').clear();}finally{globalThis.indexedDB=indexedDB;}
 assert.equal(await tokenVault('reload').get(),'');
});
test('legacy IndexedDB token remains readable and can be cleared',async()=>{
 await tokenVault('legacy').set('legacy-token');values.delete('meow:novelai-token:legacy');
 assert.equal(await tokenVault('legacy').get(),'legacy-token');await tokenVault('legacy').clear();assert.equal(await tokenVault('legacy').get(),'');
});
test('failure of both stores reports persistence failure without exposing token',async()=>{
 const storage=globalThis.localStorage;globalThis.localStorage={getItem(){throw Error();},setItem(){throw Error();}};globalThis.indexedDB={open(){throw Error();}};
 try{await assert.rejects(tokenVault('blocked').set('do-not-echo'),e=>!e.message.includes('do-not-echo')&&e.message.includes('未能保存'));await assert.rejects(tokenVault('blocked').get());}
 finally{globalThis.localStorage=storage;globalThis.indexedDB=indexedDB;}
});
