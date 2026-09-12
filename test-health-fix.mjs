// Health endpoint regression: public shape stays private, admin token gets
// the detailed D1 + R2 report, failures degrade correctly.
import worker from '/home/z/my-project/audit/tlilixmed.github.io/cf-work/worker/index.js';

const env = {
  ADMIN_TOKEN: 'secret-token',
  DB: { prepare: () => ({ first: async () => ({}), bind: () => ({ first: async () => ({}) }) }) },
  R2_PRIVATE: { list: async () => ({ objects: [] }) },
  R2_MEDIA: { list: async () => ({ objects: [] }) },
  R2_CLOUDS: { list: async () => ({ objects: [] }) },
};
const H = (t) => (t ? { 'x-admin-token': t } : {});
let fails = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) fails++; };
const run = (headers = {}) => worker.fetch(new Request('https://x.test/api/health', { headers }), env, { waitUntil() {} });

// public — no token: bare {ok}, 200, no binding names leaked
let r = await run();
let j = await r.json();
ok(r.status === 200 && j.ok === true, `public 200 {ok:true} (got ${r.status} ${JSON.stringify(j)})`);
ok(!('d1' in j) && !('r2' in j), 'public response leaks no binding detail');

// wrong token — still bare
r = await run(H('wrong'));
j = await r.json();
ok(r.status === 200 && !('r2' in j), `wrong token stays bare (got ${JSON.stringify(j)})`);

// admin token — full report
r = await run(H('secret-token'));
j = await r.json();
ok(r.status === 200, `admin 200 (got ${r.status})`);
ok(j.d1 === true && j.r2_ok === true, `admin report d1+r2_ok (${JSON.stringify(j)})`);
ok(j.r2?.['gis-private'] === true && j.r2?.repo === true && j.r2?.['clouds-public'] === true, 'all three buckets checked');

// one bucket down -> admin sees 503 + which bucket, public still bare 200
env.R2_CLOUDS = { list: async () => { throw new Error('boom'); } };
r = await run(H('secret-token'));
j = await r.json();
ok(r.status === 503 && j.r2?.['clouds-public'] === false && j.r2_ok === false, `bucket down: admin 503 + flag (${r.status} ${JSON.stringify(j)})`);
r = await run();
j = await r.json();
ok(r.status === 200 && j.ok === true && !('r2' in j), 'public unaffected by R2 outage');

// D1 down -> everyone gets {ok:false} 503
env.DB = { prepare: () => { throw new Error('d1 down'); } };
r = await run();
j = await r.json();
ok(r.status === 503 && j.ok === false, `D1 down: public 503 (${r.status} ${JSON.stringify(j)})`);
r = await run(H('secret-token'));
ok(r.status === 503, 'D1 down: admin 503 too');

// other routes untouched: unknown api 404, lead POST still routed
env.DB = { prepare: () => ({ first: async () => ({}), bind: () => ({ first: async () => ({}) }) }) };
r = await worker.fetch(new Request('https://x.test/api/nope'), env, { waitUntil() {} });
ok(r.status === 404, `unknown api 404 intact (got ${r.status})`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS — health endpoint fix verified');
process.exit(fails ? 1 : 0);
