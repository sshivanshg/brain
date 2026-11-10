import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// databaseUrl() reads env at call time but DEMO is fixed at import, so check it in a child process.
function urlFor(env) {
  const code = "import('./server/db.js').then((m) => console.log(m.databaseUrl()))";
  const r = spawnSync(process.execPath, ['-e', code], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return r.stdout.trim();
}

test('demo mode never connects to the real database', () => {
  const real = 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require';
  assert.equal(urlFor({ DATABASE_URL: real }), real);
  assert.equal(urlFor({ DATABASE_URL: real, BRAIN_DEMO: '1' }), 'postgresql://u:p@ep-x.neon.tech/brain_demo?sslmode=require');
  assert.equal(urlFor({ BRAIN_DEMO: '1' }), 'null');
});

test('demo data is fictional and covers every surface', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../server/demo-data.json', import.meta.url)));
  const kinds = new Set(rows.map((r) => r.kind));
  for (const k of ['profile', 'decision', 'lesson', 'preference', 'todo', 'session', 'browse', 'digest', 'skill']) assert.ok(kinds.has(k), k);
  assert.ok(rows.length > 400);
  assert.ok(rows.some((r) => r.ago === 0), 'has activity today');
  assert.ok(!JSON.stringify(rows).match(/shivansh|ditch|lineup|brn_/i), 'no real personal data');
});
