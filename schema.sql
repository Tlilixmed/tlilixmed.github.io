-- ============================================================
-- D1 schema — GIS portfolio (gis-db)
-- Run: npx wrangler d1 execute gis-db --remote --file schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title_en     TEXT NOT NULL,
  title_fr     TEXT NOT NULL DEFAULT '',
  desc_en      TEXT NOT NULL DEFAULT '',
  desc_fr      TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'Other',
  year         TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#2098d8',
  visible      INTEGER NOT NULL DEFAULT 1,   -- visible at load
  collapsed    INTEGER NOT NULL DEFAULT 1,   -- legend starts folded
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 0,   -- public API shows published rows only
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS layers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  label_en      TEXT NOT NULL,
  label_fr      TEXT NOT NULL DEFAULT '',
  r2_key        TEXT,                        -- derived GeoJSON in bucket `repo` (served by /api/layer-data/<id>)
  original_key  TEXT,                        -- untouched original in bucket `gis-private`
  style_json    TEXT NOT NULL DEFAULT '{}',  -- {color, weight, dash, fillOpacity, radius, minZoom, maxZoom, outerColor}
  fields_json   TEXT NOT NULL DEFAULT '[]',  -- attribute whitelist (JSON array). '[]' = publish all attributes
  visible       INTEGER NOT NULL DEFAULT 1,
  published     INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  feature_count INTEGER NOT NULL DEFAULT 0,
  byte_size     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, slug)
);

CREATE TABLE IF NOT EXISTS pointclouds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,          -- e.g. 'las-1'
  title_en    TEXT NOT NULL,
  title_fr    TEXT NOT NULL DEFAULT '',
  desc_en     TEXT NOT NULL DEFAULT '',
  desc_fr     TEXT NOT NULL DEFAULT '',
  bucket      TEXT NOT NULL DEFAULT 'clouds-public',
  prefix      TEXT NOT NULL DEFAULT '',      -- e.g. 'las-1/' — Potree octree lives here
  status      TEXT NOT NULL DEFAULT 'awaiting_upload',  -- awaiting_upload | processing | published
  point_count INTEGER,
  srs         TEXT,
  published   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feature-level rows arrive in Phase 6 (admin feature editor).
-- Phase 4 keeps geometry in R2 artifacts; this table is ready for it.
CREATE TABLE IF NOT EXISTS features (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  layer_id   INTEGER NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  geom_json  TEXT NOT NULL,
  props_json TEXT NOT NULL DEFAULT '{}',
  published  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_layers_project  ON layers(project_id);
CREATE INDEX IF NOT EXISTS idx_features_layer  ON features(layer_id);
CREATE INDEX IF NOT EXISTS idx_projects_pub    ON projects(published, sort_order);

-- Upload tracking log (migration 002). Best-effort: the admin upload
-- endpoints keep working even if this table is absent.
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

-- ============================================================
-- Migration 003 — Lead inbox + engagement analytics
-- Both tables are cookie-less and first-party only:
--   leads  -> contact form submissions (replaces the mailto: flow)
--   events -> anonymous engagement beacons (sessionStorage session id,
--             no fingerprinting, no persistent visitor tracking)
-- Idempotent: safe to re-run.
-- Run: npx wrangler d1 execute gis-db --remote --file schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,       -- full_time | freelance | spatial_automation | other
  message TEXT NOT NULL,
  referrer TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new | read | replied | archived
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_leads_reason ON leads(reason);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  session_id TEXT,
  event_type TEXT NOT NULL,   -- page_view | cv_download | case_study_open | form_view | form_submit | map_cta_click
  detail TEXT,                -- e.g. project slug, cv language
  referrer TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
