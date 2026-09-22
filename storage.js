export function galleryStore(scope){
 let promise;
 const db=()=>promise??=new Promise((resolve,reject)=>{
  const req=indexedDB.open('meow-gallery-v1',1);
  const timer=setTimeout(()=>reject(new Error('图库打开超时')),10000);
  req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'id'});
  req.onsuccess=()=>{clearTimeout(timer);resolve(req.result);};
  req.onerror=()=>{clearTimeout(timer);reject(req.error);};
  req.onblocked=()=>{clearTimeout(timer);reject(new Error('图库被其他页面占用'));};
 }).catch(error=>{promise=null;throw error;});
 const op=async(mode,action)=>{
  const database=await db();
  return new Promise((resolve,reject)=>{
   let tx,timer;
   const fail=error=>{clearTimeout(timer);reject(error||new Error('图库存储失败'));};
   try{
    tx=database.transaction('images',mode);let result;
    timer=setTimeout(()=>{try{tx.abort();}catch{}fail(new Error('图库操作超时'));},10000);
    tx.oncomplete=()=>{clearTimeout(timer);resolve(result);};
    tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error);
    const request=action(tx.objectStore('images'));request.onsuccess=()=>{result=request.result;};request.onerror=()=>fail(request.error);
   }catch(error){fail(error);}
  });
 };
 return {list:async()=>(await op('readonly',s=>s.getAll())).filter(x=>x.scope===scope).sort((a,b)=>b.created-a.created),put:entry=>op('readwrite',s=>s.put({...entry,scope})),remove:id=>op('readwrite',s=>s.delete(id))};
}
