// Retry one remote stage, never the whole batch or successful pictures.
export async function retryAuto(task,{retries=0,signal,check=()=>{},report=()=>{},label='请求',timeout=120000,delay=2000}={}){
 retries=Math.min(5,Math.max(0,Math.trunc(Number(retries)||0)));
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();check();
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
  try{return await task(controller.signal);}catch(error){
   signal?.throwIfAborted();check();
   if(timedOut)error=new Error(`${label}等待超时`);
   if(error.name==='AbortError'||attempt>=retries)throw error;
   report(`${label}失败，${delay/1000} 秒后重试（${attempt+1}/${retries}）`);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  await new Promise((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(signal.reason);};
   const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  });
 }
}
