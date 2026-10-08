export function galleryStore(scope, { timeoutMs = 30000 } = {}) {
 let promise;
 const db = () => promise ??= new Promise((resolve, reject) => {
  const req = indexedDB.open('meow-gallery-v1', 1); let finished = false;
  const fail = error => { if (finished) return; finished = true; clearTimeout(timer); reject(error); };
  const timer = setTimeout(() => fail(new Error('图库打开超时，原图库未删除，请稍后重试。')), timeoutMs);
  req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
  req.onsuccess = () => {
   if (finished) { req.result.close(); return; }
   finished = true; clearTimeout(timer);
   req.result.onversionchange = () => { req.result.close(); promise = null; };
   req.result.onclose = () => { promise = null; };
   resolve(req.result);
  };
  req.onerror = () => fail(req.error);
  req.onblocked = () => fail(new Error('图库被其他页面占用，请关闭其他酒馆页面后重试；不要清除浏览器数据。'));
 }).catch(error => { promise = null; throw error; });
 const op = async (mode, action) => {
  const database = await db();
  return new Promise((resolve, reject) => {
   let tx, timer, result, settled = false;
   const fail = error => { if (settled) return; settled = true; clearTimeout(timer); try { tx?.abort(); } catch {} reject(error || new Error('图库存储失败')); };
   // A large library is allowed to keep reading while it makes progress.
   const touch = () => { if (settled) return; clearTimeout(timer); timer = setTimeout(() => { fail(new Error('图库读取或保存长时间没有进展，已停止等待；已有图片未删除，请重试。')); database.close(); promise = null; }, timeoutMs); };
   try {
    tx = database.transaction('images', mode); touch();
    tx.oncomplete = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error);
    action(tx.objectStore('images'), value => { result = value; touch(); }, touch, fail);
   } catch (error) { fail(error); }
  });
 };
 return {
  list: ({ onProgress } = {}) => op('readonly', (store, set, touch, fail) => {
   const entries = []; let scanned = 0, reportedAt = 0; const req = store.openCursor();
   const emit = () => { reportedAt = Date.now(); set(entries); onProgress?.(entries.slice().sort((a, b) => (b.created || 0) - (a.created || 0)), scanned); };
   req.onsuccess = () => {
    try {
     touch(); const cursor = req.result;
     if (!cursor) { entries.sort((a, b) => (b.created || 0) - (a.created || 0)); emit(); return; }
     scanned++; if (cursor.value.scope === scope) entries.push(cursor.value);
     if (scanned === 1 || scanned % 20 === 0 && Date.now() - reportedAt >= 200) emit();
     cursor.continue();
    } catch (error) { fail(error); }
   };
  }),
  get: id => op('readonly', (store, set) => { const req = store.get(id); req.onsuccess = () => set(req.result?.scope === scope ? req.result : undefined); }),
  put: entry => op('readwrite', (store, set) => { const req = store.put({ ...entry, scope }); req.onsuccess = () => set(req.result); }),
  // Recovery must never replace an existing original or migrate another scope.
  putIfAbsent: entry => op('readwrite', (store, set, touch, fail) => {
   const req = store.get(entry.id);
   req.onsuccess = () => {
    touch(); const existing = req.result;
    if (existing) { if (existing.scope !== scope) { fail(Object.assign(new Error('同编号图片已在另一个图库分组中，已跳过，未覆盖原记录。'), { code: 'scope_conflict' })); return; } set({ entry: existing, added: false }); return; }
    const restored = { ...entry, scope }, write = store.add(restored); write.onsuccess = () => set({ entry: restored, added: true });
   };
  }),
  remove: id => op('readwrite', (store, set) => { const req = store.delete(id); req.onsuccess = () => set(req.result); }),
 };
}
