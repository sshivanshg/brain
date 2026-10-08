export const TZ = process.env.BRAIN_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// YYYY-MM-DD in the owner's timezone, so "today" means your today, not UTC's.
export function dayOf(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function shiftDay(day, delta) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/\bbrn_[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, '[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED JWT]'],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*/g, 'Bearer [REDACTED]'],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@\/]+:[^\s@\/]+@/gi, '$1://[REDACTED]@'],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1$2[REDACTED]'],
];

// Never let credentials into the brain, whoever is writing.
export function scrub(text) {
  if (!text) return text;
  let out = String(text);
  for (const [re, rep] of SECRETS) out = out.replace(re, rep);
  return out;
}

export function titleFrom(body, max = 90) {
  const line = String(body || '').split('\n').map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean) || 'Untitled';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function clip(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Cheap summary when no LLM is configured: meta description, else first sentences.
export function extractiveSummary(text, description) {
  if (description && description.trim().length > 40) return clip(description.trim(), 320);
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]{25,}[.!?]/g) || [clean];
  return clip(sentences.slice(0, 2).join(' ').trim(), 320) || null;
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

const STOP = new Set('a an and are as at be but by did do does for from had has have how i if in into is it its me my of on or so than that the their then there these they this to too was we what when where which who why will with you your about after again all also any can could just more most not now only other our out over some such them up very would'.split(' '));

// Natural-language question -> OR query, so "what did I decide on payouts" still matches.
export function orQuery(q) {
  const words = String(q).toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  const keep = [...new Set(words.filter((w) => !STOP.has(w)))];
  return keep.length ? keep.join(' or ') : String(q);
}
