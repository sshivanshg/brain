// Pure helpers shared by the web app and its tests. No DOM access here.
const VIEWS = { '/': 'home', '/search': 'home', '/ask': 'ask', '/projects': 'projects', '/browsing': 'browsing', '/library': 'library', '/capture': 'capture', '/settings': 'settings', '/about': 'landing', '/login': 'home' };

export function parseRoute(hash) {
  const [p, q = ''] = String(hash || '').replace(/^#/, '').split('?');
  return { path: p || '/', params: new URLSearchParams(q) };
}

// Signed out: everything shows the manifesto except the explicit sign-in route.
export function resolveRoute(path, signedIn) {
  if (!signedIn) return path === '/login' ? 'login' : 'landing';
  if (path.startsWith('/m/')) return 'memory';
  if (path.startsWith('/project/')) return 'project';
  return VIEWS[path] || 'unknown';
}

export function introMode({ seen, reducedMotion }) {
  if (seen) return 'none';
  return reducedMotion ? 'fade' : 'full';
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
