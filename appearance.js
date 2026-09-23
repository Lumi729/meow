const look=/(外貌|外观|长相|发色|发型|头发|眼睛|瞳|肤色|身高|体型|五官|面容|服饰|穿着|衣着|appearance|hair|eyes?|height|outfit|complexion|physique)/i;
export function appearanceExcerpt(text){
 const lines=String(text??'').split(/\n/),selected=new Set();
 lines.forEach((line,i)=>{if(look.test(line))for(let j=Math.max(0,i-1);j<=Math.min(lines.length-1,i+2);j++)selected.add(j);});
 return [...selected].sort((a,b)=>a-b).map(i=>lines[i]).join('\n').trim();
}
export async function scanAppearance(context,worldSettings={}){
 const characters=context.characters??[],group=context.groups?.find(g=>String(g.id)===String(context.groupId));
 const active=group?characters.filter(c=>group.members?.includes(c.avatar)):[characters[context.characterId]].filter(Boolean);
 const sources=[],records=[],books=new Set(),warnings=[];let scanned=0;
 const add=(name,text,force=false,key=name,person=name)=>{const excerpt=force?String(text||''):appearanceExcerpt(text);if(excerpt.trim()){sources.push(`[${name}]\n${excerpt.trim()}`);records.push({id:key,name:person,text:excerpt.trim(),source:name});}};
 for(const c of active){
  add(`角色：${c.name}`,c.description||c.data?.description,true,`card:${c.avatar||c.name}`,c.name);
  if(c.data?.extensions?.world)books.add(c.data.extensions.world);
  const file=String(c.avatar||'').replace(/\.[^.]+$/,'');for(const lore of worldSettings.world_info?.charLore??[])if(lore.name===file)for(const book of lore.extraBooks??[])books.add(book);
  for(const entry of c.data?.character_book?.entries??[]){scanned++;if(entry.enabled===false)continue;add(`角色内置世界书：${entry.name||entry.keys?.join(',')||''}`,entry.content,false,`embedded:${c.avatar||c.name}:${entry.id??scanned}`,entry.name||entry.keys?.[0]||'待整理人物');}
 }
 const power=context.powerUserSettings??{};add(`用户人设：${context.name1||'用户'}`,power.persona_description,true,`persona:${context.name1||'用户'}`,context.name1||'用户');
 for(const name of [context.chatMetadata?.world_info,power.persona_description_lorebook,...(worldSettings.world_info?.globalSelect??[])])if(typeof name==='string'&&name)books.add(name);
 const results=await Promise.allSettled([...books].map(async name=>{if(typeof context.loadWorldInfo!=='function')throw new Error('当前酒馆未提供世界书读取接口');const data=await context.loadWorldInfo(name);if(!data?.entries)throw new Error(`未读取到世界书：${name}`);return {name,entries:Object.entries(data.entries).map(([uid,e])=>({...e,uid:e.uid??uid}))};}));
 results.forEach(r=>{if(r.status==='rejected'){warnings.push(r.reason?.message||'世界书读取失败');return;}for(const entry of r.value.entries){scanned++;if(entry.disable||entry.enabled===false)continue;add(`世界书 ${r.value.name}：${entry.comment||entry.key?.join(',')||entry.uid}`,entry.content,false,`world:${r.value.name}:${entry.uid??scanned}`,entry.comment||entry.key?.[0]||'待整理人物');}});
 return {records,text:[...new Set(sources)].join('\n\n'),summary:`已扫描 ${active.length} 张角色卡、${books.size} 本关联世界书、${scanned} 条设定；提取 ${sources.length} 份候选资料。${warnings.join('；')}`,warnings};
}

// Stable across conversations; distinct cards with the same name never overwrite one another.
export function appearanceScope(context){
 const group=context.groups?.find(g=>String(g.id)===String(context.groupId));
 const cast=group?[...(group.members??[])].sort():[context.characters?.[context.characterId]?.avatar||`character:${context.characterId??'none'}`];
 return JSON.stringify([cast,context.name1||'用户']);
}
export function mergeAppearanceScan(archive,records){
 for(const record of records){
  const previous=archive[record.id];
  if(previous){previous.scannedText=record.text;previous.source=record.source;}
  else archive[record.id]={...record,scannedText:record.text,updated:Date.now()};
 }
 return records.map(r=>r.id);
}
export function formatAppearanceProfiles(archive,ids){
 return [...new Set(ids)].map(id=>archive[id]).filter(p=>p?.text?.trim()).map(p=>`[人物：${p.name}]\n${p.text.trim()}`).join('\n\n');
}
