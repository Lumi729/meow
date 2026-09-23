// Adds a "画图" button to the 书摘 (Book Excerpt) script's floating bars without changing that script.
// The selection bar (#be-float-bar) and the existing-highlight bar (#be-hl-bar) live in the main document.
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
 let lastHighlight='';
 doc.addEventListener('pointerdown',e=>{const h=e.target?.closest?.('.be-highlight[data-be-id]');if(h)lastHighlight=h.getAttribute('data-be-id');},true);
 const make=(cls,get,close)=>{const b=doc.createElement('button');b.type='button';b.className=cls;b.innerHTML=`${ICON}<span>画图</span>`;b.title='用猫猫星绘把这段画出来';
  let busy=false;const fire=e=>{e.preventDefault();e.stopPropagation();if(busy)return;busy=true;setTimeout(()=>busy=false,400);const info=get();close();Promise.resolve(onDraw(info)).catch(()=>{});};
  b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',fire);return b;};
 const ensure=()=>{
  const bar=doc.getElementById('be-float-bar');
  if(bar&&!bar.querySelector('.meow-be-btn')){const d=doc.createElement('span');d.className='be-fbtn-divider meow-be-divider';
   bar.append(d,make('be-fbtn meow-be-btn',()=>selectionInfo(doc),()=>{bar.classList.remove('show');}));}
  const hl=doc.getElementById('be-hl-bar'),row=hl?.querySelector('.be-hl-row1');
  if(row&&!row.querySelector('.meow-be-btn'))row.append(make('meow-be-btn',()=>lastHighlight?highlightInfo(doc,lastHighlight):{text:''},()=>hl.classList.remove('show')));
 };
 let queued=false;
 new doc.defaultView.MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;ensure();});}).observe(doc.body,{childList:true,subtree:true});
 ensure();
 return {ensure};
}
