const safePath = path => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[\s<>"\\]/.test(path);
export function chatGalleryCandidates(chat, key) {
 const seen = new Set(), entries = [];
 chat.forEach((message, index) => {
  for (const group of message.extra?.meow_inline || []) for (const variant of group.variants || []) {
   if (!variant.id || seen.has(variant.id) || !safePath(variant.path) || !variant.payload) continue;
   seen.add(variant.id);
   const source = { ...structuredClone(group.source || {}), messageIndex: index, messageSnapshot: group.snapshot ?? group.source?.messageSnapshot ?? message.mes };
   entries.push({ id: variant.id, src: variant.path, payload: structuredClone(variant.payload), title: variant.title || '从正文找回的图片', source: [source], insertionSource: source, chatKey: key, bad: true, recovered: true, created: Date.parse(message.send_date) || Date.now(), ...(variant.scene ? { scene: structuredClone(variant.scene) } : {}) });
  }
 });
 return entries;
}
const asDataURL = (blob, mime) => new Promise((resolve, reject) => {
 const reader = new window.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('正文图片转换失败。')); reader.readAsDataURL(new window.Blob([blob], { type: mime }));
});
export async function recoverChatGallery({ chat, key, store, signal, check = () => {}, onEntry = () => {}, onProgress = () => {}, fetcher = fetch, toDataURL = asDataURL }) {
 const candidates = chatGalleryCandidates(chat, key), stats = { total: candidates.length, restored: 0, existing: 0, failed: 0, errors: [] };
 const verify = () => { signal?.throwIfAborted(); check(); };
 for (const candidate of candidates) {
  verify(); let entry;
  try {
   const existing = await store.get(candidate.id); verify();
   if (existing) { onEntry(existing); stats.existing++; continue; }
   const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 30000);
   signal?.addEventListener('abort', abort, { once: true });
   try {
    const response = await fetcher(candidate.src, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`正文图片文件无法读取（HTTP ${response.status}）。`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const mime = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : '';
    if (!mime) throw new Error('正文图片地址没有返回有效图片，未写入图库。');
    const src = await toDataURL(blob, mime); verify(); entry = { ...candidate, src };
   } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
   const saved = await store.putIfAbsent(entry); onEntry(saved.entry); if (saved.added) stats.restored++; else stats.existing++;
  } catch (error) {
   verify(); stats.failed++; stats.errors.push(`${candidate.title}：${error.message}`);
   if (entry && error.code !== 'scope_conflict') onEntry({ ...entry, unsaved: true });
  } finally { onProgress({ ...stats }); }
 }
 return stats;
}
