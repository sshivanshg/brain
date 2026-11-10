#!/usr/bin/env node
// End-to-end check of every Neon service through the deployed Brain function.
//   node --env-file=.env.local scripts/verify-neon.mjs <function-url>
// Writes one temporary memory and archives it at the end.
import { subscribeToday, closeRealtime } from '../server/neon.js';

const base = (process.argv[2] || '').replace(/\/$/, '');
const T = process.env.BRAIN_TOKEN;
if (!base || !T) { console.error('usage: node --env-file=.env.local scripts/verify-neon.mjs <function-url>'); process.exit(2); }
const H = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const call = async (p, opts = {}) => {
  const r = await fetch(`${base}${p}`, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: AbortSignal.timeout(60000) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };

// Realtime: subscribe to today's feed before writing, so the write must arrive as a change.
let changes = 0;
const sub = await subscribeToday();
sub.onChange(() => { changes++; });
await new Promise((r) => setTimeout(r, 2000));

// Postgres (+ the function itself)
const health = await call('/api/health');
check('function + postgres: health', health.status === 200 && health.body?.db === 'postgres', JSON.stringify(health.body));
const created = await call('/api/memories', { method: 'POST', body: JSON.stringify({ kind: 'note', title: 'neon verify', content: `verify run ${new Date().toISOString()}`, source: 'verify' }) });
check('postgres: write', created.status === 201, `id ${created.body?.id}`);
const read = await call(`/api/memories/${created.body?.id}`);
check('postgres: read back', read.body?.title === 'neon verify');

// Realtime
await new Promise((r) => setTimeout(r, 4000));
check('realtime: live change received', changes > 0, `${changes} change event(s)`);
const sealed = await call('/api/live/today', { method: 'POST' });
check('realtime: browser seal endpoint', sealed.status === 200 && sealed.body && typeof sealed.body === 'object', Object.keys(sealed.body || {}).join(','));

// Object storage
const backup = await call('/api/backup', { method: 'POST' });
check('object storage: backup written', backup.status === 200 && backup.body?.memories > 0, `${backup.body?.key} (${backup.body?.memories} memories)`);
const list = await call('/api/backups');
check('object storage: backup listed', (list.body || []).some((b) => b.key === backup.body?.key));

// Neon Auth: JWKS published; a forged token is rejected.
const jwks = await fetch(process.env.NEON_AUTH_JWKS_URL).then((r) => r.json()).catch(() => null);
check('auth: JWKS reachable', Array.isArray(jwks?.keys) && jwks.keys.length > 0, `${jwks?.keys?.length} key(s)`);
const forged = 'eyJhbGciOiJFZERTQSJ9.eyJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIn0.c2ln';
const denied = await fetch(`${base}/api/stats`, { headers: { Authorization: `Bearer ${forged}` } });
check('auth: forged JWT rejected', denied.status === 401, `HTTP ${denied.status}`);

// MCP
const mcp = await call('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
check('mcp: tools/list', (mcp.body?.result?.tools || []).length >= 10, `${mcp.body?.result?.tools?.length} tools`);

await call(`/api/memories/${created.body?.id}`, { method: 'DELETE' });
await closeRealtime();
console.log(failed ? `\n${failed} check(s) failed` : '\nall Neon services verified');
process.exit(failed ? 1 : 0);
