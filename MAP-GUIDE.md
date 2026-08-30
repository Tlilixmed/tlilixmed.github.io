# Interactive Map — Owner's Guide

Your portfolio now includes an interactive GeoJSON map (in the **Maps** section).
Visitors can browse your layers, filter them by category, click features for
details, and fly to each project. Everything is plain static files — it works
on GitHub Pages exactly as-is, with your Namecheap domain on top.

---

## 1. Convert a shapefile to GeoJSON (one-time per project)

**QGIS (easiest):**
1. Load your `.shp` in QGIS.
2. Right-click the layer → **Export ▸ Save Features As…**
3. Format: **GeoJSON** · CRS: **EPSG:4326 (WGS 84)** — important.
4. Save into the `geojson/` folder of this site, e.g. `geojson/my-project.geojson`.

**Command line (alternative):**
```bash
ogr2ogr -f GeoJSON -t_srs EPSG:4326 geojson/my-project.geojson mylayer.shp
```

**Tips:**
- Big files? Simplify first (QGIS ▸ Vector ▸ Geometry Tools ▸ **Simplify**)
  and keep each file **under ~5 MB** so the map stays fast for visitors.
- Confidential geometry? Generalize or clip before publishing.
- Your attribute table travels with the file: a field named `name`
  (and optionally `name_fr`, `note`, `note_fr`) is shown automatically
  in the popups. Add those fields in QGIS to localize the popups.

## 2. Add the project to the map

Open **`js/map-projects.js`** and copy the TEMPLATE block, then fill in:

| Field      | What it does                                              |
|------------|-----------------------------------------------------------|
| `id`       | unique short key, no spaces                               |
| `title`    | `{ en, fr }` — list, filter & popup title                 |
| `desc`     | `{ en, fr }` — 1–2 sentences shown in the list & popups   |
| `category` | free label → drives filters, legend and colors            |
| `year`     | display year                                              |
| `file`     | `'geojson/your-file.geojson'` — **relative path**         |
| `color`    | optional hex color override (otherwise auto palette)      |
| `visible`  | `false` hides the project without deleting it             |

Save, refresh the page — the layer, list card, filter chip, legend entry and
popups are all generated automatically. No other file needs to change.

## 3. Local preview (why "nothing shows" if you double-click)

`fetch()` cannot read local files (`file://`). To preview on your machine:

```bash
cd neumorph-portfolio
python -m http.server 8000
# open http://localhost:8000
```

or use VS Code "Live Server". On GitHub Pages this is a non-issue.

## 4. Replace the shipped samples

The three layers currently on the map (`lidar-survey-blocks`,
`fiber-network`, `urban-digitization`) are **illustrative samples** so the
map never looks empty. Replace them with your real exports when ready:
overwrite the files in `geojson/` (or point `file:` to new ones) and edit
the titles/descriptions in `js/map-projects.js`.

## 5. Publishing — GitHub Pages + Namecheap (checklist)

- Commit & push the whole folder (including `geojson/` and `js/map-projects.js`).
  GitHub Pages needs **no build step** — files are served as-is.
- All map paths are **relative**, so the map works both at
  `https://tliligis.me/` and at a project URL like
  `https://<user>.github.io/<repo>/`.
- Custom domain (already yours): in your repo ▸ **Settings ▸ Pages**,
  set the custom domain to `tliligis.me` (this creates a `CNAME` file),
  then in Namecheap ▸ Advanced DNS:
  - `A` record `@` → `185.199.108.153`, `185.199.109.153`,
    `185.199.110.153`, `185.199.111.153`
  - `CNAME` record `www` → `<your-github-username>.github.io`
- Wait for the DNS check to pass in Pages settings, then tick
  **Enforce HTTPS**.
- If the map tiles ever fail to load for a visitor, the map shows a clean
  bilingual message instead of breaking — the rest of the page is unaffected.

## 6. Under the hood (reference)

| File                    | Role                                                        |
|-------------------------|-------------------------------------------------------------|
| `js/map-projects.js`    | your editable manifest (the only file you touch)            |
| `js/map.js`             | viewer: layers, filters, list, legend, popups, EN/FR sync   |
| `geojson/*.geojson`     | your data layers (WGS 84, EPSG:4326)                        |
| Leaflet 1.9.4           | loaded from jsDelivr CDN — no install, no build             |
| Basemap                 | OpenStreetMap standard tiles, softly desaturated via CSS    |

## 7. About the basemap

The map uses **OpenStreetMap standard tiles** — free, no API key, no account,
and legal for a public portfolio with the small attribution line that Leaflet
displays (it stays on the map; don't remove it).

CARTO's "Positron" (the classic minimal grey style) is prettier on light
themes, but since mid-2025 CARTO stamps keyless tile requests with an
"API KEY REQUIRED" watermark, so it needs a (free-tier) API key and is only
license-clean for non-commercial use. If you ever want it: create a free
CARTO account, get a key, and swap the `L.tileLayer` URL in `js/map.js`
for `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` plus
`?apikey=YOUR_KEY` — the current setup deliberately avoids that dependency.
