#!/usr/bin/env python3
"""
diff_check.py — GeoJSON fidelity check (plan Phase 4 gate).

Compares the live API (/api/manifest + /api/layer-data/:id) against the
locally derived files in ./derived/geojson/. Verifies per layer:
  feature count, geometry-type mix, attribute keys, coordinate bbox.

Usage:  python3 scripts/diff_check.py [base_url]
        default base_url: https://tlilixmed-github-io.tlilixmed.workers.dev
"""
import json, os, sys, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://tlilixmed-github-io.tlilixmed.workers.dev").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DERIVED = os.path.join(ROOT, "derived", "geojson")


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def stats(fc):
    types, bbox, keys = {}, [180, 90, -180, -90], set()
    for ft in fc.get("features", []):
        g = ft.get("geometry") or {}
        t = g.get("type", "None")
        types[t] = types.get(t, 0) + 1
        for k in (ft.get("properties") or {}):
            keys.add(k)
        coords = g.get("coordinates")
        def walk(c):
            nonlocal bbox
            if isinstance(c, (list, tuple)):
                if len(c) and isinstance(c[0], (int, float)):
                    bbox[0] = min(bbox[0], c[0]); bbox[1] = min(bbox[1], c[1])
                    bbox[2] = max(bbox[2], c[0]); bbox[3] = max(bbox[3], c[1])
                else:
                    for x in c:
                        walk(x)
        walk(coords)
    return {"n": len(fc.get("features", [])), "types": types, "keys": keys, "bbox": bbox}


def main():
    man = get(BASE + "/api/manifest")
    rows = []
    all_ok = True
    for p in man.get("projects", []):
        for lyr in p.get("layers", []):
            lid = lyr["file"].rsplit("/", 1)[-1]
            local_path = os.path.join(DERIVED, p["id"], lyr["label"]["en"].lower().replace(" ", "-") + ".geojson")
            # resolve local file by manifest order instead of guessing by label:
            proj_dir = os.path.join(DERIVED, p["id"])
            local_path = None
            if os.path.isdir(proj_dir):
                cands = sorted(os.listdir(proj_dir))
                idx = next((i for i, l2 in enumerate(p["layers"]) if l2["file"] == lyr["file"]), None)
                if idx is not None and idx < len(cands):
                    local_path = os.path.join(proj_dir, cands[idx])
            if not local_path or not os.path.exists(local_path):
                rows.append((p["id"], lyr["label"]["en"], "NO LOCAL FILE", "—", "WARN"))
                continue
            with open(local_path, encoding="utf-8") as fh:
                local = stats(json.load(fh))
            remote = stats(get(BASE + lyr["file"]))
            diffs = []
            if local["n"] != remote["n"]:
                diffs.append(f"count {local['n']}!={remote['n']}")
            if local["types"] != remote["types"]:
                diffs.append("geometry mix differs")
            if local["keys"] != remote["keys"]:
                diffs.append(f"attrs {sorted(local['keys'])} != {sorted(remote['keys'])}")
            if any(abs(a - b) > 1e-6 for a, b in zip(local["bbox"], remote["bbox"])):
                diffs.append(f"bbox {local['bbox']} != {remote['bbox']}")
            ok = not diffs
            all_ok &= ok
            rows.append((p["id"], lyr["label"]["en"], f"{local['n']} feats, {len(local['keys'])} attrs",
                         f"{remote['n']} feats, {len(remote['keys'])} attrs", "OK" if ok else "FAIL: " + "; ".join(diffs)))

    print(f"{'PROJECT':22s} {'LAYER':30s} {'LOCAL':24s} {'API':24s} RESULT")
    for r in rows:
        print(f"{r[0]:22s} {r[1]:30s} {r[2]:24s} {r[3]:24s} {r[4]}")
    print("\nDIFF CHECK: " + ("PASS — API output matches derived files" if all_ok else "FAIL — see rows above"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
