// "画图" next to the 书摘 (Book Excerpt) script's floating bars, without changing that script.
// Meow never puts anything inside 书摘's bars (other scripts add their own buttons there and may remove
// them when the bar changes). Instead a separate little button follows the bar and sits beside it.
const ICON='<svg viewBox="0 0 24 24"><path d="M12 3l2.2 5.6L20 9.3l-4.4 3.8 1.4 5.9L12 16l-5 3 1.4-5.9L4 9.3l5.8-.7z"/></svg>';
export function selectionInfo(doc){
 const sel=doc.defaultView.getSelection?.();const text=String(sel?.toString()||'').trim();
 const node=sel?.anchorNode,el=node?.nodeType===1?node:node?.parentElement;
 const mes=el?.closest?.('.mes[mesid]');return {text,messageIndex:mes?Number(mes.getAttribute('mesid')):null};
}
export function highlightInfo(doc,id){
 const spans=[...doc.querySelectorAll(`.be-highlight[data-be-id="${CSS.escape(id)}"]`)];
 const mes=spans[0]?.closest('.mes[mesid]');
 return {text:spans.map(s=>s.textContent).join('').trim(),messageIndex:mes?Number(mes.getAttribute('mesid')):null};
}
export function mountExcerptBridge(doc,onDraw){
 const win=doc.defaultView;let lastHighlight='',current=null;
 doc.addEventListener('pointerdown',e=>{const h=e.target?.closest?.('.be-highlight[data-be-id]');if(h)lastHighlight=h.getAttribute('data-be-id');},true);
 const button=doc.createElement('button');button.type='button';button.id='meow-be-draw';button.innerHTML=`<span class="meow-be-sep"></span><span class="meow-be-inner">${ICON}<span>画图</span></span>`;button.title='用猫猫星绘把这段画出来';button.hidden=true;
 doc.body.append(button);
 // Keep the text selection alive while pressing, exactly like 书摘's own bar does.
 button.addEventListener('pointerdown',e=>e.preventDefault());button.addEventListener('mousedown',e=>e.preventDefault());
 let busy=false;
 button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(busy||!current)return;busy=true;setTimeout(()=>busy=false,400);
  const info=current.kind==='float'?selectionInfo(doc):(lastHighlight?highlightInfo(doc,lastHighlight):{text:''});
  current.bar.classList.remove('show');button.hidden=true;Promise.resolve(onDraw(info)).catch(()=>{});});
 const shown=bar=>bar&&bar.isConnected&&bar.classList.contains('show')&&win.getComputedStyle(bar).display!=='none';
 const copy=(from,to,props)=>{const cs=win.getComputedStyle(from);for(const p of props)to.style.setProperty(p,cs.getPropertyValue(p));};
 const place=()=>{
  const float=doc.getElementById('be-float-bar'),hl=doc.getElementById('be-hl-bar');
  current=shown(float)?{kind:'float',bar:float}:shown(hl)?{kind:'hl',bar:hl}:null;
  if(!current){button.hidden=true;return;}
  const bar=current.bar,r=bar.getBoundingClientRect(),cs=win.getComputedStyle(bar),vw=doc.documentElement.clientWidth;
  const inner=button.querySelector('.meow-be-inner'),sep=button.querySelector('.meow-be-sep'),sample=bar.querySelector('.be-fbtn,button'),sampleIcon=sample?.querySelector('svg'),divider=bar.querySelector('.be-fbtn-divider');
  button.style.background=cs.backgroundColor;button.style.color=cs.color;
  if(sample)copy(sample,inner,['font-size','font-family','font-weight','line-height','letter-spacing','color','padding-top','padding-bottom','padding-left','padding-right','gap','flex-direction','align-items','justify-content']);
  if(sampleIcon){const ic=win.getComputedStyle(sampleIcon);const svg=inner.querySelector('svg');svg.style.width=ic.width;svg.style.height=ic.height;svg.style.strokeWidth=ic.strokeWidth;}
  if(divider){copy(divider,sep,['width','height','background-color','margin-left','margin-right','opacity']);sep.style.display='';}else sep.style.display='none';
  button.hidden=false;
  const radius=parseFloat(cs.borderTopRightRadius)||0,merge=current.kind==='float';
  // Joined to the bar's right end so the row reads as one; too narrow → a separate pill under the bar.
  button.classList.toggle('meow-be-joined',merge);
  let left,top,w;
  if(merge){button.style.height=`${r.height}px`;button.style.borderRadius=`0 ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} 0`;button.style.paddingLeft=`${radius}px`;button.style.boxShadow='none';
   w=button.offsetWidth;left=r.right-radius;top=r.top;
   if(left+w>vw-4){button.classList.remove('meow-be-joined');button.style.height='';button.style.borderRadius=cs.borderTopRightRadius;button.style.paddingLeft='';sep.style.display='none';w=button.offsetWidth;left=Math.max(6,Math.min(r.right-w,vw-w-6));top=r.bottom+6;}}
  else{button.style.height='';button.style.borderRadius=cs.borderTopRightRadius||'12px';button.style.paddingLeft='';sep.style.display='none';w=button.offsetWidth;left=Math.max(6,Math.min(r.right-w,vw-w-6));top=r.bottom+6;}
  button.style.left=`${left+win.scrollX}px`;button.style.top=`${top+win.scrollY}px`;
 };
 let queued=false;const schedule=()=>{if(queued)return;queued=true;win.requestAnimationFrame?win.requestAnimationFrame(()=>{queued=false;place();}):setTimeout(()=>{queued=false;place();},16);};
 new win.MutationObserver(list=>{if(list.some(m=>m.target!==button&&!button.contains(m.target)))schedule();}).observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
 win.addEventListener('scroll',schedule,true);win.addEventListener('resize',schedule);
 place();
 return {place,button};
}
