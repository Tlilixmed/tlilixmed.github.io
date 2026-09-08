# Phase 7 — Cloudflare Access (Email PIN + GitHub)

Protect the admin dashboard and admin API with Cloudflare Access (Zero Trust),
keeping the existing `X-Admin-Token` check as the second layer.

| Asset | Protection after this phase |
|---|---|
| `/admin` (dashboard page) | Cloudflare Access — email PIN **or** GitHub login |
| `/api/admin/*` (admin API) | Cloudflare Access **+** `X-Admin-Token` (unchanged, defense in depth) |
| `/`, `/lidar/`, `/clouds/*`, `/api/manifest`, `/api/pointclouds`, `/api/layer-data/*` | **Public — untouched** |

> Access runs at Cloudflare's edge **before** the Worker executes, so blocked
> visitors never reach your code. It works on the `workers.dev` hostname today
> and you will replicate it for `tliligis.me` in Phase 8.

---

## 1. One-time Zero Trust setup (~5 min)

1. Cloudflare dashboard → **Zero Trust** (left sidebar).
2. First visit asks for a **team name** — pick something short, e.g. `tliligis`
   (becomes `tliligis.cloudflareaccess.com`, used in login URLs).
3. Choose the **Free** plan (50 users included — plenty for one admin).

## 2. Login method A — One-time PIN (email)

- Zero Trust → **Settings → Authentication → Login methods**.
- **One-time PIN** is already added/enabled by default — nothing to do.
- Effect: user enters email → receives a 6-digit PIN by email → enters PIN → logged in.

## 3. Login method B — GitHub OAuth (~5 min)

1. Zero Trust → **Settings → Authentication → Login methods → Add → GitHub**.
2. Keep "Use the default GitHub app instance (or GHE URL empty)" and click
   **Add** — Cloudflare shows a **callback URL**, e.g.
   `https://tliligis.cloudflareaccess.com/cdn-cgi/access/callback`
3. In a second tab: GitHub → **Settings → Developer settings → OAuth Apps →
   New OAuth App**:
   - Application name: `tliligis Cloudflare Access`
   - Homepage URL: `https://tliligis.me`
   - Authorization callback URL: paste the callback URL from step 2
4. Copy the GitHub **Client ID**, generate a **Client Secret**, paste both into
   the Cloudflare GitHub dialog → **Save**.
5. To restrict WHO can use GitHub login, use your email in the application
   policies below (step 4/5) — do not rely on GitHub alone.

## 4. Application A — protect the admin page `/admin`

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**.
2. Configure:
   - Application name: `GIS Admin UI`
   - Session duration: `24 hours`
   - Public domain: subdomain `tlilixmed-github-io` , domain
     `tlilixmed.workers.dev`  (or type the full host)
   - **Path: `/admin`**  (covers `/admin`, `/admin/`, `/admin/index.html`)
3. Click **Next** → add **two policies** (either one may match):

   **Policy 1 — email PIN**
   - Policy name: `Admin via email PIN`
   - Action: `Allow`
   - Include → Selector: `Emails` → your email
   - **Login methods**: One-time PIN  (under "Additional settings" /
     "Login methods" section of the policy — limit to this method)

   **Policy 2 — GitHub**
   - Policy name: `Admin via GitHub`
   - Action: `Allow`
   - Include → Selector: `Emails` → your GitHub account email
   - **Login methods**: GitHub

4. Save. Visit `https://tlilixmed-github-io.tlilixmed.workers.dev/admin` in an
   **incognito window** → you should hit the Access login screen.

## 5. Application B — protect the admin API `/api/admin/*`

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**.
2. Configure:
   - Application name: `GIS Admin API`
   - Session duration: `24 hours`
   - Same domain: `tlilixmed-github-io.tlilixmed.workers.dev`
   - **Path: `/api/admin`**
3. Reuse the **same two policies** as Application A.
4. Save.

### Why no code changes are needed

- The dashboard and the API live on the **same origin**. Once you log in to
  Access for `/admin`, the browser automatically attaches the
  `CF_Authorization` cookie to every `fetch()` the dashboard makes to
  `/api/admin/*` — Access passes those through to the Worker.
- The Worker **still** enforces `X-Admin-Token` on every admin request
  (`worker/admin.js`, SHA-256 timing-safe compare). Access is layer 1,
  the token is layer 2. Keep the token in the dashboard login box as before.
- Direct calls without a browser session — e.g.
  `curl https://.../api/admin/projects -H "X-Admin-Token: ..."` — now get an
  Access redirect page instead of JSON. That is expected. No current script
  depends on curling the admin API (import/seed scripts write straight to
  D1/R2 via `wrangler`).

> **If you ever need headless/script access to the admin API**, add a
> **Service Token**: Zero Trust → Access → Service Auth → Create token, then
> add a policy with Action `Non-identity` (Service Auth) to Application B and
> send headers `CF-Access-Client-Id` / `CF-Access-Client-Secret`. Not needed
> for the dashboard flow.

## 6. Verification checklist

| Test | Expected |
|---|---|
| Incognito → `/admin` | Access login page (email PIN + GitHub buttons) |
| Email PIN login | PIN mail arrives, code accepted, dashboard loads |
| GitHub login | OAuth consent, back to app, dashboard loads |
| Open `/admin` while logged in (normal window) | Dashboard directly, no login |
| `curl -I https://.../api/admin/projects` (no cookie) | `302` to `<team>.cloudflareaccess.com` — NOT a JSON 401 (Access intercepts first) |
| With browser logged in: dashboard → login with token → list projects | Works exactly as before (cookie + token both present) |
| `/`, `/lidar/`, `/api/manifest`, `/api/pointclouds` (incognito, no login) | All public, no Access prompt |

## 7. Rollback (instant, no deploy)

Zero Trust → **Access → Applications** → select the application →
**Pause** (or Delete). Protection is off immediately; nothing to redeploy.

## 8. Phase 8 preview — custom domain

The two applications above protect the **workers.dev** hostname only. After
Phase 8 moves `tliligis.me` onto Cloudflare (nameservers), create the same two
applications for `tliligis.me` (`/admin` and `/api/admin`) — 2 minutes, same
policies. Until then the workers.dev apps stay in place.
