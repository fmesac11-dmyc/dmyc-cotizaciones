const DB_NAME = "dmyc_quotes_db_local";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("quotes")) db.createObjectStore("quotes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeReq(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const out = fn(store);
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  }));
}

export async function getSetting(key, fallback=null){
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("settings","readonly");
    const s = tx.objectStore("settings");
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
    r.onerror = () => resolve(fallback);
  });
}

export async function setSetting(key, value){
  return storeReq("settings", "readwrite", s => s.put({ key, value }));
}

export async function putQuote(q){ return storeReq("quotes","readwrite", s => s.put(q)); }

export async function getQuote(id){
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("quotes","readonly");
    const s = tx.objectStore("quotes");
    const r = s.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
}

export async function deleteQuote(id){ return storeReq("quotes","readwrite", s => s.delete(id)); }

export async function listQuotes(){
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("quotes","readonly");
    const s = tx.objectStore("quotes");
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
}

export async function replaceAllQuotes(quotes){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("quotes","readwrite");
    const s = tx.objectStore("quotes");
    s.clear();
    for (const q of quotes) s.put(q);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
