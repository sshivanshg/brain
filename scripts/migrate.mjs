// Copies every memory from one Brain to another Postgres, keeping ids' timestamps and days.
// Usage: node --env-file=.env.local scripts/migrate.mjs <source-url> <source-token>
// Writes into DATABASE_URL. Idempotent: rows are keyed by ext_key (or "local:<id>").
import pg from 'pg';

const [src, token] = process.argv.slice(2);
if (!src || !token || !process.env.DATABASE_URL) {
  console.error('usage: node --env-file=.env.local scripts/migrate.mjs <source-url> <source-token>');
  process.exit(1);
}
const res = await fetch(`${src.replace(/\/$/, '')}/api/export`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`export failed: HTTP ${res.status}`);
const rows = await res.json();
console.log(`source has ${rows.length} memories`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
let inserted = 0;
for (const m of rows) {
  const r = await pool.query(
    `INSERT INTO memories (kind, title, body, summary, source, project, tags, url, meta, pinned, status, day, ext_key, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::date,$13,$14,$15)
     ON CONFLICT (ext_key) DO NOTHING`,
    [m.kind, m.title || '', m.body || '', m.summary, m.source || 'unknown', m.project, m.tags || [], m.url, JSON.stringify(m.meta || {}),
      Boolean(m.pinned), m.status || 'active', m.day, m.ext_key || `local:${m.id}`, m.created_at, m.updated_at || m.created_at],
  );
  inserted += r.rowCount;
}
const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM memories');
console.log(`inserted ${inserted}, target now has ${n}`);
await pool.end();
