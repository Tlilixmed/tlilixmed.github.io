# Phase 8 — Production cutover (`tliligis.me` → Cloudflare)

Move the live domain `tliligis.me` from **GitHub Pages (via Namecheap DNS)** to the
**Cloudflare Worker**, replicate the Phase 7 Access apps for the production hostname,
and keep a one-click rollback path open at all times.

| | Today (pre-cutover) | After Phase 8 |
|---|---|---|
| `https://tliligis.me` | GitHub Pages (static, no API) | **Cloudflare Worker** — full site + API + LiDAR + admin |
| `https://www.tliligis.me` | GitHub Pages (redirect target) | **Cloudflare Worker** (same build) |
| `https://tlilixmed-github-io.tlilixmed.workers.dev` | Test deployment | Test deployment (unchanged, still deploys on push) |
| DNS provider | Namecheap BasicDNS | Cloudflare (NS moved at Namecheap) |
| `/admin` + `/api/admin/*` | Access (workers.dev host) | Access on **both** hosts (workers.dev + tliligis.me) |

**What does NOT change:** the Worker name (`tlilixmed-github-io`), git-integration
deploys (push to `cloudflare` → auto build), secrets (`ADMIN_TOKEN`), D1 database,
the three R2 buckets, Access login methods (email PIN + GitHub). DNS is only an
address book — your data and code are never at risk during this phase.

---

## 0. Pre-flight checklist (~10 min)

All of these are already true / verified:

- [x] `cloudflare` branch pushed; Workers build green; `/api/health` returns
      `{"ok":true,"d1":true,"r2":…}` on the workers.dev URL.
- [x] Phase 7 Access working on workers.dev (`/admin` shows the Access login,
      then the in-dashboard `ADMIN_TOKEN` gate).
- [x] Live DNS inventory captured (2026-09-09) — this is also your rollback table:

  | Name | Type | Value | Serves |
  |---|---|---|---|
  | `tliligis.me` | NS | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` | Namecheap |
  | `@` (apex) | A | `185.199.108.153` `185.199.109.153` `185.199.110.153` `185.199.111.153` | GitHub Pages |
  | `www` | CNAME | `tlilixmed.github.io` | GitHub Pages |

- [ ] You have ~30–60 min (most of it is waiting on nameserver propagation).
- [ ] If this domain handles **email** (MX records at Namecheap): do NOT delete
      anything Cloudflare's record scan imports — step 5 only replaces the apex A
      records and the `www` CNAME, never MX/TXT.

---

## 1. Add the zone to Cloudflare (~10 min, no downtime)

1. Cloudflare dashboard → **Add a domain** → `tliligis.me` → plan **Free**.
2. Cloudflare scans the existing DNS and imports the records it finds.
   **Review them but delete nothing.** The GitHub `A` records on `@` and the
   `www` CNAME are *supposed* to be there — they keep the site alive during
   steps 2–4 (zero-downtime handoff, see §4). Keep them **DNS only**
   (grey cloud) for now.
3. Cloudflare shows the **two nameservers** assigned to your account, e.g.
   `aria.ns.cloudflare.com` / `kai.ns.cloudflare.com`. Copy them — you need
   them in step 2. (Yours may differ from the example; use the pair the
   dashboard shows you.)
4. Zone status is **Pending** until the nameservers move. That is expected.

## 2. Switch nameservers at Namecheap — the actual cutover trigger

This is the moment delegation moves. Everything before/after is reversible;
this step is what flips the internet's pointer to Cloudflare.

1. Namecheap → **Domain List** → `tliligis.me` → **Manage**.
2. **Nameservers** section → choose **Custom DNS** (not Namecheap BasicDNS,
   not Namecheap Web Hosting DNS).
3. Enter the **two Cloudflare nameservers** from step 1, one per line → save.
4. Propagation: usually **minutes to ~1 hour**, worst case 24–48 h for
   stragglers. The site stays online the whole time (see §4).

> Tip: keep the old Namecheap records written down (table in §0). Namecheap
> may discard custom records when you switch modes, so the table is your
> full-restoration copy.

## 3. Wait for zone activation

1. Cloudflare dashboard → the `tliligis.me` zone → click
   **Check nameservers now** (the dashboard also emails you when it flips).
2. CLI check: `dig NS tliligis.me +short @1.1.1.1` → should return the two
   `*.ns.cloudflare.com` names.
3. **Do not start step 5 until the zone shows Active** — Worker custom
   domains require an active zone.

## 4. Why nothing goes dark (record handoff)

```
Now:            Namecheap NS ──► A @ 185.199.x.x (GitHub Pages)
After step 2:   Cloudflare NS ──► imported A @ 185.199.x.x   ← same site, new DNS
After step 5:   Cloudflare NS ──► Worker custom domain @     ← same host, new backend
```

Every hop serves a working site. The final flip happens at Cloudflare's edge
when the custom domain replaces the GitHub records — seconds, zero downtime.
And every hop is one edit away from reverse (§9 rollback).

## 5. Attach the Worker to `tliligis.me` + `www` — the flip (~5 min)

1. Dashboard → **Workers & Pages** → `tlilixmed-github-io` →
   **Settings → Domains & Routes** → **Add → Custom domain**.
2. Enter `tliligis.me`. Cloudflare detects the existing apex `A` records
   (GitHub) and asks to **replace them** — confirm. It creates its own
   proxied records bound to the Worker and issues an edge certificate
   (~1 minute).
3. Repeat with `www.tliligis.me` (replaces the `tlilixmed.github.io` CNAME).
4. Verify:
   ```bash
   curl -sI https://tliligis.me/ | head -4          # 200 + server: cloudflare + cf-ray
   curl -s  https://tliligis.me/api/health          # {"ok":true,...}
   curl -sI https://tliligis.me/ | grep -i cache-control   # no-cache on HTML
   ```
   Then open `https://tliligis.me` in a browser: portfolio, 2D map, embedded
   3D LiDAR, standalone `/lidar/` — all served by the Worker now.

## 6. Replicate Access for the production host (~5 min, no GitHub changes)

Zero Trust → **Access → Applications** — for **each** of the two existing apps:

1. **GIS Admin UI** → Edit → **Application domains** → *Add a domain*:
   - domain `tliligis.me`, path `/admin` (keep the existing workers.dev
     entry — both hosts stay protected).
2. **GIS Admin API** → Edit → add: domain `tliligis.me`, path `/api/admin`.
3. Save. Policies are account-level: the same **email PIN** and **GitHub**
   allow-policies apply automatically on the new host.

> **No GitHub OAuth app change is needed.** The callback URL is
> `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback` — it
> belongs to Cloudflare Access itself, not to the protected hostname.
> (Your OAuth app's *Homepage URL* is already `https://tliligis.me`.)

4. Test in an **incognito** window:
   - `https://tliligis.me/admin` → Access login (PIN or GitHub) → dashboard →
     `ADMIN_TOKEN` gate → unlock.
   - Direct API hit without Access session → blocked at the edge:
     `curl -s https://tliligis.me/api/admin/projects` must NOT return project
     data (returns the Access login page / 302).

## 7. Zone hygiene (5 min)

- **SSL/TLS → Overview**: encryption mode **Full** (Worker custom domains
  terminate at the edge with managed certs).
- **SSL/TLS → Edge Certificates**: **Always Use HTTPS** → ON
  (apex/http visitors get redirected).
- Nothing else required — cache rules (`no-cache` on HTML, immutable octree
  chunks) are already set by the Worker code itself.

## 8. Final regression checklist

Local sanity (no deploy needed): `node scripts/test-worker-headers.mjs`
(18 assertions, imports the Worker directly).

Live checks against `https://tliligis.me`:

| Check | Command / action | Expected |
|---|---|---|
| Site up | `curl -sI https://tliligis.me/` | `200`, `server: cloudflare`, `cf-ray` present |
| HTML freshness | `curl -sI https://tliligis.me/ \| grep -i cache` | `cache-control: no-cache` |
| Health | `curl -s https://tliligis.me/api/health` | `{"ok":true,"d1":true,...}` |
| CORS preflight | `curl -s -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: GET" -o /dev/null -w "%{http_code}" https://tliligis.me/api/pointclouds` | `204` |
| Catalog API | `curl -s https://tliligis.me/api/pointclouds` | JSON with `las-1`, 10,304,711 pts, EPSG:2056 |
| Octree | open `/lidar/` → loads | 10.3 M points render from R2 |
| Portfolio | open `/` → 2D map → 3D LiDAR | embed shows topbar (Color by, cloud tab), 2D↔3D toggle round-trip |
| Admin edge | `curl -s https://tliligis.me/api/admin/projects` | Access block page / redirect — **no data** |
| Admin full | browser `/admin` incognito | Access login → token gate → dashboard |
| workers.dev | open the old URL | still works (regression guard) |

## 9. Rollback

**Fast path — seconds, keep Cloudflare DNS** (covers 99% of scenarios):

1. Workers & Pages → `tlilixmed-github-io` → Settings → Domains & Routes →
   **remove** `tliligis.me` and `www.tliligis.me` (this also removes the
   Worker's DNS records).
2. DNS → recreate the GitHub records from the §0 table, **DNS only**
   (grey cloud):
   - `@` A → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153`
   - `www` CNAME → `tlilixmed.github.io`
3. `tliligis.me` serves GitHub Pages again within a few minutes. The GitHub
   repo was never touched, so the old site is intact.

**Full path — only if you suspect the Cloudflare zone itself:**

1. Namecheap → Nameservers → back to **Namecheap BasicDNS**.
2. Re-enter the §0 record table in Namecheap's Advanced DNS.
3. Wait for propagation. workers.dev deployment is unaffected throughout.

## 10. Post-cutover cleanup (optional, any time later)

- **GitHub Pages settings**: repo `tlilixmed.github.io` → Settings → Pages →
  remove the custom domain — stops Let's Encrypt renewal-failure emails once
  DNS no longer points there. (The `CNAME` file in the repo can stay; the
  repo remains your instant fallback.)
- **`REMOTE_ORIGIN` fallback** in `lidar/index.html` can stay as-is — it only
  kicks in for local dev; production is same-origin.
- **`data.tliligis.me`** (Phase 5 leftover): optional — add it later as another
  Worker custom domain if you ever want octree traffic on a separate host.
  Same-origin `/clouds/*` streaming already works on the new domain.
- Known nits, non-blocking: favicon, CV button 404, `YOUR-USERNAME`
  placeholder(s) in docs.

---

## FAQ

**Why isn't there a "login with token only" option on the admin login screen?**
By design. Auth is two independent layers:

1. **Cloudflare Access** (email PIN / GitHub) — sits at the edge *before* the
   page loads. It is who you are; there is intentionally no token shortcut
   here, otherwise the token alone would bypass identity.
2. **`ADMIN_TOKEN`** — the second card you see *inside* the dashboard after
   passing Access. It is sent as `X-Admin-Token` on every admin API call and
   is the break-glass credential: if Access were ever misconfigured or
   removed, the API stays protected by the token check alone.

If you signed in earlier in the same browser session, the gate auto-unlocks
from `sessionStorage` — open a fresh incognito window to see it again.

**Do I need to change `wrangler.jsonc` for the custom domains?**
No. Dashboard-added custom domains persist on the Worker across git-integration
deploys. (Declaring `routes` in the config is only needed for CLI-based deploys.)

**Can I keep using the workers.dev URL?**
Yes — it stays live and continues to auto-deploy on every push to `cloudflare`.
Access remains attached to it as well.
