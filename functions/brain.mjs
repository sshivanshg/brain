// Neon Function entry: Brain's HTTP API, MCP server and PWA, running next to the database.
// DATABASE_URL, NEON_AUTH_*, NEON_AI_GATEWAY_* and AWS_* are injected by Neon at runtime.
import { app } from '../server/index.js';
import assets from './web-assets.mjs';

const API = /^\/(api|mcp|oauth|\.well-known|connector|share)(\/|$)/;

function asset(pathname) {
  const hit = assets[pathname === '/' ? '/index.html' : pathname] || (!API.test(pathname) && !/\.\w+$/.test(pathname) ? assets['/index.html'] : null);
  if (!hit) return null;
  const html = hit.type.startsWith('text/html');
  return new Response(Buffer.from(hit.b64, 'base64'), {
    headers: { 'content-type': hit.type, 'cache-control': html || pathname === '/sw.js' ? 'no-cache' : 'public, max-age=3600' },
  });
}

export default {
  async fetch(req, ...rest) {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && !API.test(pathname)) {
      const res = asset(pathname);
      if (res) return res;
    }
    return app.fetch(req, ...rest);
  },
};
