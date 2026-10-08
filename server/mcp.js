// Minimal stateless MCP server over Streamable HTTP (JSON responses).
// Any agent that speaks MCP — Claude Code, Cursor, Codex, Windsurf, Claude Desktop — connects to POST /mcp.
import { KINDS } from './store.js';
import { dayOf, shiftDay, clip } from './util.js';

const INSTRUCTIONS = `This is the user's second brain — the single long-term memory shared by every agent they use.
- At the start of work on a project, call \`brief\` with the project name.
- Before asking the user something they may have told an agent before, call \`recall\`.
- Call \`remember\` the moment something durable happens: a decision (with the why), a lesson from a mistake or correction, a preference about how they like things done, a todo/open thread, or a fact about them or their projects. Keep each memory short and self-contained, and set \`project\`.
- Never store secrets; the server redacts them anyway.`;

const DREAM_PROMPT = `Consolidate my brain ("dream"). Use the brain MCP tools:
1. Call \`dream\` (no day = the oldest day still waiting) to get that day's raw activity.
2. Write a dense markdown digest with sections "## Worked on" (by project), "## Read & learned" (group pages by theme, keep useful URLs), "## Decisions", "## Lessons", "## Open threads". Skip empty sections.
3. Call \`save_digest\` with the day and digest.
4. For every genuinely durable decision, lesson or preference you found that isn't already a memory, call \`remember\` with the right kind and project.
5. If you learned something new about me, call \`update_profile\` with the full revised profile.
Repeat for each remaining day the tool reports, then give me a two-line summary.`;

const str = (description) => ({ type: 'string', description });

const TOOLS = [
  {
    name: 'brief',
    description: 'Get the briefing for a project: who the user is, their preferences, lessons, decisions, open threads and recent sessions. Call at the start of work.',
    inputSchema: { type: 'object', properties: { project: str('Project name, e.g. the repo folder name') } },
    run: async (s, a) => s.brief({ project: a.project }),
  },
  {
    name: 'remember',
    description: `Save something durable to the brain. kind is one of: ${KINDS.join(', ')}. Prefer decision / lesson / preference / todo / fact for agent-learned knowledge.`,
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: str('The memory itself, self-contained, markdown ok'),
        kind: { type: 'string', enum: KINDS },
        title: str('Short title (optional)'),
        project: str('Project it belongs to; omit for global/personal'),
        tags: { type: 'array', items: { type: 'string' } },
        url: str('Related URL'),
        pinned: { type: 'boolean', description: 'Always include in briefings' },
      },
    },
    run: async (s, a, ctx) => {
      const m = await s.remember({ ...a, body: a.content, source: ctx.source });
      return `Saved #${m.id} (${m.kind}${m.project ? ` · ${m.project}` : ''}): ${m.title}`;
    },
  },
  {
    name: 'recall',
    description: 'Search everything in the brain (sessions, decisions, lessons, browsing, notes, skills, prompts). Supports "quoted phrases", OR and -exclusions.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: str('What to look for'),
        kind: str('Comma-separated kinds to filter'),
        project: str('Limit to a project'),
        since: str('YYYY-MM-DD'),
        limit: { type: 'number' },
      },
    },
    run: async (s, a) => {
      const rows = await s.search({ q: a.query, kind: a.kind, project: a.project, since: a.since, limit: a.limit || 12 });
      if (!rows.length) return 'Nothing found.';
      return rows.map((r) => `#${r.id} [${r.kind}${r.project ? ` · ${r.project}` : ''} · ${r.day}] ${r.title}${r.url ? ` <${r.url}>` : ''}\n  ${clip((r.snippet || r.summary || r.body || '').replace(/[⟦⟧]/g, '').replace(/\s+/g, ' '), 300)}`).join('\n');
    },
  },
  {
    name: 'get',
    description: 'Read one memory in full by id.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' } } },
    run: async (s, a) => {
      const m = await s.get(a.id);
      return m ? `#${m.id} [${m.kind}${m.project ? ` · ${m.project}` : ''} · ${m.day} · ${m.source}] ${m.title}${m.url ? `\n${m.url}` : ''}\n\n${m.body}` : 'Not found.';
    },
  },
  {
    name: 'update',
    description: 'Correct or extend an existing memory (e.g. a decision that changed). Only pass fields to change.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'number' }, content: str('New body'), title: str('New title'), kind: { type: 'string', enum: KINDS }, project: str('Project'), pinned: { type: 'boolean' }, status: { type: 'string', enum: ['active', 'archived'] } },
    },
    run: async (s, a) => {
      const { id, content, ...rest } = a;
      const m = await s.update(id, content !== undefined ? { ...rest, body: content } : rest);
      return m ? `Updated #${m.id}: ${m.title}` : 'Not found.';
    },
  },
  {
    name: 'forget',
    description: 'Archive a memory that is wrong or obsolete.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'number' } } },
    run: async (s, a) => ((await s.forget(a.id)) ? `Archived #${a.id}` : 'Not found.'),
  },
  {
    name: 'timeline',
    description: 'What happened on a day (default today): sessions, pages read, notes, decisions.',
    inputSchema: { type: 'object', properties: { day: str('YYYY-MM-DD, or "yesterday"'), project: str('Project'), kind: str('Comma-separated kinds') } },
    run: async (s, a) => {
      const day = a.day === 'yesterday' ? shiftDay(dayOf(), -1) : a.day || dayOf();
      const rows = await s.search({ day, project: a.project, kind: a.kind, limit: 100, status: 'any' });
      if (!rows.length) return `Nothing recorded on ${day}.`;
      return `${day}:\n` + rows.map((r) => `#${r.id} ${new Date(r.created_at).toISOString().slice(11, 16)} [${r.kind} · ${r.source}${r.project ? ` · ${r.project}` : ''}] ${r.title}`).join('\n');
    },
  },
  {
    name: 'projects',
    description: 'List every project the brain knows about with activity counts.',
    inputSchema: { type: 'object', properties: {} },
    run: async (s) => (await s.projects()).map((p) => `${p.project}: ${p.count} memories, ${p.sessions} sessions, ${p.knowledge} decisions/lessons, last ${new Date(p.last_active).toISOString().slice(0, 10)}`).join('\n') || 'No projects yet.',
  },
  {
    name: 'update_profile',
    description: 'Replace the living "about me" profile (markdown) that every briefing starts with. Read the current one via brief first and keep what is still true.',
    inputSchema: { type: 'object', required: ['profile'], properties: { profile: str('Full markdown profile') } },
    run: async (s, a, ctx) => {
      await s.remember({ kind: 'profile', title: 'About me', body: a.profile, source: ctx.source, ext_key: 'profile:me', pinned: true });
      return 'Profile updated.';
    },
  },
  {
    name: 'dream',
    description: 'Start nightly consolidation: returns one day of raw activity (pages, sessions, notes) that still needs a digest. Follow up with save_digest.',
    inputSchema: { type: 'object', properties: { day: str('YYYY-MM-DD; default = oldest day still waiting') } },
    run: async (s, a) => {
      const waiting = await s.daysNeedingDigest();
      const day = a.day || waiting[0]?.day;
      if (!day) return 'Nothing waiting — every past day already has a digest.';
      const items = await s.pendingForDay(day);
      const others = waiting.filter((w) => w.day !== day).map((w) => w.day);
      return `Day ${day} — ${items.length} items.${others.length ? ` Also waiting: ${others.join(', ')}.` : ''}\n\n` +
        items.map((m) => `#${m.id} [${m.kind} · ${m.source}${m.project ? ` · ${m.project}` : ''}${m.meta?.dwell ? ` · ${Math.round(m.meta.dwell / 60)}m read` : ''}] ${m.title}${m.url ? ` <${m.url}>` : ''}\n  ${clip((m.summary || m.body || '').replace(/\s+/g, ' '), 500)}${m.meta?.highlights?.length ? `\n  highlights: ${m.meta.highlights.slice(0, 5).map((h) => `"${clip(h, 160)}"`).join(' | ')}` : ''}`).join('\n');
    },
  },
  {
    name: 'save_digest',
    description: 'Save the digest for a day and compact that day\'s raw browsing into it.',
    inputSchema: { type: 'object', required: ['day', 'digest'], properties: { day: str('YYYY-MM-DD'), digest: str('Markdown digest') } },
    run: async (s, a, ctx) => {
      const r = await s.saveDigest(a.day, a.digest, { source: ctx.source });
      return `Digest #${r.digest.id} saved for ${a.day}; compacted ${r.compacted} raw pages.`;
    },
  },
];

const PROMPTS = [
  { name: 'dream', description: 'Consolidate raw activity into daily digests, lessons and profile updates', text: DREAM_PROMPT },
  { name: 'catch-me-up', description: 'Brief me on a project from the brain', text: 'Call the brain `brief` tool for the current project (use the folder name), then `timeline` for yesterday, and give me a tight catch-up: where things stand, open threads, and what to do next.' },
];

function ok(id, result) { return { jsonrpc: '2.0', id, result }; }
function fail(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handle(msg, store, ctx) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'brain', version: '0.1.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool ${params.name}`);
      try {
        const text = await tool.run(store, params.arguments || {}, ctx);
        return ok(id, { content: [{ type: 'text', text: String(text) }] });
      } catch (err) {
        return ok(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }
    }
    case 'prompts/list':
      return ok(id, { prompts: PROMPTS.map(({ name, description }) => ({ name, description })) });
    case 'prompts/get': {
      const p = PROMPTS.find((x) => x.name === params.name);
      if (!p) return fail(id, -32602, `Unknown prompt ${params.name}`);
      return ok(id, { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text } }] });
    }
    case 'resources/list':
      return ok(id, { resources: [] });
    default:
      return id === undefined ? null : fail(id, -32601, `Method not found: ${method}`);
  }
}

export function mountMcp(app, store) {
  app.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));
  app.delete('/mcp', (c) => c.body(null, 200));
  app.post('/mcp', async (c) => {
    let body;
    try { body = await c.req.json(); } catch { return c.json(fail(null, -32700, 'Parse error'), 400); }
    const agent = c.req.header('x-brain-source') || (c.req.header('user-agent') || '').split(/[\s/]/)[0].toLowerCase() || 'mcp';
    const ctx = { source: agent.includes('claude') ? 'claude-code' : agent };
    const batch = Array.isArray(body);
    const out = (await Promise.all((batch ? body : [body]).map((m) => handle(m, store, ctx)))).filter(Boolean);
    if (!out.length) return c.body(null, 202);
    return c.json(batch ? out : out[0]);
  });
}
