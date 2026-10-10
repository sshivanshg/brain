// Postgres in production (DATABASE_URL), embedded PGlite on disk for local use.
// Both expose query(sql, params) -> { rows }, so the rest of the app doesn't care.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function openDb() {
  let db;
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const url = process.env.DATABASE_URL;
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    db = { kind: 'postgres', query: (sql, params) => pool.query(sql, params), exec: (sql) => pool.query(sql) };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.BRAIN_DATA_DIR || path.join(ROOT, 'data', 'pglite');
    const lite = new PGlite(dir);
    await lite.waitReady;
    db = { kind: 'pglite', query: (sql, params) => lite.query(sql, params), exec: (sql) => lite.exec(sql) };
  }
  await db.exec(SCHEMA);
  return db;
}

export { ROOT };
