export async function updateSelf(folder,headers,save,reload,fetcher=fetch){
 if(!/^third-party\/[^/]+$/.test(folder))throw new Error('无法识别 Meow 安装目录，请从扩展管理更新。');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const discovery=await fetcher('/api/extensions/discover',{headers,signal:controller.signal});
  if(!discovery.ok)throw new Error('无法读取扩展安装信息。');
  const entries=await discovery.json();
  const own=Array.isArray(entries)?entries.find(e=>e.name===folder&&['local','global'].includes(e.type)):null;
  if(!own)throw new Error('未找到 Meow 安装信息，请从扩展管理更新。');
  await save();
  const response=await fetcher('/api/extensions/update',{method:'POST',headers,signal:controller.signal,body:JSON.stringify({extensionName:folder.slice('third-party/'.length),global:own.type==='global'})});
  if(!response.ok)throw new Error(`Meow 更新失败（HTTP ${response.status}），请查看酒馆日志；页面未刷新。`);
  const data=await response.json();
  if(typeof data.shortCommitHash!=='string'||typeof data.isUpToDate!=='boolean')throw new Error('更新结果无效，页面未刷新。');
  await save();reload();
 }catch(error){if(error.name==='AbortError')throw new Error('等待更新超时，服务器可能仍在更新；请稍后在扩展管理查看结果。');throw error;}
 finally{clearTimeout(timer);}
}

/** Asks the SillyTavern server (git fetch) whether a newer Meow exists; the version label comes from GitHub when reachable. */
export async function checkUpdate(folder,headers,fetcher=fetch,manifestUrl='https://raw.githubusercontent.com/Lumi729/meow/main/manifest.json'){
 if(!/^third-party\/[^/]+$/.test(folder))return {known:false};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const discovery=await fetcher('/api/extensions/discover',{headers,signal:controller.signal});
  const entries=discovery.ok?await discovery.json():[];
  const own=Array.isArray(entries)?entries.find(e=>e.name===folder):null;
  const r=await fetcher('/api/extensions/version',{method:'POST',headers,signal:controller.signal,body:JSON.stringify({extensionName:folder.slice('third-party/'.length),global:own?.type==='global'})});
  if(!r.ok)return {known:false};
  const data=await r.json();if(typeof data.isUpToDate!=='boolean')return {known:false};
  let latest='';if(!data.isUpToDate){try{const m=await fetcher(manifestUrl,{cache:'no-store',signal:controller.signal});if(m.ok)latest=String((await m.json()).version||'');}catch{}}
  return {known:true,upToDate:data.isUpToDate,latest,commit:String(data.currentCommitHash||'').slice(0,7)};
 }catch{return {known:false};}
 finally{clearTimeout(timer);}
}
