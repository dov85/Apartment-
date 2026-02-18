/**
 * Supabase Storage sync service.
 *
 * Two modes:
 * 1. **Server mode** (dev server running) – writes go through /api/supabase/*
 *    proxy so the service_role key stays on the server.
 * 2. **Standalone mode** (GitHub Pages / static build) – writes go directly
 *    to the Supabase Storage REST API from the browser. The service_role key
 *    is embedded in the client code.  This is acceptable for a personal app
 *    with no sensitive data.
 *
 * Bucket: apartment-images (public)
 *   - data/apartments.json   → apartment metadata
 *   - images/<key>            → image files
 */

import type { Property } from '../types';

const SUPABASE_URL = 'https://axmjuqxyekfyxrjftkcr.supabase.co';
const BUCKET = 'apartment-images';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bWp1cXh5ZWtmeXhyamZ0a2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQwMjY1NSwiZXhwIjoyMDg2OTc4NjU1fQ.' +
  'yzQ8beCXNPodmffyVxg-oqmW-ks3KF4u4eGuGHPc_Ts';

// ─── Mode detection (cached) ──────────────────────────────

let _serverAvailable: boolean | null = null;

/** Returns true when the Vite dev-server API is reachable. */
export async function isServerAvailable(): Promise<boolean> {
  if (_serverAvailable !== null) return _serverAvailable;
  try {
    const res = await fetch('/api/supabase/status', { signal: AbortSignal.timeout(1500) });
    _serverAvailable = res.ok;
  } catch {
    _serverAvailable = false;
  }
  return _serverAvailable;
}

// ─── Public URL helpers ────────────────────────────────────

export function getPublicImageUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/images/${key}`;
}

export function getPublicDataUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ─── Direct Supabase helpers (browser → Supabase) ─────────

/** Upload a Blob/ArrayBuffer directly to Supabase Storage. */
async function directUpload(
  storagePath: string,
  body: Blob | Uint8Array,
  contentType: string,
): Promise<boolean> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a file from Supabase Storage. */
async function directDelete(storagePath: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [storagePath] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Convert a data-URL to { blob, mimeType, ext }. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string; ext: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)/s);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2].replace(/\s/g, '')), c => c.charCodeAt(0));
  const mime = m[1];
  return {
    blob: new Blob([bytes], { type: mime }),
    mime,
    ext: mime.split('/')[1]?.split('+')[0] || 'png',
  };
}

// ─── Read (direct public access — no auth needed) ──────────

export async function loadApartmentsFromCloud(): Promise<Property[] | null> {
  try {
    const res = await fetch(getPublicDataUrl('data/apartments.json'), {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ─── Write (auto-selects proxy vs direct) ──────────────────

export async function saveApartmentsToCloud(data: Property[]): Promise<boolean> {
  const server = await isServerAvailable();
  if (server) {
    try {
      const res = await fetch('/api/supabase/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  // Direct mode
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  return directUpload('data/apartments.json', blob, 'application/json');
}

/**
 * Upload an image (as base64 data URL) to Supabase Storage.
 * Returns the storage key (filename).
 */
export async function uploadImageToCloud(dataUrl: string): Promise<string> {
  const server = await isServerAvailable();
  if (server) {
    const res = await fetch('/api/supabase/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) throw new Error('Cloud image upload failed');
    const { key } = await res.json();
    return key;
  }
  // Direct mode — use fetch() to robustly convert data URL to Blob
  let blob: Blob;
  try {
    const fetchRes = await fetch(dataUrl);
    blob = await fetchRes.blob();
  } catch (e) {
    // Fallback: try manual parsing
    const parsed = dataUrlToBlob(dataUrl);
    if (!parsed) throw new Error('Invalid data URL — could not convert to blob');
    blob = parsed.blob;
  }
  const mime = blob.type || 'image/png';
  const ext = mime.split('/')[1]?.split('+')[0]?.split(';')[0] || 'png';
  const key =
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
  console.log('Uploading image to Supabase:', key, 'size:', blob.size, 'type:', mime);
  const ok = await directUpload(`images/${key}`, blob, mime);
  if (!ok) throw new Error('Direct Supabase image upload failed for key: ' + key);
  console.log('Image uploaded successfully:', key);
  return key;
}

/**
 * Delete an image from Supabase Storage.
 */
export async function deleteImageFromCloud(key: string): Promise<void> {
  const server = await isServerAvailable();
  if (server) {
    await fetch(`/api/supabase/image/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return;
  }
  await directDelete(`images/${key}`);
}

/**
 * Check whether cloud functionality is available.
 * Always true — we can always reach Supabase directly.
 */
export async function isCloudAvailable(): Promise<boolean> {
  return true;
}

/**
 * Get total storage usage in the Supabase bucket.
 * Returns { totalBytes, fileCount }.
 */
export async function getCloudStorageUsage(): Promise<{ totalBytes: number; fileCount: number }> {
  let totalBytes = 0;
  let fileCount = 0;

  const listFolder = async (prefix: string) => {
    const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix, limit: 10000 }),
      });
      if (!res.ok) return;
      const items: any[] = await res.json();
      for (const item of items) {
        if (item.id) {
          // It's a file
          totalBytes += item.metadata?.size || 0;
          fileCount++;
        }
      }
    } catch {}
  };

  await Promise.all([listFolder('data'), listFolder('images')]);
  return { totalBytes, fileCount };
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
