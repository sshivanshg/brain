import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scrub, orQuery, extractiveSummary } from '../server/util.js';

let store;
before(async () => {
  process.env.BRAIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-test-'));
  delete process.env.DATABASE_URL;
  const { openDb } = await import('../server/db.js');
  const { createStore } = await import('../server/store.js');
  store = createStore(await openDb());
});

test('scrub removes credentials', () => {
  const out = scrub('key sk-ant-abcdefghijklmnopqrstuvwxyz123 and postgres://me:hunter2@db.host/x and password=letmein99');
  assert.ok(!out.includes('abcdefghijklmnop'));
  assert.ok(!out.includes('hunter2'));
  assert.ok(!out.includes('letmein99'));
});

test('orQuery drops stopwords', () => {
  assert.equal(orQuery('What did I decide about the payouts?'), 'decide or payouts');
});

test('extractiveSummary prefers meta description', () => {
  assert.equal(extractiveSummary('body text here', 'A long enough meta description for this page right here.'), 'A long enough meta description for this page right here.');
});

test('remember is scrubbed, searchable and idempotent by ext_key', async () => {
  const a = await store.remember({ kind: 'decision', project: 'p1', body: 'Use Neon branching for previews. token=abcdef123456', ext_key: 'k1' });
  assert.match(a.body, /\[REDACTED\]/);
  const b = await store.remember({ kind: 'decision', project: 'p1', body: 'Use Neon branching for every PR preview.', ext_key: 'k1' });
  assert.equal(a.id, b.id);
  const hits = await store.search({ q: 'neon branching' });
  assert.equal(hits[0].id, a.id);
});

test('natural-language search falls back to OR', async () => {
  const hits = await store.search({ q: 'what did we decide about previews' });
  assert.ok(hits.length >= 1);
});

test('visits merge per url per day', async () => {
  const v = { url: 'https://example.com/a', title: 'A', text: 'Some text that is long enough to be a sentence here.', dwell: 30, day: '2026-01-01' };
  await store.recordVisit(v);
  const r = await store.recordVisit({ ...v, dwell: 15, highlights: ['nice quote here'] });
  assert.equal(r.meta.visits, 2);
  assert.equal(r.meta.dwell, 45);
  assert.deepEqual(r.meta.highlights, ['nice quote here']);
});

test('brief includes lessons and decisions for the project', async () => {
  await store.remember({ kind: 'lesson', project: 'p1', body: 'Run the integrity checklist before payout migrations.' });
  const brief = await store.brief({ project: 'p1' });
  assert.match(brief, /Lessons/);
  assert.match(brief, /Neon branching/);
});

test('saveDigest compacts that day of browsing', async () => {
  const waiting = await store.daysNeedingDigest();
  assert.ok(waiting.some((d) => d.day === '2026-01-01'));
  const r = await store.saveDigest('2026-01-01', '## Read & learned\n- example.com/a');
  assert.equal(r.compacted, 1);
  assert.ok(!(await store.daysNeedingDigest()).some((d) => d.day === '2026-01-01'));
});
