-- Migration 002 — upload tracking log for the admin dashboard.
-- Apply:  npx wrangler d1 execute gis-db --remote --file derived/migrations/002-upload-log.sql
-- (idempotent; also appended to schema.sql)
CREATE TABLE IF NOT EXISTS upload_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cloud_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER,
  parts INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading',   -- uploading | complete | failed
  error TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_upload_log_cloud ON upload_log(cloud_id, id DESC);
