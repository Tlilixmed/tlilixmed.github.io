#!/usr/bin/env node
// ============================================================
// One-command seed for the GIS portfolio
//
// What it does, in order:
//   1. Uploads the derived GeoJSON files to R2 bucket `repo`
//      (local repo file -> R2 key referenced by seed.sql)
//   2. Fills the D1 database (projects, layers, "LAS 1" placeholder)
//
// seed.sql uses INSERT OR IGNORE, so re-running never overwrites rows
// that already exist. To rename things on a live database use
// derived/004-rename-projects.sql instead.
//
// How to run (from the repo folder — the one with index.html):
//   npx wrangler login        <-- once; a browser opens, click Allow
//   node derived/seed.mjs
// ============================================================
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// { key: R2 object key (as written in seed.sql), local: file in this repo }
// Files whose local copy is missing are skipped with a warning instead of
// aborting, so a partial dataset still seeds what it can.
const FILES = [
  { key: 'geojson/something-open-ground/faults.geojson',            local: 'geojson/Something-open-ground/Faults.json' },
  { key: 'geojson/something-open-ground/favorable-geology.geojson', local: 'geojson/Something-open-ground/something Favorable Geology.json' },
  { key: 'geojson/something-open-ground/ocurrences.geojson',        local: 'geojson/Something-open-ground/Ocurrences.json' },
  { key: 'geojson/urban-digitize/buildings.geojson',                local: 'geojson/Las/Buildings.geojson' },
  { key: 'geojson/urban-digitize/cycleways.geojson',                local: 'geojson/Las/Cycleway.geojson' },
  { key: 'geojson/urban-digitize/pavements.geojson',                local: 'geojson/Las/Pavements.geojson' },
  { key: 'geojson/urban-digitize/roads.geojson',                    local: 'geojson/Las/Roads.geojson' },
  { key: 'geojson/urban-digitize/signalisation-horizontale.geojson', local: 'geojson/Las/signalisation_horizontale.geojson' },
  { key: 'geojson/legacy-tests/lidar-survey-blocks.geojson',        local: 'geojson/lidar-survey-blocks.geojson' },
  { key: 'geojson/legacy-tests/fiber-network.geojson',              local: 'geojson/fiber-network.geojson' },
  // early v1 demo layer — not kept in the repo; seeded only if a copy exists under derived/
  { key: 'geojson/legacy-tests/urban-digitization.geojson',         local: 'derived/geojson/legacy-tests/urban-digitization.geojson' },
];

// --- sanity: are we in the right folder? ---
if (!existsSync(join('derived', 'seed.sql')) || !existsSync('index.html')) {
  console.error('\n  Please run this from your REPO folder (the one that contains index.html).');
  console.error('  Example:  cd C:\Users\you\projects\tlilixmed.github.io\n');
  process.exit(1);
}

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// --- step 1: upload derived files to bucket `repo` ---
let n = 0, skipped = 0;
for (const { key, local } of FILES) {
  n++;
  if (!existsSync(local)) {
    console.warn(`\n=== [ ${n} / ${FILES.length} ] ${key}  — SKIPPED (no local file: ${local})`);
    skipped++;
    continue;
  }
  const mb = (statSync(local).size / 1e6).toFixed(2);
  console.log(`\n=== [ ${n} / ${FILES.length} ] ${local}  ->  repo/${key}  (${mb} MB) ===`);
  const ok = run(`npx wrangler r2 object put "repo/${key}" --file "${local}" --remote --content-type "application/geo+json"`);
  if (!ok) {
    console.error('\n  Upload failed. Most common cause: not logged in.');
    console.error('  Run:  npx wrangler login   (a browser opens, click Allow), then retry.\n');
    process.exit(1);
  }
}

// --- step 2: fill the database ---
console.log('\n=== Filling the D1 database (gis-db) ===');
if (!run('npx wrangler d1 execute gis-db --remote --file derived/seed.sql')) {
  console.error('\n  Database seed failed. Alternative: open gis-db in the Cloudflare dashboard ->');
  console.error('  Console -> paste the whole content of derived/seed.sql -> Run.\n');
  process.exit(1);
}

// --- done ---
console.log('\n==========================================');
console.log(`  DONE! ${FILES.length - skipped} files uploaded (${skipped} skipped) + database seeded.`);
console.log('  Test your API here:');
console.log('  https://tlilixmed-github-io.tlilixmed.workers.dev/api/manifest');
console.log('==========================================\n');
