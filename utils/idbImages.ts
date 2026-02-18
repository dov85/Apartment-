export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ApartmentImagesDB', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveImageDataUrl(dataUrl: string): Promise<string> {
  // convert dataURL to Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    const key = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    store.put({ key, blob });
    tx.oncomplete = () => { db.close(); resolve(key); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getImageObjectURL(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const store = tx.objectStore('images');
    const req = store.get(key);
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec) { db.close(); resolve(null); return; }
      const url = URL.createObjectURL(rec.blob as Blob);
      db.close();
      resolve(url);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteImageKey(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    const req = store.delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
