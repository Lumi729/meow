import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountTagEditor, validateEditedScene } from '../tag-editor.js';

const scene={title:'Garden',prompt:'cat',negative_prompt:'blurry',characters:[{name:'Cat',prompt:'blue eyes',negative_prompt:'red eyes',x:0.2,y:0.7}]};
test('edited scenes preserve role order and reject invalid positions before saving',()=>{
 const copy=validateEditedScene(scene);copy.characters[0].prompt='green eyes';assert.equal(scene.characters[0].prompt,'blue eyes');
 assert.throws(()=>validateEditedScene({...scene,prompt:''}),/正面/);
 assert.throws(()=>validateEditedScene({...scene,characters:[{...scene.characters[0],x:NaN}]}),/位置/);
 assert.throws(()=>validateEditedScene({...scene,characters:[{...scene.characters[0],y:1.5}]}),/位置/);
 assert.equal(validateEditedScene({...scene,characters:[]}).characters,null);
});

test('closing discards unsaved draft, invalid edits cannot save or redraw, saving does not redraw',async()=>{
 const w=new Window();w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const editor=mountTagEditor(w.document),dialog=w.document.getElementById('meow-tag-editor');let saves=0,draws=0,last;
 const options={scene,onSave:async value=>{saves++;last=value;},onRedraw:async()=>draws++};
 const button=label=>[...dialog.querySelectorAll('button')].find(b=>b.textContent===label);
 const set=(label,value)=>{const input=dialog.querySelector(`[aria-label="${label}"]`);input.value=value;input.dispatchEvent(new w.Event('input'));};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
 editor.open(options);set('场景正面 tags','unsaved');button('关闭').click();assert.equal(saves,0);
 editor.open(options);assert.equal(dialog.querySelector('[aria-label="场景正面 tags"]').value,'cat');
 set('角色 1 横向位置 x','2');button('保存并重绘').click();await settle();assert.equal(saves,0);assert.equal(draws,0);assert.match(dialog.querySelector('[role=status]').textContent,/位置/);
 set('角色 1 横向位置 x','0.6');button('保存 tags').click();await settle();assert.equal(saves,1);assert.equal(draws,0);assert.equal(last.characters[0].x,0.6);
 button('保存并重绘').click();await settle();assert.equal(saves,2);assert.equal(draws,1);assert.equal(dialog.open,false);
 await w.happyDOM.abort();
});
