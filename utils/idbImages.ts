/**
 * Image persistence utilities.
 * Primary: saves images as files on disk via /api/images (file ref: "file://<key>")
 * Fallback: IndexedDB (ref: plain key without prefix — legacy)
 */

// ── File-based API ─────────────────────────────────────────

export async function saveImageToFile(dataUrl: string): Promise<string> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  if (!res.ok) throw new Error('Failed to save image to file');
  const { key } = await res.json();
  return key; // e.g. "m1abc-xyz.png"
}

export function getFileImageURL(key: string): string {
  return `/api/images/${encodeURIComponent(key)}`;
}

export async function deleteFileImage(key: string): Promise<void> {
  await fetch(`/api/images/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

// ── Unified helpers (handle both file:// and idb:// refs) ──

export async function saveImageDataUrl(dataUrl: string): Promise<string> {
  // Try file-based first
  try {
    const key = await saveImageToFile(dataUrl);
    return key; // stored on disk
  } catch (e) {
    console.warn('File API unavailable, falling back to IndexedDB', e);
  }
  // Fallback: IndexedDB
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    const key = 'idb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    store.put({ key, blob });
    tx.oncomplete = () => { db.close(); resolve(key); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Resolve an image key to a displayable URL.
 * - "file://<key>" or bare key without "idb-" prefix → served from /api/images/<key>
 * - "idb-..." → IndexedDB blob
 */
export async function getImageObjectURL(key: string): Promise<string | null> {
  if (key.startsWith('file://')) {
    return getFileImageURL(key.replace('file://', ''));
  }
  // If key does NOT start with "idb-", it's a file key (new default)
  if (!key.startsWith('idb-')) {
    return getFileImageURL(key);
  }
  // Legacy IDB key
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
  if (key.startsWith('file://')) {
    await deleteFileImage(key.replace('file://', ''));
    return;
  }
  if (!key.startsWith('idb-')) {
    // new file key
    await deleteFileImage(key);
    return;
  }
  // Legacy IDB
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    const store = tx.objectStore('images');
    const req = store.delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ── IndexedDB helpers (kept for legacy/fallback) ───────────

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

// ── Apartments file persistence ────────────────────────────

export async function loadApartmentsFromFile(): Promise<any[] | null> {
  try {
    const res = await fetch('/api/apartments');
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

export async function saveApartmentsToFile(data: any[]): Promise<boolean> {
  try {
    const res = await fetch('/api/apartments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}
