/**
 * Image persistence utilities.
 * Primary: saves images as files on disk via /api/images (file ref: "file://<key>")
 * Cloud:   also uploads to Supabase Storage (directly or via proxy)
 * Standalone: when file API is unreachable (GitHub Pages), stores only in cloud
 * Fallback: IndexedDB (ref: plain key without prefix — legacy)
 */

import { uploadImageToCloud, deleteImageFromCloud, getPublicImageUrl, isServerAvailable } from '../services/supabaseSync';

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
  // Upload to Supabase cloud — this MUST succeed for cross-device access
  // Retry once on failure before giving up
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const key = await uploadImageToCloud(dataUrl);
      console.log('Image saved to Supabase cloud ☁️:', key);
      return key;
    } catch (e) {
      lastError = e as Error;
      console.warn(`Cloud upload attempt ${attempt + 1} failed:`, e);
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
    }
  }
  // Both attempts failed — throw with the actual error so the user sees it
  throw new Error(`העלאת תמונה לענן נכשלה: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Resolve an image key to a displayable URL.
 * - "cloud://<key>" → Supabase public URL
 * - "file://<key>" or bare key without "idb-" prefix →
 *     server mode: served from /api/images/<key>
 *     standalone:  Supabase public URL for images/<key>
 * - "idb-..." → IndexedDB blob
 */
export async function getImageObjectURL(key: string): Promise<string | null> {
  if (key.startsWith('cloud://')) {
    return getPublicImageUrl(key.replace('cloud://', ''));
  }

  const bareKey = key.startsWith('file://') ? key.replace('file://', '') : key;

  // Non-IDB key
  if (!key.startsWith('idb-')) {
    const server = await isServerAvailable();
    if (server) {
      return getFileImageURL(bareKey);
    }
    // Standalone: use Supabase public URL
    return getPublicImageUrl(bareKey);
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
  if (key.startsWith('cloud://')) {
    await deleteImageFromCloud(key.replace('cloud://', ''));
    return;
  }
  if (key.startsWith('file://')) {
    await deleteFileImage(key.replace('file://', ''));
    return;
  }
  if (!key.startsWith('idb-')) {
    // new file key — also try deleting from cloud
    await deleteFileImage(key);
    deleteImageFromCloud(key).catch(() => {});
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
