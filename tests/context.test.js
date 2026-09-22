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
 assert.deepEqual(parts.map(p=>p.name),['story','extra']);
 assert.equal(parts[0].text,'<story class="x">one<状态面板>private</状态面板>two</story>');
 assert.ok(captureContext([{mes:text}],1).every(p=>!p.selected));
 assert.equal(splitAutoMessage('<broken>text')[0].name,'未分类原文');
});
test('character scene validation and official mapping preserve identity and fixed tags',async()=>{
 const {validateCharacters,characterParameters}=await import('../characters.js');
 const {directRequest}=await import('../advanced.js');
 const chars=[{name:'A',prompt:'white hair',negative_prompt:'black hair',x:0.2,y:0.5},{name:'B',prompt:'black hair',negative_prompt:'white hair',x:0.8,y:0.5}];
 const raw=JSON.stringify({scenes:[{prompt:'2people',source_ids:['m0p0'],characters:chars}]});
 const scenes=parseScenes(raw,['m0p0'],1,true);assert.equal(scenes[0].characters.length,2);
 const body=directRequest(buildRequest({prompt:'2people',fixed_positive:'pastel',negative_prompt:'bad quality'}),JSON.stringify(characterParameters(chars,'nai-diffusion-4-5-full')));
 assert.equal(body.parameters.v4_prompt.caption.base_caption,'pastel, 2people');assert.equal(body.parameters.v4_negative_prompt.caption.base_caption,'bad quality');
 assert.equal(body.parameters.v4_prompt.caption.char_captions[1].centers[0].x,0.8);assert.equal(body.parameters.v4_negative_prompt.caption.char_captions[1].char_caption,'white hair');
 assert.throws(()=>validateCharacters([{...chars[0],x:2}]),/位置/);assert.throws(()=>characterParameters(chars,'nai-diffusion-3'),/V4/);
 assert.throws(()=>parseScenes(JSON.stringify({scenes:[{prompt:'cat',source_ids:['m0p0']}]}),['m0p0'],1,true),/characters/);
 assert.ok(!('token' in validateCharacters([{...chars[0],token:'discard'}])[0]));
 const req=buildTagRequest({url:'https://example.com/v1',model:'m',preset:'MY PRESET',character_mode:true},[{id:'m0p0',text:'story'}],1);
 assert.ok(req.messages[0].content.includes('MY PRESET'));assert.ok(req.messages[0].content.includes('characters'));
});

test('outer paired blocks stay intact with attributes, void tags and repeated pairs',()=>{
 const text='<details><RoundMemo><history id="A3" t="now">one<br>two</history></RoundMemo></details><history>next</history>';
 const parts=splitAutoMessage(text);assert.equal(parts.length,2);assert.equal(parts[0].name,'details');assert.equal(parts[1].text,'<history>next</history>');assert.equal(parts.map(p=>p.text).join(''),text);
 assert.ok(parts.every(p=>!/^\s*<\//.test(p.text)));
});
