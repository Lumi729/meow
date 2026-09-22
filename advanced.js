/** Official NovelAI JSON transport, for parameters the ST bridge cannot forward. */
export function directRequest(payload, extraText='{}', model=''){
 let extra;try{extra=JSON.parse(extraText||'{}');}catch{throw new Error('高级参数必须是有效 JSON。');}
 if(!extra||typeof extra!=='object'||Array.isArray(extra))throw new Error('高级 parameters 必须是对象。');
 for(const key of ['__proto__','constructor','prototype','Authorization','token','api_key','url'])if(Object.hasOwn(extra,key))throw new Error(`高级参数不允许 ${key}。`);
 const params={params_version:3,width:payload.width,height:payload.height,steps:payload.steps,scale:payload.scale,seed:payload.seed,
  sampler:payload.sampler,noise_schedule:payload.scheduler,n_samples:1,negative_prompt:payload.negative_prompt,
  qualityToggle:false,ucPreset:0,sm:payload.sm,sm_dyn:payload.sm_dyn,dynamic_thresholding:payload.decrisper,
  deliberate_euler_ancestral_bug:false,prefer_brownian:true,
  v4_prompt:{caption:{base_caption:payload.prompt,char_captions:[]},use_coords:false,use_order:true},
  v4_negative_prompt:{caption:{base_caption:payload.negative_prompt,char_captions:[]}},...extra};
 if(payload.upscale_ratio!==1||payload.variety_boost)throw new Error('官网直连请关闭酒馆放大和 Variety Boost；需要时使用官网对应参数。');
 // The batch UI controls sample count; preserve fixed prompt composition in both caption formats.
 Object.assign(params,{width:payload.width,height:payload.height,steps:payload.steps,scale:payload.scale,seed:payload.seed,sampler:payload.sampler,noise_schedule:payload.scheduler,n_samples:1,negative_prompt:payload.negative_prompt});
 for(const key of ['v4_prompt','v4_negative_prompt']){
  if(params[key]!==undefined){if(!params[key]||typeof params[key]!=='object'||Array.isArray(params[key]))throw new Error(`${key} 必须是对象。`);
   params[key]={...params[key],caption:{...params[key].caption,base_caption:key==='v4_prompt'?payload.prompt:payload.negative_prompt}};}
 }
 const modelId=model.trim()||payload.model;
 if(!/^[a-zA-Z0-9_.-]+$/.test(modelId))throw new Error('模型 API 标识格式不正确。');
 return {action:'generate',input:payload.prompt,model:modelId,parameters:params};
}
export async function requestDirect(body,token,signal,fetcher=fetch){
 if(!token)throw new Error('官网直连需要在本次页面中重新填写并保存 NovelAI Token；不会从服务器回读密钥。');
 let r;try{r=await fetcher('https://image.novelai.net/ai/generate-image',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal});}catch(e){if(e.name==='AbortError')throw e;throw new Error('官网直连失败：请检查网络或浏览器跨域限制。可切回酒馆通道使用基础参数。');}
 if(!r.ok)throw new Error(`NovelAI 返回 HTTP ${r.status}，请检查参数、密钥和余额。`);
 const raw=await r.json();const image=raw.images?.[0]?.image;
 if(typeof image!=='string'||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image))throw new Error('官网没有返回预期的 JSON PNG 图像。');
 return `data:image/png;base64,${image}`;
}
