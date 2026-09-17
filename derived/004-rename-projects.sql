-- ============================================================
-- Migration 004 — replace placeholder names on the LIVE database.
-- seed.sql uses INSERT OR IGNORE, so it never touches existing rows;
-- this file updates them in place. Idempotent: safe to re-run.
-- Run: npx wrangler d1 execute gis-db --remote --file derived/004-rename-projects.sql
-- ============================================================

UPDATE projects SET
  title_en = 'Tungsten Open Ground — Yukon',
  title_fr = 'Terrains libres tungstène — Yukon',
  desc_en  = 'Prospectivity screening for tungsten skarn targets: regional faults, favorable geology units and MINFILE occurrences, built on Yukon Geological Survey open data.',
  desc_fr  = 'Analyse de prospectivité pour des cibles de skarn à tungstène : failles régionales, unités géologiques favorables et indices MINFILE, à partir des données ouvertes de la Commission géologique du Yukon.',
  updated_at = datetime('now')
WHERE slug = 'something-open-ground';

UPDATE layers SET
  label_en = 'Regional faults (YGS)', label_fr = 'Failles régionales (YGS)',
  style_json = '{"weight": 1.2, "dash": "6 4"}', fields_json = '[]',
  -- after re-uploading the slimmed geojson/Something-open-ground/Faults.json (node derived/seed.mjs)
  feature_count = 34826, byte_size = 7119504,
  updated_at = datetime('now')
WHERE slug = 'faults' AND project_id = (SELECT id FROM projects WHERE slug = 'something-open-ground');

UPDATE layers SET
  label_en = 'Favorable geology', label_fr = 'Géologie favorable', updated_at = datetime('now')
WHERE slug = 'favorable-geology' AND project_id = (SELECT id FROM projects WHERE slug = 'something-open-ground');

UPDATE layers SET
  label_en = 'MINFILE occurrences', label_fr = 'Indices MINFILE', style_json = '{}', updated_at = datetime('now')
WHERE slug = 'ocurrences' AND project_id = (SELECT id FROM projects WHERE slug = 'something-open-ground');

UPDATE projects SET
  title_en = 'Urban Digitization',
  title_fr = 'Numérisation urbaine',
  desc_en  = 'High-precision digitization of buildings, roads, pavements, cycleways and road markings from drone imagery.',
  desc_fr  = 'Numérisation de haute précision des bâtiments, routes, revêtements, pistes cyclables et marquages au sol à partir d''imagerie drone.',
  updated_at = datetime('now')
WHERE slug = 'urban-digitize';
