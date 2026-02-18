/**
 * Vite server plugin that adds REST API endpoints for:
 * 1. File-based local persistence (data/ folder)
 * 2. Supabase Storage proxy (keeps service_role key on server)
 *
 * Local:     data/apartments.json, data/images/<key>
 * Supabase:  apartment-images bucket → data/apartments.json, images/<key>
 */
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

// ── Supabase config ────────────────────────────────────────
const SUPABASE_URL = 'https://axmjuqxyekfyxrjftkcr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bWp1cXh5ZWtmeXhyamZ0a2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQwMjY1NSwiZXhwIjoyMDg2OTc4NjU1fQ.yzQ8beCXNPodmffyVxg-oqmW-ks3KF4u4eGuGHPc_Ts';
const SB_BUCKET = 'apartment-images';

/** Upload a Buffer to Supabase Storage */
async function sbUpload(storagePath: string, buf: Buffer, contentType: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/storage/v1/object/${SB_BUCKET}/${storagePath}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',          // overwrite if exists
      },
      body: new Uint8Array(buf),
    });
    return res.ok;
  } catch { return false; }
}

/** Delete a file from Supabase Storage */
async function sbDelete(storagePath: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/storage/v1/object/${SB_BUCKET}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [storagePath] }),
    });
    return res.ok;
  } catch { return false; }
}

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const APARTMENTS_FILE = path.join(DATA_DIR, 'apartments.json');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function readApartments(): any[] {
  ensureDirs();
  if (!fs.existsSync(APARTMENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(APARTMENTS_FILE, 'utf-8'));
  } catch { return []; }
}

function writeApartments(data: any[]) {
  ensureDirs();
  fs.writeFileSync(APARTMENTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/** Collect raw body from IncomingMessage */
function collectBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default function apiPlugin(): Plugin {
  return {
    name: 'local-file-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // ── GET /api/apartments ──────────────────────────────
        if (url === '/api/apartments' && req.method === 'GET') {
          const data = readApartments();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return;
        }

        // ── POST /api/apartments ─────────────────────────────
        if (url === '/api/apartments' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const data = JSON.parse(body.toString('utf-8'));
            writeApartments(data);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── POST /api/images  (save image, returns key) ─────
        if (url === '/api/images' && req.method === 'POST') {
          try {
            ensureDirs();
            const body = await collectBody(req);
            // Expect JSON with { dataUrl: "data:image/..." }
            const { dataUrl } = JSON.parse(body.toString('utf-8'));
            // Parse data URL → buffer
            const match = (dataUrl as string).match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid data URL' }));
              return;
            }
            const ext = match[1].split('/')[1] || 'png';
            const buf = Buffer.from(match[2], 'base64');
            const key = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
            const filename = `${key}.${ext}`;
            fs.writeFileSync(path.join(IMAGES_DIR, filename), buf);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ key: filename }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── GET /api/images/<key> ────────────────────────────
        if (url.startsWith('/api/images/') && req.method === 'GET') {
          const key = decodeURIComponent(url.replace('/api/images/', ''));
          ensureDirs();
          const filePath = path.join(IMAGES_DIR, key);

          // If file doesn't exist locally, try downloading from Supabase
          if (!fs.existsSync(filePath)) {
            try {
              const sbUrl = `${SUPABASE_URL}/storage/v1/object/public/${SB_BUCKET}/images/${key}`;
              console.log(`[api] Image not found locally, downloading from Supabase: ${key}`);
              const sbRes = await fetch(sbUrl);
              if (sbRes.ok) {
                const bytes = new Uint8Array(await sbRes.arrayBuffer());
                fs.writeFileSync(filePath, bytes);
                console.log(`[api] Downloaded ${key} (${bytes.length} bytes)`);
              } else {
                console.warn(`[api] Supabase download failed for ${key}: ${sbRes.status}`);
                res.statusCode = 404;
                res.end('Not found');
                return;
              }
            } catch (e: any) {
              console.error(`[api] Failed to download ${key} from Supabase:`, e.message);
              res.statusCode = 404;
              res.end('Not found');
              return;
            }
          }

          const ext = path.extname(key).replace('.', '');
          res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        // ── DELETE /api/images/<key> ─────────────────────────
        if (url.startsWith('/api/images/') && req.method === 'DELETE') {
          const key = decodeURIComponent(url.replace('/api/images/', ''));
          const filePath = path.join(IMAGES_DIR, key);
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ══════════════════════════════════════════════════════
        // ═══  SUPABASE PROXY ENDPOINTS  ═══════════════════════
        // ══════════════════════════════════════════════════════

        // ── GET /api/supabase/status ─────────────────────────
        if (url === '/api/supabase/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, bucket: SB_BUCKET }));
          return;
        }

        // ── POST /api/supabase/data  (save apartments.json) ─
        if (url === '/api/supabase/data' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const ok = await sbUpload('data/apartments.json', body, 'application/json');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── POST /api/supabase/image  (upload image) ────────
        if (url === '/api/supabase/image' && req.method === 'POST') {
          try {
            const body = await collectBody(req);
            const { dataUrl } = JSON.parse(body.toString('utf-8'));
            const match = (dataUrl as string).match(/^data:(image\/[\w+]+);base64,(.+)$/);
            if (!match) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid data URL' }));
              return;
            }
            const ext = match[1].split('/')[1] || 'png';
            const buf = Buffer.from(match[2], 'base64');
            const key = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
            const ok = await sbUpload(`images/${key}`, buf, match[1]);
            if (!ok) {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: 'Supabase upload failed' }));
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ key }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── DELETE /api/supabase/image/<key> ─────────────────
        if (url.startsWith('/api/supabase/image/') && req.method === 'DELETE') {
          const key = decodeURIComponent(url.replace('/api/supabase/image/', ''));
          await sbDelete(`images/${key}`);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        next();
      });
    },
  };
}
