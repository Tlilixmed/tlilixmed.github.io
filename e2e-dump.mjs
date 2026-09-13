import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/tmp/e2e-gis.db');
const dump = (title, sql) => {
  console.log('--- ' + title + ' ---');
  for (const r of db.prepare(sql).all()) console.log(JSON.stringify(r));
};
dump('events by type+detail', `SELECT event_type, COALESCE(detail,'(none)') AS detail, COUNT(*) AS n
     FROM events GROUP BY event_type, detail ORDER BY event_type, n DESC`);
dump('leads', 'SELECT id, name, email, status FROM leads');
