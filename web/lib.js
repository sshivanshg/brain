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

// Landing gets the full-screen constellation that flies into the hero; app routes the short ignite.
export function introMode({ seen, reducedMotion, landing = false }) {
  if (seen) return 'none';
  if (reducedMotion) return 'fade';
  return landing ? 'hero' : 'full';
}

// One geometry for the hero canvas and the intro, so intro nodes land exactly on hero nodes.
export const heroNodeCount = (viewportWidth) => (viewportWidth < 700 ? 90 : 160);
export const BRAIN_SEED = 11;
export function heroGeometry(w, h) {
  const s = Math.min(w / 2.15, h / 1.8);
  return { s, cx: w / 2, cy: h / 2 - s * 0.05 };
}
export const brainPoint = (n, g, off = { left: 0, top: 0 }) => ({ x: off.left + g.cx + n.x * g.s, y: off.top + g.cy + n.y * g.s });

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

// Brain silhouette (side view, facing left) in unit space x,y ∈ [-1, 1]:
// cerebrum + temporal lobe + cerebellum + brainstem, as a union of simple shapes.
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
export function inBrain(x, y) {
  // lateral sulcus: a thin empty groove so the lobes read
  const t = Math.max(0, Math.min(1, (x + 0.42) / 0.8)), gx = -0.42 + t * 0.8, gy = 0.14 - t * 0.2;
  if (x > -0.42 && x < 0.38 && Math.hypot(x - gx, y - gy) < 0.035) return false;
  return inEllipse(x, y, 0, -0.15, 0.92, 0.55)
    || inEllipse(x, y, -0.18, 0.22, 0.6, 0.3)
    || inEllipse(x, y, 0.55, 0.36, 0.3, 0.2)
    || (x >= 0.18 && x <= 0.34 && y >= 0.3 && y <= 0.86);
}

// Deterministic rejection sampling inside the silhouette; capped so phones stay cheap.
export function brainNodes(count, seed = 1) {
  const n = Math.min(count, 160), out = [];
  for (let k = 0; out.length < n && k < n * 40; k++) {
    const x = rand(seed * 7919 + k * 2) * 2 - 1, y = rand(seed * 7919 + k * 2 + 1) * 2 - 1;
    if (inBrain(x, y)) out.push({ x, y, r: 0.6 + rand(k + seed + 0.71) * 1.4 });
  }
  return out;
}

// Synapses: each node links to its nearest neighbours within reach, at most perNode each.
export function brainLinks(nodes, { reach = 0.3, perNode = 3 } = {}) {
  const deg = new Array(nodes.length).fill(0), links = [];
  const pairs = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d <= reach) pairs.push([d, i, j]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of pairs) {
    if (deg[i] >= perNode || deg[j] >= perNode) continue;
    deg[i]++; deg[j]++; links.push([i, j]);
  }
  return links;
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
