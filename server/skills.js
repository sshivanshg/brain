// Skills: SKILL.md playbooks stored in the brain, per project or global, that every agent can
// list and load over MCP (`skills`, `skill`, `save_skill`) or pull into .claude/skills with the CLI.
// A skill is a memory of kind 'skill' keyed by ext_key `skill:<project|*>:<name>`.
import { clip } from './util.js';

const MAX_BYTES = 200_000;

export const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

// Reads `name` and `description` from YAML frontmatter, falling back to the first heading.
export function parseSkill(md) {
  const text = String(md || '').replace(/^﻿/, '');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const field = (k) => fm?.[1].match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1]?.trim();
  const heading = text.replace(/^---[\s\S]*?---/, '').match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstPara = text.replace(/^---[\s\S]*?---/, '').replace(/^#.*$/gm, '').split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#'));
  return { name: field('name') || heading || '', description: field('description') || clip(firstPara || '', 240) };
}

// GitHub page URLs → raw file URLs, so people can paste what they see in the browser.
export function rawUrl(u) {
  const url = new URL(u);
  if (url.protocol !== 'https:') throw new Error('only https URLs can be imported');
  if (url.hostname === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|tree)\/([^/]+)\/(.+)$/);
    if (m) {
      const file = /\.md$/i.test(m[4]) ? m[4] : `${m[4].replace(/\/$/, '')}/SKILL.md`;
      return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${file}`;
    }
  }
  return url.toString();
}

export async function fetchSkill(u) {
  const res = await fetch(rawUrl(u), { signal: AbortSignal.timeout(8000), redirect: 'follow' });
  if (!res.ok) throw new Error(`couldn't fetch the skill (HTTP ${res.status})`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('skill file is larger than 200 KB');
  if (/^\s*</.test(text)) throw new Error('that URL returned a web page, not a markdown file — use the raw link');
  return text;
}

export function createSkills(store) {
  const keyOf = (project, name) => `skill:${project || '*'}:${slug(name)}`;

  async function save({ content, url, name, project, source = 'web' }) {
    const body = content ?? (url ? await fetchSkill(url) : '');
    if (!String(body).trim()) throw new Error('skill content is empty');
    if (body.length > MAX_BYTES) throw new Error('skill file is larger than 200 KB');
    const meta = parseSkill(body);
    const finalName = slug(name || meta.name);
    if (!finalName) throw new Error('give the skill a name (frontmatter `name:` or a # heading)');
    return store.remember({
      kind: 'skill', ext_key: keyOf(project, finalName), title: finalName, summary: meta.description || null,
      body, project: project || null, url: url || null, source, tags: ['skill'],
      meta: { skill: { name: finalName, description: meta.description, imported_from: url || null } },
    });
  }

  const list = (project) => store.listSkills(project);
  const get = (name, project) => store.getSkill(slug(name), project);

  return { save, list, get };
}

export function mountSkills(app, skills) {
  app.get('/api/skills', async (c) => c.json(await skills.list(c.req.query('project'))));
  app.get('/api/skills/:name', async (c) => {
    const s = await skills.get(c.req.param('name'), c.req.query('project'));
    return s ? c.json(s) : c.json({ error: 'no skill with that name' }, 404);
  });
  app.post('/api/skills', async (c) => {
    const b = await c.req.json();
    try {
      return c.json(await skills.save({ ...b, source: c.req.header('x-brain-source') || 'web' }), 201);
    } catch (e) {
      return c.json({ error: e.message }, 400);
    }
  });
}

export const skillTools = (skills) => [
  {
    name: 'skills',
    description: "List the user's skills (SKILL.md playbooks) for a project, including global ones. Call at the start of work and load any that fit the task with `skill`.",
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project name (repo folder)' } } },
    run: async (_s, a) => {
      const rows = await skills.list(a.project);
      if (!rows.length) return 'No skills saved yet. The user can add them in the Brain app (Skills) or with `save_skill`.';
      return rows.map((r) => `- **${r.name}**${r.project ? ` (${r.project})` : ' (global)'}: ${r.description || ''}`).join('\n');
    },
  },
  {
    name: 'skill',
    description: 'Load the full SKILL.md for a skill by name, then follow its instructions.',
    inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, project: { type: 'string' } } },
    run: async (_s, a) => {
      const s = await skills.get(a.name, a.project);
      return s ? s.body : `No skill named "${a.name}". Call \`skills\` to see what exists.`;
    },
  },
  {
    name: 'save_skill',
    description: 'Save or update a skill: full SKILL.md markdown (with `name:` / `description:` frontmatter) or an https URL to one (GitHub links work). Omit project for a global skill.',
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, url: { type: 'string' }, name: { type: 'string' }, project: { type: 'string' } } },
    run: async (_s, a, ctx) => {
      const m = await skills.save({ ...a, source: ctx?.source || 'mcp' });
      return `Saved skill "${m.title}"${m.project ? ` for ${m.project}` : ' (global)'} (#${m.id}).`;
    },
  },
];
