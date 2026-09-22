const base = new URL('.', import.meta.url);
export function mountPanel(markup, preferences, save){
 const dialog=document.createElement('dialog');dialog.id='meow-dialog';dialog.setAttribute('aria-label','Meow · 猫猫星绘');
 dialog.insertAdjacentHTML('beforeend',markup);document.body.append(dialog);
 let opener,mode='draw';
 const close=dialog.querySelector('#meow-close-top');
 const open=event=>{if(dialog.open)return;opener=event?.currentTarget;dialog.showModal();close.focus();};
 dialog.querySelectorAll('[data-meow-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>{dialog.querySelectorAll('input[type=password]').forEach(e=>e.value='');if(opener?.isConnected)opener.focus();});
 const make=(id,label)=>{const b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.setAttribute('aria-label','打开猫猫星绘');b.setAttribute('aria-haspopup','dialog');b.addEventListener('click',open);return b;};
 const menu=document.querySelector('#extensionsMenu');
 if(menu){const row=document.createElement('div');row.id='meow-wand-entry';row.addEventListener('click',open);const b=make('meow-wand-button','✦ 猫猫星绘');b.removeEventListener('click',open);row.append(b);menu.append(row);}
 const host=document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings');
 host?.append(make('meow-open-settings','ฅ 打开猫猫星绘'));
 const top=document.querySelector('#top-settings-holder');
 const topButton=make('meow-top-button','✦');topButton.title='猫猫星绘';top?.append(topButton);
 const floating=make('meow-floating','');floating.title='猫猫星绘 · 点击打开，拖动移动';
 const img=document.createElement('img');img.alt='猫猫星绘';img.draggable=false;img.referrerPolicy='no-referrer';floating.append(img);document.body.append(floating);
 const fallback=document.createElement('span');fallback.textContent='ฅ';fallback.hidden=true;floating.append(fallback);
 const defaults=()=>new URL(mode==='bad'?'assets/love-transparent.png':'assets/pet-phone.png',base).href;
 img.addEventListener('load',()=>{img.hidden=false;fallback.hidden=true;});
 img.addEventListener('error',()=>{if(img.src!==defaults())img.src=defaults();else{img.hidden=true;fallback.hidden=false;}});
 const safeImage=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:defaults();}catch{return defaults();}};
 const clamp=(v,max)=>Math.min(Math.max(6,v),Math.max(6,max));
 const place=(x,y)=>{floating.style.left=`${clamp(x,innerWidth-floating.offsetWidth-6)}px`;floating.style.top=`${clamp(y,innerHeight-floating.offsetHeight-6)}px`;floating.style.right=floating.style.bottom='auto';};
 const refresh=()=>{topButton.hidden=preferences.top_enabled===false;floating.hidden=preferences.enabled===false;const size=Math.min(120,Math.max(36,Number(preferences.size)||64));for(const node of [floating,img,fallback]){for(const property of ['width','height','min-width','min-height','max-width','max-height'])node.style.setProperty(property,`${size}px`,'important');node.style.setProperty('box-sizing','border-box','important');node.style.setProperty('flex','none','important');}img.width=img.height=size;img.src=safeImage(mode==='bad'?preferences.bad_image:preferences.normal_image);if(Number.isFinite(preferences.x)&&Number.isFinite(preferences.y))place(preferences.x,preferences.y);else{place(innerWidth-size-12,innerHeight-size-110);}};
 let drag,suppress=false;
 floating.addEventListener('click',e=>{if(suppress){e.stopImmediatePropagation();e.preventDefault();suppress=false;}},true);
 floating.addEventListener('pointerdown',e=>{if(e.button!==0)return;suppress=false;const r=floating.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};floating.setPointerCapture(e.pointerId);});
 floating.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>10)drag.moved=true;if(drag.moved)place(drag.left+dx,drag.top+dy);});
 const finish=e=>{if(!drag||drag.id!==e.pointerId)return;suppress=drag.moved;if(drag.moved){const r=floating.getBoundingClientRect();preferences.x=r.left;preferences.y=r.top;save();}drag=null;};
 floating.addEventListener('pointerup',finish);floating.addEventListener('pointercancel',finish);
 window.addEventListener('resize',refresh);refresh();
 return {dialog,open,refresh,setMode(page){if(page==='bad'||page==='draw'){mode=page;refresh();}},reset(){delete preferences.x;delete preferences.y;preferences.normal_image='';preferences.bad_image='';preferences.enabled=true;refresh();save();}};
}
