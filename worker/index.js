// ============================================================
// GIS portfolio API — Worker entry point
// ------------------------------------------------------------
// Serves:
//   /api/health          binding sanity check (D1 + R2)
//   /api/manifest        public map manifest (published only, D1-driven)
//   /api/layer-data/:id  derived GeoJSON streamed from R2 (`repo` bucket)
//   /api/pointclouds     public point-cloud catalog (published only)
//   /clouds/*            Potree octrees streamed from R2 (clouds-public bucket)
//   /api/admin/*         admin CRUD (token-guarded until Cloudflare Access, Phase 7)
// Everything else -> static assets (ASSETS binding).
// ============================================================
import { handleAdmin } from './admin.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const MIME_BY_EXT = {
  json: 'application/json; charset=utf-8',
  bin: 'application/octet-stream',
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
};

function extMime(key) {
  const m = key.toLowerCase().match(/\.([a-z0-9]+)$/);
  return (m && MIME_BY_EXT[m[1]]) || 'application/octet-stream';
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function fail(status, message) {
  return json({ error: message }, status);
}

// ------------------------------------------------------------
// GET /api/health — verify bindings without touching data
// ------------------------------------------------------------
async function health(env) {
  const out = { ok: true, d1: false, r2: {} };
  try {
    await env.DB.prepare('SELECT 1').first();
    out.d1 = true;
  } catch (e) {
    out.d1 = false;
    out.d1_error = String(e && e.message ? e.message : e);
  }
  for (const [name, binding] of [['gis-private', env.R2_PRIVATE], ['repo', env.R2_MEDIA], ['clouds-public', env.R2_CLOUDS]]) {
    try {
      if (binding && typeof binding.head === 'function') { await binding.head('__probe__'); out.r2[name] = true; }
      else out.r2[name] = false;
    } catch (e) { out.r2[name] = false; }
  }
  out.ok = out.d1 && Object.values(out.r2).every(Boolean);
  return json(out, out.ok ? 200 : 500);
}

// ------------------------------------------------------------
// GET /api/manifest — same shape as window.MAP_PROJECTS
// ------------------------------------------------------------
async function manifest(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id AS pid, p.slug, p.title_en, p.title_fr, p.desc_en, p.desc_fr,
            p.category, p.year, p.color, p.visible, p.collapsed,
            l.id AS lid, l.label_en, l.label_fr, l.style_json, l.fields_json, l.visible AS lvisible
     FROM projects p
     JOIN layers l ON l.project_id = p.id
     WHERE p.published = 1 AND l.published = 1 AND l.r2_key IS NOT NULL
     ORDER BY p.sort_order, p.id, l.sort_order, l.id`
  ).all();

  const projects = [];
  const bySlug = new Map();
  for (const r of results) {
    let p = bySlug.get(r.slug);
    if (!p) {
      p = {
        id: r.slug,
        title: { en: r.title_en, fr: r.title_fr },
        desc: { en: r.desc_en, fr: r.desc_fr },
        category: r.category,
        year: r.year,
        color: r.color,
        visible: !!r.visible,
        collapsed: !!r.collapsed,
        layers: [],
      };
      bySlug.set(r.slug, p);
      projects.push(p);
    }
    let style = {};
    try { style = JSON.parse(r.style_json || '{}'); } catch { style = {}; }
    const layer = {
      file: `/api/layer-data/${r.lid}`,
      label: { en: r.label_en, fr: r.label_fr || r.label_en },
      visible: !!r.lvisible,
    };
    // style keys the frontend understands, if present
    for (const k of ['color', 'outerColor', 'weight', 'dash', 'fillOpacity', 'radius', 'minZoom', 'maxZoom']) {
      if (style[k] !== undefined && style[k] !== null) layer[k] = style[k];
    }
    p.layers.push(layer);
  }
  return json({ projects }, 200, { 'cache-control': 'public, max-age=60' });
}

// ------------------------------------------------------------
// GET /api/layer-data/:id — stream derived GeoJSON from R2
// ------------------------------------------------------------
async function layerData(env, id) {
  const row = await env.DB.prepare(
    `SELECT r2_key FROM layers WHERE id = ? AND published = 1 AND r2_key IS NOT NULL`
  ).bind(id).first();
  if (!row) return fail(404, 'layer not found or unpublished');
  const obj = await env.R2_MEDIA.get(row.r2_key);
  if (!obj) return fail(404, 'derived data missing in R2 (key: ' + row.r2_key + ')');
  const headers = {
    'content-type': 'application/geo+json; charset=utf-8',
    'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
  };
  if (obj.size !== undefined) headers['content-length'] = String(obj.size);
  return new Response(obj.body, { headers });
}

// ------------------------------------------------------------
// GET /api/pointclouds — public catalog for the /lidar viewer (Phase 5)
// ------------------------------------------------------------
async function pointclouds(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, title_en, title_fr, desc_en, desc_fr, prefix, status, point_count, srs
     FROM pointclouds WHERE published = 1 ORDER BY slug`
  ).all();
  return json({ pointclouds: results }, 200, { 'cache-control': 'public, max-age=60' });
}

// ------------------------------------------------------------
// GET /clouds/<key> — stream Potree octree files from R2 (Phase 5)
// Supports Range requests (Potree lazy-loads slices of octree.bin).
// Same-origin => no CORS needed. data.tliligis.me can front this later.
// ------------------------------------------------------------
async function cloudAsset(env, request, rawKey) {
  const key = rawKey.replace(/\/{2,}/g, '/');
  if (!key || key.includes('..') || key.startsWith('/')) return fail(404, 'not found');

  const hasRange = request.headers.has('range');
  const opts = hasRange ? { range: request.headers } : undefined;
  const obj = await env.R2_CLOUDS.get(key, opts);
  if (!obj) return fail(404, 'not found in clouds-public: ' + key);

  const headers = new Headers();
  headers.set('content-type', extMime(key));
  headers.set('accept-ranges', 'bytes');
  headers.set('etag', obj.httpEtag);
  // octree chunks are immutable -> cache hard; metadata.json -> short cache
  headers.set('cache-control', key.endsWith('.bin')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300, stale-while-revalidate=86400');
  obj.writeHttpMetadata(headers);

  if (hasRange && obj.range && (obj.range.offset !== undefined || obj.range.length !== undefined)) {
    const size = obj.size;
    const start = obj.range.offset !== undefined ? obj.range.offset : (obj.range.length !== undefined ? size - obj.range.length : 0);
    const len = obj.range.length !== undefined ? obj.range.length : (size - start);
    headers.set('content-range', `bytes ${start}-${start + len - 1}/${size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') return await health(env);
      if (path === '/api/manifest') return await manifest(env);
      if (path === '/api/pointclouds') return await pointclouds(env);

      const m = path.match(/^\/api\/layer-data\/(\d+)$/);
      if (m) return await layerData(env, Number(m[1]));

      const c = path.match(/^\/clouds\/(.+)$/);
      if (c) return await cloudAsset(env, request, decodeURIComponent(c[1]));

      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env, path);

      if (path.startsWith('/api/')) return fail(404, 'unknown API route: ' + path);
    } catch (e) {
      console.error('api error', path, e);
      return fail(500, String(e && e.message ? e.message : e));
    }

    // static site
    return env.ASSETS.fetch(request);
  },
};
