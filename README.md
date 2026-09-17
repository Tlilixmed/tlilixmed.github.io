# tliligis.me — GIS Engineer portfolio

Bilingual (EN/FR) portfolio for Tlili Mohamed, GIS Engineer. A static site with no
build step, served by a Cloudflare Worker that also provides a small API: a
D1-driven map manifest, GeoJSON and Potree point clouds streamed from R2, a
contact-form lead inbox, and cookie-less engagement analytics.

Live: https://tliligis.me · 3D viewer: https://tliligis.me/lidar/ · Admin: `/admin`

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | The one-page portfolio (hero, work, case studies, capabilities, experience, maps, about, contact). Text is bilingual via `data-en` / `data-fr` attributes. |
| `js/script.js` | Language toggle and persistence, mobile nav, scroll reveal, case-study panels, lightbox. |
| `js/map.js`, `js/map-projects.js` | Leaflet project map. Prefers the live manifest from `/api/manifest`; falls back to the static manifest in `map-projects.js` and the files under `geojson/`. |
| `js/contact-form.js` | Posts the contact form to `/api/leads`, with a pre-filled `mailto:` fallback. |
| `js/analytics.js` | First-party, cookie-less beacons to `/api/events` (sessionStorage id only). |
| `lidar/` | Potree 3D viewer. Reads the catalog from `/api/pointclouds` and streams octrees from `/clouds/<prefix>/…`. Embedded in the main page via the 2D/3D toggle. |
| `admin/index.html` | Single-file admin panel: projects, layers, GeoJSON upload, point-cloud uploads (multipart), lead inbox, analytics dashboard. |
| `worker/index.js` | Worker entry: public API routes, `/clouds/*` range streaming, static assets with `no-cache` HTML. |
| `worker/admin.js` | `/api/admin/*` routes, guarded by the `X-Admin-Token` header. |
| `schema.sql` | D1 schema (projects, layers, pointclouds, features, upload_log, leads, events). |
| `derived/` | Seed and maintenance scripts (see below). |
| `wrangler.jsonc`, `_headers`, `.assetsignore` | Cloudflare config, static cache rules, files excluded from the asset upload. |

## Deploy

Cloudflare Workers Builds watches the `cloudflare` branch and runs
`npx wrangler deploy` on every push. There is no local build.

One-time setup on a fresh account:

```sh
npx wrangler login
npx wrangler d1 execute gis-db --remote --file schema.sql   # create tables
npx wrangler secret put ADMIN_TOKEN                          # openssl rand -hex 32
node derived/seed.mjs                                        # upload GeoJSON to R2 + seed D1
```

Bindings expected by the Worker (declared in `wrangler.jsonc`):

- `DB` — D1 database `gis-db`
- `R2_PRIVATE` — bucket `gis-private` (untouched originals, never served)
- `R2_MEDIA` — bucket `repo` (derived public GeoJSON)
- `R2_CLOUDS` — bucket `clouds-public` (Potree octrees)
- `ASSETS` — the static site
- `ADMIN_TOKEN` — secret

## Local development

Any static server works for the page itself (VS Code Live Server, `python -m http.server`).
When `/api/*` is missing locally, the map falls back to the static manifest and the
LiDAR viewer falls back to the deployed Worker API. For the full stack run
`npx wrangler dev` (needs the D1/R2 bindings, remote or local).

## Adding content

- **Map project (recommended):** open `/admin`, create the project and its layers, upload
  each layer's GeoJSON (EPSG:4326). The original goes to `gis-private`, a
  derived copy to `repo`, and the manifest updates within a minute.
- **Map project (static fallback):** add an entry to `js/map-projects.js` and put the
  files under `geojson/`. Keep each file under ~5 MB.
- **Point cloud:** convert with PotreeConverter, then
  `node derived/cloud-upload.mjs <folder> <slug> --activate` (needs `ADMIN_TOKEN` in the
  environment), or use the file manager in the admin panel.
- **Renaming live projects/layers:** `seed.sql` never touches existing rows. Edit them in
  the admin panel or run an `UPDATE` file such as `derived/004-rename-projects.sql`:
  `npx wrangler d1 execute gis-db --remote --file derived/004-rename-projects.sql`.

## Tracking applications

Tag the link you paste into an application so the Insights tab shows whether that
company visited and what they opened:

```
https://tliligis.me/?utm_source=<company>&utm_medium=application&utm_campaign=<role>
```

The admin panel has a link builder in the Insights tab. The tag is recorded once per
session as a `campaign_visit` event and removed from the visitor's address bar.
A short form also works: `https://tliligis.me/?ref=<company>`.

## Cache and versioning

HTML is always served with `cache-control: no-cache`. Scripts and styles are cached
for an hour (`_headers`), so bump the `?v=` query string in `index.html` when you
change `css/style.css` or anything in `js/`.

## Privacy

No cookies, no third-party analytics. The events table stores an anonymous
sessionStorage id, event type, a short detail string and the referrer. Rate limiting
uses a SHA-256 hash of the client IP held in Worker memory only; raw IPs are never
stored. Contact-form submissions are stored in D1 and readable only through the
token-guarded admin API.
