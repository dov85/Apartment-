/**
 * One-time script: upload all local images from data/images/ to Supabase Storage.
 * Run with: node upload-images.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://axmjuqxyekfyxrjftkcr.supabase.co';
const BUCKET = 'apartment-images';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bWp1cXh5ZWtmeXhyamZ0a2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQwMjY1NSwiZXhwIjoyMDg2OTc4NjU1fQ.' +
  'yzQ8beCXNPodmffyVxg-oqmW-ks3KF4u4eGuGHPc_Ts';

const IMAGES_DIR = path.join(__dirname, 'data', 'images');

async function upload(filename) {
  const filePath = path.join(IMAGES_DIR, filename);
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filename).replace('.', '');
  const contentType = `image/${ext || 'png'}`;
  const storagePath = `images/${filename}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(buf),
  });

  if (res.ok) {
    console.log(`  ✓ ${filename}`);
  } else {
    const text = await res.text();
    console.error(`  ✗ ${filename} — ${res.status}: ${text}`);
  }
  return res.ok;
}

async function main() {
  const files = fs.readdirSync(IMAGES_DIR).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  console.log(`Uploading ${files.length} images to Supabase...`);
  let ok = 0, fail = 0;
  for (const f of files) {
    if (await upload(f)) ok++; else fail++;
  }
  console.log(`\nDone: ${ok} uploaded, ${fail} failed.`);
}

main();
