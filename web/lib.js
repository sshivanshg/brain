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
