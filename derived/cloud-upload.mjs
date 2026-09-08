#!/usr/bin/env node
// ============================================================
// Upload a converted Potree folder to R2 (clouds-public) and
// optionally publish the cloud in the D1 catalog.
//
// Usage (from your repo folder — the one with index.html):
//   node derived/cloud-upload.mjs <converted-folder> <slug> [--activate]
//
//   <converted-folder>   output of PotreeConverter (either the plain
//                        octree folder, or a --generate-page folder —
//                        the script auto-detects pointclouds/<name>/)
//   <slug>               cloud name in the catalog, e.g. las-1
//   --activate           also publish it (status=ready, published=1)
//                        requires the ADMIN_TOKEN environment variable
//
// Examples:
//   node derived/cloud-upload.mjs converted-las1 las-1
//   set ADMIN_TOKEN=xxxx  &  node derived/cloud-upload.mjs page las-1 --activate
// ============================================================
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const BUCKET = 'clouds-public';
const BASE = 'https://tlilixmed-github-io.tlilixmed.workers.dev';

const args = process.argv.slice(2).filter(a => a !== '--activate');
const ACTIVATE = process.argv.includes('--activate');
const [folder, slug] = args;

if (!folder || !slug || !existsSync(folder)) {
  console.error('\n  Usage: node derived/cloud-upload.mjs <converted-folder> <slug> [--activate]');
  console.error('  Example: node derived/cloud-upload.mjs converted-las1 las-1\n');
  process.exit(1);
}

// --- auto-detect the octree directory -------------------------------
let root = folder;
const pcSub = join(folder, 'pointclouds');
if (existsSync(pcSub)) {
  const subs = readdirSync(pcSub).filter(f => statSync(join(pcSub, f)).isDirectory());
  if (subs.length === 1) root = join(pcSub, subs[0]);
}
if (!existsSync(join(root, 'metadata.json'))) {
  console.error(`\n  No metadata.json in "${root}" — is this a PotreeConverter output folder?\n`);
  process.exit(1);
}
console.log(`\n=== Uploading "${root}" -> r2://${BUCKET}/${slug}/ ===`);

// --- collect files ---------------------------------------------------
function walk(dir, base = dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(p);
  }
  return out;
}
const files = walk(root).filter(p => !p.endsWith('log.txt'));
const totalMB = files.reduce((s, p) => s + statSync(p).size, 0) / 1e6;
console.log(`${files.length} files, ${totalMB.toFixed(1)} MB total\n`);

// --- upload with small concurrency -----------------------------------
function run(cmd) {
  try { execSync(cmd, { stdio: 'pipe' }); return true; }
  catch (e) { console.error(String(e.stderr || e)); return false; }
}

let done = 0;
let failed = 0;
const QUEUE = [...files];

async function worker(n) {
  while (QUEUE.length) {
    const abs = QUEUE.shift();
    if (!abs) break;
    const rel = relative(root, abs).split(sep).join('/');
    const key = `${slug}/${rel}`;
    const mb = (statSync(abs).size / 1e6).toFixed(2);
    const isBin = rel.endsWith('.bin');
    const ct = isBin ? 'application/octet-stream' : 'application/json';
    const cc = isBin ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
    const ok = run(`npx wrangler r2 object put "${BUCKET}/${key}" --file "${abs}" --remote --content-type "${ct}" --cache-control "${cc}"`);
    done++;
    if (!ok) failed++;
    console.log(`  [ ${String(done).padStart(String(files.length).length)} / ${files.length} ] ${key}  (${mb} MB)${ok ? '' : '  FAILED'}`);
  }
}
await Promise.all([worker(1), worker(2), worker(3), worker(4), worker(5), worker(6)]);

if (failed) {
  console.error(`\n  ${failed} upload(s) failed — fix and re-run (already-uploaded files are simply overwritten).\n`);
  process.exit(1);
}
console.log('\nAll files uploaded.');

// --- optionally publish ----------------------------------------------
if (ACTIVATE) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.error('\n  --activate needs ADMIN_TOKEN. In cmd:   set ADMIN_TOKEN=yourtoken');
    console.error('                            in PowerShell:  $env:ADMIN_TOKEN="yourtoken"\n');
    process.exit(1);
  }
  try {
    const listRes = await fetch(`${BASE}/api/admin/pointclouds`, { headers: { 'X-Admin-Token': token } });
    if (listRes.status === 401 || listRes.status === 403) throw new Error('ADMIN_TOKEN rejected by the API');
    const list = await listRes.json();
    const row = (list.pointclouds || []).find(c => c.slug === slug);
    if (!row) throw new Error(`cloud "${slug}" not found in the catalog (expected the LAS 1 placeholder)`);
    // enrich from Potree metadata.json when available
    const patch = { status: 'ready', published: 1 };
    try {
      const meta = JSON.parse(await import('node:fs').promises.readFile(join(root, 'metadata.json'), 'utf8'));
      if (meta.points) patch.point_count = meta.points;
      if (meta.projection) patch.srs = meta.projection;
    } catch { /* metadata optional here */ }
    const put = await fetch(`${BASE}/api/admin/pointclouds/${row.id}`, {
      method: 'PUT',
      headers: { 'X-Admin-Token': token, 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!put.ok) throw new Error('PUT failed: HTTP ' + put.status + ' ' + (await put.text()));
    console.log(`\nPublished "${slug}" (status=ready, published=1).`);
  } catch (e) {
    console.error('\n  Activation failed: ' + (e.message || e));
    console.error('  The files ARE uploaded — you can publish later from the admin API.');
    process.exit(1);
  }
}

console.log('\n==========================================');
console.log('  DONE!');
console.log('  Catalog:  ' + BASE + '/api/pointclouds');
console.log('  Viewer:   ' + BASE + '/lidar/');
console.log('==========================================\n');
