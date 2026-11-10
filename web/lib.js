// Pure helpers shared by the web app and its tests. No DOM access here.
const VIEWS = { '/': 'home', '/search': 'home', '/ask': 'ask', '/projects': 'projects', '/browsing': 'browsing', '/library': 'library', '/skills': 'skills', '/capture': 'capture', '/settings': 'settings', '/about': 'landing', '/login': 'home' };

export function parseRoute(hash) {
  const [p, q = ''] = String(hash || '').replace(/^#/, '').split('?');
  return { path: p || '/', params: new URLSearchParams(q) };
}

// Signed out: everything shows the manifesto except the explicit sign-in route.
export function resolveRoute(path, signedIn) {
  if (!signedIn) return path === '/login' ? 'login' : 'landing';
  if (path.startsWith('/m/')) return 'memory';
  if (path.startsWith('/project/')) return 'project';
  if (path.startsWith('/skills/')) return 'skill';
  return VIEWS[path] || 'unknown';
}

// The landing opens on the full-screen brain that flies into the hero on every load; app routes get
// the short ignite once per session. Reduced motion: a crossfade.
export function introMode({ seen, reducedMotion, landing = false }) {
  if (seen && !landing) return 'none';
  if (reducedMotion) return 'fade';
  return landing ? 'hero' : 'full';
}

export function searchPath(q, kind) {
  let p = '/api/memories?limit=40';
  if (q) p += `&q=${encodeURIComponent(q)}`;
  if (kind && kind !== 'all') p += `&kind=${encodeURIComponent(kind)}`;
  return p;
}

export const mcpUrl = (origin) => `${origin}/mcp`;

// Memory kinds map onto a small set of colour tokens (--k-*) and specimen glyphs.
const KIND_VAR = { session: 'session', decision: 'decision', lesson: 'lesson', preference: 'preference', profile: 'preference', browse: 'browse', digest: 'digest', todo: 'todo', skill: 'skill', agent: 'agent', prompt: 'prompt', 'prompt-log': 'prompt', playbook: 'skill', highlight: 'highlight', bookmark: 'browse', voice: 'note', fact: 'note' };
const GLYPH = { session: '◇', decision: '◆', lesson: '▲', preference: '●', browse: '○', digest: '≡', todo: '□', skill: '✦', agent: '⌘', prompt: '›', highlight: '✳', note: '—' };
export const kindVar = (k) => KIND_VAR[k] || 'note';
export const kindGlyph = (k) => GLYPH[kindVar(k)];

// Phones get fewer nodes and a capped pixel ratio; reduced motion draws one still frame.
export function fieldBudget({ width, dpr = 1, reducedMotion = false }) {
  const phone = width < 700;
  return { dpr: Math.min(dpr || 1, phone ? 1.5 : 2), nodes: phone ? 48 : 110, animate: !reducedMotion };
}

// Stable 0..1 pseudo-random from a number, so layouts don't jump between renders.
const rand = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Projects sit on an ellipse around the centre; each project's memories scatter close to it.
export function clusterLayout(memories, { width, height, max = 120 }) {
  const rows = memories.slice(0, max);
  const projects = [...new Set(rows.map((m) => m.project || ''))];
  const cx = width / 2, cy = height / 2;
  const R = projects.length > 1 ? Math.min(width, height) * 0.32 : 0;
  const spread = Math.min(width, height) * (projects.length > 1 ? 0.6 / Math.sqrt(projects.length + 2) : 0.35);
  const centres = new Map(projects.map((p, i) => {
    const a = (i / projects.length) * Math.PI * 2 - Math.PI / 2;
    return [p, [cx + Math.cos(a) * R * (width / Math.max(width, height)) * 1.2, cy + Math.sin(a) * R]];
  }));
  const clamp = (v, hi) => Math.max(8, Math.min(hi - 8, v));
  return rows.map((m, i) => {
    const [px, py] = centres.get(m.project || '');
    const a = rand(m.id || i) * Math.PI * 2, r = Math.sqrt(rand((m.id || i) + 0.5)) * spread;
    return { id: m.id, title: m.title, kind: m.kind, project: m.project || '', x: clamp(px + Math.cos(a) * r, width), y: clamp(py + Math.sin(a) * r, height) };
  });
}

export function specimenMeta(m, when) {
  return [m.kind, m.project, when, `#${m.id}`].filter(Boolean);
}

// 3D brain volume in unit space, facing left: x front(-)/back(+), y up(-)/down(+), z left(-)/right(+).
// Two hemispheres split by the longitudinal fissure, temporal lobes, cerebellum and stem.
// brainDepth is the normalised radius of the nearest shape: 1 on the cortex, 0 at a lobe's core.
const LOBES = [
  [0, -0.16, 0.34, 0.92, 0.54, 0.36], [0, -0.16, -0.34, 0.92, 0.54, 0.36], // hemispheres
  [-0.52, -0.06, 0.3, 0.42, 0.42, 0.3], [-0.52, -0.06, -0.3, 0.42, 0.42, 0.3], // frontal lobes
  [0.55, -0.02, 0.3, 0.4, 0.4, 0.3], [0.55, -0.02, -0.3, 0.4, 0.4, 0.3], // occipital lobes
  [-0.12, 0.2, 0.4, 0.5, 0.25, 0.27], [-0.12, 0.2, -0.4, 0.5, 0.25, 0.27], // temporal lobes
  [0.58, 0.4, 0.18, 0.3, 0.19, 0.24], [0.58, 0.4, -0.18, 0.3, 0.19, 0.24], // cerebellum
  [0.28, 0.55, 0, 0.1, 0.36, 0.11], // stem
];
const FISSURE = 0.035;
export function brainDepth(x, y, z) {
  let best = Infinity;
  for (const [cx, cy, cz, rx, ry, rz] of LOBES) best = Math.min(best, ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2);
  return Math.sqrt(best);
}
export function inBrain3(x, y, z) {
  if (Math.abs(z) < FISSURE && y < 0.15) return false;
  // lateral sulcus: a groove on the outer face so the temporal lobe reads
  const t = Math.max(0, Math.min(1, (x + 0.42) / 0.8)), gx = -0.42 + t * 0.8, gy = 0.1 - t * 0.2;
  if (Math.abs(z) > 0.3 && x > -0.42 && x < 0.38 && Math.hypot(x - gx, y - gy) < 0.04) return false;
  return brainDepth(x, y, z) <= 1;
}

// Deterministic rejection sampling, biased to the cortex so the silhouette reads; capped for phones.
export const CLOUD_SEED = 11;
const CLOUD_CAP = 600, CORTEX = 0.82, CORE_KEEP = 0.16;
export function brainCloud(count, seed = CLOUD_SEED) {
  const n = Math.min(count, CLOUD_CAP), pos = new Float32Array(n * 3), size = new Float32Array(n);
  let m = 0;
  for (let k = 0; m < n && k < n * 400; k++) {
    const b = seed * 7919 + k * 4;
    const x = rand(b) * 2 - 1, y = rand(b + 1) * 1.7 - 0.76, z = rand(b + 2) * 1.5 - 0.75;
    if (!inBrain3(x, y, z)) continue;
    if (brainDepth(x, y, z) < CORTEX && rand(b + 3) > CORE_KEEP) continue;
    pos[m * 3] = x; pos[m * 3 + 1] = y; pos[m * 3 + 2] = z;
    size[m++] = 0.6 + rand(b + 0.5) * 1.4;
  }
  return { pos, size };
}

// Cortex dust: fine points on the surface only, kept where a folding pattern runs, so gyri and
// sulci read in the silhouette. Not part of the network; drawn as 1px specks.
const DUST_CAP = 2400, DUST_SHELL = 0.88, FOLD = 0.42;
const fold = (x, y, z) => Math.sin(10 * x + 2.4 * Math.sin(8 * y + 1.3) + 1.6 * Math.sin(7 * z)) + Math.sin(10 * y + 2.2 * Math.sin(7 * z + 0.4) + 1.8 * Math.sin(9 * x));
export function brainDust(count, seed = CLOUD_SEED) {
  const n = Math.min(count, DUST_CAP), out = new Float32Array(n * 3);
  let m = 0;
  const area = LOBES.map(([, , , rx, ry, rz]) => rx * ry + ry * rz + rx * rz), total = area.reduce((a, b) => a + b);
  for (let k = 0; m < n && k < n * 60; k++) {
    const b = seed * 104729 + k * 4;
    let pick = rand(b) * total, l = 0;
    while (pick > area[l] && l < LOBES.length - 1) pick -= area[l++];
    const [cx, cy, cz, rx, ry, rz] = LOBES[l], u = rand(b + 1) * 2 - 1, a = rand(b + 2) * Math.PI * 2, q = Math.sqrt(1 - u * u), r = 0.9 + rand(b + 3) * 0.1;
    const x = cx + rx * r * q * Math.cos(a), y = cy + ry * r * u, z = cz + rz * r * q * Math.sin(a);
    if (!inBrain3(x, y, z) || brainDepth(x, y, z) < DUST_SHELL || Math.abs(fold(x, y, z)) > FOLD) continue;
    out[m * 3] = x; out[m * 3 + 1] = y; out[m * 3 + 2] = z; m++;
  }
  return out;
}

// Synapses: nearest neighbours within reach, found once through a uniform grid; flat [i, j, …] pairs.
export function cloudLinks(pos, { reach = 0.2, perNode = 4 } = {}) {
  const n = pos.length / 3, cell = new Map(), key = (a, b, c) => `${a},${b},${c}`;
  const at = (i) => [Math.floor(pos[i * 3] / reach), Math.floor(pos[i * 3 + 1] / reach), Math.floor(pos[i * 3 + 2] / reach)];
  for (let i = 0; i < n; i++) { const k = key(...at(i)); (cell.get(k) || cell.set(k, []).get(k)).push(i); }
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c] = at(i);
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
      for (const j of cell.get(key(a + da, b + db, c + dc)) || []) {
        if (j <= i) continue;
        const d = Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]);
        if (d <= reach) pairs.push([d, i, j]);
      }
    }
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const deg = new Uint8Array(n), out = [];
  for (const [, i, j] of pairs) {
    if (deg[i] >= perNode || deg[j] >= perNode) continue;
    deg[i]++; deg[j]++; out.push(i, j);
  }
  return Uint16Array.from(out);
}

// Compressed adjacency: edges of node i are link indices adj[start[i] .. start[i + 1]).
export function cloudAdjacency(n, links) {
  const start = new Uint32Array(n + 1), adj = new Uint32Array(links.length), fill = new Uint32Array(n);
  for (const v of links) start[v + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  for (let k = 0; k < links.length; k++) { const v = links[k]; adj[start[v] + fill[v]++] = k >> 1; }
  return { start, adj };
}

// Breadth-first hop count from the spark: the order an activation wave reaches each node (-1: never).
export function hopDistances(n, links, seed) {
  const { start, adj } = cloudAdjacency(n, links), hop = new Int16Array(n).fill(-1), queue = new Uint16Array(n);
  hop[seed] = 0; queue[0] = seed;
  for (let head = 0, tail = 1; head < tail; head++) {
    const i = queue[head];
    for (let e = start[i]; e < start[i + 1]; e++) {
      const k = adj[e], j = links[k * 2] === i ? links[k * 2 + 1] : links[k * 2];
      if (hop[j] < 0) { hop[j] = hop[i] + 1; queue[tail++] = j; }
    }
  }
  return hop;
}

// Perspective projection after yaw (about y) then pitch (about x). out holds [sx, sy, scale, depth] per node.
export const CAMERA = 3.6;
export function projectCloud(pos, out, { cx, cy, s }, yaw, pitch) {
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let i = 0, o = 0; i < pos.length; i += 3, o += 4) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const p = CAMERA / (CAMERA + z2);
    out[o] = cx + x1 * s * p; out[o + 1] = cy + y2 * s * p; out[o + 2] = p; out[o + 3] = z2;
  }
  return out;
}

// One budget, view and resting pose for intro and hero, so the intro lands exactly on the hero.
export function cloudBudget(width, dpr = 1) {
  const phone = width < 700;
  return { nodes: phone ? 150 : 520, dpr: Math.min(dpr || 1, phone ? 1.5 : 2) };
}
export function cloudView(w, h, off = { left: 0, top: 0 }) {
  const s = Math.min(w / 2.6, h / 1.95);
  return { s, cx: off.left + w / 2, cy: off.top + h / 2 - s * 0.08 };
}
export const HERO_YAW = -0.4, HERO_SWAY = 0.24, HERO_PITCH = 0.13, HERO_PERIOD = 22;
export const heroYaw = (t) => HERO_YAW - HERO_SWAY * Math.cos((2 * Math.PI * t) / HERO_PERIOD);

// Landing intro timeline (ms): spark, network grows, name resolves, then a long flight into the hero.
export const INTRO = { spark: 500, grow: 1400, name: 2000, total: 3200 };
const span = (ms, a, b) => Math.max(0, Math.min(1, (ms - a) / (b - a)));
export function introPhase(ms) {
  return { spark: span(ms, 0, INTRO.spark), grow: span(ms, INTRO.spark, INTRO.grow), name: span(ms, INTRO.grow, INTRO.name), land: span(ms, INTRO.name, INTRO.total), done: ms >= INTRO.total };
}
// Debug only: ?introSpeed=0.25 slows the intro 4x for frame capture. Absent or invalid: null.
export function introSpeed(search) {
  const v = new URLSearchParams(search || '').get('introSpeed');
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.max(0.05, Math.min(4, n)) : null;
}

// Landing search demo: plain substring match over title and body.
export function demoSearch(rows, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => `${r.title} ${r.body}`.toLowerCase().includes(s));
}

// Skills: API paths, a display title for uploads (frontmatter name, heading, file name), CLI hint.
const withProject = (p, project) => (project ? `${p}?project=${encodeURIComponent(project)}` : p);
export const skillsPath = (project) => withProject('/api/skills', project);
export const skillPath = (name, project) => withProject(`/api/skills/${encodeURIComponent(name)}`, project);
export function skillTitle(md, fileName = '') {
  const s = String(md || '');
  const fm = s.match(/^---\n([\s\S]*?)\n---/);
  const name = fm && fm[1].match(/^name:\s*["']?(.+?)["']?\s*$/m);
  if (name) return name[1];
  const h = s.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  return String(fileName || '').replace(/\.(md|markdown)$/i, '');
}
export const pullCommand = (project) => `brain skills pull -p ${project || '<project>'}`;

// Landing field: signed-out visitors see a living field of realistic sample memories.
export const SAMPLE_PROJECTS = ['atlas-web', 'atlas-api', 'pocket-ml', 'field-notes', 'infra'];
const SAMPLES = {
  'atlas-web': [
    ['decision', 'Server components for the dashboard, client islands for charts'], ['lesson', 'Hydration mismatch came from Date.now() in a render'],
    ['session', 'Rebuilt the onboarding flow with optimistic saves'], ['browse', 'Interaction to Next Paint, field data explained'],
    ['skill', 'Playbook: ship a UI change with before/after screenshots'], ['preference', 'Tailwind off; plain CSS tokens per theme'],
    ['todo', 'Skeletons for the billing page instead of a spinner'], ['lesson', 'Focus rings vanished when outline was reset globally'],
    ['decision', 'One date formatter shared by web and email templates'],
  ],
  'atlas-api': [
    ['decision', 'Idempotency keys on every POST that charges a card'], ['lesson', 'N+1 on /orders: always eager-load line items'],
    ['session', 'Moved webhooks onto a queue with retries and a dead-letter table'], ['browse', 'Postgres advisory locks for job scheduling'],
    ['skill', 'Playbook: add an endpoint with a contract test first'], ['decision', 'Cursor pagination, never offset, for public lists'],
    ['lesson', 'Timeouts on every outbound fetch, or one slow vendor stalls the pool'], ['todo', 'Rotate the staging signing key before launch'],
    ['preference', 'Errors return a code, a sentence and a next step'],
  ],
  'pocket-ml': [
    ['decision', 'Evaluate on a frozen test set; never tune on it'], ['lesson', 'Label leakage via the timestamp column inflated recall'],
    ['session', 'Distilled the ranker to a 40MB model for on-device'], ['browse', 'Calibration curves and why accuracy lies'],
    ['skill', 'Playbook: log every eval run with data hash and commit'], ['decision', 'Embeddings cached by content hash, not row id'],
    ['lesson', 'Batch size 512 OOMs on the T4; 256 with grad accumulation'], ['todo', 'Re-run the ablation without the synthetic data'],
  ],
  'field-notes': [
    ['decision', 'Weekly review on Fridays: inbox to zero, then plan'], ['lesson', 'Long meetings without a written decision get re-litigated'],
    ['session', 'Drafted the essay on memory for agents'], ['browse', 'How Zettelkasten notes link without folders'],
    ['skill', 'Playbook: turn a messy call into three decisions and owners'], ['preference', 'Short answers first, details on request'],
    ['browse', 'The case for writing decisions down with the why'], ['todo', 'Collect the reading list on retrieval and recall'],
  ],
  infra: [
    ['decision', 'Neon branch per preview deploy; prod only via main'], ['lesson', 'A missing index on sessions(user_id) caused the 2am spike'],
    ['session', 'Moved cron jobs to the platform scheduler'], ['browse', 'Zero-downtime Postgres migrations, expand then contract'],
    ['skill', 'Playbook: roll back a bad deploy in under five minutes'], ['decision', 'Secrets only in the platform vault, never in .env files in git'],
    ['lesson', 'Health checks must not touch the database'], ['todo', 'Alert on queue depth, not just error rate'],
  ],
};
export const SAMPLE_MEMORIES = SAMPLE_PROJECTS.flatMap((project) => SAMPLES[project].map(([kind, title]) => ({ kind, project, title })));

// Nodes live in parallax layers: on screen, y = layerY - scrollY * depth (depth < 1 is farther and slower).
// Each project anchors two clusters down the page, alternating sides, so every scroll position has company.
const FIELD_LAYERS = [0.42, 0.62, 0.84];
export function landingField(count, { width, height, pageHeight }) {
  const n = count, x = new Float32Array(n), y = new Float32Array(n), depth = new Float32Array(n), mem = new Uint8Array(n), layer = new Uint8Array(n);
  const travel = Math.max(0, pageHeight - height), P = SAMPLE_PROJECTS.length, anchors = P * 2;
  const gauss = (k) => (rand(k) + rand(k + 0.37) + rand(k + 0.71) - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    const a = i % anchors, p = a % P, list = SAMPLES[SAMPLE_PROJECTS[p]];
    const pick = Math.floor(rand(i * 3.1 + 5) * list.length);
    mem[i] = SAMPLE_MEMORIES.findIndex((m) => m.project === SAMPLE_PROJECTS[p] && m.title === list[pick][1]);
    layer[i] = Math.floor(rand(i * 5.3 + 1) * FIELD_LAYERS.length);
    depth[i] = FIELD_LAYERS[layer[i]];
    const f = (a + 0.5) / anchors, side = a % 2 ? 0.8 : 0.2;
    x[i] = Math.max(6, Math.min(width - 6, width * (side + gauss(i * 7 + 2) * 0.28)));
    y[i] = f * travel * depth[i] + height * (0.5 + gauss(i * 11 + 3) * 0.75);
  }
  return { n, x, y, depth, mem, layer };
}

// Behind text the field drops to a whisper. rects: flat [left, top, right, bottom] in page coordinates.
const CALM = 0.18, CALM_PAD = 16;
export function calmAt(x, screenY, rects, scrollY) {
  const y = screenY + scrollY;
  for (let k = 0; k < rects.length; k += 4) {
    if (x > rects[k] - CALM_PAD && x < rects[k + 2] + CALM_PAD && y > rects[k + 1] - CALM_PAD && y < rects[k + 3] + CALM_PAD) return CALM;
  }
  return 1;
}
