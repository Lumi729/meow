// Browser-local credentials are separate from extension settings, profiles and image exports.
export function tokenVault(scope){
 const access=(mode,value)=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('meow-local-credentials',1);let db;const timer=setTimeout(()=>{db?.close();reject(new Error('本地凭证存储超时'));},5000);
  const fail=()=>{clearTimeout(timer);db?.close();reject(new Error('本地凭证存储不可用'));};
  req.onupgradeneeded=()=>req.result.createObjectStore('tokens');req.onerror=fail;req.onblocked=fail;
  req.onsuccess=()=>{db=req.result;const tx=db.transaction('tokens',mode),store=tx.objectStore('tokens');const op=mode==='readonly'?store.get(scope):value===null?store.delete(scope):store.put(value,scope);let result;op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{clearTimeout(timer);db.close();resolve(typeof result==='string'?result:'');};tx.onerror=fail;tx.onabort=fail;};
 });
 return {get:()=>access('readonly'),set:value=>access('readwrite',value),clear:()=>access('readwrite',null)};
}
