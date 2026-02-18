/**
 * Vite server plugin that adds REST API endpoints for file-based persistence.
 * Data is saved to the `data/` directory inside the project:
 *   data/apartments.json   – listing metadata
 *   data/images/<key>.bin  – image blobs
 */
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

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
          const filePath = path.join(IMAGES_DIR, key);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const ext = path.extname(key).replace('.', '');
          res.setHeader('Content-Type', `image/${ext || 'png'}`);
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

        next();
      });
    },
  };
}
