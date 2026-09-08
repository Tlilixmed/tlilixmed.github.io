# Phase 6 — Admin Dashboard + Dual-Map Compare

**What you get in this package:**

| Package path | Repo path | What it is |
|---|---|---|
| `admin/index.html` | `admin/index.html` (new) | Phase 6 — admin dashboard SPA (self-contained, no build step) |
| `js/map-compare.js` | `js/map-compare.js` (new) | Dual-map compare module (styles injected, no style.css edit) |
| `index.html` | `index.html` (replace) | Your live page + the Dual Map block + one script tag |
| `js/map.js` | `js/map.js` (replace) | Same as deployed + safe Leaflet-sharing handshake |
| `lidar/index.html` | `lidar/index.html` (replace) | v1.1 black-screen fix (see PHASE5-LIDAR.md) |
| `docs/PHASE6-DASHBOARD.md` | `docs/PHASE6-DASHBOARD.md` | This file |

Everything is tested end-to-end locally (dashboard CRUD + upload path,
dual-map sync/divider/swap, RGB-less point cloud render).

---

## Deploy — 3 steps in VS Code

1. Copy the files from this package into your repo clone (the `cloudflare`
   branch checkout), matching the table above. Overwrite when asked.
2. Stage → commit → sync in the VS Code Git panel.
3. Wait ~1–2 min for the Cloudflare auto-deploy, then verify:

```
https://<your-worker>.workers.dev/admin/     → token gate appears
https://<your-worker>.workers.dev/           → scroll to Maps → Dual view block
https://<your-worker>.workers.dev/lidar/     → LAS 1 renders (not black)
```

> If you edited `index.html` yourself since today, don't overwrite it —
> instead make the two small insertions manually (both are idempotent):
> a) after `<script src="js/map.js" defer></script>` add
>   `<script src="js/map-compare.js" defer></script>`
> b) immediately before `<div class="map-grid">` paste the whole
>   `<div class="cmp-block" id="cmpBlock">…` block from the package
>   `index.html`.

---

## The dashboard (`/admin/`)

Paste your `ADMIN_TOKEN` secret once — it is kept in the browser session
only (never stored server-side) and sent as `X-Admin-Token`.

**Projects & layers tab**
- Left list: every project with `published/draft` + layer-count chips
- Project editor: slug, titles/descriptions (EN/FR), category, year, color,
  sort order, visible / collapsed / published → **Save project** (POST/PUT)
- **Delete** removes the project and all its layers (asks twice)
- Layers table per project: `edit` (labels, style JSON, popup-field JSON,
  sort, visible, published), `publish/unpublish`, `upload`, `del`
- **upload** = pick a `.geojson` file → it goes to `gis-private` untouched
  (timestamped original) AND a copy to the public `repo` bucket, and the
  layer's `feature_count` / `r2_key` update automatically. Handy for
  datasets up to ~4 MB; bigger ones → `scripts/import_geojson.py` locally.

**Point clouds tab**
- Inline row editing: title, status (`awaiting_upload` / `ready` /
  `processing`), point count, SRS, prefix, published → **save**
- **Register new cloud** for your next dataset (LAS 2, …)

Your live record `LAS 1` currently has `point_count = NULL` — the viewer
reads the real number from `metadata.json`, but for a tidy catalog just set
points to `10304711` and status `ready` in the table and hit save.

**Health pill (top right)** — live `GET /api/health`: D1 + all three R2
buckets. Green = everything reachable.

---

## The Dual Map block (Maps section)

Sits right under the interactive project map. Two panes, one viewport:

- **Pan/zoom either map — the other follows** (live sync, both directions)
- **Drag the center divider** (or focus it and use arrow keys) to resize
- **Per-pane layer pickers** — every project/layer from the same manifest as
  the main map (live `/api/manifest`, static fallback). Changing a pane's
  layer frames that layer on both maps
- **Per-pane basemap pickers** — OSM, Satellite Esri, Topo Esri, Light gray
  Esri. Soft basemaps get the same calm filter as the main map
- **Swap panes** exchanges layers + basemaps between A and B
- **Mirrored cursor** — hover one pane, a marker appears on the other
- Fully bilingual (EN/FR follows the site toggle), mobile stacks vertically
  with a horizontal divider

**Note for later:** the main map's "Dark (Carto)" basemap now returns
"API KEY REQUIRED" watermark tiles (CARTO policy change — affects the main
map too, not this module). The compare module ships without it; you may want
to drop `carto-dark` from `js/map.js`'s `BASEMAPS` array at some point.

---

## Security status (unchanged)

- `/api/admin/*` stays token-guarded (X-Admin-Token, timing-safe compare)
- **Phase 7** puts Cloudflare Access (email PIN + GitHub) in front of
  `/admin` and `/api/admin/*` — the token remains as break-glass access
- Production (GitHub Pages + Namecheap DNS) is untouched; everything here
  lives on the `cloudflare` branch / workers.dev until Phase 8
