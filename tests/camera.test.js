import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {cameraRecords,mountCamera,buildCameraRequest} from '../camera.js';
const mes='<tracker_home><entry>客厅｜午后，在线｜空沙发和窗边的猫。</entry><entry>走廊｜晚上，在线｜顶灯亮着。</entry></tracker_home><tracker_health>DO NOT SEND</tracker_health>';
test('camera capture keeps full records and excludes other sections',()=>{assert.deepEqual(cameraRecords(mes).map(x=>x.text),['客厅｜午后，在线｜空沙发和窗边的猫。','走廊｜晚上，在线｜顶灯亮着。']);assert.throws(()=>cameraRecords('none'));});
test('iframe camera flow validates source, generates isolated tags and returns persisted images',async()=>{
 const w=new Window({url:'https://local.test'});globalThis.window=w;globalThis.document=w.document;
 document.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><iframe></iframe></div></div><div id="panel"><section data-view="bad"></section></div>';
 const frame=document.querySelector('iframe'),out=[],images=[],requests=[];frame.contentWindow.postMessage=d=>out.push(d);
 const ctx={chat:[{mes,name:'Char'}],getCurrentChatId:()=> 'chat',getRequestHeaders:()=>({})};let key='chat',opened=0;
 const api=mountCamera({root:document.querySelector('#panel'),context:()=>ctx,chatKey:()=>key,panel:{open:()=>opened++,setMode:()=>{},dialog:{close:()=>{}}},page:()=>{},secondary:{url:'https://example.com/v1',model:'mock',secret_id:'local'},run:fn=>fn(new AbortController().signal),isBusy:()=>false,config:()=>({}),prepare:x=>x,png:async()=> 'data:image/png;base64,AAAA',makeEntry:(src,payload,source,title)=>({id:'image',src,payload,source,title}),addImage:async x=>images.push(x),listImages:()=>images,viewEntry:id=>viewed.push(id),redrawEntry:async entry=>{const next={...entry,id:'redrawn'};images.push(next);return next;},removeEntry:async entry=>{images.splice(images.indexOf(entry),1);}});const viewed=[];
 const send=(source=frame.contentWindow,type='meow-camera-open',extra={})=>w.dispatchEvent(new w.MessageEvent('message',{source,origin:'https://local.test',data:{type,requestId:'request',records:cameraRecords(mes).map(r=>r.text),index:0,...extra}}));
 const settle=()=>new Promise(r=>setTimeout(r,20));
 send({postMessage:()=>{}});assert.equal(opened,0);send();await settle();assert.equal(opened,1);
 const buttons=()=>[...document.querySelectorAll('.meow-camera button')];
 globalThis.fetch=async(_url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);const id=JSON.parse(body.messages[1].content).passages[0].id;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({scenes:[{prompt:'empty room',source_ids:[id]}]})}}]})};};
 buttons()[0].click();await settle();assert.equal(requests.length,1);assert.equal(JSON.parse(requests[0].messages[1].content).passages.length,1);assert.ok(JSON.parse(requests[0].messages[1].content).original_context.includes('DO NOT SEND'));assert.equal(JSON.parse(requests[0].messages[1].content).passages[0].text,'客厅｜午后，在线｜空沙发和窗边的猫。');
 buttons()[1].click();await settle();assert.equal(images.length,1);assert.equal(out.at(-1).images[0].record,'客厅｜午后，在线｜空沙发和窗边的猫。');
 send(frame.contentWindow,'meow-camera-list');assert.equal(out.at(-1).images.length,1);
 // Monitor screen can open, redraw and delete its own pictures.
 const shown=frame.contentDocument.createElement('img');shown.setAttribute('src','data:image/png;base64,AAAA');frame.contentDocument.body.append(shown);shown.click();assert.deepEqual(viewed,['image']);viewed.length=0;
 send(frame.contentWindow,'meow-camera-view',{id:'image'});await settle();assert.deepEqual(viewed,['image']);
 send(frame.contentWindow,'meow-camera-redraw',{id:'image'});await settle();assert.equal(images.length,2);assert.equal(out.filter(x=>x.type==='meow-camera-images').at(-1).images.length,2);
 send(frame.contentWindow,'meow-camera-delete',{id:'redrawn'});await settle();assert.equal(images.length,1);assert.equal(out.filter(x=>x.type==='meow-camera-images').at(-1).images.length,1);
 send(frame.contentWindow,'meow-camera-delete',{id:'missing'});await settle();assert.equal(out.at(-1).type,'meow-camera-error');
 key='other';buttons()[1].click();await settle();assert.equal(images.length,1);assert.match(document.querySelector('[role=status]').textContent,/变化/);
 api.dispose();w.happyDOM.abort();
});

test('camera combines saved tag preset, full source message and appearance without altering the preset',()=>{
 const secondary={preset:'My saved tag style',model:'mock',url:'https://example.com/v1'},record=cameraRecords(mes)[0];
 const request=buildCameraRequest(secondary,record,'本条原文：人物正坐在窗边。','人物：白发');
 assert.equal(secondary.preset,'My saved tag style');assert.ok(request.messages[0].content.includes('My saved tag style'));assert.ok(request.messages[0].content.includes('最终输出协议'));
 const sent=JSON.parse(request.messages[1].content);assert.equal(sent.original_context,'这是原文，用于理解生图 tag：\n本条原文：人物正坐在窗边。');assert.equal(sent.appearance_reference,'人物：白发');assert.equal(sent.passages.length,1);
});
