const look=/(外貌|外观|长相|发色|发型|头发|眼睛|瞳|肤色|身高|体型|五官|面容|服饰|穿着|衣着|appearance|hair|eyes?|height|outfit|complexion|physique)/i;
export function appearanceExcerpt(text){
 const lines=String(text??'').split(/\n/),selected=new Set();
 lines.forEach((line,i)=>{if(look.test(line))for(let j=Math.max(0,i-1);j<=Math.min(lines.length-1,i+2);j++)selected.add(j);});
 return [...selected].sort((a,b)=>a-b).map(i=>lines[i]).join('\n').trim();
}
export async function scanAppearance(context,worldSettings={}){
 const characters=context.characters??[],group=context.groups?.find(g=>String(g.id)===String(context.groupId));
 const active=group?characters.filter(c=>group.members?.includes(c.avatar)):[characters[context.characterId]].filter(Boolean);
 const sources=[],books=new Set(),warnings=[];let scanned=0;
 const add=(name,text,force=false)=>{const excerpt=force?String(text||''):appearanceExcerpt(text);if(excerpt.trim())sources.push(`[${name}]\n${excerpt.trim()}`);};
 for(const c of active){
  add(`角色：${c.name}`,c.description||c.data?.description,true);
  if(c.data?.extensions?.world)books.add(c.data.extensions.world);
  const file=String(c.avatar||'').replace(/\.[^.]+$/,'');for(const lore of worldSettings.world_info?.charLore??[])if(lore.name===file)for(const book of lore.extraBooks??[])books.add(book);
  for(const entry of c.data?.character_book?.entries??[]){scanned++;if(entry.enabled===false)continue;add(`角色内置世界书：${entry.name||entry.keys?.join(',')||''}`,entry.content);}
 }
 const power=context.powerUserSettings??{};add(`用户人设：${context.name1||'用户'}`,power.persona_description,true);
 for(const name of [context.chatMetadata?.world_info,power.persona_description_lorebook,...(worldSettings.world_info?.globalSelect??[])])if(typeof name==='string'&&name)books.add(name);
 const results=await Promise.allSettled([...books].map(async name=>{if(typeof context.loadWorldInfo!=='function')throw new Error('当前酒馆未提供世界书读取接口');const data=await context.loadWorldInfo(name);if(!data?.entries)throw new Error(`未读取到世界书：${name}`);return {name,entries:Object.values(data.entries)};}));
 results.forEach(r=>{if(r.status==='rejected'){warnings.push(r.reason?.message||'世界书读取失败');return;}for(const entry of r.value.entries){scanned++;if(entry.disable||entry.enabled===false)continue;add(`世界书 ${r.value.name}：${entry.comment||entry.key?.join(',')||entry.uid}`,entry.content);}});
 return {text:[...new Set(sources)].join('\n\n'),summary:`已扫描 ${active.length} 张角色卡、${books.size} 本关联世界书、${scanned} 条设定；提取 ${sources.length} 份候选资料。${warnings.join('；')}`,warnings};
}
