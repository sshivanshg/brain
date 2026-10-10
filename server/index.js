import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { openDb, ROOT } from './db.js';
import { createStore } from './store.js';
import { mountMcp } from './mcp.js';
import { mountPush } from './push.js';
import * as cortex from './cortex.js';
import { dayOf, shiftDay, clip } from './util.js';

const PORT = Number(process.env.PORT || 4321);

function loadToken() {
  if (process.env.BRAIN_TOKEN) return process.env.BRAIN_TOKEN;
  if (process.env.NODE_ENV === 'production') throw new Error('Set BRAIN_TOKEN in production.');
  const file = path.join(ROOT, 'data', 'token.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const token = `brn_${crypto.randomBytes(24).toString('base64url')}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

const TOKEN = loadToken();
const db = await openDb();
const store = createStore(db);
const app = new Hono();

function sameToken(value) {
  const given = Buffer.from(value || '');
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
const authorized = (c) => sameToken((c.req.header('authorization') || '').replace(/^Bearer\s+/i, ''));

// Connector URL with the token in the path, for MCP clients that can't send headers
// (e.g. custom connectors in chat apps). Off unless BRAIN_CONNECTOR_URL=1.
if (process.env.BRAIN_CONNECTOR_URL === '1') {
  app.all('/connector/:token/mcp', async (c) => {
    if (!sameToken(c.req.param('token'))) return c.json({ error: 'unauthorized' }, 401);
    const headers = new Headers(c.req.raw.headers);
    headers.set('authorization', `Bearer ${TOKEN}`);
    return app.fetch(new Request(new URL('/mcp', c.req.url), { method: c.req.method, headers, body: c.req.method === 'GET' ? undefined : await c.req.raw.text() }));
  });
}

app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'X-Brain-Source'], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use('/mcp', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'X-Brain-Source'], exposeHeaders: ['Mcp-Session-Id'] }));
app.use('*', async (c, next) => {
  const p = c.req.path;
  const open = c.req.method === 'OPTIONS' || p === '/api/health' || !(p.startsWith('/api/') || p === '/mcp');
  if (!open && !authorized(c)) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

const sourceOf = (c, fallback) => c.req.header('x-brain-source') || fallback;

// Fire-and-forget enrichment when an LLM key is configured.
function enrich(fn) { if (cortex.cortexEnabled) fn().catch((e) => console.error('[enrich]', e.message)); }

app.get('/api/health', (c) => c.json({ ok: true, db: db.kind, cortex: cortex.cortexEnabled, today: dayOf(), owner: process.env.BRAIN_OWNER || null }));
app.get('/api/stats', async (c) => c.json(await store.stats()));
app.get('/api/projects', async (c) => c.json(await store.projects()));

app.get('/api/memories', async (c) => {
  const q = c.req.query();
  return c.json(await store.search({ q: q.q, kind: q.kind, project: q.project, source: q.source, day: q.day, since: q.since, status: q.status, limit: q.limit, offset: q.offset }));
});

app.post('/api/memories', async (c) => {
  const b = await c.req.json();
  const m = await store.remember({ ...b, body: b.body ?? b.content, source: b.source || sourceOf(c, 'web') });
  return c.json(m, 201);
});

app.get('/api/memories/:id', async (c) => {
  const m = await store.get(Number(c.req.param('id')));
  return m ? c.json(m) : c.json({ error: 'not found' }, 404);
});

app.patch('/api/memories/:id', async (c) => {
  const m = await store.update(Number(c.req.param('id')), await c.req.json());
  return m ? c.json(m) : c.json({ error: 'not found' }, 404);
});

app.delete('/api/memories/:id', async (c) => {
  const m = await store.forget(Number(c.req.param('id')));
  return m ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});

// Quick capture: phone, iOS Shortcut, share sheet, voice.
app.post('/api/capture', async (c) => {
  const b = await c.req.json();
  const text = [b.text, b.url && !String(b.text || '').includes(b.url) ? b.url : null].filter(Boolean).join('\n\n');
  if (!text.trim()) return c.json({ error: 'empty' }, 400);
  const m = await store.remember({ kind: b.kind || (b.url ? 'bookmark' : 'note'), title: b.title, body: text, url: b.url, project: b.project, tags: b.tags, source: b.source || sourceOf(c, 'phone') });
  return c.json(m, 201);
});

// Chrome extension: batched page visits.
app.post('/api/capture/browse', async (c) => {
  const b = await c.req.json();
  const visits = (Array.isArray(b) ? b : b.visits || [b]).filter((v) => v && /^https?:/.test(v.url || ''));
  const saved = [];
  for (const v of visits.slice(0, 100)) {
    const row = await store.recordVisit(v);
    saved.push(row.id);
    if (!row.meta?.summarized && (row.meta?.dwell || 0) >= 45 && row.body?.length > 400) {
      enrich(async () => {
        const s = await cortex.summarizePage({ title: row.title, url: v.url, text: row.body, highlights: row.meta.highlights });
        if (s) await store.update(row.id, { summary: s, meta: { summarized: true } });
      });
    }
  }
  return c.json({ saved: saved.length, ids: saved });
});

// Agent session transcripts (Claude Code SessionEnd / PreCompact hooks).
app.post('/api/sessions', async (c) => {
  const b = await c.req.json();
  if (!b.session_id || !b.transcript) return c.json({ error: 'session_id and transcript required' }, 400);
  const m = await store.remember({
    kind: 'session', ext_key: `session:${b.session_id}`, project: b.project, source: b.agent || sourceOf(c, 'claude-code'),
    title: b.title || clip(b.first_prompt || `Session in ${b.project}`, 120), body: b.transcript,
    summary: b.summary || null, meta: { session_id: b.session_id, cwd: b.cwd, files: b.files || [], prompts: b.prompt_count || 0, reason: b.reason },
  });
  enrich(async () => {
    const s = await cortex.summarizeSession({ project: b.project, transcript: b.transcript });
    if (s) await store.update(m.id, { summary: s });
  });
  return c.json({ id: m.id }, 201);
});

app.get('/api/brief', async (c) => {
  const text = await store.brief({ project: c.req.query('project') });
  return c.req.query('format') === 'json' ? c.json({ brief: text }) : c.text(text);
});

app.get('/api/digest', async (c) => {
  const day = c.req.query('day') || shiftDay(dayOf(), -1);
  const [digest] = await store.search({ kind: 'digest', day, limit: 1, status: 'any' });
  return c.json({ day, digest: digest ? await store.get(digest.id) : null });
});

app.post('/api/dream', async (c) => {
  if (!cortex.cortexEnabled) return c.json({ error: 'No ANTHROPIC_API_KEY on the server. Run the dream from Claude Code: /mcp__brain__dream' }, 400);
  return c.json(await dreamAll());
});

app.post('/api/ask', async (c) => {
  const { question } = await c.req.json();
  const sources = await store.search({ q: question, mode: 'or', limit: 14 });
  const text = await cortex.answer(question, sources);
  return c.json({ answer: text, sources, cortex: cortex.cortexEnabled });
});

app.get('/api/export', async (c) => {
  c.header('Content-Disposition', `attachment; filename="brain-export-${dayOf()}.json"`);
  return c.json(await store.exportAll());
});

// PWA share target -> capture screen.
app.get('/share', (c) => {
  const u = new URL(c.req.url);
  return c.redirect(`/#/capture?${u.searchParams.toString()}`);
});

mountMcp(app, store);
mountPush(app, store);

app.use('/*', serveStatic({ root: path.relative(process.cwd(), path.join(ROOT, 'web')) || '.' }));
app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(ROOT, 'web', 'index.html')) }));

async function dreamAll() {
  const done = [];
  for (const { day } of await store.daysNeedingDigest()) {
    const items = await store.pendingForDay(day);
    const body = await cortex.writeDigest(day, items);
    if (!body) break;
    const r = await store.saveDigest(day, body, { source: 'cortex' });
    done.push({ day, digest: r.digest.id, compacted: r.compacted });
  }
  return { done };
}

const onVercel = Boolean(process.env.VERCEL);
if (cortex.cortexEnabled && !onVercel) setInterval(() => dreamAll().catch((e) => console.error('[dream]', e.message)), 60 * 60 * 1000).unref();

export { app };

if (!onVercel) serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`brain listening on http://localhost:${PORT}  (db: ${db.kind}, cortex: ${cortex.cortexEnabled ? 'on' : 'off'})`);
  if (!process.env.BRAIN_TOKEN) console.log(`token: data/token.txt`);
});
