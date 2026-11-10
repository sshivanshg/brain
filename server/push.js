// Morning brief as a web push notification. No LLM: built from yesterday's digest, activity and open threads.
import webpush from 'web-push';
import { dayOf, shiftDay, clip } from './util.js';
import { DEMO } from './demo.js';

const PUB = process.env.VAPID_PUBLIC;
const PRIV = process.env.VAPID_PRIVATE;
export const pushEnabled = !DEMO && Boolean(PUB && PRIV);
if (pushEnabled) webpush.setVapidDetails('mailto:brain@localhost', PUB, PRIV);

export async function morningText(store) {
  const y = shiftDay(dayOf(), -1);
  const rows = await store.search({ day: y, limit: 200, status: 'any' });
  const sessions = rows.filter((r) => r.kind === 'session');
  const pages = rows.filter((r) => r.kind === 'browse');
  const projects = [...new Set(sessions.map((r) => r.project).filter(Boolean))];
  const todos = await store.search({ kind: 'todo', status: 'active', limit: 5 });
  const [digest] = await store.search({ kind: 'digest', day: y, limit: 1, status: 'any' });
  const parts = [];
  if (sessions.length) parts.push(`${sessions.length} agent session${sessions.length > 1 ? 's' : ''}${projects.length ? ` (${projects.slice(0, 3).join(', ')})` : ''}`);
  if (pages.length) parts.push(`${pages.length} pages read`);
  const lead = parts.length ? `Yesterday: ${parts.join(' · ')}.` : 'Quiet day yesterday.';
  const next = todos[0] ? ` First up: ${clip(todos[0].title, 80)}` : '';
  return { title: 'Good morning — your brain', body: clip(digest?.summary ? `${lead} ${digest.summary}` : `${lead}${next}`, 230), url: '/' };
}

export async function sendAll(store, payload) {
  if (!pushEnabled) return { sent: 0, error: 'VAPID keys not set' };
  const subs = await store.query('SELECT endpoint, sub FROM push_subs');
  let sent = 0;
  for (const { endpoint, sub } of subs) {
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); sent++; } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await store.query('DELETE FROM push_subs WHERE endpoint = $1', [endpoint]);
    }
  }
  return { sent };
}

export function mountPush(app, store) {
  app.get('/api/push/key', (c) => c.json({ key: PUB || null }));
  app.post('/api/push/subscribe', async (c) => {
    const sub = await c.req.json();
    if (!sub?.endpoint) return c.json({ error: 'bad subscription' }, 400);
    await store.query('INSERT INTO push_subs (endpoint, sub) VALUES ($1, $2::jsonb) ON CONFLICT (endpoint) DO UPDATE SET sub = EXCLUDED.sub', [sub.endpoint, JSON.stringify(sub)]);
    return c.json({ ok: true });
  });
  app.post('/api/push/test', async (c) => c.json(await sendAll(store, await morningText(store))));
  // Vercel Cron calls this with Authorization: Bearer $CRON_SECRET (set equal to BRAIN_TOKEN).
  app.get('/api/cron/morning', async (c) => c.json(await sendAll(store, await morningText(store))));
}
