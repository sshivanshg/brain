// Semantic embeddings through the Neon AI Gateway (OpenAI-compatible /v1/embeddings).
// Optional: with no gateway vars, or no AI Gateway credits (HTTP 403), Brain keeps
// using full-text search and retries the gateway later.
export const EMBED_MODEL = process.env.BRAIN_EMBED_MODEL || 'qwen3-embedding-0-6b';
export const EMBED_DIM = 1024;
const RETRY_MS = 10 * 60 * 1000;
const QUERY_PREFIX = 'Instruct: Given a question, retrieve personal notes, decisions and sessions that answer it\nQuery: ';

const configured = Boolean(process.env.NEON_AI_GATEWAY_BASE_URL && process.env.NEON_AI_GATEWAY_TOKEN);
let blockedUntil = 0;
let lastError = configured ? null : 'not configured';

export function embedStatus() {
  return { configured, available: configured && Date.now() >= blockedUntil, lastError, model: EMBED_MODEL };
}

// Returns an array of vectors, or null when embeddings are unavailable right now.
export async function embedTexts(texts, { query = false } = {}) {
  if (!configured || Date.now() < blockedUntil || !texts.length) return null;
  const input = texts.map((t) => (query ? QUERY_PREFIX : '') + String(t).slice(0, 8000));
  try {
    const res = await fetch(`${process.env.NEON_AI_GATEWAY_BASE_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.NEON_AI_GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input, dimensions: EMBED_DIM }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
      blockedUntil = Date.now() + RETRY_MS;
      return null;
    }
    const out = await res.json();
    lastError = null;
    return out.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (e) {
    lastError = e.message;
    blockedUntil = Date.now() + 60 * 1000;
    return null;
  }
}

export const embedText = async (text, opts) => (await embedTexts([text], opts))?.[0] || null;

// Text that represents a memory for embedding.
export const memoryText = (m) => [m.title, m.project, m.summary, String(m.body || '').slice(0, 6000)].filter(Boolean).join('\n');
