#!/usr/bin/env python3
"""
import_geojson.py — Phase 4 one-time seed for the GIS portfolio on Cloudflare.

What it does (offline, no Cloudflare access needed):
  1. Reads the GeoJSON files from ./geojson/ of the site repo
  2. Applies the drop-list from scripts/field-whitelist.json
  3. Writes compact derived copies to ./derived/geojson/<project>/<layer>.geojson
  4. Emits ./derived/r2-upload.sh   (uploads derived files into bucket `repo`)
  5. Emits ./derived/seed.sql       (projects + layers + "LAS 1" placeholder into D1)

Then you run (requires `npx wrangler login` once):
  bash derived/r2-upload.sh
  npx wrangler d1 execute gis-db --remote --file derived/seed.sql

Idempotent: safe to re-run (INSERT OR IGNORE keyed on slugs).
"""
import json, os, sys, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
GEO = os.path.join(ROOT, "geojson")
DERIVED = os.path.join(ROOT, "derived")
WHITELIST = os.path.join(ROOT, "scripts", "field-whitelist.json")

# ------------------------------------------------------------
# Seed definition — mirrors js/map-projects.js (the static fallback).
# file: path relative to geojson/ · style: exactly the manifest's values
# ------------------------------------------------------------
PROJECTS = [
    {
        "slug": "something-open-ground",
        "title_en": "Something Open Ground",
        "title_fr": "Ciel Ouvert — quelque chose",
        "desc_en": "Mineral exploration project.",
        "desc_fr": "Projet d'exploration minière.",
        "category": "Mineral Exploration",
        "year": "2025",
        "color": "#F0B429",
        "visible": 1, "collapsed": 1, "sort_order": 1, "published": 1,
        "layers": [
            {"slug": "faults", "file": "Something-open-ground/Faults.json",
             "label_en": "License Boundary", "label_fr": "Périmètre Minier",
             "style": {"weight": 2.5, "dash": "8 5", "fillOpacity": 0.05}, "sort_order": 1},
            {"slug": "favorable-geology", "file": "Something-open-ground/something Favorable Geology.json",
             "label_en": "Favorable Geology", "label_fr": "Géologie Favorable",
             "style": {}, "sort_order": 2},
            {"slug": "ocurrences", "file": "Something-open-ground/Ocurrences.json",
             "label_en": "Ocurrences", "label_fr": "Ocurrences",
             "style": {"dash": "4 3"}, "sort_order": 3},
        ],
    },
    {
        "slug": "urban-digitize",
        "title_en": "Urban Digitize",
        "title_fr": "numérisation",
        "desc_en": "High precision urban digitization project.",
        "desc_fr": "numérisation urbaine de haute précision.",
        "category": "Cartography",
        "year": "2025",
        "color": "#e90eda",
        "visible": 1, "collapsed": 1, "sort_order": 2, "published": 1,
        "layers": [
            {"slug": "buildings", "file": "Las/Buildings.geojson",
             "label_en": "Buildings", "label_fr": "Bâtiments",
             "style": {"color": "#fe221b94", "outerColor": "#36f029"}, "sort_order": 1},
            {"slug": "cycleways", "file": "Las/Cycleway.geojson",
             "label_en": "Cycleways", "label_fr": "Pistes cyclables",
             "style": {"color": "#8a5a00"}, "sort_order": 2},
            {"slug": "pavements", "file": "Las/Pavements.geojson",
             "label_en": "Pavements", "label_fr": "Revêtements",
             "style": {"color": "#f2fc3a"}, "sort_order": 3},
            {"slug": "roads", "file": "Las/Roads.geojson",
             "label_en": "Roads", "label_fr": "Routes",
             "style": {"color": "#2098d8"}, "sort_order": 4},
            {"slug": "signalisation-horizontale", "file": "Las/signalisation_horizontale.geojson",
             "label_en": "Horizontal Signage", "label_fr": "Signalisation routière horizontale",
             "style": {"color": "#c00e99"}, "sort_order": 5},
        ],
    },
    {
        # legacy v1 files, kept unpublished until you enable them from the admin
        "slug": "legacy-tests",
        "title_en": "Legacy Test Layers",
        "title_fr": "Couches de test",
        "desc_en": "Early demo layers kept unpublished.",
        "desc_fr": "Couches de démonstration non publiées.",
        "category": "Demo", "year": "2024", "color": "#2098d8",
        "visible": 1, "collapsed": 1, "sort_order": 99, "published": 0,
        "layers": [
            {"slug": "lidar-survey-blocks", "file": "lidar-survey-blocks.geojson",
             "label_en": "LiDAR Classification — Survey Blocks", "label_fr": "Classification LiDAR — Blocs de relevé",
             "style": {"color": "#f01616"}, "sort_order": 1},
            {"slug": "fiber-network", "file": "fiber-network.geojson",
             "label_en": "Fiber Optic Network — Routes", "label_fr": "Réseau Fibre Optique — Tronçons",
             "style": {"color": "#19C9EB"}, "sort_order": 2},
            {"slug": "urban-digitization", "file": "urban-digitization.geojson",
             "label_en": "Urban Digitization (v1)", "label_fr": "Numérisation urbaine (v1)",
             "style": {}, "sort_order": 3},
        ],
    },
]

POINTCLOUDS = [
    # the placeholder the user asked for until real LiDAR is uploaded
    {"slug": "las-1", "title_en": "LAS 1", "title_fr": "LAS 1",
     "desc_en": "Point cloud dataset — awaiting upload.", "desc_fr": "Nuage de points — en attente de téléversement.",
     "bucket": "clouds-public", "prefix": "las-1/", "status": "awaiting_upload", "published": 0},
]


def sql(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def main() -> int:
    with open(WHITELIST, encoding="utf-8") as fh:
        drop_map = json.load(fh).get("drop", {})

    os.makedirs(DERIVED, exist_ok=True)
    upload_lines = ["#!/usr/bin/env bash",
                    "# Uploads derived GeoJSON into R2 bucket `repo` (requires: npx wrangler login)",
                    "set -e"]
    seed_lines = ["-- generated by scripts/import_geojson.py", "BEGIN;"]

    total_files, total_feats, total_bytes = 0, 0, 0

    for p in PROJECTS:
        seed_lines.append(
            "INSERT OR IGNORE INTO projects (slug, title_en, title_fr, desc_en, desc_fr, category, year, color, visible, collapsed, sort_order, published) "
            f"VALUES ({sql(p['slug'])}, {sql(p['title_en'])}, {sql(p['title_fr'])}, {sql(p['desc_en'])}, {sql(p['desc_fr'])}, "
            f"{sql(p['category'])}, {sql(p['year'])}, {sql(p['color'])}, {p['visible']}, {p['collapsed']}, {p['sort_order']}, {p['published']});"
        )
        for lyr in p["layers"]:
            src = os.path.join(GEO, lyr["file"])
            if not os.path.exists(src):
                print(f"  !! missing source file: geojson/{lyr['file']} — layer skipped", file=sys.stderr)
                continue
            with open(src, encoding="utf-8") as fh:
                data = json.load(fh)
            feats = data.get("features", [])
            drop = set(drop_map.get(lyr["file"], []))
            if drop:
                for ft in feats:
                    props = ft.get("properties")
                    if props:
                        for k in drop:
                            props.pop(k, None)
            out_dir = os.path.join(DERIVED, "geojson", p["slug"])
            os.makedirs(out_dir, exist_ok=True)
            out_path = os.path.join(out_dir, lyr["slug"] + ".geojson")
            text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            with open(out_path, "w", encoding="utf-8") as fh:
                fh.write(text)

            r2_key = f"geojson/{p['slug']}/{lyr['slug']}.geojson"
            size = len(text.encode("utf-8"))
            upload_lines.append(
                f'npx wrangler r2 object put "repo/{r2_key}" --file "{os.path.relpath(out_path, ROOT)}" '
                f'--remote --content-type application/geo+json'
            )
            seed_lines.append(
                "INSERT OR IGNORE INTO layers (project_id, slug, label_en, label_fr, r2_key, style_json, fields_json, visible, published, sort_order, feature_count, byte_size) "
                "VALUES ((SELECT id FROM projects WHERE slug = " + sql(p["slug"]) + "), "
                f"{sql(lyr['slug'])}, {sql(lyr['label_en'])}, {sql(lyr['label_fr'])}, {sql(r2_key)}, "
                f"{sql(json.dumps(lyr['style']))}, {sql(json.dumps(sorted(drop)))}, 1, {p['published']}, {lyr['sort_order']}, {len(feats)}, {size});"
            )
            total_files += 1
            total_feats += len(feats)
            total_bytes += size
            print(f"  derived: {r2_key}  ({len(feats)} features, {size/1e6:.2f} MB)")

    for pc in POINTCLOUDS:
        seed_lines.append(
            "INSERT OR IGNORE INTO pointclouds (slug, title_en, title_fr, desc_en, desc_fr, bucket, prefix, status, published) "
            f"VALUES ({sql(pc['slug'])}, {sql(pc['title_en'])}, {sql(pc['title_fr'])}, {sql(pc['desc_en'])}, {sql(pc['desc_fr'])}, "
            f"{sql(pc['bucket'])}, {sql(pc['prefix'])}, {sql(pc['status'])}, {pc['published']});"
        )
        print(f"  placeholder point cloud registered: {pc['slug']} ({pc['status']})")

    seed_lines.append("COMMIT;")

    up = os.path.join(DERIVED, "r2-upload.sh")
    with open(up, "w", encoding="utf-8") as fh:
        fh.write("\n".join(upload_lines) + "\n")
    os.chmod(up, 0o755)

    with open(os.path.join(DERIVED, "seed.sql"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(seed_lines) + "\n")

    print(f"\nDone: {total_files} layers, {total_feats} features, {total_bytes/1e6:.2f} MB derived")
    print("Next steps:")
    print("  1) npx wrangler login                     (once)")
    print("  2) bash derived/r2-upload.sh              (upload derived files to bucket `repo`)")
    print("  3) npx wrangler d1 execute gis-db --remote --file derived/seed.sql")
    return 0


if __name__ == "__main__":
    sys.exit(main())
