const DB_NAME = "dmyc_quotes_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("quotes")) db.createObjectStore("quotes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("catalog")) db.createObjectStore("catalog", { keyPath: "name" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" }); // pendientes de sync
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    const out = fn(s);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

export async function getSetting(key, fallback=null){
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction("settings", "readonly");
    const s = t.objectStore("settings");
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
    r.onerror = () => resolve(fallback);
  });
}

export async function setSetting(key, value){
  return tx("settings", "readwrite", (s) => s.put({ key, value }));
}

export async function putQuote(q){ return tx("quotes", "readwrite", (s) => s.put(q)); }
export async function getQuote(id){
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction("quotes", "readonly");
    const s = t.objectStore("quotes");
    const r = s.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
}
export async function deleteQuote(id){ return tx("quotes", "readwrite", (s) => s.delete(id)); }
export async function listQuotes(){
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction("quotes", "readonly");
    const s = t.objectStore("quotes");
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
}

export async function upsertCatalogItem(name, last){
  return tx("catalog", "readwrite", (s) => s.put({ name, ...last }));
}
export async function listCatalog(){
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction("catalog", "readonly");
    const s = t.objectStore("catalog");
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
}

export async function putOutbox(item){ return tx("outbox", "readwrite", (s) => s.put(item)); }
export async function deleteOutbox(id){ return tx("outbox", "readwrite", (s) => s.delete(id)); }
export async function listOutbox(){
  const db = await openDB();
  return new Promise((resolve) => {
    const t = db.transaction("outbox", "readonly");
    const s = t.objectStore("outbox");
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
}
