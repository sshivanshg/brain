#!/usr/bin/env node
// Claude Code hook. `start`: inject the project briefing. `end`: ship the session to the brain.
// Reads ~/.brain/config.json ({ url, token }); BRAIN_URL / BRAIN_TOKEN override. Never blocks or fails a session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2];
if (process.env.BRAIN_DISABLE) process.exit(0);

function config() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.brain', 'config.json'), 'utf8'));
    return { url: process.env.BRAIN_URL || c.url, token: process.env.BRAIN_TOKEN || c.token };
  } catch {
    return { url: process.env.BRAIN_URL, token: process.env.BRAIN_TOKEN };
  }
}

function projectOf(cwd) {
  let dir = cwd || process.cwd();
  const wt = dir.indexOf(`${path.sep}.claude${path.sep}worktrees${path.sep}`);
  if (wt > 0) dir = dir.slice(0, wt);
  try { dir = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || dir; } catch {}
  return dir === os.homedir() ? 'home' : path.basename(dir);
}

const readStdin = () => new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (d) => { data += d; });
  process.stdin.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  setTimeout(() => resolve({}), 1500);
});

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
}

function condense(transcriptPath, project) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const prompts = [];
  const replies = [];
  const files = new Set();
  const commands = [];
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isMeta || e.isSidechain) continue;
    const content = e.message?.content;
    if (e.type === 'user') {
      const t = textOf(content).trim();
      if (t && !t.startsWith('<') && !t.startsWith('[Request interrupted')) prompts.push(t);
    } else if (e.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'text' && b.text.trim()) replies.push(b.text.trim());
        if (b.type === 'tool_use') {
          const f = b.input?.file_path || b.input?.notebook_path;
          if (f && /Edit|Write|NotebookEdit/.test(b.name)) files.add(f);
          if (b.name === 'Bash' && b.input?.command && commands.length < 25) commands.push(b.input.command.split('\n')[0].slice(0, 140));
        }
      }
    }
  }
  if (!prompts.length) return null;
  const clipTo = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const parts = [
    `## What I asked\n${prompts.map((p, i) => `${i + 1}. ${clipTo(p.replace(/\n+/g, ' '), 700)}`).join('\n')}`,
    files.size ? `## Files changed\n${[...files].map((f) => `- ${f}`).join('\n')}` : '',
    commands.length ? `## Commands\n${commands.map((c) => `- \`${c}\``).join('\n')}` : '',
    `## What the agent said (last turns)\n${replies.slice(-6).map((r) => clipTo(r, 1500)).join('\n\n---\n\n')}`,
  ].filter(Boolean);
  return { transcript: clipTo(parts.join('\n\n'), 24000), first_prompt: prompts[0].replace(/\s+/g, ' ').slice(0, 140), files: [...files].slice(0, 60), prompt_count: prompts.length, project };
}

async function main() {
  const input = await readStdin();
  const { url, token } = config();
  if (!url || !token) return;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'claude-code' };
  const project = projectOf(input.cwd);

  if (mode === 'start') {
    const res = await fetch(`${url}/api/brief?project=${encodeURIComponent(project)}`, { headers, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return;
    const brief = await res.text();
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: brief } }));
    return;
  }

  if (mode === 'end' && input.transcript_path && fs.existsSync(input.transcript_path)) {
    const s = condense(input.transcript_path, project);
    if (!s) return;
    await fetch(`${url}/api/sessions`, {
      method: 'POST', headers, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ ...s, session_id: input.session_id, cwd: input.cwd, reason: input.hook_event_name || input.reason, agent: 'claude-code' }),
    });
  }
}

main().catch(() => {}).finally(() => process.exit(0));
