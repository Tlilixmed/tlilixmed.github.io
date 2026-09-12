# Lead Inbox + Engagement Analytics (migration 003)

Two new first-party features, no new services: **D1 + Workers only**, no cookies,
no third-party scripts, no raw IP storage.

```
Contact form (site)  --POST /api/leads-->  Worker  -->  D1 `leads`   -->  Admin "Leads" tab
Visitor actions      --POST /api/events->  Worker  -->  D1 `events`  -->  Admin "Analytics" tab
```

## 1. ONE-TIME DEPLOY STEP — run the migration

The Worker deploy picks the code up automatically (push to `cloudflare`), but the
two new D1 tables must be created once:

```bash
npx wrangler d1 execute gis-db --remote --file schema.sql
```

`schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS` everywhere), so it is
safe to re-run. Until this is done:

- the contact form shows a friendly error + `mailto:` fallback (no lead is lost silently),
- `/api/admin/leads` returns an empty inbox with a warning naming migration 003,
- `/api/admin/analytics` returns HTTP 503 with the same hint.

## 2. What was added

### Public endpoints (worker/index.js)

| Endpoint | Purpose |
|---|---|
| `POST /api/leads` | Contact form submissions → D1 `leads`. Validates name/email/message, maps `reason` to `full_time \| freelance \| spatial_automation \| other`. |
| `POST /api/events` | Engagement beacons → D1 `events`. Accepts a single event or `{events:[...]}` (max 25); unknown types dropped; insert runs in `waitUntil` so the response is instant. |

Spam/abuse defenses (all in-memory or validated, nothing persisted):

- **Honeypot**: hidden `company` field — filled ⇒ fake `{ok:true}`, nothing stored.
- **Validation**: name ≤ 200, email ≤ 320 (regex), message ≤ 10000, all fields trimmed.
- **Rate limit**: leads 5 / 10 min, events 120 / min — keyed on a SHA-256 hash of the
  client IP. The hash lives only in isolate memory; raw IPs are never stored anywhere.

### Public site (index.html, js/contact-form.js, js/analytics.js, css/style.css)

- The quote form now **POSTs to `/api/leads`**: on success an inline bilingual
  confirmation is shown (no redirect); on failure an inline error with a
  pre-filled `mailto:` fallback link appears, so a down API never blocks a
  motivated contact.
- `js/analytics.js` (~4 KB, fail-silent) tracks:
  - `page_view` (+ language detail)
  - `cv_download` — EN/FR read from the live CV href
  - `case_study_open` — per project slug (`data-target` minus `case-`)
  - `form_view` — fired once when the form scrolls into view (IntersectionObserver)
  - `form_submit` — fired by contact-form.js after a successful POST
  - `map_cta_click` — static map cards + 2D/3D LiDAR toggles
- Session id: anonymous UUID in **sessionStorage** (dies with the tab). No cookies,
  no fingerprinting, no persistent identifiers. Events batch (5 / 2.5 s) and flush
  via `navigator.sendBeacon` / `fetch keepalive` so clicks survive navigation.

### Admin API (worker/admin.js, all behind the existing X-Admin-Token + Access)

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/leads?status=&reason=&limit=` | List, newest first, + per-status counts |
| `GET /api/admin/leads/:id` | Single lead |
| `PUT /api/admin/leads/:id` | Update `status` (`new|read|replied|archived`) and/or `notes` |
| `DELETE /api/admin/leads/:id` | Delete one lead |
| `GET /api/admin/leads/export.csv?status=&reason=` | CSV on the fly (UTF-8 BOM + CRLF, Excel-friendly), honors the same filters |
| `GET /api/admin/analytics?days=7|30` | One-screen dashboard payload (see below) |

### Admin dashboard (admin/index.html — two new tabs)

- **Leads** — inbox with unread badge on the tab, status/reason filters, newest
  first, unread rows highlighted. Opening a lead marks it read. Detail view:
  full message, referrer, status select (auto-saves), internal notes
  (save button), **Reply by email** (`mailto:`), delete.
- **Analytics** — one screen: KPI cards (page views + unique sessions, case
  study opens, CV downloads with EN/FR split, form submits + conversion, map
  CTA clicks); page-views-per-day bar chart (tooltip = date / views / unique
  sessions); contact funnel (form views → submits → leads → replied with reply
  rate joined from `leads`); case studies ranked; referrer breakdown by
  category (LinkedIn / job board / search / direct / other) + top sources;
  7-day / 30-day range toggle.

## 3. D1 tables (already in schema.sql)

Exactly as specified, plus indexes:

```sql
leads  (id, created_at, name, email, reason, message, referrer, status DEFAULT 'new', notes)
events (id, created_at, session_id, event_type, detail, referrer)
```

`events.event_type` whitelist: `page_view | cv_download | case_study_open |
form_view | form_submit | map_cta_click`.

## 4. Verification checklist after deploy

1. `npx wrangler d1 execute gis-db --remote --file schema.sql`
2. Push `cloudflare` → Workers CI deploys.
3. Submit the live contact form once → inline confirmation → the lead shows in
   **Admin → Leads** with the NEW highlight.
4. Open **Admin → Analytics** → the page view / form submit appear within seconds.
5. `GET /api/health` stays green; the map, lidar viewer and uploads are untouched
   (this change is purely additive to the Worker router).

## 5. Notes & limits

- The rate limiter is per-isolate (resets on deploy) — it is spam damping, not a
  hard quota. Cloudflare's edge protection stays the first line of defense.
- CSV export is generated on the fly (≤ 5000 rows). If the inbox ever grows past
  that, an R2-backed export can be added without changing the UI.
- `analytics.js` is only loaded by the portfolio `index.html` — the lidar viewer
  and admin pages do not emit events.
