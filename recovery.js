// Optional current-chat recovery. No synthetic render events or page reloads.
export function mountRecovery({root,context,isBusy,isGenerating,save,now=()=>Date.now(),schedule=setInterval}){
 const settings=context().extensionSettings.meow_recovery??={automatic:false};
 const toggle=root.querySelector('#meow-recovery-auto'),button=root.querySelector('#meow-recovery-now'),status=root.querySelector('#meow-recovery-status');
 let running=false,pending=false,lastInput=now(),lastReload=-Infinity;
 const identity=()=>JSON.stringify([context().groupId,context().characterId,context().getCurrentChatId()]);
 const draft=()=>document.querySelector('#send_textarea')?.value||'';
 const unsupported=()=>typeof isGenerating!=='function'||typeof context().saveChat!=='function'||typeof context().reloadCurrentChat!=='function';
 function blocked(manual){
  const ownDialog=root.closest('dialog')||root.querySelector('dialog');
  return document.hidden||unsupported()||isGenerating()||isBusy()||!!draft().trim()
   ||!!document.querySelector('.mes_edit_textarea, #chat [contenteditable="true"], [aria-busy="true"]')
   ||[...document.querySelectorAll('dialog[open]')].some(d=>!manual||d!==ownDialog);
 }
 function activity(){if(running)return;lastInput=now();pending=true;}
 const onActivity=e=>{if(e.isTrusted)activity();};
 const onVisibility=()=>{if(!document.hidden)activity();};
 const setEnabled=()=>{settings.automatic=toggle.checked;pending=toggle.checked;lastInput=now();save();status.textContent=toggle.checked?'已开启：停止操作 30 秒后恢复，至少间隔 2 分钟。':'自动恢复已关闭；仍可手动恢复。';};
 toggle.checked=!!settings.automatic;
 toggle.addEventListener('change',setEnabled);
 async function recover(manual=false){
  if(running)return;
  if(unsupported()){status.textContent='当前酒馆缺少恢复接口，请使用 /chat-reload。';pending=false;return;}
  if(blocked(manual)){if(manual)status.textContent='请先结束聊天或猫猫任务、保存消息编辑、处理输入框草稿并关闭其他弹窗。';return;}
  const current=context(),key=identity();if(!current.chat?.length){pending=false;status.textContent='当前没有可恢复的聊天。';return;}
  running=true;button.disabled=true;pending=false;lastReload=now();
  const chatNode=document.getElementById('chat'),scroll=chatNode?.scrollTop,originalDraft=draft();
  try{
   status.textContent='正在保存并重新加载当前聊天…';
   await current.saveChat();
   if(key!==identity()||blocked(manual)||originalDraft!==draft()){status.textContent='聊天或操作状态已变化，已取消本次恢复。';return;}
   await current.reloadCurrentChat();
   if(key===identity()&&chatNode&&Number.isFinite(scroll))chatNode.scrollTop=scroll;
   status.textContent='当前聊天已重新加载。';
  }catch{status.textContent='恢复未完成，请检查酒馆连接，或手动使用 /chat-reload。';}
  finally{running=false;button.disabled=false;}
 }
 const onClick=()=>void recover(true);button.addEventListener('click',onClick);
 for(const event of ['pointerdown','keydown','touchmove','wheel'])document.addEventListener(event,onActivity,{passive:true});
 document.addEventListener('visibilitychange',onVisibility);
 const tick=()=>{
  if(!root.isConnected)return;
  if(settings.automatic&&document.getElementById('chat-recovery-settings')){status.textContent='检测到独立恢复扩展，请停用独立版并刷新后再用猫猫自动恢复。';return;}
  if(settings.automatic&&pending&&!running&&now()-lastInput>=30000&&now()-lastReload>=120000)void recover();
 };
 const timer=schedule(tick,3000);
 return {recover,tick,activity,isRunning:()=>running,dispose(){clearInterval(timer);for(const event of ['pointerdown','keydown','touchmove','wheel'])document.removeEventListener(event,onActivity);document.removeEventListener('visibilitychange',onVisibility);toggle.removeEventListener('change',setEnabled);button.removeEventListener('click',onClick);}};
}
