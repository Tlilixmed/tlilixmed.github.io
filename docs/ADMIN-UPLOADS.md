# Admin uploads & dashboard workflow (Phase 6.5)

Everything below happens inside `/admin` (Cloudflare Access + `X-Admin-Token`),
no local tooling required except Potree conversion.

## 1. Feature layers — upload a GeoJSON straight from the dashboard

**Projects & layers tab → select a project → "Upload GeoJSON layer"** (top of the
Layers card). Pick a `.geojson` / `.json` file and the dashboard will:

1. Create a new layer under the selected project (slug + label derived from the
   filename; duplicate slugs are rejected by D1 — rename via *edit* if needed).
2. Auto-style it by geometry type (point / line / polygon defaults).
3. Upload the data: original → `gis-private/originals/…`, derived copy →
   `repo/geojson/<project>/<layer>.geojson`, and update `feature_count` /
   `byte_size`.
4. Leave the layer **unpublished** — open it in **Style studio**, tune the
   symbology, then *publish* (and publish the project if it is still a draft).

Existing layers keep the per-row **upload** button (replaces the data in place,
keeping the layer's fields drop-list).

Limits: the browser route handles FeatureCollections up to ~4 MB. Bigger
datasets → `scripts/import_geojson.py` (unchanged).

## 2. Point clouds — upload LAS + converted octree from the dashboard

Point clouds tab, one row per cloud, actions: **save / LAS / octree / files**.

| Step | Action | What happens |
|------|--------|--------------|
| 1 | **Register** the cloud (form below the table) | status `awaiting_upload`, prefix `<slug>/` |
| 2 | **LAS** button | picks a `.las` / `.laz` file, streams it to `gis-private/originals/<slug>/source.<las|laz>` — never served publicly. Status becomes `source_uploaded`. Hard cap 100 MB (Cloudflare request-body limit) |
| 3 | Convert locally | `PotreeConverter.exe source.las -o output --projection EPSG:2056` (Potree 1.8 or 2.x both work) |
| 4 | **octree** button | picks the converted **folder**; junk files (dotfiles, `__MACOSX`) are skipped, files upload 4-at-a-time with one retry each into `clouds-public/<prefix>/<relative path>`. A `cloud.js` / `metadata.json` in the batch automatically sets `point_count` and flips status to `ready` |
| 5 | **files** button | lists what is stored under the prefix (first 400 objects + sizes) so you can verify |
| 6 | **save** (+ publish checkbox) | persists title/status/points/SRS edits |

Notes:

- If you select the folder that *matches* the cloud slug/prefix, its top level is
  stripped so files land directly under the prefix (selecting a different folder
  keeps the full relative path).
- Raw scans bigger than 100 MB: skip step 2 (the viewer streams the *octree*,
  never the raw scan) and upload the octree folder; if a single octree file is
  over 100 MB, use `npx wrangler r2 object put clouds-public/<prefix>/<file>
  --file <file>` for that file.
- Unpublish a cloud any time to hide it from `/lidar` and `/clouds/*`.

## 3. New API routes (admin, token + Access guarded)

```
POST /api/admin/upload/las?cloud_id=N&filename=scan.las   → R2_PRIVATE originals/<slug>/source.*
POST /api/admin/upload/octree?cloud_id=N&path=cloud.js    → R2_CLOUDS <prefix>/<path>
GET  /api/admin/pointclouds/:id/files                     → R2_CLOUDS list under prefix
```

Both POSTs stream `request.body` straight into R2 (no buffering in the Worker).
`path` is sanitized (`..` rejected); `cloud.js` / `metadata.json` are parsed for
`points` before being stored.

## 4. ⚠️ Cloudflare Access scoping — check your Zero Trust config

Verified 2026-09-09: `https://tliligis.me/`, `/api/health`, `/lidar`, static
assets — **and** the `*.workers.dev` hostname — all redirect to the Access
login. The Access application is currently attached to the **whole zone**
(empty path), which walls off the public portfolio from visitors.

Fix in **Zero Trust → Access → Applications** (one of):

- **If the site should be public:** edit the app that covers `tliligis.me` →
  *Application domains* → change the entry to a path-scoped one:
  - `tliligis.me/admin` and `tliligis.me/api/admin` (keep the `workers.dev`
    equivalents, e.g. `<worker>.<subdomain>.workers.dev/admin`). Delete the
    path-less `tliligis.me` entry.
- **If you intentionally locked the whole site while polishing:** leave it, but
  remember every visitor (and the lidar embed) will need to log in.

After the fix, re-check with:

```
curl -sI https://tliligis.me/            → 200 (public), NOT 302 to cloudflareaccess.com
curl -s  https://tliligis.me/api/admin/projects  → Access login page / 401, never data
```
