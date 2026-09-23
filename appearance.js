const look=/(外貌|外观|长相|发色|发型|头发|眼睛|瞳|肤色|身高|体型|五官|面容|服饰|穿着|衣着|appearance|hair|eyes?|height|outfit|complexion|physique)/i;
export function appearanceExcerpt(text){
 const lines=String(text??'').split(/\n/),selected=new Set();
 lines.forEach((line,i)=>{if(look.test(line))for(let j=Math.max(0,i-1);j<=Math.min(lines.length-1,i+2);j++)selected.add(j);});
 return [...selected].sort((a,b)=>a-b).map(i=>lines[i]).join('\n').trim();
}
// Feature groups: a person entry mentions at least two different kinds of look (e.g. hair + eyes).
const features=[/(发|髮|hair|刘海|bangs)/i,/(眼|瞳|eyes?)/i,/(身高|体型|身材|个子|肤|皮肤|height|figure|skin|slim|petite)/i,/(五官|面容|脸|长相|容貌|face|lips?)/i,/(服|衣|穿|裙|裤|鞋|外套|衬衫|outfit|wear|dress|shirt|coat)/i];
// Titles that describe the world, rules or formatting rather than a person.
const notPerson=/(世界观|世界设定|世界书|规则|生成|系统|格式|输出|指令|说明|模板|背景|地图|地点|场景|组织|势力|机构|剧情|大纲|事件|时间线|物品|道具|技能|功法|货币|状态栏|文风|破限|预设|总结|变量|副本|任务|前情|摘要|注意|待整理|开场|主线|设定集|城市|学校|公司)/;
const featureCount=text=>features.filter(r=>r.test(String(text??''))).length;
// A person entry needs two kinds of look; a named extra (e.g. "陈野衣柜") only needs one.
export function looksLikePerson(title,text,names=[]){
 if(!title||notPerson.test(title))return false;
 const count=featureCount(text);if(count>=2)return true;
 return count>=1&&names.some(n=>n&&n.length>=2&&title.includes(n)&&title!==n);
}
const personName=(entry,fallback)=>{
 const title=String(entry.comment||entry.name||'').trim();if(title)return title;
 const named=String(entry.content??'').match(/(?:姓名|名字|名称|name)\s*[:：]\s*([^\n，,。；;]{1,20})/i);if(named)return named[1].trim();
 const key=(entry.key||entry.keys||[]).find(k=>typeof k==='string'&&k.trim()&&k.length<=20);return key?key.trim():fallback;
};
export async function scanAppearance(context,worldSettings={},persona={}){
 const characters=context.characters??[],group=context.groups?.find(g=>String(g.id)===String(context.groupId));
 const active=group?characters.filter(c=>group.members?.includes(c.avatar)):[characters[context.characterId]].filter(Boolean);
 const sources=[],records=[],books=new Set(),warnings=[];let scanned=0,skipped=0;
 const add=(name,text,force=false,key=name,person=name,placeholder=false)=>{const excerpt=force?String(text||''):appearanceExcerpt(text);if(excerpt.trim()){sources.push(`[${name}]\n${excerpt.trim()}`);records.push({id:key,name:person,text:excerpt.trim(),source:name});}else if(placeholder)records.push({id:key,name:person,text:'',source:name});};
 const pending=[];const entry=(label,e,key)=>{scanned++;pending.push({label,e,key,person:personName(e,'')});};
 for(const c of active){
  add(`角色：${c.name}`,c.description||c.data?.description,true,`card:${c.avatar||c.name}`,c.name);
  if(c.data?.extensions?.world)books.add(c.data.extensions.world);
  const file=String(c.avatar||'').replace(/\.[^.]+$/,'');for(const lore of worldSettings.world_info?.charLore??[])if(lore.name===file)for(const book of lore.extraBooks??[])books.add(book);
  for(const e of c.data?.character_book?.entries??[]){if(e.enabled===false){scanned++;continue;}entry('角色内置世界书',{...e,comment:e.comment||e.name},`embedded:${c.avatar||c.name}:${e.id??scanned}`);}
 }
 // The user persona is always offered, even when it lives outside any lorebook or is still empty.
 const power=context.powerUserSettings??{},userName=context.name1||'用户';
 const userText=persona.description||power.persona_description||(persona.avatar&&power.persona_descriptions?.[persona.avatar]?.description)||'';
 add(`用户人设：${userName}`,userText,true,`persona:${userName}`,userName,true);
 for(const name of [context.chatMetadata?.world_info,power.persona_description_lorebook,...(worldSettings.world_info?.globalSelect??[])])if(typeof name==='string'&&name)books.add(name);
 const results=await Promise.allSettled([...books].map(async name=>{if(typeof context.loadWorldInfo!=='function')throw new Error('当前酒馆未提供世界书读取接口');const data=await context.loadWorldInfo(name);if(!data?.entries)throw new Error(`未读取到世界书：${name}`);return {name,entries:Object.entries(data.entries).map(([uid,e])=>({...e,uid:e.uid??uid}))};}));
 results.forEach(r=>{if(r.status==='rejected'){warnings.push(r.reason?.message||'世界书读取失败');return;}for(const e of r.value.entries){if(e.disable||e.enabled===false){scanned++;continue;}entry(`世界书 ${r.value.name}`,e,`world:${r.value.name}:${e.uid??scanned}`);}});
 const names=[...active.map(c=>c.name),userName,...pending.filter(x=>looksLikePerson(x.person,x.e.content)).map(x=>x.person)];
 for(const x of pending){if(looksLikePerson(x.person,x.e.content,names))add(`${x.label}：${x.person}`,x.e.content,!appearanceExcerpt(x.e.content),x.key,x.person);else skipped++;}
 const user=records.find(x=>x.id===`persona:${userName}`);
 return {records,text:[...new Set(sources)].join('\n\n'),summary:`已扫描 ${active.length} 张角色卡、${books.size} 本关联世界书、${scanned} 条设定；识别出 ${records.length} 位人物，跳过 ${skipped} 条非人物条目（世界观、规则等）。${user?.text?'':`用户「${userName}」没有人设描述，已建空白档案，可手动填写外貌。`}${warnings.join('；')}`,warnings};
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
  if(previous){if(!previous.text&&!previous.edited)previous.text=record.text;previous.scannedText=record.text;previous.source=record.source;}
  else archive[record.id]={...record,scannedText:record.text,updated:Date.now()};
 }
 return records.map(r=>r.id);
}
// Drop old scan results that a rescan no longer counts as people, unless the user edited them.
export function pruneAppearanceScan(archive,states,current,found){
 const keep=new Set(found),removed=[];
 for(const id of [...current.ids]){const p=archive[id];if(!/^(world|embedded):/.test(id)||keep.has(id)||!p||p.edited||(p.text&&p.text!==p.scannedText))continue;current.ids=current.ids.filter(x=>x!==id);removed.push(id);}
 for(const id of removed)if(!Object.values(states).some(s=>s.ids?.includes(id)))delete archive[id];
 return removed;
}
export function formatAppearanceProfiles(archive,ids){
 return [...new Set(ids)].map(id=>archive[id]).filter(p=>p?.text?.trim()).map(p=>`[人物：${p.name}]\n${p.text.trim()}`).join('\n\n');
}
