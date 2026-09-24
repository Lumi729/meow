// Browser-local credentials stay outside extension settings and exports.
// Both stores are scoped to the same user profile; never search other profiles.
export function tokenVault(scope){
 const key=`meow:novelai-token:${scope}`;
 const access=(mode,value)=>new Promise((resolve,reject)=>{
  let db,tx,finished=false;
  const finish=(error,result='')=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(new Error('本地凭证存储超时'));},5000);
  try{
   const req=indexedDB.open('meow-local-credentials',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('tokens');
   req.onerror=req.onblocked=()=>finish(new Error('本地凭证存储不可用'));
   req.onsuccess=()=>{
    db=req.result;if(finished){db.close();return;}
    try{
     tx=db.transaction('tokens',mode);const store=tx.objectStore('tokens');
     const op=mode==='readonly'?store.get(scope):store.put(value,scope);let result='';
     op.onsuccess=()=>{result=typeof op.result==='string'?op.result:'';};
     tx.oncomplete=()=>finish(null,result);
     tx.onerror=tx.onabort=()=>finish(new Error('本地凭证存储不可用'));
    }catch{finish(new Error('本地凭证存储不可用'));}
   };
  }catch{finish(new Error('本地凭证存储不可用'));}
 });
 const get=async()=>{
  // An empty string is a tombstone: never resurrect an older IndexedDB token.
  try{const value=localStorage.getItem(key);if(value!==null)return value;}catch{}
  return access('readonly');
 };
 const set=async value=>{
  let localSaved=false;
  try{localStorage.setItem(key,value);localSaved=localStorage.getItem(key)===value;}catch{}
  try{
   await access('readwrite',value);
   if(await access('readonly')!==value)throw new Error('凭证读回校验失败');
   // If the backup exists but failed to update, it must not mask the new value.
   if(!localSaved){try{const stale=localStorage.getItem(key);if(stale!==null&&stale!==value){localStorage.removeItem(key);if(localStorage.getItem(key)!==null)throw new Error();}}catch{throw new Error('备用凭证未能更新');}}
  }catch{if(!localSaved)throw new Error('浏览器未能保存直连 Token：请检查网站存储权限；当前页面仍可使用，重新打开后需再填写。');}
 };
 return {get,set,clear:()=>set('')};
}
