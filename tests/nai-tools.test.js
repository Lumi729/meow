import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTools,toolsActive,pngText,parseNaiMetadata,unzipFirst,responsePng,sizeFor,toBase64} from '../nai-tools.js';
import {directRequest} from '../advanced.js';
import {buildRequest} from '../core.js';
import zlib from 'node:zlib';
const body=model=>directRequest(buildRequest({prompt:'cat',model,seed:7}),'{}');
test('img2img and inpaint use official actions, inpainting model and one seed',()=>{
 const a=applyTools(body('nai-diffusion-4-5-full'),{mode:'img2img',image:'data:image/png;base64,AAA',strength:0.5,noise:0.1});
 assert.equal(a.action,'img2img');assert.equal(a.parameters.image,'AAA');assert.equal(a.parameters.strength,0.5);assert.equal(a.parameters.noise,0.1);assert.equal(a.parameters.extra_noise_seed,7);
 const b=applyTools(body('nai-diffusion-5-full'),{mode:'inpaint',image:'AAA',mask:'MMM',strength:0.8});
 assert.equal(b.action,'infill');assert.equal(b.model,'nai-diffusion-5-full-inpainting');assert.equal(b.parameters.mask,'MMM');assert.equal(b.parameters.inpaintImg2ImgStrength,0.8);assert.equal(b.parameters.params_version,4);
 assert.throws(()=>applyTools(body('nai-diffusion-4-5-full'),{mode:'inpaint',image:'AAA'}),/蒙版/);
 assert.ok(!toolsActive({mode:'generate',vibes:[{enabled:false}]}));assert.ok(toolsActive({references:[{}]}));
});
test('vibe transfer uses encoded tokens on V4+ and is refused on V5; precise reference fills all director lists',()=>{
 const v=applyTools(body('nai-diffusion-4-5-full'),{vibes:[{token:'TOK',strength:0.6},{token:'T2',strength:0.4,enabled:true}]});
 assert.deepEqual(v.parameters.reference_image_multiple,['TOK','T2']);assert.deepEqual(v.parameters.reference_strength_multiple,[0.6,0.4]);
 assert.throws(()=>applyTools(body('nai-diffusion-5-full'),{vibes:[{token:'TOK'}]}),/V5/);
 const r=applyTools(body('nai-diffusion-4-5-full'),{references:[{padded:'PAD',type:'character',strength:0.9,fidelity:0.7}]});
 assert.deepEqual(r.parameters.director_reference_images,['PAD']);assert.equal(r.parameters.director_reference_descriptions[0].caption.base_caption,'character');
 assert.deepEqual(r.parameters.director_reference_strength_values,[0.9]);assert.deepEqual(r.parameters.director_reference_secondary_strength_values,[0.3]);
 assert.throws(()=>applyTools(body('nai-diffusion-4-full'),{references:[{padded:'PAD'}]}),/V4\.5/);
});
const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);return Buffer.concat([len,Buffer.from(type,'latin1'),data,Buffer.alloc(4)]);};
test('reads NovelAI metadata from PNG text chunks',async()=>{
 const comment={prompt:'old',uc:'bad',steps:28,width:832,height:1216,scale:5,seed:42,sampler:'k_euler',noise_schedule:'karras',v4_prompt:{caption:{base_caption:'1girl, silver hair',char_captions:[{char_caption:'girl',centers:[{x:0.3,y:0.5}]}]}},v4_negative_prompt:{caption:{base_caption:'lowres',char_captions:[{char_caption:'blur'}]}}};
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('tEXt',Buffer.from('Source\0NovelAI Diffusion V4.5 4BDE2A90')),chunk('iTXt',Buffer.concat([Buffer.from('Comment\0\0\0\0\0'),Buffer.from(JSON.stringify(comment))])),chunk('IEND',Buffer.alloc(0))]);
 const meta=parseNaiMetadata(await pngText(png));
 assert.equal(meta.prompt,'1girl, silver hair');assert.equal(meta.negative,'lowres');assert.equal(meta.model,'nai-diffusion-4-5-full');assert.equal(meta.seed,42);assert.equal(meta.settings.width,832);
 assert.deepEqual(meta.characters,[{name:'角色 1',prompt:'girl',negative_prompt:'blur',x:0.3,y:0.5}]);
 await assert.rejects(pngText(Buffer.from('nope')),/PNG/);assert.throws(()=>parseNaiMetadata({}),/NovelAI/);
});
test('official responses: zip (deflate), bare PNG and JSON all become base64 PNG',async()=>{
 const pngBytes=Buffer.from([137,80,78,71,1,2,3]),deflated=zlib.deflateRawSync(pngBytes),name=Buffer.from('image_0.png');
 const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(8,8);head.writeUInt32LE(deflated.length,18);head.writeUInt16LE(name.length,26);
 const zip=Buffer.concat([head,name,deflated]);
 assert.deepEqual(Buffer.from(await unzipFirst(new Uint8Array(zip))),pngBytes);
 assert.equal(await responsePng(new Response(zip)),toBase64(pngBytes));
 assert.equal(await responsePng(new Response(pngBytes)),toBase64(pngBytes));
 assert.equal(await responsePng(new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}),{headers:{'content-type':'application/json'}})),'iVBORw0KGgo=');
 assert.deepEqual(sizeFor(3000,2000),{width:1280,height:832});
});
test('reverse tagging sends the picture as an image_url message to the secondary API and cleans the reply',async()=>{
 const {buildReverseRequest,cleanTags,REVERSE_PROMPT}=await import('../context.js');
 const r=buildReverseRequest({model:'vision',url:'https://api.example/v1',secret_id:'id'},'data:image/jpeg;base64,AAAA','');
 assert.equal(r.chat_completion_source,'custom');assert.equal(r.secret_id,'id');assert.equal(r.messages[0].content,REVERSE_PROMPT);assert.equal(r.messages[1].content[1].image_url.url,'data:image/jpeg;base64,AAAA');
 assert.throws(()=>buildReverseRequest({url:'https://api.example/v1'},'data:image/jpeg;base64,AA'),/模型/);
 assert.equal(cleanTags('```\n1girl, smile,\nwhite hair\n```'),'1girl, smile, white hair');
});
test('vibe files keep image and per-model encodings through export and import',async()=>{
 const {buildVibeFile,parseVibeFile}=await import('../nai-tools.js');
 const item={id:'vibe:1',name:'粉色梦境',image:'data:image/png;base64,AAAA',info:0.8,strength:0.5,tokens:{'nai-diffusion-4-5-full|0.8':'ENC'}};
 const back=parseVibeFile(buildVibeFile(item));assert.equal(back.name,'粉色梦境');assert.equal(back.image,'data:image/png;base64,AAAA');assert.deepEqual(back.tokens,{'nai-diffusion-4-5-full|0.8':'ENC'});assert.equal(back.info,0.8);assert.equal(back.strength,0.5);
 const onlyEncoding=parseVibeFile(JSON.stringify({identifier:'novelai-vibe-transfer',encodings:{'v4-5curated':{x:{encoding:'E2',params:{information_extracted:1}}}}}),'文件名');assert.equal(onlyEncoding.name,'文件名');assert.deepEqual(onlyEncoding.tokens,{'nai-diffusion-4-5-curated|1':'E2'});
 assert.throws(()=>parseVibeFile('{}'),/没有/);assert.throws(()=>parseVibeFile('nope'),/JSON/);
});
test('metadata lists the website features the picture used',()=>{
 const comment={prompt:'p',uc:'u',request_type:'Img2ImgRequest',strength:0.6,noise:0.1,reference_image_multiple:['VIBEENC'],reference_strength_multiple:[0.5],reference_information_extracted_multiple:[0.9],director_reference_descriptions:[{caption:{base_caption:'character'}}],director_reference_strength_values:[0.8],director_reference_secondary_strength_values:[0.25],dynamic_thresholding:true,skip_cfg_above_sigma:58};
 const m=parseNaiMetadata({Comment:JSON.stringify(comment)});
 assert.equal(m.tools.mode,'img2img');assert.equal(m.tools.strength,0.6);assert.deepEqual(m.tools.vibes,[{image:'',token:'VIBEENC',info:0.9,strength:0.5}]);
 assert.deepEqual(m.tools.references,[{type:'character',strength:0.8,fidelity:0.75,image:''}]);assert.ok(m.extras.decrisper&&m.extras.variety_boost);
 assert.equal(parseNaiMetadata({Comment:'{"prompt":"x"}'}).tools.mode,undefined);
});
