#!/usr/bin/env node
// ============================================================
// One-command seed for the GIS portfolio (Phase 4)
//
// What it does, in order:
//   1. Uploads the 11 derived GeoJSON files to R2 bucket `repo`
//   2. Fills the D1 database (projects, layers, "LAS 1" placeholder)
//
// How to run (from your repo folder — the one with index.html):
//   npx wrangler login        <-- once; a browser opens, click Allow
//   node derived/seed.mjs
// ============================================================
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const FILES = [
  'geojson/something-open-ground/faults.geojson',
  'geojson/something-open-ground/favorable-geology.geojson',
  'geojson/something-open-ground/ocurrences.geojson',
  'geojson/urban-digitize/buildings.geojson',
  'geojson/urban-digitize/cycleways.geojson',
  'geojson/urban-digitize/pavements.geojson',
  'geojson/urban-digitize/roads.geojson',
  'geojson/urban-digitize/signalisation-horizontale.geojson',
  'geojson/legacy-tests/lidar-survey-blocks.geojson',
  'geojson/legacy-tests/fiber-network.geojson',
  'geojson/legacy-tests/urban-digitization.geojson',
];

// --- sanity: are we in the right folder? ---
if (!existsSync(join('derived', 'seed.sql')) || !existsSync('index.html')) {
  console.error('\n  Please run this from your REPO folder (the one that contains index.html).');
  console.error('  Example:  cd C:\\Users\\you\\projects\\tlilixmed.github.io\n');
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
let n = 0;
for (const rel of FILES) {
  const local = join('derived', rel);
  if (!existsSync(local)) {
    console.error(`\n  MISSING FILE: ${local}`);
    console.error('  (the derived folder is incomplete — re-extract the zip)\n');
    process.exit(1);
  }
  const mb = (statSync(local).size / 1e6).toFixed(2);
  console.log(`\n=== [ ${++n} / ${FILES.length} ] ${rel}  (${mb} MB) ===`);
  const ok = run(`npx wrangler r2 object put "repo/${rel}" --file "${local}" --remote --content-type "application/geo+json"`);
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
console.log('  DONE! 11 files uploaded + database seeded.');
console.log('  Test your API here:');
console.log('  https://tlilixmed-github-io.tlilixmed.workers.dev/api/manifest');
console.log('==========================================\n');
