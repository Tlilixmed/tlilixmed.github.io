// Full-stack local E2E server: the REAL worker (real routes, real D1 SQL via
// node:sqlite, real ASSETS fall-through) + static files from cf-work.
// Events/leads land in a file-backed SQLite the test can inspect afterwards.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import worker from '/home/z/my-project/audit/tlilixmed.github.io/cf-work/worker/index.js';

const ROOT = '/home/z/my-project/audit/tlilixmed.github.io/cf-work';
const PORT = 8127;
const DB_FILE = '/tmp/e2e-gis.db';
try { statSync(DB_FILE); } catch { /* first run */ }
const db = new DatabaseSync(DB_FILE);
db.exec(readFileSync(`${ROOT}/schema.sql`, 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const env = {
  ADMIN_TOKEN: 'e2e-token',
  DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const mk = (params) => {
        const run = async () => {
          const info = stmt.run(...params);
          return { meta: { last_row_id: Number(info.lastInsertRowid || 0) }, changes: info.changes };
        };
        return Object.assign(run, {
          run,
          first: async () => stmt.get(...params) ?? null,
          all: async () => ({ results: stmt.all(...params) }),
          bind: (...p) => mk(p),
        });
      };
      return mk([]);
    },
    async batch(stmts) { for (const s of stmts) await s(); return []; },
  },
  ASSETS: {
    async fetch(request) {
      const u = new URL(request.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '/index.html') p = '/index.html';
      const fp = normalize(join(ROOT, p));
      if (!fp.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
      if (!existsSync(fp) || statSync(fp).isDirectory()) {
        // SPA-ish fallback: /lidar -> lidar/index.html
        const alt = join(ROOT, p.replace(/\/$/, ''), 'index.html');
        if (existsSync(alt)) {
          return new Response(readFileSync(alt), { headers: { 'content-type': MIME['.html'] } });
        }
        return new Response('not found: ' + p, { status: 404 });
      }
      return new Response(readFileSync(fp), { headers: { 'content-type': MIME[extname(fp)] || 'application/octet-stream' } });
    },
  },
  R2_PRIVATE: { list: async () => ({ objects: [] }) },
  R2_MEDIA: { list: async () => ({ objects: [] }) },
  R2_CLOUDS: { list: async () => ({ objects: [] }) },
};

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const url = 'http://localhost:' + PORT + req.url;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
      redirect: 'manual',
    });
    const resp = await worker.fetch(request, env, { waitUntil() {} });
    const headers = {};
    resp.headers.forEach((v, k) => { headers[k] = v; });
    const buf = Buffer.from(await resp.arrayBuffer());
    res.writeHead(resp.status, headers);
    res.end(buf);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('E2E server error: ' + (e && e.message || e));
  }
});
server.listen(PORT, () => console.log('E2E server on http://localhost:' + PORT));
