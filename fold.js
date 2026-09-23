// Every multi-line box in the panel folds into a one-line summary with a preview; tap to expand.
const valueDescriptor=node=>{for(let p=Object.getPrototypeOf(node);p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,'value');if(d?.set)return d;}return null;};
export function foldTextarea(area){
 if(area.dataset.meowFold||area.closest('.meow-fold,[data-no-fold]'))return;
 area.dataset.meowFold='1';
 const doc=area.ownerDocument,label=area.parentElement?.tagName==='LABEL'&&area.parentElement.querySelectorAll('input,select,textarea').length===1?area.parentElement:null;
 const host=label||area,details=doc.createElement('details'),summary=doc.createElement('summary'),title=doc.createElement('span'),preview=doc.createElement('span');
 details.className='meow-fold';title.className='meow-fold-title';preview.className='meow-fold-preview';
 let text=area.getAttribute('aria-label')||'内容';
 if(label){const words=[...label.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());if(words.length){text=words.map(n=>n.textContent.trim()).join(' ');words.forEach(n=>n.remove());}}
 title.textContent=text;if(!area.getAttribute('aria-label'))area.setAttribute('aria-label',text);
 const update=()=>{const v=String(area.value||'').replace(/\s+/g,' ').trim();preview.textContent=v?(v.length>40?`${v.slice(0,40)}…`:v):(area.placeholder?'（空）':'');};
 const d=valueDescriptor(area);
 if(d)Object.defineProperty(area,'value',{configurable:true,get(){return d.get.call(this);},set(v){d.set.call(this,v);update();}});
 area.addEventListener('input',update);
 host.replaceWith(details);summary.append(title,preview);details.append(summary,host);update();
}
export function foldAll(root){
 const run=node=>{if(node.nodeType!==1)return;if(node.tagName==='TEXTAREA')foldTextarea(node);else node.querySelectorAll?.('textarea').forEach(foldTextarea);};
 run(root);
 new (root.ownerDocument.defaultView.MutationObserver)(list=>{for(const m of list)m.addedNodes.forEach(run);}).observe(root,{childList:true,subtree:true});
}
// Long explanation lines shrink to a small round "!" at the end of the line above; tap to show the text.
export function foldHints(root){
 for(const small of [...root.querySelectorAll('small')]){
  if(small.id||small.getAttribute('role')||small.children.length||small.classList.contains('meow-hint-text')||small.closest('summary,.meow-tool-item,.meow-gallery,.meow-quick')||small.textContent.trim().length<12)continue;
  const doc=small.ownerDocument,dot=doc.createElement('button');
  dot.type='button';dot.className='meow-hint-dot';dot.textContent='!';dot.title='点开看说明';dot.setAttribute('aria-label','说明');dot.setAttribute('aria-expanded','false');
  small.classList.add('meow-hint-text');small.hidden=true;
  dot.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();small.hidden=!small.hidden;dot.setAttribute('aria-expanded',String(!small.hidden));});
  const label=small.parentElement?.tagName==='LABEL'?small.parentElement:null;
  let prev=label||small.previousElementSibling;
  while(prev&&prev.classList.contains('meow-hint-text'))prev=prev.previousElementSibling;
  if(label)label.after(small);
  // A block (list, button group, picker) or a heading: hang the dot on the section title instead of a line of its own.
  if(!label&&(!prev||/^H[1-6]$/.test(prev.tagName)||(prev.tagName==='DIV'&&!prev.classList.contains('meow-hint-row')))){let h=prev;while(h&&!/^H[1-6]$/.test(h.tagName))h=h.previousElementSibling;if(h){h.append(dot);continue;}}
  if(prev?.tagName==='SUMMARY')prev.append(dot);
  else if(prev?.classList.contains('meow-hint-row'))prev.append(dot);
  else if(prev?.matches('details')&&prev.querySelector(':scope > summary')&&prev.parentElement===small.parentElement)prev.querySelector(':scope > summary').append(dot);
  else if(prev&&!prev.matches('details,hr')&&prev.parentElement===small.parentElement){const row=doc.createElement('div');row.className='meow-hint-row';prev.replaceWith(row);row.append(prev,dot);}
  else{const row=doc.createElement('div');row.className='meow-hint-row meow-hint-alone';small.before(row);row.append(dot);}
 }
}
