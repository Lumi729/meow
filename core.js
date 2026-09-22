export const MODELS = Object.freeze({
    'nai-diffusion-4-5-full': 'V4.5 Full', 'nai-diffusion-4-5-curated': 'V4.5 Curated',
    'nai-diffusion-4-full': 'V4 Full', 'nai-diffusion-4-curated-preview': 'V4 Curated',
    'nai-diffusion-3': 'Anime V3', 'nai-diffusion-furry-3': 'Furry V3', 'nai-diffusion-2': 'Anime V2',
});
export const SAMPLERS = ['k_euler_ancestral','k_euler','k_dpmpp_2m','k_dpmpp_sde','k_dpmpp_2s_ancestral','k_dpm_fast','ddim'];
export const SCHEDULERS = ['karras','native','exponential','polyexponential'];
export const DEFAULTS = Object.freeze({ model:'nai-diffusion-4-5-full', prompt:'', fixed_positive:'', negative_prompt:'', extra_negative:'', width:832, height:1216, steps:28, scale:5, seed:-1, sampler:'k_euler_ancestral', scheduler:'karras', decrisper:false, variety_boost:false, sm:false, sm_dyn:false, upscale_ratio:1, anlas_guard:true });
export const combine = (...parts) => parts.map(x=>String(x ?? '').trim()).filter(Boolean).join(', ');
export function numberIn(value, min, max, label, integer=true) {
    if (String(value).trim()==='') throw new Error(`${label} 不能为空。`);
    const n=Number(value);
    if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))) throw new Error(`${label} 需要在 ${min}–${max} 之间${integer?'的整数':''}。`);
    return n;
}
export function buildRequest(settings, randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0]) {
    const s={...DEFAULTS,...settings};
    const prompt=combine(s.fixed_positive,s.prompt);
    if(!prompt) throw new Error('先写一点画面描述吧。');
    if(!Object.hasOwn(MODELS,s.model)) throw new Error('请选择已核对的模型。');
    if(!SAMPLERS.includes(s.sampler)||!SCHEDULERS.includes(s.scheduler)) throw new Error('采样器或噪声计划不受支持。');
    const width=numberIn(s.width,64,2048,'宽度'), height=numberIn(s.height,64,2048,'高度');
    if(width%64||height%64) throw new Error('尺寸须为 64 的倍数。');
    const steps=numberIn(s.steps,1,50,'步数');
    if(s.anlas_guard && (width*height>1048576||steps>28||Number(s.upscale_ratio)>1)) throw new Error('节省模式限制 28 步、1,048,576 像素且不放大；需要更高配置请关闭节省模式（可能额外计费）。');
    const seed=numberIn(s.seed,-1,4294967295,'种子');
    const supportsSm=!s.model.includes('diffusion-4')&&s.sampler!=='ddim';
    if((s.sm||s.sm_dyn)&&!supportsSm) throw new Error('SMEA 仅在 V2/V3 且非 DDIM 时启用，请关闭 SMEA。');
    if(s.sm_dyn&&!s.sm) throw new Error('SMEA DYN 需要同时开启 SMEA。');
    return {prompt,negative_prompt:combine(s.negative_prompt,s.extra_negative),model:s.model,width,height,steps,
        scale:numberIn(s.scale,0,10,'引导',false), seed:seed===-1?randomSeed():seed,sampler:s.sampler,scheduler:s.scheduler,
        upscale_ratio:numberIn(s.upscale_ratio,1,4,'放大倍数'),decrisper:!!s.decrisper,variety_boost:!!s.variety_boost,sm:!!s.sm,sm_dyn:!!s.sm_dyn};
}
export async function requestImage(payload,headers,signal,fetcher=fetch){
    const r=await fetcher('/api/novelai/generate-image',{method:'POST',headers,signal,body:JSON.stringify(payload)});
    if(!r.ok) throw new Error(`生图失败（HTTP ${r.status}）。请检查 Token、Anlas、参数及酒馆日志；不会自动重试。`);
    const data=(await r.text()).trim();
    if(!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('服务器未返回有效的 PNG 图片。');
    return `data:image/png;base64,${data}`;
}
export function cleanPreset(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('配置必须是 JSON 对象。');
    const source=raw.settings??raw;
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k,v])=>[k,typeof source[k]===typeof v?source[k]:v]));
}
