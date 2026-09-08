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

  // ---- pointclouds ----
  if (what === 'pointclouds') {
    if (method === 'GET' && !id) {
      const r = await env.DB.prepare(`SELECT * FROM pointclouds ORDER BY slug`).all();
      return json({ pointclouds: r.results || [] });
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
