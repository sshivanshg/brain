import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, introMode, searchPath, mcpUrl, parseRoute, skillsPath, skillPath, skillTitle, pullCommand } from '../web/lib.js';

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

test('brain silhouette contains the cerebrum and excludes the corners', async () => {
  const { inBrain } = await import('../web/lib.js');
  assert.equal(inBrain(0, -0.1), true);
  assert.equal(inBrain(0.55, 0.42), true); // cerebellum
  assert.equal(inBrain(-0.98, 0.95), false);
  assert.equal(inBrain(0.98, -0.95), false);
});

test('brain nodes are deterministic, capped and all inside the silhouette', async () => {
  const { brainNodes, inBrain } = await import('../web/lib.js');
  const a = brainNodes(90, 7);
  assert.deepEqual(a, brainNodes(90, 7));
  assert.equal(a.length, 90);
  assert.ok(a.every((n) => inBrain(n.x, n.y)));
  assert.equal(brainNodes(5000, 1).length, 160);
});

test('brain links join near neighbours only, each pair once, with a per-node cap', async () => {
  const { brainNodes, brainLinks } = await import('../web/lib.js');
  const nodes = brainNodes(80, 3);
  const links = brainLinks(nodes, { reach: 0.35, perNode: 3 });
  assert.ok(links.length > 40);
  const seen = new Set(), deg = new Map();
  for (const [i, j] of links) {
    assert.ok(i < j && !seen.has(`${i}-${j}`)); seen.add(`${i}-${j}`);
    assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) <= 0.35);
    deg.set(i, (deg.get(i) || 0) + 1);
  }
  assert.ok([...deg.values()].every((d) => d <= 3));
});

test('landing search demo matches title or body, case-insensitively, and marks hits', async () => {
  const { demoSearch } = await import('../web/lib.js');
  const rows = [{ title: 'Use Neon branches', body: 'per PR' }, { title: 'Tabs', body: 'Prefer two spaces' }];
  assert.deepEqual(demoSearch(rows, 'neon').map((r) => r.title), ['Use Neon branches']);
  assert.deepEqual(demoSearch(rows, 'SPACES').map((r) => r.title), ['Tabs']);
  assert.equal(demoSearch(rows, '').length, 2);
  assert.equal(demoSearch(rows, 'zzz').length, 0);
});

test('skills routes resolve to the list and detail views', () => {
  assert.equal(resolveRoute('/skills', true), 'skills');
  assert.equal(resolveRoute('/skills/code-review', true), 'skill');
  assert.equal(resolveRoute('/skills', false), 'landing');
});

test('skills api paths carry the project only when one is picked', () => {
  assert.equal(skillsPath(''), '/api/skills');
  assert.equal(skillsPath('my app'), '/api/skills?project=my%20app');
  assert.equal(skillPath('code review', ''), '/api/skills/code%20review');
  assert.equal(skillPath('x', 'brain'), '/api/skills/x?project=brain');
});

test('skill title comes from frontmatter, then heading, then file name', () => {
  assert.equal(skillTitle('---\nname: tdd\ndescription: d\n---\n# Other'), 'tdd');
  assert.equal(skillTitle('# Code review\nbody'), 'Code review');
  assert.equal(skillTitle('plain text', 'notes.md'), 'notes');
  assert.equal(skillTitle('', ''), '');
});

test('pull command names the project or falls back to a placeholder', () => {
  assert.equal(pullCommand('brain'), 'brain skills pull -p brain');
  assert.equal(pullCommand(''), 'brain skills pull -p <project>');
});

test('landing gets the hero morph intro; app routes keep the short one', () => {
  assert.equal(introMode({ seen: false, reducedMotion: false, landing: true }), 'hero');
  assert.equal(introMode({ seen: false, reducedMotion: true, landing: true }), 'fade');
  assert.equal(introMode({ seen: true, reducedMotion: false, landing: true }), 'none');
  assert.equal(introMode({ seen: false, reducedMotion: false, landing: false }), 'full');
});

test('intro and hero share one geometry so the morph lands on the hero nodes', async () => {
  const { heroGeometry, heroNodeCount, brainPoint } = await import('../web/lib.js');
  const g = heroGeometry(600, 520);
  assert.equal(g.s, Math.min(600 / 2.15, 520 / 1.8));
  assert.equal(g.cx, 300);
  assert.equal(heroNodeCount(390), 90);
  assert.equal(heroNodeCount(1440), 160);
  const p = brainPoint({ x: 0.5, y: -0.5 }, g, { left: 100, top: 40 });
  assert.equal(p.x, 100 + g.cx + 0.5 * g.s);
  assert.equal(p.y, 40 + g.cy - 0.5 * g.s);
});

// WCAG contrast of the theme tokens in styles.css.
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('theme tokens keep body text >= 7:1 and accent text >= 4.5:1', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
  const tok = (block, name) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
  for (const block of [light, dark]) {
    const bg = tok(block, '--bg'), surface = tok(block, '--surface');
    for (const b of [bg, surface]) {
      assert.ok(ratio(tok(block, '--text'), b) >= 7);
      assert.ok(ratio(tok(block, '--muted'), b) >= 7);
      assert.ok(ratio(tok(block, '--accent'), b) >= 4.5);
    }
    assert.ok(ratio(tok(block, '--on-accent'), tok(block, '--accent')) >= 4.5);
  }
  assert.equal(tok(dark, '--bg'), '#05070a');
});
