#!/usr/bin/env node
// Pull everything you already have into the brain. Idempotent (every item has a stable ext_key).
//   npm run import                       -> agent-hub + ~/.claude/history.jsonl
//   npm run import -- --hub ~/Documents/projects/agent-hub --no-history
//   npm run import -- --from-export brain-export-2026-10-08.json   (move local data to a hosted brain)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p) => p.replace(/^~/, os.homedir());
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.brain', 'config.json'), 'utf8')); } catch { return {}; } })();
const url = (flag('url') || process.env.BRAIN_URL || cfg.url || 'http://localhost:4321').replace(/\/$/, '');
const token = flag('token') || process.env.BRAIN_TOKEN || cfg.token || fs.readFileSync(new URL('../data/token.txt', import.meta.url), 'utf8').trim();
const TZ = process.env.BRAIN_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

const items = [];
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  let block = null; // YAML folded/literal scalars: `description: >`
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      block = /^[>|][-+]?$/.test(kv[2].trim()) ? kv[1] : null;
      fm[kv[1]] = block ? '' : kv[2].replace(/^["']|["']$/g, '');
    } else if (block && /^\s+\S/.test(line)) fm[block] = `${fm[block]} ${line.trim()}`.trim();
  }
  if (!fm.type) fm.type = (m[1].match(/^\s+type:\s*(\S+)/m) || [])[1]; // nested under metadata:
  return { fm, body: text.slice(m[0].length) };
}

const KNOWN = ['ditchla-creator-portal', 'DesiDiva', 'Sde-project', 'agent-hub', 'brain'];
const projectFromSlug = (slug) => KNOWN.find((k) => slug.endsWith(k))
  || slug.replace(/^Users-[^-]+-?/, '').replace(/^(Documents-|Downloads-|Desktop-)?(projects-)?/, '').replace(/^projects$/, '') || 'home';

function fromHub(hub) {
  const rel = (f) => path.relative(hub, f);
  const born = (f) => dayOf(fs.statSync(f).mtimeMs);
  for (const f of walk(path.join(hub, 'memory')).filter((f) => f.endsWith('.md') && !f.endsWith('MEMORY.md'))) {
    const { fm, body } = frontmatter(fs.readFileSync(f, 'utf8'));
    const kind = { feedback: 'preference', user: 'fact', project: 'fact', reference: 'fact' }[fm.type] || 'memory';
    const project = projectFromSlug(rel(f).split(path.sep)[1]);
    items.push({ kind, project: project === 'home' ? null : project, title: fm.description || fm.name, body, source: 'claude-memory', day: born(f), ext_key: `hub:${rel(f)}`, tags: ['imported'] });
  }
  for (const f of walk(path.join(hub, 'skills')).filter((f) => f.endsWith('SKILL.md'))) {
    const { fm, body } = frontmatter(fs.readFileSync(f, 'utf8'));
    const src = path.join(path.dirname(f), '.source');
    items.push({ kind: 'skill', title: fm.name || path.basename(path.dirname(f)), summary: fm.description, body, source: 'agent-hub', project: fs.existsSync(src) ? fs.readFileSync(src, 'utf8').trim() : null, day: born(f), ext_key: `hub:${rel(f)}` });
  }
  for (const [dir, kind] of [['agents', 'agent'], ['prompts', 'prompt'], ['playbooks', 'playbook'], ['projects', 'doc']]) {
    for (const f of walk(path.join(hub, dir)).filter((f) => f.endsWith('.md'))) {
      const { fm, body } = frontmatter(fs.readFileSync(f, 'utf8'));
      const parts = rel(f).split(path.sep);
      const project = parts.length > 2 ? parts[1] : null;
      items.push({ kind, project, title: fm.name || path.basename(f, '.md'), summary: fm.description || null, body, source: 'agent-hub', day: born(f), ext_key: `hub:${rel(f)}` });
    }
  }
}

function fromHistory(file) {
  if (!fs.existsSync(file)) return;
  const groups = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    let text = String(e.display || '').trim();
    if (!text || (/^\/\S+$/.test(text))) continue; // bare slash commands
    for (const p of Object.values(e.pastedContents || {})) if (p?.content) text = text.replace(/\[Pasted text #\d+[^\]]*\]/, `\n> ${String(p.content).slice(0, 1500).replace(/\n/g, '\n> ')}\n`);
    const project = e.project ? (e.project === os.homedir() ? 'home' : path.basename(e.project)) : 'home';
    const day = dayOf(e.timestamp || Date.now());
    const key = `${project}|${day}`;
    if (!groups.has(key)) groups.set(key, { project, day, prompts: [] });
    groups.get(key).prompts.push(`- ${new Date(e.timestamp).toTimeString().slice(0, 5)} ${text}`);
  }
  for (const { project, day, prompts } of groups.values()) {
    items.push({ kind: 'prompt-log', project: project === 'home' ? null : project, day, title: `What I asked agents · ${project} · ${day}`, body: prompts.join('\n'), source: 'claude-code', ext_key: `history:${project}:${day}` });
  }
}

if (flag('from-export')) {
  for (const m of JSON.parse(fs.readFileSync(expand(flag('from-export')), 'utf8'))) {
    const { id, created_at, updated_at, ...rest } = m;
    items.push({ ...rest, ext_key: m.ext_key || `export:${id}` });
  }
} else {
  fromHub(expand(flag('hub') || '~/Documents/projects/agent-hub'));
  if (!args.includes('--no-history')) fromHistory(path.join(os.homedir(), '.claude', 'history.jsonl'));
}

let done = 0;
let failed = 0;
const queue = [...items];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const it = queue.shift();
    const res = await fetch(`${url}/api/memories`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(it) }).catch(() => null);
    if (res?.ok) done++; else failed++;
  }
}));
console.log(`imported ${done}/${items.length} into ${url}${failed ? ` (${failed} failed)` : ''}`);
