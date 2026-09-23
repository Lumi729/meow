/** App-level scene format; only validated caption fields become NovelAI parameters. */
export const CHARACTER_INSTRUCTIONS = '为每幅图返回 characters 数组（最多 6 人，无人物时 []）。每项为 {"name":"人物名","prompt":"English character tags","negative_prompt":"English negative tags","x":0.25,"y":0.5}。prompt/negative_prompt 是该人物专属描述，不要混入其他人的特征；场景总 prompt 写人数、背景、构图。x/y 为 0–1 的画面位置，x 从左到右，y 从上到下。正负角色顺序必须一致。不得返回 Token、地址或其他 API 参数。';
export function validateCharacters(value){
 if(!Array.isArray(value)||value.length>6)throw new Error('characters 必须是最多 6 人的数组。');
 return value.map((c,i)=>{
  if(!c||typeof c!=='object'||typeof c.prompt!=='string'||!c.prompt.trim()||c.prompt.length>8000)throw new Error(`角色 ${i+1} 的正面 tags 无效。`);
  if(c.negative_prompt!==undefined&&(typeof c.negative_prompt!=='string'||c.negative_prompt.length>8000))throw new Error(`角色 ${i+1} 的负面 tags 无效。`);
  if(![c.x,c.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))throw new Error(`角色 ${i+1} 的位置需要是 0–1 的数字。`);
  return {name:typeof c.name==='string'?c.name.slice(0,80):`角色 ${i+1}`,prompt:c.prompt.trim(),negative_prompt:c.negative_prompt??'',x:c.x,y:c.y};
 });
}
export function characterParameters(value,model){
 const characters=validateCharacters(value);
 if(!/^nai-diffusion-(?:4(?:-5)?|5)-(?:full|curated|curated-preview)(?:-inpainting)?$/.test(model))throw new Error('角色参数支持 V4 / V4.5 / V5 模型，请在星绘页选择。');
 const captions=negative=>characters.map(c=>({char_caption:negative?c.negative_prompt:c.prompt,centers:[{x:c.x,y:c.y}]}));
 return {v4_prompt:{caption:{char_captions:captions(false)},use_coords:true,use_order:true},v4_negative_prompt:{caption:{char_captions:captions(true)}}};
}
