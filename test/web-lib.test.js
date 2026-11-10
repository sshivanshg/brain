import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, introMode, searchPath, mcpUrl, parseRoute } from '../web/lib.js';

test('signed-out visitors land on the manifesto for any route', () => {
  assert.equal(resolveRoute('/', false), 'landing');
  assert.equal(resolveRoute('/search', false), 'landing');
  assert.equal(resolveRoute('/about', false), 'landing');
  assert.equal(resolveRoute('/login', false), 'login');
});

test('signed-in routes map to views and /about stays reachable', () => {
  assert.equal(resolveRoute('/', true), 'home');
  assert.equal(resolveRoute('/about', true), 'landing');
  assert.equal(resolveRoute('/login', true), 'home');
  assert.equal(resolveRoute('/m/42', true), 'memory');
  assert.equal(resolveRoute('/project/x', true), 'project');
  assert.equal(resolveRoute('/nope', true), 'unknown');
});

test('intro plays once per session and only crossfades under reduced motion', () => {
  assert.equal(introMode({ seen: false, reducedMotion: false }), 'full');
  assert.equal(introMode({ seen: false, reducedMotion: true }), 'fade');
  assert.equal(introMode({ seen: true, reducedMotion: false }), 'none');
});

test('search path encodes the query and omits the all-kinds filter', () => {
  assert.equal(searchPath('neon branch', 'all'), '/api/memories?limit=40&q=neon%20branch');
  assert.equal(searchPath('', 'lesson'), '/api/memories?limit=40&kind=lesson');
});

test('route parsing splits path and query', () => {
  const r = parseRoute('#/search?q=a%20b&kind=todo');
  assert.equal(r.path, '/search');
  assert.equal(r.params.get('q'), 'a b');
  assert.equal(parseRoute('').path, '/');
});

test('mcp url is derived from origin', () => {
  assert.equal(mcpUrl('https://brain.example.com'), 'https://brain.example.com/mcp');
});

test('every kind gets a glyph and colour token, unknown kinds fall back to note', async () => {
  const { kindGlyph, kindVar } = await import('../web/lib.js');
  assert.equal(kindVar('profile'), 'preference');
  assert.equal(kindVar('mystery'), 'note');
  assert.notEqual(kindGlyph('decision'), kindGlyph('lesson'));
  assert.equal(kindGlyph('mystery'), kindGlyph('note'));
});

test('neural field caps pixel ratio and node count on phones and freezes under reduced motion', async () => {
  const { fieldBudget } = await import('../web/lib.js');
  const phone = fieldBudget({ width: 375, dpr: 3, reducedMotion: false });
  const desk = fieldBudget({ width: 1440, dpr: 2, reducedMotion: false });
  assert.ok(phone.dpr <= 1.5 && phone.nodes < desk.nodes && desk.nodes <= 120);
  assert.equal(phone.animate, true);
  assert.equal(fieldBudget({ width: 1440, dpr: 1, reducedMotion: true }).animate, false);
});

test('memory field clusters nodes by project, deterministically and inside the frame', async () => {
  const { clusterLayout } = await import('../web/lib.js');
  const mems = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `m${i}`, kind: 'note', project: ['a', 'b', 'c'][i % 3] }));
  const one = clusterLayout(mems, { width: 1000, height: 800 });
  assert.deepEqual(one, clusterLayout(mems, { width: 1000, height: 800 }));
  assert.equal(one.length, 30);
  assert.ok(one.every((n) => n.x >= 0 && n.x <= 1000 && n.y >= 0 && n.y <= 800));
  const centre = (p) => { const ns = one.filter((n) => n.project === p); return [ns.reduce((s, n) => s + n.x, 0) / ns.length, ns.reduce((s, n) => s + n.y, 0) / ns.length]; };
  const [ca, cb] = [centre('a'), centre('b')];
  const a0 = one.find((n) => n.project === 'a');
  assert.ok(Math.hypot(a0.x - ca[0], a0.y - ca[1]) < Math.hypot(a0.x - cb[0], a0.y - cb[1]));
  assert.equal(clusterLayout(mems, { width: 1000, height: 800, max: 10 }).length, 10);
});

test('specimen metadata strip reads kind, project, date and id', async () => {
  const { specimenMeta } = await import('../web/lib.js');
  assert.deepEqual(specimenMeta({ id: 7, kind: 'lesson', project: 'brain' }, '3d'), ['lesson', 'brain', '3d', '#7']);
  assert.deepEqual(specimenMeta({ id: 8, kind: 'note' }, 'now'), ['note', 'now', '#8']);
});
