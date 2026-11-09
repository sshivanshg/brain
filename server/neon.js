// Neon platform services, each optional: Brain runs without any of them (self-host, PGlite).
//   Object storage → daily JSON backups      (AWS_* vars injected by Neon)
//   Neon Auth      → accept Managed Auth JWTs for the owner (NEON_AUTH_* vars)
//   Realtime       → sealed live query for today's feed (NEON_REALTIME_* vars)
import { dayOf } from './util.js';

const BUCKET = process.env.BRAIN_BUCKET || 'assets';

// ---------- object storage ----------
export const storageEnabled = Boolean(process.env.AWS_ENDPOINT_URL_S3);
let s3;
async function client() {
  if (s3) return s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3 = new S3Client({ forcePathStyle: true }); // Neon requires path-style; creds/endpoint/region come from AWS_* env
  return s3;
}

export async function backup(store) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const rows = await store.exportAll();
  const key = `backups/brain-${dayOf()}.json`;
  await (await client()).send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: JSON.stringify(rows), ContentType: 'application/json' }));
  return { key, memories: rows.length };
}

export async function listBackups() {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const out = await (await client()).send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' }));
  return (out.Contents || []).map((o) => ({ key: o.Key, size: o.Size, at: o.LastModified })).sort((a, b) => (a.key < b.key ? 1 : -1));
}

// ---------- Neon Auth ----------
export const neonAuthEnabled = Boolean(process.env.NEON_AUTH_JWKS_URL && process.env.NEON_AUTH_BASE_URL);
const OWNERS = (process.env.BRAIN_OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
let jwks;

// True only for a valid Managed Auth JWT whose email is on the owner allowlist (single-user mode).
export async function isOwnerJwt(token) {
  if (!neonAuthEnabled || !OWNERS.length || !token || token.split('.').length !== 3) return false;
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    jwks ||= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
    const { payload } = await jwtVerify(token, jwks, { issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin });
    return OWNERS.includes(String(payload.email || '').toLowerCase());
  } catch {
    return false;
  }
}

// ---------- Realtime ----------
export const realtimeEnabled = Boolean((process.env.NEON_REALTIME_SECRET || process.env.BRAIN_REALTIME_SECRET) && (process.env.NEON_REALTIME_URL || process.env.BRAIN_REALTIME_URL));
let rt;
async function realtime() {
  if (rt) return rt;
  const { createRealtime } = await import('@neon/realtime/server');
  rt = createRealtime({ secret: (process.env.NEON_REALTIME_SECRET || process.env.BRAIN_REALTIME_SECRET), db: process.env.NEON_REALTIME_DB || 'neondb', url: (process.env.NEON_REALTIME_URL || process.env.BRAIN_REALTIME_URL) });
  return rt;
}

async function todayQuery(day) {
  const { rawSql } = await import('@neon/realtime/server');
  return rawSql(
    `SELECT id, kind, title, source, project, created_at FROM memories
     WHERE day = $1::date AND status <> 'archived' ORDER BY created_at DESC LIMIT 60`,
    [day],
  );
}

// Sealed query the browser can subscribe to; it cannot read or alter the SQL.
export async function sealToday(day = dayOf()) {
  return (await realtime()).seal({ query: await todayQuery(day) });
}

// Trusted server-side subscription (used by scripts/verify-neon.mjs).
export async function subscribeToday(day = dayOf()) {
  return (await realtime()).subscribe(await todayQuery(day));
}
export async function closeRealtime() { if (rt) await rt.close(); }

export function mountNeon(app, store) {
  app.get('/api/neon/status', (c) => c.json({ storage: storageEnabled, auth: neonAuthEnabled, realtime: realtimeEnabled }));
  app.post('/api/backup', async (c) => (storageEnabled ? c.json(await backup(store)) : c.json({ error: 'object storage not configured' }, 400)));
  app.get('/api/backups', async (c) => (storageEnabled ? c.json(await listBackups()) : c.json([])));
  app.post('/api/live/today', async (c) => (realtimeEnabled ? c.json(await sealToday()) : c.json({ error: 'realtime not configured' }, 400)));
}
