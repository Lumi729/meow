// NovelAI website features for direct requests: img2img, inpaint, vibe transfer, precise reference,
// PNG metadata import, director tools and upscale. Pure builders are unit-tested; canvas helpers run in the browser.
export const IMAGE_HOST='https://image.novelai.net';
export const API_HOST='https://api.novelai.net';
export const isV5=model=>/^nai-diffusion-5/.test(model||'');
export const isV45=model=>/^nai-diffusion-4-5/.test(model||'');
export const isV4Family=model=>/^nai-diffusion-(4|5)/.test(model||'');
export const REFERENCE_TYPES=Object.freeze({'character&style':'角色 + 画风','character':'仅角色','style':'仅画风'});
export const DIRECTOR_TOOLS=Object.freeze({'bg-removal':'去除背景','lineart':'线稿','sketch':'素描','colorize':'上色','emotion':'改表情','declutter':'去杂乱（文字 / 气泡）','upscale':'放大 4×'});
export const EMOTIONS=Object.freeze({neutral:'平静',happy:'开心',sad:'难过',angry:'生气',scared:'害怕',surprised:'惊讶',tired:'疲惫',excited:'兴奋',nervous:'紧张',thinking:'思考',confused:'困惑',shy:'害羞',disgusted:'嫌弃',smug:'得意',bored:'无聊',laughing:'大笑',irritated:'烦躁',aroused:'动情',embarrassed:'尴尬',worried:'担心',love:'爱意',determined:'坚定',hurt:'受伤',playful:'调皮'});
const MODEL_NAMES=[[/V5.*0ADF9AB7|Diffusion V5$/,'nai-diffusion-5-full'],[/V5.*DB276663/,'nai-diffusion-5-curated'],[/V4\.5.*Curated/i,'nai-diffusion-4-5-curated'],[/V4\.5/,'nai-diffusion-4-5-full'],[/V4.*Curated/i,'nai-diffusion-4-curated-preview'],[/V4/,'nai-diffusion-4-full'],[/Furry/i,'nai-diffusion-furry-3'],[/V3/,'nai-diffusion-3']];
const range=(value,min,max,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`${label}需要在 ${min}–${max} 之间。`);return Math.round(n*100)/100;};
const strip=data=>String(data||'').replace(/^data:[^,]*,/,'');

/** Adds the chosen website features to an official generate-image body (mutates and returns it). */
export function applyTools(body,tools={}){
 const p=body.parameters,model=body.model,seed=p.seed;
 const mode=tools.mode||'generate';
 if(mode!=='generate'){
  if(!tools.image)throw new Error('请先选择一张基础图。');
  const strength=range(tools.strength??0.7,0.01,0.99,'重绘强度 ');
  Object.assign(p,{image:strip(tools.image),strength,extra_noise_seed:seed,img2img:{strength,color_correct:true}});
  if(mode==='img2img'){body.action='img2img';p.noise=range(tools.noise??0,0,0.99,'噪声 ');}
  else if(mode==='inpaint'){
   if(!tools.mask)throw new Error('局部重绘需要先画蒙版（涂白的地方会重画）。');
   body.action='infill';if(!/-inpainting$/.test(body.model))body.model=`${model}-inpainting`;
   Object.assign(p,{mask:strip(tools.mask),inpaintImg2ImgStrength:strength,add_original_image:tools.add_original!==false});
  }else throw new Error('未知的基础图模式。');
 }
 const vibes=(tools.vibes||[]).filter(v=>v.enabled!==false);
 if(vibes.length){
  if(isV5(model))throw new Error('V5 模型暂不支持氛围迁移（Vibe Transfer），请关闭氛围参考或换 V4.5。');
  if(isV4Family(model)){if(vibes.some(v=>!v.token))throw new Error('氛围参考还没编码，请重新生成。');p.reference_image_multiple=vibes.map(v=>v.token);delete p.reference_information_extracted_multiple;}
  else{p.reference_image_multiple=vibes.map(v=>strip(v.image));p.reference_information_extracted_multiple=vibes.map(v=>range(v.info??1,0.01,1,'信息提取 '));}
  p.reference_strength_multiple=vibes.map(v=>range(v.strength??0.6,0,1,'参考强度 '));p.normalize_reference_strength_multiple=true;
 }
 const refs=(tools.references||[]).filter(r=>r.enabled!==false);
 if(refs.length){
  if(!isV45(model)&&!isV5(model))throw new Error('精确参考只支持 V4.5 / V5 模型。');
  if(refs.some(r=>!r.padded))throw new Error('精确参考图片还没处理好，请重新选择图片。');
  p.director_reference_images=refs.map(r=>strip(r.padded));
  p.director_reference_descriptions=refs.map(r=>({caption:{base_caption:Object.hasOwn(REFERENCE_TYPES,r.type)?r.type:'character&style',char_captions:[]},legacy_uc:false}));
  p.director_reference_information_extracted=refs.map(()=>1);
  p.director_reference_strength_values=refs.map(r=>range(r.strength??1,0,1,'参考强度 '));
  p.director_reference_secondary_strength_values=refs.map(r=>Math.round((1-range(r.fidelity??1,0,1,'保真度 '))*100)/100);
 }
 return body;
}
export const toolsActive=tools=>!!tools&&((tools.mode&&tools.mode!=='generate')||(tools.vibes||[]).some(v=>v.enabled!==false)||(tools.references||[]).some(r=>r.enabled!==false));

/** Reads tEXt / iTXt / zTXt chunks of a PNG. */
export async function pngText(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const sig=[137,80,78,71,13,10,26,10];if(sig.some((v,i)=>b[i]!==v))throw new Error('这不是 PNG 图片，读不到 NovelAI 信息。');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),latin=new TextDecoder('latin1'),utf=new TextDecoder();const out={};
 for(let at=8;at+8<=b.length;){
  const len=view.getUint32(at),type=latin.decode(b.subarray(at+4,at+8)),data=b.subarray(at+8,at+8+len);at+=12+len;
  if(type==='IEND')break;
  const zero=data.indexOf(0);if(zero<0)continue;const key=latin.decode(data.subarray(0,zero));
  if(type==='tEXt')out[key]=utf.decode(data.subarray(zero+1));
  else if(type==='zTXt')out[key]=utf.decode(await inflate(data.subarray(zero+2),'deflate'));
  else if(type==='iTXt'){const compressed=data[zero+1];let i=zero+3;i=data.indexOf(0,i)+1;i=data.indexOf(0,i)+1;const text=data.subarray(i);out[key]=utf.decode(compressed?await inflate(text,'deflate'):text);}
 }
 return out;
}
/** Converts NovelAI PNG text chunks into Meow fields. */
export function parseNaiMetadata(texts){
 let c;try{c=JSON.parse(texts.Comment||'');}catch{throw new Error('这张图没有 NovelAI 生成信息（可能被压缩或转存过）。');}
 if(!c||typeof c!=='object')throw new Error('这张图没有 NovelAI 生成信息。');
 const source=`${texts.Source||''} ${texts.Software||''}`;const model=MODEL_NAMES.find(([r])=>r.test(source))?.[1]||'';
 const pos=c.v4_prompt?.caption,neg=c.v4_negative_prompt?.caption;
 const characters=(pos?.char_captions||[]).map((ch,i)=>({name:`角色 ${i+1}`,prompt:ch.char_caption||'',negative_prompt:neg?.char_captions?.[i]?.char_caption||'',x:ch.centers?.[0]?.x??0.5,y:ch.centers?.[0]?.y??0.5})).filter(ch=>ch.prompt.trim());
 return {prompt:pos?.base_caption??c.prompt??texts.Description??'',negative:neg?.base_caption??c.uc??'',characters,model,
  settings:{width:c.width,height:c.height,steps:c.steps,scale:c.scale,cfg_rescale:c.cfg_rescale,sampler:c.sampler,scheduler:c.noise_schedule},seed:c.seed};
}

/** Official responses: JSON {images}, a ZIP with image_0.png, or a bare PNG. Returns base64 PNG. */
export async function responsePng(response){
 const type=response.headers?.get?.('content-type')||'';
 if(type.includes('json')){const raw=await response.json();const image=raw.images?.[0]?.image??raw.image;if(typeof image==='string')return strip(image);throw new Error('官网返回里没有图片。');}
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===0x89&&bytes[1]===0x50)return toBase64(bytes);
 if(bytes[0]===0x50&&bytes[1]===0x4b)return toBase64(await unzipFirst(bytes));
 try{const raw=JSON.parse(new TextDecoder().decode(bytes));const image=raw.images?.[0]?.image??raw.image;if(typeof image==='string')return strip(image);}catch{}
 throw new Error('官网返回了无法识别的图片格式。');
}
export async function unzipFirst(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 for(let at=0;at+30<=bytes.length&&view.getUint32(at,true)===0x04034b50;){
  const method=view.getUint16(at+8,true),size=view.getUint32(at+18,true),nameLen=view.getUint16(at+26,true),extra=view.getUint16(at+28,true);
  const start=at+30+nameLen+extra,data=bytes.subarray(start,start+size);
  if(method===0)return data;if(method===8)return inflate(data,'deflate-raw');
  at=start+size;
 }
 throw new Error('官网返回的压缩包里没有图片。');
}
async function inflate(data,format){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream(format));return new Uint8Array(await new Response(stream).arrayBuffer());}
export function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
export function fromBase64(b64){const s=atob(strip(b64));const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}

async function post(url,body,token,signal){
 if(!token)throw new Error('官网功能需要先在设置里保存 NovelAI Token。');
 let r;try{r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});}catch(e){if(e.name==='AbortError')throw e;throw new Error('连不上 NovelAI 官网：请检查网络或浏览器跨域限制。');}
 if(!r.ok){let detail='';try{detail=(await r.text()).slice(0,200);}catch{}throw new Error(`NovelAI 返回 HTTP ${r.status}${detail?`：${detail}`:''}`);}
 return r;
}
/** Vibe tokens cost Anlas once per image + information setting; callers cache the result on the slot. */
export async function encodeVibe(image,info,model,token,signal){
 const r=await post(`${IMAGE_HOST}/ai/encode-vibe`,{image:strip(image),information_extracted:range(info??1,0.01,1,'信息提取 '),model},token,signal);
 return toBase64(new Uint8Array(await r.arrayBuffer()));
}
export async function directorTool(tool,{image,width,height,prompt='',level=0,emotion='neutral'},token,signal){
 if(tool==='upscale'){const r=await post(`${API_HOST}/ai/upscale`,{image:strip(image),width,height,scale:4},token,signal);return responsePng(r);}
 if(!Object.hasOwn(DIRECTOR_TOOLS,tool))throw new Error('未知的导演工具。');
 const body={req_type:tool,width,height,image:strip(image),prompt:'',defry:0};
 if(tool==='colorize'){body.prompt=prompt;body.defry=Math.max(0,Math.min(5,Number(level)||0));}
 if(tool==='emotion'){if(!Object.hasOwn(EMOTIONS,emotion))throw new Error('请选择表情。');body.prompt=`${emotion};;${prompt?`${prompt},`:''}`;body.defry=Math.max(0,Math.min(5,Number(level)||0));}
 const r=await post(`${IMAGE_HOST}/ai/augment-image`,body,token,signal);return responsePng(r);
}

// ---- browser canvas helpers ----
export function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('图片读取失败。'));img.src=src;});}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const png64=c=>c.toDataURL('image/png').split(',')[1];
/** Stretches the base image to the generation size (the website does the same after cropping). */
export async function fitImage(src,width,height){const img=await loadImage(src),c=canvas(width,height);c.getContext('2d').drawImage(img,0,0,width,height);return png64(c);}
/** Picks the output size from a source image: keeps its shape, about 1 MP, multiples of 64. */
export function sizeFor(w,h){const scale=Math.min(1,Math.sqrt(1048576/(w*h)),1600/Math.max(w,h));const r=v=>Math.max(64,Math.min(1600,Math.round(v*scale/64)*64));return {width:r(w),height:r(h)};}
/** Precise reference canvas: fit and black-pad to 1024×1536, 1536×1024 or 1472×1472. */
export async function padReference(src){
 const img=await loadImage(src),ratio=img.naturalWidth/img.naturalHeight;
 const [w,h]=ratio<0.8?[1024,1536]:ratio>1.25?[1536,1024]:[1472,1472];
 const c=canvas(w,h),g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,w,h);
 const s=Math.min(w/img.naturalWidth,h/img.naturalHeight),dw=Math.round(img.naturalWidth*s),dh=Math.round(img.naturalHeight*s);
 g.drawImage(img,Math.round((w-dw)/2),Math.round((h-dh)/2),dw,dh);return png64(c);
}
/** Turns a painted overlay (any opaque stroke = repaint) into NovelAI's 8×8-aligned black/white mask. */
export function maskFromStrokes(strokes,width,height){
 const small=canvas(Math.ceil(width/8),Math.ceil(height/8)),g=small.getContext('2d');
 g.imageSmoothingEnabled=true;g.drawImage(strokes,0,0,small.width,small.height);
 const data=g.getImageData(0,0,small.width,small.height);
 for(let i=0;i<data.data.length;i+=4){const on=data.data[i+3]>40?255:0;data.data[i]=data.data[i+1]=data.data[i+2]=on;data.data[i+3]=255;}
 g.putImageData(data,0,0);const out=canvas(width,height),o=out.getContext('2d');o.imageSmoothingEnabled=false;o.drawImage(small,0,0,width,height);return png64(out);
}
/** Shrinks any picture to at most `max` px on the long side as JPEG (for sending to a chat model). */
export async function shrinkImage(src,max=1024){const img=await loadImage(src),s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=canvas(Math.round(img.naturalWidth*s),Math.round(img.naturalHeight*s)),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.9);}
