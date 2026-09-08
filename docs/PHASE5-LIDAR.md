# Phase 5 — LiDAR 3D Point Cloud Viewer

**What you get:** a `/lidar/` page on your site with a full 3D Potree viewer,
fed from the `/api/pointclouds` catalog, streaming your cloud from the
`clouds-public` R2 bucket through the same-origin `/clouds/` route.
Projection: **EPSG:2056 (CH1903+/LV95)** — the viewer shows LV95 meters plus a
live WGS84 lat/lon readout (proj4js).

**Already tested end-to-end** with a synthetic EPSG:2056 point cloud
(300,000 points, PotreeConverter 2.1.3 → 3-file octree → viewer render).
You only do steps 1–5 below.

> **v1.1 — black-screen fix (2026-09-08).** Your live `/lidar/` page is an
> early draft that forces the color attribute to `rgba`. Your LAS has **no
> RGB** (attributes: intensity, classification, gps-time, …), so every point
> rendered black. Replace `lidar/index.html` with the file in this package:
> it now auto-picks the best available attribute (RGB → **intensity** →
> classification), seeds Potree's `intensityRange` from the converter
> metadata (Potree 1.8.2 ships `[Infinity, -Infinity]`, which renders
> NaN-black), and shows the CRS from the octree metadata. Re-verified
> end-to-end with an RGB-less EPSG:2056 cloud: renders correctly.

---

## Step 1 — Deploy the site changes (5 min, VS Code only)

Copy from this package into your repo clone (the `cloudflare` branch checkout):

| Package path | Repo path |
|---|---|
| `site-patch/worker/index.js` | `worker/index.js` (replace — adds the `/clouds/` route) |
| `site-patch/lidar/` (whole folder) | `lidar/` (new — viewer + libraries, ~8 MB) |
| `site-patch/docs/PHASE5-LIDAR.md` | `docs/PHASE5-LIDAR.md` (this file) |

Optional (nice nav entry): in `index.html`, find

```html
<li><a href="#maps" ...>Maps</a></li>
```

and add after it:

```html
<li><a href="/lidar/">3D</a></li>
```

(keep the same `<li>`/`<a>` structure as its neighbors).

Then commit & push with the VS Code Git panel (stage → commit → sync).
Cloudflare redeploys automatically in ~1–2 minutes.

**Verify:** open `https://<your-worker>.workers.dev/clouds/las-1/metadata.json`
→ you should see `{"error":"object missing in R2 (key: las-1/metadata.json)"}`.
That 404 is **correct** — it proves the new route is live and just waiting for
your data.

## Step 2 — Convert your LAS on your PC (one command)

1. Download: <https://github.com/potree/PotreeConverter/releases/download/2.1.3/PotreeConverter_2.1.3_x64_windows.zip>
2. Extract `PotreeConverter.exe` anywhere, e.g. `C:\gis-tools\`
3. In the VS Code terminal:

```bat
C:\gis-tools\PotreeConverter.exe -i "C:\path\to\your.las" -o C:\gis-tools\out-las-1
```

A ~300 MB LAS converts in a few minutes and produces exactly **3 files**:
`metadata.json`, `hierarchy.bin`, `octree.bin`.

## Step 3 — Create one R2 API key (2 min, dashboard)

1. Cloudflare dashboard → **R2** → **Manage API Tokens** (right side) → **Create API Token**
2. Permissions: **Object Read & Write** · Scope: **Apply to specific buckets only → clouds-public**
3. Create, then copy the three values: **Access Key ID**, **Secret Access Key**.
   (Your account ID is the hex string in the dashboard URL `dash.cloudflare.com/<this>`.)

## Step 4 — Upload (one command)

Copy `gis-tools/upload-cloud.mjs` from this package to `C:\gis-tools\` (it
lives **outside** the repo on purpose). Open it in VS Code and fill the three
`PASTE_...` values in the CONFIG block at the top. Then:

```bat
node upload-cloud.mjs C:\gis-tools\out-las-1
```

It uploads with retries, **verifies every file**, and — on success — prints
the exact D1 command for the final step (point count already filled in).
No `npm install` needed; the script only uses Node built-ins.

> Alternative: you can also drag the 3 files into the R2 dashboard
> (clouds-public → Create folder `las-1` → upload). Works only while each
> file is under the dashboard size limit — the script has no limit, so
> prefer the script.

## Step 5 — Register in the database (one command)

Paste the `npx wrangler d1 execute ...` command that step 4 printed.
It marks LAS 1 as `ready`, stores the point count + `EPSG:2056`, and ensures
it is published.

## Step 6 — Look at your cloud in 3D

Open `https://<your-worker>.workers.dev/lidar/`

- Drag = orbit · Right-drag = pan · Scroll = zoom
- Info card shows point count, LV95 extent, and the WGS84 center
- First load downloads `octree.bin` once (~size of your LAS); the browser
  then caches it for a year (immutable headers)

When done, tell me — I will run the full remote verification
(route, range requests, metadata, catalog, viewer smoke test).

---

## How it works (for reference)

- `/clouds/<prefix><file>` → Worker streams from the `clouds-public` bucket
  with `cache-control: public, max-age=31536000, immutable` and byte-range
  support (Potree uses range requests — confirmed in testing).
- Only **published** point-cloud prefixes are exposed (checked against D1,
  cached 60 s). Unpublished datasets are 404 — no data leaks.
- `data.tliligis.me`: attaching a custom domain to R2 requires the zone to be
  on Cloudflare first — so it is deferred to **Phase 8** (DNS cutover). The
  same-origin `/clouds/` route works everywhere meanwhile and needs no CORS.
- Viewer stack (vendored, no CDN): Potree 1.8.2 viewer + three.js r124 +
  Tween.js + proj4js, all under `lidar/libs/` (licenses included).
  PotreeConverter 2.x output loads directly into it.
- EPSG:2056 definition lives in the page (proj4js). If a future cloud uses a
  different CRS, set its `srs` value in D1 and extend the defs list in
  `lidar/index.html`.
