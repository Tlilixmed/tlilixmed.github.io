Lead Inbox + Engagement Analytics — changed files (commit 05a0298)
Base: origin/cloudflare @ afde419. 9 files, folder layout mirrors the repo.

OPTION A (recommended — git):
  git checkout cloudflare && git pull
  git am 0001-*.patch   (patch also delivered as ../leads-analytics.patch)
  git push              -> Workers CI auto-deploys

THEN run ONCE (creates the two new D1 tables):
  npx wrangler d1 execute gis-db --remote --file schema.sql
  (schema.sql is idempotent — safe to re-run)

OPTION B (manual copy): overwrite these repo paths with the ones here:
  worker/index.js          — +POST /api/leads, +POST /api/events
  worker/admin.js          — +leads CRUD/CSV, +/api/admin/analytics
  schema.sql               — migration 003 (leads + events)
  index.html               — form enum values, honeypot, note copy, analytics.js tag
  css/style.css            — honeypot + .qf-status styles
  js/contact-form.js       — real submission flow (inline ok / error + mailto fallback)
  js/analytics.js          — NEW: cookie-less engagement tracking
  admin/index.html         — new Leads + Analytics tabs
  docs/LEADS-ANALYTICS.md  — full deploy steps + API reference

Verification after deploy: submit the live contact form once, then check
Admin -> Leads (unread lead) and Admin -> Analytics (page view + submit).
Until the migration runs, the form shows an error + mailto fallback and the
admin tabs explain that migration 003 is pending — nothing breaks.
