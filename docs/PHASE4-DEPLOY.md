# Phase 4 — D1 + R2 + API deployment guide

Everything below happens on the **`cloudflare` branch** and the Cloudflare **test** Worker.
`main` and tliligis.me (GitHub Pages) are never touched. Every step is reversible.

---

## 0. What you are deploying

| New file | Role |
|---|---|
| `wrangler.jsonc` | Worker config: assets + D1 + your 3 R2 buckets. **You must paste your D1 database ID into it.** |
| `schema.sql` | D1 tables: `projects`, `layers`, `pointclouds`, `features` (ready for Phase 6) |
| `worker/index.js` | API: `/api/health`, `/api/manifest`, `/api/layer-data/:id`, `/api/pointclouds` + static assets |
| `worker/admin.js` | Admin API: project/layer/point-cloud CRUD + GeoJSON upload (token-guarded until Access in Phase 7) |
| `js/map.js` | **Patched**: map prefers `/api/manifest` (4 s timeout), falls back to static manifest |
| `scripts/import_geojson.py` | Builds derived (attribute-stripped) GeoJSON + seed SQL + R2 upload script — already tested against your data: 11 layers, 35,233 features |
| `scripts/field-whitelist.json` | Attributes stripped from public copies (internal IDs, SHAPE_* artifacts, duplicate coords). Originals keep everything. |
| `scripts/diff_check.py` | Gate check: API output vs derived files (count / geometry / attributes / bbox) |
| `.assetsignore` | Keeps worker/scripts/docs/schema out of the public static assets |

**Semantics to remember**
- `gis-private` = originals (never served to anyone). `repo` = derived public files. `clouds-public` = Potree later.
- `layers.fields_json` = **drop-list** (attributes removed from public copies).
- The public map only shows rows with `published = 1`.

## 1. Copy files into the repo (cloudflare branch)

Copy the contents of `site-patch/` over the repo root (paths match 1:1), then:

```bash
git checkout cloudflare && git pull
# copy files, then:
git add -A && git commit -m "Phase 4: D1 + R2 + API layer (worker, schema, import, patched map)"
# DO NOT PUSH YET — first create D1 (step 2), or the deploy will fail its checks
```

## 2. Create the D1 database (dashboard, one time)

1. Dashboard → **Storage & Databases → D1 SQL Database → Create** → name: `gis-db` → Create.
2. Open the database → copy **Database ID**.
3. Paste it into `wrangler.jsonc` → `"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"`.
4. Create the tables: dashboard `gis-db` → **Console** → paste the whole `schema.sql` → Run.
   *(or CLI: `npx wrangler d1 execute gis-db --remote --file schema.sql`)*

## 3. Set the admin secret (one time)

```bash
npx wrangler login
npx wrangler secret put ADMIN_TOKEN      # paste a long random string when asked
```
Generate one with: `openssl rand -hex 32`. Dashboard alternative: Worker → Settings → Variables → Add → type **Secret** → `ADMIN_TOKEN`.
**Save it in your password manager** — admin endpoints require it as `X-Admin-Token` until Phase 7 (Cloudflare Access).

## 4. Seed the data (one time, local)

```bash
python3 scripts/import_geojson.py        # writes derived/ + prints what it found
bash derived/r2-upload.sh                # uploads 11 derived files into bucket `repo`
npx wrangler d1 execute gis-db --remote --file derived/seed.sql
```
`derived/` is generated output — no need to commit it.

## 5. Deploy + verify

```bash
git add wrangler.jsonc && git commit -m "Phase 4: set D1 database id" && git push
```
Workers Builds deploys the `cloudflare` branch automatically. Then verify:

| Check | Expected |
|---|---|
| `curl https://…workers.dev/api/health` | `{"ok":true,"d1":true,"r2":{…all true}}` |
| `curl https://…workers.dev/api/manifest` | 2 projects (something-open-ground, urban-digitize), 8 layers |
| Open site, scroll to map, DevTools Network | layer requests go to `/api/layer-data/N`, map renders as before |
| `python3 scripts/diff_check.py` | `DIFF CHECK: PASS` |
| Legacy tests | NOT visible (unpublished) |

## 6. Try the admin API (sanity test)

```bash
TOKEN="your-admin-token"
# register + publish the LAS 1 placeholder (already seeded; flip it visible in admin catalog):
curl -s -H "X-Admin-Token: $TOKEN" https://…workers.dev/api/admin/pointclouds
# negative test (must be rejected):
curl -s https://…workers.dev/api/admin/projects        # -> 401
```

## 7. Rollback (if anything fails)

- **API issues**: `git revert` the Phase 4 commits and push — the map automatically falls back to the static manifest (that's what the patch guarantees), site behaves exactly like Phase 2.
- **Bad seed data**: `npx wrangler d1 execute gis-db --remote --command "DELETE FROM layers; DELETE FROM projects; DELETE FROM pointclouds;"` then re-run step 4.
- GitHub Pages production was never involved.

## Notes & limits (honest engineering)

- The HTTP upload endpoint (`/api/admin/upload/geojson`) is meant for datasets up to **a few MB** (Workers CPU limits). Multi-MB data → use the local import script; Phase 6 improves this path.
- `/api/layer-data/:id` streams from R2 with `max-age=300` cache — a publish takes up to ~5 min to appear for returning visitors (add `?v=` cache-bust in Phase 6 admin if you want instant).
- `features` table ships now but fills in Phase 6 (feature editor); Phase 4 keeps geometry in R2 artifacts.
- After Phase 8 cutover this same Worker serves tliligis.me — nothing about it is test-only except the URL.
