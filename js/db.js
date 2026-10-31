/* IndexedDB の薄いラッパー。全データはこのブラウザ内に保存される */
window.DB = (() => {
  const NAME = 'biz-assistant';
  const VERSION = 1;
  const STORES = ['documents', 'customers', 'templates', 'settings'];
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const result = fn(s);
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
    });
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    STORES,
    uid,
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
    get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
    async put(store, obj) {
      if (!obj.id) obj.id = uid();
      const now = new Date().toISOString();
      obj.createdAt = obj.createdAt || now;
      obj.updatedAt = now;
      await tx(store, 'readwrite', (s) => s.put(obj));
      return obj;
    },
    remove: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
    clear: (store) => tx(store, 'readwrite', (s) => s.clear()),

    async exportAll() {
      const data = { app: 'biz-assistant', version: VERSION, exportedAt: new Date().toISOString() };
      for (const s of STORES) data[s] = await this.all(s);
      return data;
    },
    async importAll(data, { replace = true } = {}) {
      if (!data || data.app !== 'biz-assistant') throw new Error('Biz Assistant のバックアップファイルではありません');
      for (const s of STORES) {
        if (!Array.isArray(data[s])) continue;
        if (replace) await this.clear(s);
        await tx(s, 'readwrite', (st) => data[s].forEach((o) => st.put(o)));
      }
    },
  };
})();
