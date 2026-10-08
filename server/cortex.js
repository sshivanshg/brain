// Optional LLM layer. With ANTHROPIC_API_KEY set, the server summarizes pages and
// sessions itself and writes nightly digests. Without it, everything still works:
// summaries are extractive and Claude Code does the nightly "dream" over MCP.
import Anthropic from '@anthropic-ai/sdk';
import { clip } from './util.js';

const MODEL = process.env.BRAIN_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;

export const cortexEnabled = Boolean(client);

async function think(system, content, effort = 'low') {
  if (!client) return null;
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages: [{ role: 'user', content }],
    });
    if (res.stop_reason === 'refusal') return null;
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
  } catch (err) {
    console.error('[cortex]', err?.status || '', err?.message || err);
    return null;
  }
}

export function summarizePage({ title, url, text, highlights }) {
  return think(
    'You compress web pages into a personal knowledge base. Reply with 1-3 plain sentences: what the page is and the specific, useful takeaway for the reader. No preamble.',
    `Title: ${title}\nURL: ${url}\n${highlights?.length ? `Reader highlighted:\n${highlights.join('\n')}\n` : ''}\nPage text:\n${clip(text, 10000)}`,
  );
}

export function summarizeSession({ project, transcript }) {
  return think(
    'You summarize a coding-agent session for the developer\'s second brain. Reply in at most 4 short sentences: what was attempted, what got done, key decisions, and anything left open. Concrete nouns (files, features, tools). No preamble.',
    `Project: ${project}\n\n${clip(transcript, 30000)}`,
  );
}

export function writeDigest(day, items) {
  const lines = items.map((m) => `- [${m.kind}${m.project ? ` · ${m.project}` : ''}${m.source ? ` · ${m.source}` : ''}] ${m.title}${m.url ? ` <${m.url}>` : ''}\n  ${clip(m.summary || m.body || '', 400).replace(/\n/g, ' ')}`);
  return think(
    'You are the overnight memory consolidation of a developer\'s second brain. Turn one day of raw activity into a digest they will reread months later. Use markdown with these sections, skipping empty ones: "## Worked on" (by project), "## Read & learned" (group pages by theme, keep the useful URLs), "## Decisions", "## Lessons", "## Open threads". Be specific and dense; no filler.',
    `Day: ${day}\n\n${lines.join('\n')}`,
    'medium',
  );
}

export function answer(question, sources) {
  const ctx = sources.map((m) => `[#${m.id}] (${m.kind}, ${m.day}${m.project ? `, ${m.project}` : ''}) ${m.title}\n${clip(m.summary || m.body || '', 900)}`).join('\n\n');
  return think(
    'You are the owner\'s second brain. Answer their question using only the memories provided, citing them inline like [#123]. If the memories don\'t contain the answer, say so plainly. Be direct and brief.',
    `Memories:\n${ctx}\n\nQuestion: ${question}`,
    'medium',
  );
}
