export function galleryStore(scope){
    let promise;
    const db=()=>promise??=new Promise((resolve,reject)=>{
        const req=indexedDB.open('meow-gallery-v1',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'id'});
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const op=async(mode,action)=>new Promise(async(resolve,reject)=>{
        let database;try{database=await db();}catch(e){reject(e);return;}
        const tx=database.transaction('images',mode);let result;
        const request=action(tx.objectStore('images'));
        request.onsuccess=()=>{result=request.result;};
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    return {list:async()=> (await op('readonly',s=>s.getAll())).filter(x=>x.scope===scope).sort((a,b)=>b.created-a.created),
        put:entry=>op('readwrite',s=>s.put({...entry,scope})),remove:id=>op('readwrite',s=>s.delete(id))};
}
