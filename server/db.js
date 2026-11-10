// Postgres in production (DATABASE_URL), embedded PGlite on disk for local use.
// Both expose query(sql, params) -> { rows }, so the rest of the app doesn't care.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO } from './demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT        NOT NULL DEFAULT 'note',
  title       TEXT        NOT NULL DEFAULT '',
  body        TEXT        NOT NULL DEFAULT '',
  summary     TEXT,
  source      TEXT        NOT NULL DEFAULT 'unknown',
  project     TEXT,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  url         TEXT,
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  pinned      BOOLEAN     NOT NULL DEFAULT false,
  status      TEXT        NOT NULL DEFAULT 'active',
  day         DATE        NOT NULL DEFAULT CURRENT_DATE,
  ext_key     TEXT        UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple',  coalesce(project, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(body, ''), 200000)), 'C')
  ) STORED
);
CREATE INDEX IF NOT EXISTS memories_tsv      ON memories USING gin (tsv);
CREATE INDEX IF NOT EXISTS memories_kind     ON memories (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_project  ON memories (project, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_day      ON memories (day);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, sub JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

// The demo never uses the real database: it gets a sibling database named brain_demo
// (or BRAIN_DEMO_DATABASE_URL), and falls back to in-memory PGlite locally.
export function databaseUrl() {
  if (!DEMO) return process.env.DATABASE_URL || null;
  if (process.env.BRAIN_DEMO_DATABASE_URL) return process.env.BRAIN_DEMO_DATABASE_URL;
  if (!process.env.DATABASE_URL) return null;
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = '/brain_demo';
  return u.toString();
}

export async function openDb() {
  let db;
  const url = databaseUrl();
  if (url) {
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    db = { kind: 'postgres', query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql) };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.BRAIN_DATA_DIR || path.join(ROOT, 'data', 'pglite');
    const lite = DEMO ? new PGlite() : new PGlite(dir); // demo without Postgres: in-memory
    await lite.waitReady;
    db = { kind: 'pglite', query: (sql, params) => lite.query(sql, params), exec: (sql) => lite.exec(sql) };
  }
  await db.exec(SCHEMA);
  if (DEMO) await seedDemo(db);
  db.vector = await enableVectors(db);
  return db;
}

// pgvector for semantic search (Postgres only; PGlite keeps full-text search).
async function enableVectors(db) {
  if (db.kind !== 'postgres' || DEMO || process.env.BRAIN_VECTORS === '0') return false;
  try {
    await db.exec(`CREATE EXTENSION IF NOT EXISTS vector;
      ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1024);
      CREATE INDEX IF NOT EXISTS memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);`);
    return true;
  } catch (e) {
    // Concurrent cold starts can race on CREATE EXTENSION; the column existing is what matters.
    const { rows } = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'embedding'").catch(() => ({ rows: [] }));
    if (rows.length) return true;
    console.error('[db] pgvector unavailable:', e.message);
    return false;
  }
}

export { ROOT };

// Load server/demo-data.json into the in-memory demo database (fictional data only).
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

// Reseed the demo with fresh dates once a day (or when empty). An advisory lock stops
// concurrent cold starts from seeding twice.
async function seedDemo(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS demo_meta (id INT PRIMARY KEY, seeded_at TIMESTAMPTZ NOT NULL)');
  if (db.kind === 'postgres') await db.query('SELECT pg_advisory_lock(4242)');
  try {
    const last = (await db.query('SELECT seeded_at FROM demo_meta WHERE id = 1')).rows[0];
    if (last && Date.now() - new Date(last.seeded_at).getTime() < DEMO_TTL_MS) return;
    const { default: rows } = await import('./demo-data.json', { with: { type: 'json' } });
    await db.exec('TRUNCATE memories RESTART IDENTITY; DELETE FROM push_subs;');
    const now = Date.now();
    const items = rows.map((m) => {
      const at = new Date(now - m.ago * 86400000);
      at.setHours(m.hour, (m.title.length * 7) % 60, 0, 0);
      return { ...m, day: at.toLocaleDateString('en-CA'), at: at.toISOString(), meta: m.meta || {}, tags: m.tags || [] };
    });
    // One round trip: expand the JSON array into rows server-side.
    await db.query(
      `INSERT INTO memories (kind, title, body, summary, source, project, tags, url, meta, pinned, status, day, ext_key, created_at, updated_at)
       SELECT kind, title, body, summary, source, project, ARRAY(SELECT jsonb_array_elements_text(tags)), url, meta,
              coalesce(pinned, false), 'active', day::date, ext_key, at::timestamptz, at::timestamptz
       FROM jsonb_to_recordset($1::jsonb) AS r(kind text, title text, body text, summary text, source text, project text,
            tags jsonb, url text, meta jsonb, pinned boolean, day text, ext_key text, at text)`,
      [JSON.stringify(items)],
    );
    await db.query('INSERT INTO demo_meta (id, seeded_at) VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET seeded_at = now()');
  } finally {
    if (db.kind === 'postgres') await db.query('SELECT pg_advisory_unlock(4242)');
  }
}
