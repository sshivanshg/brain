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

test('landing plays the brain intro on every load; app routes keep the short one once per session', () => {
  assert.equal(introMode({ seen: false, reducedMotion: false, landing: true }), 'hero');
  assert.equal(introMode({ seen: false, reducedMotion: true, landing: true }), 'fade');
  assert.equal(introMode({ seen: true, reducedMotion: false, landing: true }), 'hero');
  assert.equal(introMode({ seen: true, reducedMotion: true, landing: true }), 'fade');
  assert.equal(introMode({ seen: true, reducedMotion: false, landing: false }), 'none');
  assert.equal(introMode({ seen: false, reducedMotion: false, landing: false }), 'full');
});

test('3D brain volume has two hemispheres split by a fissure, a cerebellum, and empty corners', async () => {
  const { inBrain3 } = await import('../web/lib.js');
  assert.equal(inBrain3(0, -0.15, 0.33), true); // right hemisphere
  assert.equal(inBrain3(0, -0.15, -0.33), true); // left hemisphere
  assert.equal(inBrain3(0, -0.5, 0), false); // longitudinal fissure along the top
  assert.equal(inBrain3(0.58, 0.4, 0.15), true); // cerebellum
  assert.equal(inBrain3(0.26, 0.7, 0), true); // stem
  assert.equal(inBrain3(-0.98, 0.95, 0.9), false);
  assert.equal(inBrain3(0, 0, 0.95), false);
});

test('brain cloud is deterministic, capped, inside the volume and dense at the cortex', async () => {
  const { brainCloud, inBrain3, brainDepth } = await import('../web/lib.js');
  const a = brainCloud(400, 11);
  assert.deepEqual(a.pos, brainCloud(400, 11).pos);
  assert.equal(a.pos.length, 400 * 3);
  assert.equal(a.size.length, 400);
  let left = 0, shell = 0;
  for (let i = 0; i < 400; i++) {
    const [x, y, z] = a.pos.subarray(i * 3, i * 3 + 3);
    assert.ok(inBrain3(x, y, z));
    if (z < 0) left++;
    if (brainDepth(x, y, z) > 0.8) shell++;
  }
  assert.ok(left > 140 && left < 260, `both hemispheres populated (${left} left)`);
  assert.ok(shell > 260, `cortex-biased (${shell} near the surface)`);
  assert.equal(brainCloud(5000, 1).size.length, 600);
});

test('cortex dust lies on the brain surface, traces folds, and is deterministic', async () => {
  const { brainDust, brainDepth, inBrain3 } = await import('../web/lib.js');
  const d = brainDust(800, 11);
  assert.equal(d.length, 800 * 3);
  assert.deepEqual(d, brainDust(800, 11));
  for (let i = 0; i < d.length; i += 3) {
    assert.ok(inBrain3(d[i], d[i + 1], d[i + 2]));
    assert.ok(brainDepth(d[i], d[i + 1], d[i + 2]) > 0.86);
  }
  assert.equal(brainDust(99999, 1).length, 2400 * 3);
});

test('cloud links come from a spatial grid: near neighbours only, each pair once, degree capped', async () => {
  const { brainCloud, cloudLinks } = await import('../web/lib.js');
  const { pos } = brainCloud(300, 11);
  const links = cloudLinks(pos, { reach: 0.22, perNode: 4 });
  assert.ok(links.length / 2 > 300, `enough synapses (${links.length / 2})`);
  const seen = new Set(), deg = new Uint8Array(300);
  for (let k = 0; k < links.length; k += 2) {
    const i = links[k], j = links[k + 1];
    assert.ok(i < j && !seen.has(i * 1000 + j)); seen.add(i * 1000 + j);
    const d = Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]);
    assert.ok(d <= 0.22);
    deg[i]++; deg[j]++;
  }
  assert.ok(deg.every((d) => d <= 4));
});

test('activation spreads by hops from the spark; unreachable nodes stay dark', async () => {
  const { hopDistances } = await import('../web/lib.js');
  const links = Uint16Array.from([0, 1, 1, 2, 0, 3]); // 0-1-2, 0-3, node 4 isolated
  assert.deepEqual([...hopDistances(5, links, 0)], [0, 1, 2, 1, -1]);
  assert.deepEqual([...hopDistances(5, links, 2)], [2, 1, 0, 3, -1]);
});

test('projection is perspective: origin lands on the view centre, nearer points grow', async () => {
  const { projectCloud } = await import('../web/lib.js');
  const out = new Float32Array(3 * 4);
  projectCloud(Float32Array.from([0, 0, 0, 0, 0, -0.5, 0, 0, 0.5]), out, { cx: 200, cy: 100, s: 50 }, 0, 0);
  assert.deepEqual([out[0], out[1], out[2]], [200, 100, 1]);
  assert.ok(out[6] > 1 && out[10] < 1);
  projectCloud(Float32Array.from([1, 0, 0]), out, { cx: 0, cy: 0, s: 10 }, Math.PI / 2, 0);
  assert.ok(Math.abs(out[0]) < 1e-6, 'a quarter turn of yaw points +x at the camera axis');
});

test('intro and hero share node budget, view geometry and resting orientation', async () => {
  const { cloudBudget, cloudView, heroYaw, HERO_YAW, HERO_SWAY } = await import('../web/lib.js');
  assert.deepEqual(cloudBudget(390, 3), { nodes: 150, dpr: 1.5 });
  assert.deepEqual(cloudBudget(1440, 3), { nodes: 520, dpr: 2 });
  const v = cloudView(600, 520, { left: 100, top: 40 });
  assert.equal(v.cx, 400);
  assert.ok(v.s > 0 && v.s * 2.6 <= 600 + 1e-9 && v.s * 1.95 <= 520 + 1e-9, 'the brain fits inside the rect');
  assert.equal(heroYaw(0), HERO_YAW - HERO_SWAY);
  assert.ok(Math.abs(heroYaw(0.01) - heroYaw(0)) < 1e-4, 'hero starts at rest so the hand-off has no jolt');
});

test('intro timeline: spark, grow, name, a long readable flight, done at 3.2s', async () => {
  const { introPhase, INTRO } = await import('../web/lib.js');
  assert.equal(INTRO.total, 3200);
  assert.deepEqual(introPhase(0), { spark: 0, grow: 0, name: 0, land: 0, done: false });
  assert.equal(introPhase(500).spark, 1);
  assert.equal(introPhase(950).grow, 0.5);
  assert.equal(introPhase(1700).name, 0.5);
  assert.equal(introPhase(2600).land, 0.5, 'the big brain flies into the hero from 2.0s to 3.2s');
  assert.equal(introPhase(3200).done, true);
});

test('intro speed is a debug flag: only a valid query param changes it', async () => {
  const { introSpeed } = await import('../web/lib.js');
  assert.equal(introSpeed(''), null);
  assert.equal(introSpeed('?introSpeed=0.25'), 0.25);
  assert.equal(introSpeed('?introSpeed=abc'), null);
  assert.equal(introSpeed('?introSpeed=0'), 0.05);
  assert.equal(introSpeed('?introSpeed=99'), 4);
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

test('landing sample memories span the demo kinds and projects', async () => {
  const { SAMPLE_MEMORIES, SAMPLE_PROJECTS, kindVar } = await import('../web/lib.js');
  assert.deepEqual(SAMPLE_PROJECTS, ['atlas-web', 'atlas-api', 'pocket-ml', 'field-notes', 'infra']);
  assert.ok(SAMPLE_MEMORIES.length >= 40);
  for (const k of ['decision', 'lesson', 'session', 'browse', 'skill']) assert.ok(SAMPLE_MEMORIES.some((m) => m.kind === k), k);
  assert.ok(SAMPLE_MEMORIES.every((m) => SAMPLE_PROJECTS.includes(m.project) && m.title && kindVar(m.kind) !== 'note'));
});

test('landing field covers the whole scroll, in parallax layers, clustered by project', async () => {
  const { landingField, SAMPLE_MEMORIES } = await import('../web/lib.js');
  const opts = { width: 1440, height: 900, pageHeight: 4200 };
  const f = landingField(110, opts);
  assert.deepEqual(f.x, landingField(110, opts).x);
  assert.equal(f.n, 110);
  let top = 0, bottom = 0;
  for (let i = 0; i < f.n; i++) {
    assert.ok(f.x[i] >= 0 && f.x[i] <= 1440);
    assert.ok(f.depth[i] > 0 && f.depth[i] < 1);
    assert.ok(f.mem[i] < SAMPLE_MEMORIES.length);
    const maxScroll = 4200 - 900, sy = (s) => f.y[i] - s * f.depth[i]; // screen y at scroll s
    if (sy(0) >= 0 && sy(0) <= 900) top++;
    if (sy(maxScroll) >= 0 && sy(maxScroll) <= 900) bottom++;
  }
  assert.ok(top >= 12 && bottom >= 12, `visible at the top (${top}) and the bottom (${bottom}) of the page`);
  const centre = (p) => { let x = 0, c = 0; for (let i = 0; i < f.n; i++) if (SAMPLE_MEMORIES[f.mem[i]].project === p) { x += f.y[i]; c++; } return x / c; };
  assert.notEqual(Math.round(centre('atlas-web')), Math.round(centre('infra')));
});

test('the field calms behind text: nodes inside a padded text block are dimmed', async () => {
  const { calmAt } = await import('../web/lib.js');
  const rects = Float32Array.from([100, 100, 400, 200]); // left, top, right, bottom
  assert.equal(calmAt(250, 150, rects, 0), 0.18);
  assert.equal(calmAt(800, 150, rects, 0), 1);
  assert.ok(calmAt(250, 150, rects, -300) === 1, 'rects scroll with the page');
});
