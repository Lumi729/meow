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
