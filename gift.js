// 千千送给梨梨的礼物：第一次打开的欢迎卡片、设置页「关于」、标题彩蛋里的小信。
// 想改信的内容，只改下面 LETTER 这一段就好（每一行一句）。
export const GIFT_TO='梨梨';
export const GIFT_FROM='千千';
export const GIFT_LINE='世界为梨梨诞生';
export const LETTER=[
 'hi梨梨酱，',
 '这是魔法猫猫，它会一遍一遍为你更新，',
 '画梨梨喜欢的画，把想象中的人带到你面前。',
 '初雪落下的时候天空碎成千千片，',
 '这个世界为梨梨诞生，猫猫也是。',
];

export function mountGift({root,ext,save}){
 const card=(id,label)=>{const d=document.createElement('dialog');d.id=id;d.className='meow-gift';d.setAttribute('aria-label',label);document.body.append(d);return d;};
 const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
 const sparkle=box=>{const sky=node('div','','meow-gift-sky');for(let i=0;i<14;i++){const s=node('span',i%3?'✦':'♡');s.style.left=`${Math.random()*100}%`;s.style.animationDelay=`${(Math.random()*2.4).toFixed(2)}s`;s.style.fontSize=`${10+Math.random()*12}px`;sky.append(s);}box.prepend(sky);};
 const welcome=card('meow-gift-welcome','送给梨梨的小礼物');
 function showWelcome(){
  welcome.replaceChildren(node('p','ฅ^•ﻌ•^ฅ','meow-gift-cat'),node('p',`送给${GIFT_TO}的小礼物 ♡`,'meow-gift-small'),node('h2',GIFT_LINE,'meow-gift-line'),node('p',`—— ${GIFT_FROM}`,'meow-gift-sign'));
  const ok=node('button','收下啦 ♡');ok.type='button';ok.addEventListener('click',()=>welcome.close());welcome.append(ok);sparkle(welcome);
  if(!welcome.open)welcome.showModal();
 }
 welcome.addEventListener('close',()=>{if(!ext.meow_gift_seen){ext.meow_gift_seen=true;save();}try{localStorage.setItem('meow-gift-seen','1');}catch{}});
 const letter=card('meow-gift-letter','给梨梨的信');
 function showLetter(){
  letter.replaceChildren(node('p','✉','meow-gift-cat'),...LETTER.map((line,i)=>node('p',line,i===0?'meow-gift-to':'meow-gift-text')),node('p',`—— ${GIFT_FROM}`,'meow-gift-sign'));
  const ok=node('button','折好收起来');ok.type='button';ok.addEventListener('click',()=>letter.close());letter.append(ok);sparkle(letter);
  if(!letter.open)letter.showModal();
 }
 // Easter egg: tap the ฅ^•ﻌ•^ฅ title five times quickly.
 const title=root.querySelector('.meow-header h2');let taps=[];
 title?.addEventListener('click',()=>{const now=Date.now();taps=[...taps.filter(t=>now-t<3000),now];if(taps.length>=5){taps=[];showLetter();}});
 if(title)title.style.cursor='default';
 root.querySelector('#meow-gift-again')?.addEventListener('click',showWelcome);
 const seen=()=>{if(ext.meow_gift_seen)return true;try{return localStorage.getItem('meow-gift-seen')==='1';}catch{return false;}};
 return {showWelcome,showLetter,firstOpen:()=>{if(!seen())showWelcome();}};
}
