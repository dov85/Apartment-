/**
 * Supabase Storage sync service.
 * Uses the Vite server proxy (/api/supabase/*) so that the service_role key
 * stays on the server and never ships to the browser.
 *
 * Bucket: apartment-images (public)
 *   - data/apartments.json   → apartment metadata
 *   - images/<key>            → image files
 */

import type { Property } from '../types';

const SUPABASE_URL = 'https://axmjuqxyekfyxrjftkcr.supabase.co';
const BUCKET = 'apartment-images';

// Public URL for reading (bucket is public)
export function getPublicImageUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/images/${key}`;
}

export function getPublicDataUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
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

// ─── Write (via server proxy to keep service_role key safe) ─

export async function saveApartmentsToCloud(data: Property[]): Promise<boolean> {
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

/**
 * Upload an image (as base64 data URL) to Supabase Storage.
 * Returns the storage key (filename).
 */
export async function uploadImageToCloud(dataUrl: string): Promise<string> {
  const res = await fetch('/api/supabase/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  if (!res.ok) throw new Error('Cloud image upload failed');
  const { key } = await res.json();
  return key;
}

/**
 * Delete an image from Supabase Storage.
 */
export async function deleteImageFromCloud(key: string): Promise<void> {
  await fetch(`/api/supabase/image/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

/**
 * Check whether the Supabase sync proxy is available (server running).
 */
export async function isCloudAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/supabase/status');
    return res.ok;
  } catch {
    return false;
  }
}
