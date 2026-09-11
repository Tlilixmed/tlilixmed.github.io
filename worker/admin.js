// ============================================================
// Admin API — /api/admin/*
// ------------------------------------------------------------
// Phase 4: guarded by X-Admin-Token secret (ADMIN_TOKEN).
// Phase 7: replaced/strengthened by Cloudflare Access JWT checks.
//
// Endpoints
//   GET    /api/admin/projects                    all projects + layers (incl. unpublished)
//   POST   /api/admin/projects                    create project
//   PUT    /api/admin/projects/:id                update project (partial)
//   DELETE /api/admin/projects/:id                delete project + its layers
//   POST   /api/admin/projects/:id/publish        set published 0|1  {published: bool}
//   POST   /api/admin/layers                      create layer {project_id, slug, label_en, ...}
//   PUT    /api/admin/layers/:id                  update layer (partial)
//   DELETE /api/admin/layers/:id                  delete layer (+ features)
//   POST   /api/admin/layers/:id/publish          set published 0|1
//   POST   /api/admin/upload/geojson?layer_id=N   replace a layer's data (see size note in docs)
//   POST   /api/admin/upload/las?cloud_id=N&filename=scan.las
//                                                 store the raw source scan in gis-private
//                                                 (never served publicly; <=100 MB)
//   POST   /api/admin/upload/octree?cloud_id=N&path=cloud.js
//                                                 store one Potree octree file under the
//                                                 cloud's prefix in clouds-public. Uploading
//                                                 cloud.js / metadata.json flips status to
//                                                 'ready' and records point_count.
//   GET    /api/admin/pointclouds/:id/files       list objects stored under the prefix
//   DELETE /api/admin/pointclouds/:id/file?path=<rel>
//                                                 delete ONE stored object under the prefix
//   POST   /api/admin/pointclouds/:id/multipart?path=<rel>
//                                                 start a chunked multipart upload for large
//                                                 files (octree.bin is typically 100-400 MB and
//                                                 exceeds the Workers request-body limit when
//                                                 sent as one request). Returns {uploadId}.
//   PUT    /api/admin/pointclouds/:id/multipart/<uploadId>?part=N&path=<rel>
//                                                 upload one part (<= 64 MB body). Returns
//                                                 {partNumber, etag}.
//   POST   /api/admin/pointclouds/:id/multipart/<uploadId>/complete?path=<rel>
//                                                 body {parts:[{partNumber, etag}...]} —
//                                                 finalize; metadata.json/cloud.js still flips
//                                                 status to 'ready' + records point_count.
//   POST   /api/admin/pointclouds/:id/multipart/<uploadId>/abort?path=<rel>
//                                                 cancel a chunked upload.
//   GET    /api/admin/pointclouds/:id/uploads      recent upload history (upload_log table,
//                                                 migration 002 — endpoints degrade gracefully
//                                                 if the table does not exist yet).
//   GET    /api/admin/pointclouds                 all point clouds
//   POST   /api/admin/pointclouds                 register one (e.g. "LAS 1")
//   PUT    /api/admin/pointclouds/:id             update (rename, publish, set prefix/status)
// ============================================================

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function fail(status, message) {
  return json({ error: message }, status);
}

async function tokenOK(request, env) {
  const a = request.headers.get('x-admin-token') || '';
  const b = env.ADMIN_TOKEN || '';
  if (!a || !b) return false;
  try {
    const enc = new TextEncoder();
    const [h1, h2] = await Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode(a)),
      crypto.subtle.digest('SHA-256', enc.encode(b)),
    ]);
    if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(h1, h2);
    const v1 = new Uint8Array(h1), v2 = new Uint8Array(h2);
    let diff = 0;
    for (let i = 0; i < v1.length; i++) diff |= v1[i] ^ v2[i];
    return diff === 0;
  } catch { return false; }
}

// columns a client may write, per table (SQL-injection safe dynamic updates)
const WRITABLE = {
  projects: ['slug', 'title_en', 'title_fr', 'desc_en', 'desc_fr', 'category', 'year', 'color', 'visible', 'collapsed', 'sort_order', 'published'],
  layers: ['slug', 'label_en', 'label_fr', 'r2_key', 'original_key', 'style_json', 'fields_json', 'visible', 'published', 'sort_order'],
  pointclouds: ['slug', 'title_en', 'title_fr', 'desc_en', 'desc_fr', 'bucket', 'prefix', 'status', 'point_count', 'srs', 'published'],
};

function buildUpdate(table, body) {
  const allowed = WRITABLE[table];
  const cols = [];
  const vals = [];
  for (const k of allowed) {
    if (body[k] === undefined) continue;
    cols.push(`${k} = ?`);
    vals.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]);
  }
  if (!cols.length) return null;
  cols.push(`updated_at = datetime('now')`);
  return { sql: cols.join(', '), vals };
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

// ------------------------------------------------------------
// Point-cloud uploads (browser -> R2, streamed, no buffering).
// The browser sends the raw File as the request body; Workers gives us a
// fixed-length stream whenever content-length is present, which R2 accepts
// directly — so multi-MB octree files pass through without ever being
// buffered in the isolate.
// ------------------------------------------------------------

// "a/b/../../etc" style traversal is rejected; empty segments dropped.
function sanitizeRel(p) {
  const parts = String(p || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length || parts.some((s) => s === '.' || s === '..')) return null;
  return parts.join('/');
}

function requiredLength(request) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (!cl) return null;
  return cl;
}

async function uploadCloudSource(request, env, cloudId, filename) {
  const c = await env.DB.prepare(`SELECT id, slug, status FROM pointclouds WHERE id = ?`).bind(cloudId).first();
  if (!c) return fail(404, 'point cloud not found');
  const ext = String(filename || '').toLowerCase().match(/\.la[sz]$/);
  if (!ext) return fail(400, 'expected a .las or .laz file (pass &filename=scan.las)');
  const cl = requiredLength(request);
  if (!cl) return fail(411, 'content-length required');
  if (cl > 100 * 1024 * 1024) {
    return fail(413, 'source is ' + Math.round(cl / 1048576) + ' MB — browser upload is capped at 100 MB. ' +
      'Convert locally with PotreeConverter and upload the octree folder instead (the viewer streams the octree, not the raw scan).');
  }
  const key = `originals/${c.slug}/source${ext[0]}`;
  await logUpload(env, cloudId, filename, cl, null, 'uploading');
  try {
    await env.R2_PRIVATE.put(key, request.body, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
  } catch (e) {
    await logUpload(env, cloudId, filename, cl, null, 'failed', String((e && e.message) || e));
    throw e;
  }
  await logUpload(env, cloudId, filename, cl, null, 'complete');
  if (c.status === 'awaiting_upload') {
    await env.DB.prepare(`UPDATE pointclouds SET status = 'source_uploaded', updated_at = datetime('now') WHERE id = ?`).bind(cloudId).run();
  }
  return json({ ok: true, key, bytes: cl, note: 'stored in gis-private (never served publicly)' });
}

async function uploadOctreeFile(request, env, cloudId, rel) {
  const c = await env.DB.prepare(`SELECT id, slug, prefix, status FROM pointclouds WHERE id = ?`).bind(cloudId).first();
  if (!c) return fail(404, 'point cloud not found');
  const prefix = String(c.prefix || (c.slug + '/'));
  const key = prefix + rel;
  const cl = requiredLength(request);
  if (!cl) return fail(411, 'content-length required');

  // cloud.js (Potree 1.x) / metadata.json (Potree 2.x) carry the point count:
  // parse them and flip the cloud to ready automatically.
  const isMeta = /(^|\/)(cloud\.js|metadata\.json)$/.test(rel);
  let body = request.body;
  let meta = null;
  if (isMeta && cl <= 8 * 1024 * 1024) {
    const text = await request.text();
    body = text;
    try { meta = JSON.parse(text); } catch { meta = null; }
  }

  await logUpload(env, cloudId, rel, cl, null, 'uploading');
  try {
    await env.R2_CLOUDS.put(key, body, {
      httpMetadata: { contentType: isMeta ? 'application/json; charset=utf-8' : 'application/octet-stream' },
    });
  } catch (e) {
    await logUpload(env, cloudId, rel, cl, null, 'failed', String((e && e.message) || e));
    throw e;
  }
  await logUpload(env, cloudId, rel, cl, null, 'complete');

  if (meta) {
    const points = Number(meta.points || meta.pointCount || 0) || null;
    await env.DB.prepare(
      `UPDATE pointclouds SET point_count = COALESCE(?, point_count), status = 'ready', updated_at = datetime('now') WHERE id = ?`
    ).bind(points, cloudId).run();
  } else if (c.status === 'awaiting_upload') {
    await env.DB.prepare(`UPDATE pointclouds SET status = 'processing', updated_at = datetime('now') WHERE id = ?`).bind(cloudId).run();
  }
  return json({ ok: true, key, bytes: cl, parsed_meta: !!meta });
}

// ------------------------------------------------------------
// Upload tracking (upload_log). Best-effort: if migration 002 has not
// been applied yet the endpoints must keep working, so every log write
// is swallowed. Run:  npx wrangler d1 execute gis-db --remote \
//   --file derived/migrations/002-upload-log.sql
// ------------------------------------------------------------

async function logUpload(env, cloudId, filename, sizeBytes, parts, status, error) {
  try {
    if (status === 'uploading') {
      await env.DB.prepare(
        `INSERT INTO upload_log (cloud_id, filename, size_bytes, parts, status) VALUES (?, ?, ?, ?, ?)`
      ).bind(cloudId, filename, sizeBytes == null ? null : Math.round(sizeBytes), parts == null ? null : parts, 'uploading').run();
    } else {
      await env.DB.prepare(
        `UPDATE upload_log SET status = ?, error = ?, size_bytes = COALESCE(?, size_bytes), finished_at = datetime('now')
         WHERE id = (SELECT id FROM upload_log WHERE cloud_id = ? AND filename = ? ORDER BY id DESC LIMIT 1)`
      ).bind(status, error || null, sizeBytes == null ? null : Math.round(sizeBytes), cloudId, filename).run();
    }
  } catch { /* log only — never block an upload */ }
}

async function listUploads(request, env, cloudId) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, filename, size_bytes, parts, status, error, started_at, finished_at
       FROM upload_log WHERE cloud_id = ? ORDER BY id DESC LIMIT 20`
    ).bind(cloudId).all();
    return json({ uploads: results || [] });
  } catch {
    return json({ uploads: [], note: 'upload_log table missing — run derived/migrations/002-upload-log.sql' });
  }
}

// ------------------------------------------------------------
// Chunked multipart uploads (R2 binding multipart API).
// A single Worker request cannot carry a ~300 MB octree.bin (platform
// request-body limit), so the browser slices the file into <= 32 MB
// parts and each part is its own request: start -> PUT parts ->
// complete. Parts are buffered (bounded by the 64 MB guard) and handed
// to R2 via resumeMultipartUpload().uploadPart().
// ------------------------------------------------------------

const PART_MAX = 64 * 1024 * 1024; // hard server-side guard; client slices at 32 MB

function cloudKeyFor(c, rel) {
  return String(c.prefix || (c.slug + '/')) + rel;
}

async function cloudById(env, cloudId) {
  return env.DB.prepare(`SELECT id, slug, prefix, status FROM pointclouds WHERE id = ?`).bind(cloudId).first();
}

async function startMultipart(request, env, cloudId) {
  const c = await cloudById(env, cloudId);
  if (!c) return fail(404, 'point cloud not found');
  const rel = sanitizeRel(new URL(request.url).searchParams.get('path') || '');
  if (!rel) return fail(400, 'query param path is required (relative path, no ..)');
  const key = cloudKeyFor(c, rel);
  const isMeta = /(^|\/)(cloud\.js|metadata\.json)$/.test(rel);
  const mpu = await env.R2_CLOUDS.createMultipartUpload(key, {
    httpMetadata: { contentType: isMeta ? 'application/json; charset=utf-8' : 'application/octet-stream' },
  });
  await logUpload(env, cloudId, rel, null, null, 'uploading');
  return json({ ok: true, uploadId: mpu.uploadId, key, partMax: PART_MAX });
}

async function uploadMultipartPart(request, env, cloudId, uploadId) {
  const c = await cloudById(env, cloudId);
  if (!c) return fail(404, 'point cloud not found');
  const url = new URL(request.url);
  const rel = sanitizeRel(url.searchParams.get('path') || '');
  const part = Number(url.searchParams.get('part') || 0);
  if (!rel) return fail(400, 'query param path is required');
  if (!Number.isInteger(part) || part < 1 || part > 10000) return fail(400, 'query param part must be an integer 1..10000');
  const cl = Number(request.headers.get('content-length') || 0);
  if (!cl) return fail(411, 'content-length required');
  if (cl > PART_MAX) {
    return fail(413, 'part is ' + Math.round(cl / 1048576) + ' MB — slice files into parts of 32 MB or less');
  }
  const key = cloudKeyFor(c, rel);
  const buf = await request.arrayBuffer(); // bounded: guarded to <= 64 MB above
  const mpu = env.R2_CLOUDS.resumeMultipartUpload(key, String(uploadId));
  const uploaded = await mpu.uploadPart(part, buf);
  return json({ ok: true, partNumber: uploaded.partNumber, etag: uploaded.etag, bytes: buf.byteLength });
}

async function finishMultipart(request, env, cloudId, uploadId, action) {
  const c = await cloudById(env, cloudId);
  if (!c) return fail(404, 'point cloud not found');
  const rel = sanitizeRel(new URL(request.url).searchParams.get('path') || '');
  if (!rel) return fail(400, 'query param path is required');
  const key = cloudKeyFor(c, rel);
  if (action === 'abort') {
    try { await env.R2_CLOUDS.resumeMultipartUpload(key, String(uploadId)).abort(); } catch { /* already gone */ }
    await logUpload(env, cloudId, rel, null, null, 'failed', 'aborted by user');
    return json({ ok: true, aborted: true });
  }
  const b = await readBody(request);
  const parts = Array.isArray(b.parts) && b.parts.length
    ? b.parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })).sort((x, y) => x.partNumber - y.partNumber)
    : null;
  if (!parts) return fail(400, 'body.parts must be a non-empty array of {partNumber, etag}');
  const isMeta = /(^|\/)(cloud\.js|metadata\.json)$/.test(rel);
  try {
    const mpu = env.R2_CLOUDS.resumeMultipartUpload(key, String(uploadId));
    const done = await mpu.complete(parts);
    let points = null;
    if (isMeta) {
      try {
        const obj = await env.R2_CLOUDS.get(key);
        const meta = JSON.parse(await new Response(obj.body).text());
        points = Number(meta.points || meta.pointCount || 0) || null;
      } catch { points = null; }
    }
    await env.DB.prepare(
      `UPDATE pointclouds SET point_count = COALESCE(?, point_count), status = 'ready', updated_at = datetime('now') WHERE id = ?`
    ).bind(points, cloudId).run();
    await logUpload(env, cloudId, rel, done.size, parts.length, 'complete');
    return json({ ok: true, key, size: done.size, point_count: points });
  } catch (e) {
    await logUpload(env, cloudId, rel, null, parts.length, 'failed', String((e && e.message) || e));
    return fail(500, 'multipart complete failed: ' + String((e && e.message) || e));
  }
}

async function deleteCloudFile(request, env, cloudId) {
  const c = await cloudById(env, cloudId);
  if (!c) return fail(404, 'point cloud not found');
  const rel = sanitizeRel(new URL(request.url).searchParams.get('path') || '');
  if (!rel) return fail(400, 'query param path is required (relative path, no ..)');
  const key = cloudKeyFor(c, rel);
  await env.R2_CLOUDS.delete(key);
  return json({ ok: true, deleted: key });
}

async function listCloudFiles(request, env, cloudId) {
  const c = await env.DB.prepare(`SELECT id, slug, prefix FROM pointclouds WHERE id = ?`).bind(cloudId).first();
  if (!c) return fail(404, 'point cloud not found');
  const prefix = String(c.prefix || (c.slug + '/'));
  const cursor = new URL(request.url).searchParams.get('cursor') || undefined;
  const page = await env.R2_CLOUDS.list({ prefix, cursor, limit: 400 });
  const objects = (page.objects || []).map((o) => ({ key: o.key.slice(prefix.length), size: o.size }));
  return json({
    prefix,
    objects,
    truncated: !!page.truncated,
    cursor: page.truncated ? page.cursor : null,
  });
}

// ------------------------------------------------------------
// Upload endpoint — replace a layer's GeoJSON.
// Original -> gis-private (never served). Whitelisted copy -> repo bucket.
// NOTE: intended for datasets up to a few MB (Workers CPU limits).
// Multi-MB datasets: use scripts/import_geojson.py locally instead.
// ------------------------------------------------------------
async function uploadGeojson(request, env, layerId) {
  const layer = await env.DB.prepare(
    `SELECT l.id, l.slug, l.fields_json, p.slug AS project_slug
     FROM layers l JOIN projects p ON p.id = l.project_id WHERE l.id = ?`
  ).bind(layerId).first();
  if (!layer) return fail(404, 'layer not found');

  let data;
  try { data = JSON.parse(await request.text()); } catch (e) { return fail(400, 'body is not valid JSON: ' + e.message); }
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return fail(400, 'expected a GeoJSON FeatureCollection');
  }

  // fields_json = drop-list (attributes stripped from the derived copy). Empty = publish all.
  let drop = [];
  try { drop = JSON.parse(layer.fields_json || '[]'); if (!Array.isArray(drop)) drop = []; } catch { drop = []; }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const originalKey = `originals/${layer.project_slug}/${layer.slug}/${ts}.geojson`;
  const derivedKey = `geojson/${layer.project_slug}/${layer.slug}.geojson`;

  // 1) untouched original into the private bucket
  await env.R2_PRIVATE.put(originalKey, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/geo+json' },
  });

  // 2) whitelisted derived copy into the public bucket
  const features = data.features.map((ft) => {
    if (!drop.length || !ft.properties) return ft;
    const props = { ...ft.properties };
    for (const k of drop) delete props[k];
    return { ...ft, properties: props };
  });
  const derived = { type: 'FeatureCollection', features };
  const derivedText = JSON.stringify(derived);
  await env.R2_MEDIA.put(derivedKey, derivedText, {
    httpMetadata: { contentType: 'application/geo+json' },
  });

  await env.DB.prepare(
    `UPDATE layers SET r2_key = ?, original_key = ?, feature_count = ?, byte_size = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(derivedKey, originalKey, features.length, derivedText.length, layerId).run();

  return json({ ok: true, layer_id: layer.id, derived_key: derivedKey, original_key: originalKey, features: features.length, bytes: derivedText.length });
}

// ------------------------------------------------------------
export async function handleAdmin(request, env, path) {
  if (!(await tokenOK(request, env))) {
    return fail(401, 'missing or invalid X-Admin-Token (set secret ADMIN_TOKEN)');
  }
  const method = request.method;
  const seg = path.split('/').filter(Boolean); // ['api','admin',...]
  const what = seg[2];
  const id = seg[3] ? Number(seg[3]) : null;
  const action = seg[4] || null;

  // ---- projects ----
  if (what === 'projects') {
    if (method === 'GET') {
      const projects = await env.DB.prepare(`SELECT * FROM projects ORDER BY sort_order, id`).all();
      const layers = await env.DB.prepare(`SELECT * FROM layers ORDER BY sort_order, id`).all();
      const byP = new Map((projects.results || []).map((p) => [p.id, { ...p, layers: [] }]));
      for (const l of layers.results || []) {
        const p = byP.get(l.project_id);
        if (p) p.layers.push(l);
      }
      return json({ projects: [...byP.values()] });
    }
    if (method === 'POST' && id === null) {
      const b = await readBody(request);
      if (!b.slug || !b.title_en) return fail(400, 'slug and title_en are required');
      const r = await env.DB.prepare(
        `INSERT INTO projects (slug, title_en, title_fr, desc_en, desc_fr, category, year, color, visible, collapsed, sort_order, published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        String(b.slug), String(b.title_en), b.title_fr || '', b.desc_en || '', b.desc_fr || '',
        b.category || 'Other', b.year || '', b.color || '#2098d8',
        b.visible === undefined ? 1 : Number(!!b.visible), b.collapsed === undefined ? 1 : Number(!!b.collapsed),
        Number(b.sort_order || 0), Number(!!b.published)
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (method === 'PUT' && id) {
      const u = buildUpdate('projects', await readBody(request));
      if (!u) return fail(400, 'no writable fields in body');
      await env.DB.prepare(`UPDATE projects SET ${u.sql} WHERE id = ?`).bind(...u.vals, id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && id) {
      await env.DB.prepare(`DELETE FROM features WHERE layer_id IN (SELECT id FROM layers WHERE project_id = ?)`).bind(id).run();
      await env.DB.prepare(`DELETE FROM layers WHERE project_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- layers ----
  if (what === 'layers') {
    // GET /api/admin/layers/:id/data — preview payload (published or not)
    if (method === 'GET' && id && action === 'data') {
      const row = await env.DB.prepare(
        `SELECT r2_key FROM layers WHERE id = ? AND r2_key IS NOT NULL`
      ).bind(id).first();
      if (!row) return fail(404, 'layer has no data in R2 (upload it first)');
      const obj = await env.R2_MEDIA.get(row.r2_key);
      if (!obj) return fail(404, 'derived data missing in R2 (key: ' + row.r2_key + ')');
      const headers = {
        'content-type': 'application/geo+json; charset=utf-8',
        'cache-control': 'no-store',
      };
      if (obj.size !== undefined) headers['content-length'] = String(obj.size);
      return new Response(obj.body, { headers });
    }
    if (method === 'POST' && id === null && !action) {
      const b = await readBody(request);
      if (!b.project_id || !b.slug || !b.label_en) return fail(400, 'project_id, slug and label_en are required');
      const r = await env.DB.prepare(
        `INSERT INTO layers (project_id, slug, label_en, label_fr, style_json, fields_json, visible, published, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        Number(b.project_id), String(b.slug), String(b.label_en), b.label_fr || '',
        JSON.stringify(b.style || {}), JSON.stringify(b.fields || []),
        b.visible === undefined ? 1 : Number(!!b.visible), Number(!!b.published), Number(b.sort_order || 0)
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (method === 'PUT' && id) {
      const u = buildUpdate('layers', await readBody(request));
      if (!u) return fail(400, 'no writable fields in body');
      await env.DB.prepare(`UPDATE layers SET ${u.sql} WHERE id = ?`).bind(...u.vals, id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && id) {
      await env.DB.prepare(`DELETE FROM features WHERE layer_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM layers WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
    if (method === 'POST' && id && action === 'publish') {
      const b = await readBody(request);
      const pub = b.published === undefined ? 1 : Number(!!b.published);
      await env.DB.prepare(`UPDATE layers SET published = ?, updated_at = datetime('now') WHERE id = ?`).bind(pub, id).run();
      return json({ ok: true, published: !!pub });
    }
    // upload lives at /api/admin/upload/geojson (below), kept out of :id space
  }

  // ---- upload ----
  if (what === 'upload' && seg[3] === 'geojson' && method === 'POST') {
    const url = new URL(request.url);
    const layerId = Number(url.searchParams.get('layer_id') || 0);
    if (!layerId) return fail(400, 'query param layer_id is required');
    return uploadGeojson(request, env, layerId);
  }
  if (what === 'upload' && seg[3] === 'las' && method === 'POST') {
    const url = new URL(request.url);
    const cloudId = Number(url.searchParams.get('cloud_id') || 0);
    if (!cloudId) return fail(400, 'query param cloud_id is required');
    return uploadCloudSource(request, env, cloudId, url.searchParams.get('filename') || '');
  }
  if (what === 'upload' && seg[3] === 'octree' && method === 'POST') {
    const url = new URL(request.url);
    const cloudId = Number(url.searchParams.get('cloud_id') || 0);
    const rel = sanitizeRel(url.searchParams.get('path') || '');
    if (!cloudId) return fail(400, 'query param cloud_id is required');
    if (!rel) return fail(400, 'query param path is required (relative path, no ..)');
    return uploadOctreeFile(request, env, cloudId, rel);
  }

  // ---- pointclouds ----
  if (what === 'pointclouds') {
    if (method === 'GET' && !id) {
      const r = await env.DB.prepare(`SELECT * FROM pointclouds ORDER BY slug`).all();
      return json({ pointclouds: r.results || [] });
    }
    if (method === 'GET' && id && action === 'files') {
      return listCloudFiles(request, env, id);
    }
    if (method === 'GET' && id && action === 'uploads') {
      return listUploads(request, env, id);
    }
    if (method === 'DELETE' && id && action === 'file') {
      return deleteCloudFile(request, env, id);
    }
    if (method === 'POST' && id && action === 'multipart' && seg[5] === undefined) {
      return startMultipart(request, env, id);
    }
    if (method === 'PUT' && id && action === 'multipart' && seg[5] !== undefined && seg[6] === undefined) {
      return uploadMultipartPart(request, env, id, seg[5]);
    }
    if (method === 'POST' && id && action === 'multipart' && (seg[6] === 'complete' || seg[6] === 'abort')) {
      return finishMultipart(request, env, id, seg[5], seg[6]);
    }
    if (method === 'POST' && !id) {
      const b = await readBody(request);
      if (!b.slug || !b.title_en) return fail(400, 'slug and title_en are required');
      const r = await env.DB.prepare(
        `INSERT INTO pointclouds (slug, title_en, title_fr, desc_en, desc_fr, bucket, prefix, status, point_count, srs, published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        String(b.slug), String(b.title_en), b.title_fr || '', b.desc_en || '', b.desc_fr || '',
        b.bucket || 'clouds-public', b.prefix || (String(b.slug) + '/'), b.status || 'awaiting_upload',
        b.point_count || null, b.srs || null, Number(!!b.published)
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (method === 'PUT' && id) {
      const u = buildUpdate('pointclouds', await readBody(request));
      if (!u) return fail(400, 'no writable fields in body');
      await env.DB.prepare(`UPDATE pointclouds SET ${u.sql} WHERE id = ?`).bind(...u.vals, id).run();
      return json({ ok: true });
    }
  }

  return fail(404, 'unknown admin route: ' + method + ' ' + path);
}
