// Regression for the analytics funnel expansion:
//  - new event types accepted (language_change, form_* split, lidar_*, details_open)
//  - unknown types rejected WITH reasons reported in the response + console log
//  - admin analytics surfaces languages / lidar / extended funnel numbers
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '/home/z/my-project/audit/tlilixmed.github.io/cf-work/worker/index.js';
import { handleAdmin } from '/home/z/my-project/audit/tlilixmed.github.io/cf-work/worker/admin.js';

const ROOT = '/home/z/my-project/audit/tlilixmed.github.io/cf-work';
const TOKEN = 'tok';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(`${ROOT}/schema.sql`, 'utf8'));
const env = {
  ADMIN_TOKEN: TOKEN,
  DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrap = (s) => ({
        first: async (...p) => s.get(...p) ?? null,
        all: async (...p) => ({ results: s.all(...p) }),
        run: async (...p) => s.run(...p),
        bind: (...p) => wrap(s),
      });
      return wrap(stmt);
    },
    async batch(stmts) { const o = []; for (const st of stmts) o.push(await st.run()); return o; },
  },
};
// D1 batch passes pre-bound statements; emulate by evaluating them eagerly:
// our wrapper ignores the bind chain, so batch items must capture their params.
// Simplest faithful approach: run inserts directly when batch is called.
env.DB.batch = async (stmts) => { for (const s of stmts) await s(); return []; };

// NOTE: worker builds batch items as prepared().bind(...).bind() results —
// to keep the mock honest we intercept at prepare(): each `.bind(...)` returns
// a runnable that executes immediately-batched SQL. The `batch` above calls
// each item as a function — so make bind() return a callable with run/all/first.
env.DB.prepare = (sql) => {
  const stmt = db.prepare(sql);
  const mk = (params) => {
    const run = async () => {
      const info = stmt.run(...params);
      // D1-shaped result: r.meta.last_row_id
      return { meta: { last_row_id: Number(info.lastInsertRowid || 0) }, changes: info.changes };
    };
    return Object.assign(run, {
      run, first: async () => stmt.get(...params) ?? null,
      all: async () => ({ results: stmt.all(...params) }),
      bind: (...p) => mk(p),
    });
  };
  return mk([]);
};

const logs = [];
console.log = ((orig) => (...a) => { logs.push(a.join(' ')); })(console.log);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, l) => { console.error(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) fails++; };

const post = (body) => worker.fetch(new Request('https://x.test/api/events', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
}), env, { waitUntil() {} });

// 1. mixed batch: 6 valid new-type events + 2 junk
let r = await post({ events: [
  { type: 'language_change', detail: 'fr', session_id: 's1' },
  { type: 'form_attempt', session_id: 's1' },
  { type: 'form_invalid', detail: 'email', session_id: 's1' },
  { type: 'form_error', detail: 'HTTP 503', session_id: 's1' },
  { type: 'form_fallback_click', session_id: 's1' },
  { type: 'lidar_loaded', detail: 'las-1 (10,304,711 pts)', session_id: 's1' },
  { type: 'nope_type', session_id: 's1' },
  'garbage',
] });
let j = await r.json();
ok(r.status === 200 && j.stored === 6, `6 new-type events stored (got ${j.stored})`);
ok(j.rejected === 2 && /unknown type: nope_type/.test((j.reasons || []).join(';')), `2 rejected with reasons (${JSON.stringify(j.reasons)})`);
ok(logs.some((l) => l.includes('[events] rejected 2/8')), 'console log line emitted for rejected batch');
await wait(30);

// 2. details_open + lidar_error + lidar_mode also whitelist-pass
r = await post({ events: [
  { type: 'details_open', detail: 'Some summary', session_id: 's2' },
  { type: 'lidar_error', detail: 'las-2: HTTP 404', session_id: 's2' },
  { type: 'lidar_mode', detail: 'las-1:intensity', session_id: 's2' },
] });
j = await r.json();
ok(j.stored === 3 && j.rejected === 0, `details_open + lidar_error + lidar_mode stored (${j.stored}/${j.rejected})`);
await wait(30);

// 3. seed page views for the analytics window
await post({ events: [
  { type: 'page_view', session_id: 's1' }, { type: 'page_view', session_id: 's2' },
  { type: 'form_view', session_id: 's1' }, { type: 'form_submit', session_id: 's1' },
] });
await wait(30);
db.exec(`INSERT INTO leads (name,email,reason,message,status) VALUES ('T','t@x.io','other','m','new')`);

// 4. admin analytics: extended funnel + languages + lidar
r = await handleAdmin(new Request('https://x.test/api/admin/analytics?days=30', { headers: { 'x-admin-token': TOKEN } }), env, '/api/admin/analytics');
j = await r.json();
ok(r.status === 200, `analytics 200 (${r.status})`);
const f = j.funnel || {};
ok(f.form_attempts === 1 && f.form_invalid === 1 && f.form_errors === 1 && f.form_fallback_clicks === 1 && f.form_submits === 1,
  `extended funnel numbers (a:${f.form_attempts} i:${f.form_invalid} e:${f.form_errors} fb:${f.form_fallback_clicks} s:${f.form_submits})`);
ok((j.languages || []).some((x) => x.lang === 'fr' && x.n === 1), `languages split present (${JSON.stringify(j.languages)})`);
ok((j.lidar || []).some((x) => x.event === 'lidar_loaded' && /las-1/.test(x.detail)), `lidar ranking present (${JSON.stringify(j.lidar)})`);
ok(j.totals.case_study_opens === 0 && j.totals.page_views === 2, `totals sane (pv:${j.totals.page_views})`);

// 5. lead POST still fine (router untouched)
r = await worker.fetch(new Request('https://x.test/api/leads', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'N', email: 'n@x.io', reason: 'other', message: 'hi' }),
}), env, { waitUntil() {} });
j = await r.json();
ok(r.status === 200 && j.ok === true, `lead POST intact (${r.status} ${JSON.stringify(j)})`);

console.error(fails ? `\n${fails} FAILURES` : '\nALL PASS — funnel expansion verified');
process.exit(fails ? 1 : 0);
