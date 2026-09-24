import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountRecovery} from '../recovery.js';
test('recovery pauses for drawing/drafts, cancels chat switches, and never loops while idle',async()=>{
 const w=new Window();globalThis.document=w.document;Object.defineProperty(document,'hidden',{value:false});
 document.body.innerHTML='<dialog open><div id="root"><input id="meow-recovery-auto" type="checkbox"><button id="meow-recovery-now"></button><p id="meow-recovery-status"></p></div></dialog><textarea id="send_textarea"></textarea>';
 let busy=true,generating=false,clock=200000,key='a',saved=0,reloaded=0,switchOnSave=false;
 const c={extensionSettings:{},chat:[{mes:'original'}],getCurrentChatId:()=>key,saveChat:async()=>{saved++;if(switchOnSave)key='b';},reloadCurrentChat:async()=>{reloaded++;}};
 const api=mountRecovery({root:document.querySelector('#root'),context:()=>c,isBusy:()=>busy,isGenerating:()=>generating,save(){},now:()=>clock,schedule:()=>0});
 try{
  await api.recover(true);assert.equal(saved,0);busy=false;generating=true;await api.recover(true);assert.equal(saved,0);generating=false;
  document.querySelector('textarea').value='draft';await api.recover(true);assert.equal(saved,0);document.querySelector('textarea').value='';
  await api.recover(true);assert.equal(reloaded,1); // Own cat dialog must not block manual recovery.
  switchOnSave=true;await api.recover(true);assert.equal(reloaded,1);switchOnSave=false;
  const toggle=document.querySelector('input');toggle.checked=true;toggle.dispatchEvent(new w.Event('change'));
  clock+=150000;api.tick();await new Promise(r=>setImmediate(r));assert.equal(reloaded,1); // Dialog pauses auto.
  document.querySelector('dialog').removeAttribute('open');api.tick();await new Promise(r=>setImmediate(r));assert.equal(reloaded,2);
  clock+=150000;api.tick();await new Promise(r=>setImmediate(r));assert.equal(reloaded,2);
  assert.equal(c.chat[0].mes,'original');
 }finally{api.dispose();await w.happyDOM.abort();}
});
