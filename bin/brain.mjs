#!/usr/bin/env node
// brain — your second brain from the terminal.
//   brain                     briefing for the current project + today so far
//   brain find <query>        search everything
//   brain ask <question>      search by meaning-ish (OR over keywords) with sources
//   brain add <text> [-k kind] [-p project]
//   brain today | yesterday   timeline
//   brain handoff <note>      leave a note the next agent session in this project will see
//   brain dream               consolidate past days now (runs Claude Code headless)
//   brain open [id]           open the web app (or a memory)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.brain', 'config.json'), 'utf8')); } catch { return {}; } })();
const URL_ = (process.env.BRAIN_URL || cfg.url || '').replace(/\/$/, '');
const TOKEN = process.env.BRAIN_TOKEN || cfg.token;
if (!URL_ || !TOKEN) { console.error('Not connected. Run `npm run connect -- --url … --token …` in the brain repo.'); process.exit(1); }

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c(2), bold = c(1), violet = c(35), cyan = c(36);

async function api(p, opts = {}) {
  const res = await fetch(`${URL_}${p}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'cli' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

function project() {
  let dir = process.cwd();
  const wt = dir.indexOf(`${path.sep}.claude${path.sep}worktrees${path.sep}`);
  if (wt > 0) dir = dir.slice(0, wt);
  try { dir = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || dir; } catch {}
  return dir === os.homedir() ? null : path.basename(dir);
}

const time = (ts) => new Date(ts).toTimeString().slice(0, 5);
const line = (m) => `${dim(`#${m.id}`)} ${violet(m.kind)}${m.project ? dim(` · ${m.project}`) : ''} ${bold(m.title)}${m.url ? dim(`  ${m.url}`) : ''}`;
const snippet = (m) => (m.snippet || m.summary || m.body || '').replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').slice(0, 220);

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-k' || args[i] === '--kind') out.kind = args[++i];
    else if (args[i] === '-p' || args[i] === '--project') out.project = args[++i];
    else out._.push(args[i]);
  }
  return out;
}

async function timeline(day) {
  const rows = await api(`/api/memories?day=${day}&limit=100&status=any`);
  if (!rows.length) return console.log(dim(`Nothing on ${day} yet.`));
  console.log(bold(day));
  for (const m of rows.reverse()) console.log(`  ${dim(time(m.created_at))} ${line(m)}`);
}

const dayOf = (d = new Date()) => d.toLocaleDateString('en-CA');
const [cmd, ...rest] = process.argv.slice(2);
const f = flags(rest);
const text = f._.join(' ').trim();

try {
  switch (cmd) {
    case undefined:
    case 'brief': {
      const p = f.project || project();
      console.log(await api(`/api/brief${p ? `?project=${encodeURIComponent(p)}` : ''}`));
      console.log();
      await timeline(dayOf());
      break;
    }
    case 'find':
    case 'search':
    case 'ask': {
      if (!text) throw new Error(`usage: brain ${cmd} <query>`);
      const rows = cmd === 'ask'
        ? (await api('/api/ask', { method: 'POST', body: { question: text } })).sources
        : await api(`/api/memories?limit=15&q=${encodeURIComponent(text)}${f.kind ? `&kind=${f.kind}` : ''}${f.project ? `&project=${encodeURIComponent(f.project)}` : ''}`);
      if (!rows.length) console.log(dim('Nothing found.'));
      for (const m of rows.slice(0, 12)) console.log(`${line(m)}\n  ${dim(snippet(m))}\n`);
      break;
    }
    case 'add':
    case 'remember': {
      if (!text) throw new Error('usage: brain add <text> [-k kind] [-p project]');
      const m = await api('/api/memories', { method: 'POST', body: { content: text, kind: f.kind || 'note', project: f.project || project() || undefined, source: 'cli' } });
      console.log(`${cyan('saved')} ${line(m)}`);
      break;
    }
    case 'today': await timeline(dayOf()); break;
    case 'yesterday': { const d = new Date(); d.setDate(d.getDate() - 1); await timeline(dayOf(d)); break; }
    case 'handoff': {
      const p = f.project || project();
      if (!text || !p) throw new Error('usage: brain handoff <where you stopped / what is next>  (inside a project)');
      const m = await api('/api/memories', { method: 'POST', body: { kind: 'todo', title: `Handoff: ${text.slice(0, 80)}`, content: text, project: p, pinned: true, source: 'cli', tags: ['handoff'] } });
      console.log(`${cyan('handoff saved')} ${line(m)} ${dim('— the next session here starts with it')}`);
      break;
    }
    case 'get': case 'show': {
      const m = await api(`/api/memories/${text}`);
      console.log(`${line(m)}\n${dim(`${m.day} · ${m.source}`)}\n\n${m.body}`);
      break;
    }
    case 'dream': {
      console.log(dim('Running /mcp__brain__dream in Claude Code (headless)…'));
      const r = spawnSync('claude', ['-p', '/mcp__brain__dream', '--allowedTools', 'mcp__brain__dream,mcp__brain__save_digest,mcp__brain__remember,mcp__brain__update_profile,mcp__brain__brief,mcp__brain__recall'], { stdio: 'inherit', env: { ...process.env, BRAIN_DISABLE: '1' } });
      process.exit(r.status ?? 0);
    }
    case 'open': {
      spawnSync('open', [`${URL_}/${text ? `#/m/${text}` : ''}`]);
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
