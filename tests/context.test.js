import test from 'node:test';
import assert from 'node:assert/strict';
import {splitMessage,splitAutoMessage,captureContext,parseScenes,parseTagPreset,buildTagRequest,apiBase} from '../context.js';
import {buildRequest,cleanPreset} from '../core.js';
test('context delimiters preserve excluded text, with no automatic uncategorized sharing',()=>{
 const parts=splitMessage('before<正文>main</正文><状态栏>private</状态栏>after');
 assert.deepEqual(parts.map(p=>p.name),['未分类原文','正文','状态栏','未分类原文']);
 const capture=captureContext([{mes:'<正文>main</正文><状态栏>private</状态栏>'}],1);
 const sent=buildTagRequest({url:'https://example.com/v1',model:'test'},capture.filter(p=>p.part==='正文'),1);
 assert.ok(JSON.stringify(sent).includes('main'));assert.ok(!JSON.stringify(sent).includes('private'));
 assert.equal(captureContext([{mes:'no known markers'}],1)[0].selected,false);
});
test('nested and broken delimiters never lose source text',()=>{
 const text='<正文>one<状态栏>two</状态栏>three</正文>tail';
 assert.equal(splitMessage(text).map(p=>p.text).join(''),text);
 assert.equal(splitMessage('<正文>broken')[0].name,'未分类原文');
});
test('capture count excludes system and generated image messages',()=>{
 const chat=[{mes:'a'},{mes:'b',is_system:true},{mes:'c',extra:{meow:true}},{mes:'d'}];
 assert.deepEqual(captureContext(chat,2).map(p=>p.messageIndex),[0,3]);
});
test('scene output requires exact count and valid source references',()=>{
 const data={scenes:[{prompt:'cat',source_ids:['m1p0']}]};
 assert.equal(parseScenes(JSON.stringify(data),['m1p0'],1)[0].prompt,'cat');
 assert.throws(()=>parseScenes(JSON.stringify(data),['m2p0'],1));
 assert.throws(()=>parseScenes(JSON.stringify(data),['m1p0'],2));
 assert.throws(()=>parseScenes('not json',[],1));
});
test('imports only active preset instructions; no code or credentials copied',()=>{
 const preset={prompts:[{identifier:'x',content:'skip'},{identifier:'y',content:'keep'}],prompt_order:[{character_id:100001,order:[{identifier:'y',enabled:true},{identifier:'x',enabled:false}]}]};
 assert.equal(parseTagPreset(JSON.stringify(preset),'p.json'),'keep');
 const sanitized=cleanPreset({token:'secret',url:'https://bad',fixed_positive:'style'});
 assert.equal(sanitized.token,undefined);assert.equal(sanitized.url,undefined);
});
test('fixed tags, extra negatives and unlocked parameters are honored',()=>{
 const p=buildRequest({fixed_positive:'style',prompt:'cat',negative_prompt:'bad',extra_negative:'blur',steps:40,width:1536,height:1024,anlas_guard:false,sampler:'k_euler',scheduler:'native'});
 assert.equal(p.prompt,'style, cat');assert.equal(p.negative_prompt,'bad, blur');assert.equal(p.steps,40);assert.equal(p.sampler,'k_euler');
 assert.throws(()=>buildRequest({prompt:'cat',sm:true}));
 assert.throws(()=>buildRequest({prompt:'cat',sm_dyn:true,model:'nai-diffusion-3'}));
});
test('API addresses reject embedded secrets and unsafe protocols',()=>{
 assert.equal(apiBase('https://example.com/v1/chat/completions'),'https://example.com/v1');
 for(const url of ['javascript:alert(1)','https://u:p@example.com','https://example.com?key=x','http://public.example/v1'])assert.throws(()=>apiBase(url));
});

test('official direct protocol keeps one sample and fixed captions',async()=>{
 const {directRequest,requestDirect}=await import('../advanced.js');
 const p=buildRequest({prompt:'cat',fixed_positive:'style',seed:42,cfg_rescale:0.18});
 const body=directRequest(p,JSON.stringify({cfg_rescale:0.5,n_samples:8,width:99999,v4_prompt:{caption:{char_captions:[{char_caption:'white cat',centers:[{x:0.5,y:0.5}]}]}}}));
 assert.equal(body.parameters.n_samples,1);assert.equal(body.parameters.width,832);assert.equal(body.parameters.v4_prompt.caption.base_caption,'style, cat');assert.equal(body.parameters.cfg_rescale,0.18);
 await assert.rejects(requestDirect(body,'',undefined),/Token/);
 const src=await requestDirect(body,'test-only',undefined,async(url,options)=>{assert.equal(url,'https://image.novelai.net/ai/generate-image');assert.equal(options.headers.Accept,'application/json');return new Response(JSON.stringify({images:[{image:'iVBORw0KGgo='}]}));});
 assert.ok(src.startsWith('data:image/png;'));
});

test('automatic tags partition nested content and require explicit selection',()=>{
 const text='<story class="x">one<状态面板>private</状态面板>two</story><extra>aside</extra>';
 const parts=splitAutoMessage(text);
 assert.equal(parts.map(p=>p.text).join(''),text);
 assert.ok(parts.some(p=>p.name==='状态面板'&&p.text.includes('private')));
 assert.ok(!parts.filter(p=>p.name==='story').some(p=>p.text.includes('private')));
 assert.ok(captureContext([{mes:text}],1).every(p=>!p.selected));
 assert.equal(splitAutoMessage('<broken>text')[0].name,'未分类原文');
});
