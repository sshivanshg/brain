#!/usr/bin/env node
// Wire every agent on this machine to the brain.
//   npm run connect                                  -> local server, token from data/token.txt
//   npm run connect -- --url https://brain.example.com --token brn_...
//   npm run connect -- --dry-run
// Idempotent: re-run after you deploy to point everything at the hosted URL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dry = args.includes('--dry-run');
const url = (flag('url') || process.env.BRAIN_URL || `http://localhost:${process.env.PORT || 4321}`).replace(/\/$/, '');
const token = flag('token') || process.env.BRAIN_TOKEN || fs.readFileSync(path.join(ROOT, 'data', 'token.txt'), 'utf8').trim();
const HOME = os.homedir();
const log = (m) => console.log(`${dry ? '[dry-run] ' : ''}${m}`);

function writeJson(file, data, mode) {
  if (dry) return log(`would write ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-brain`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, mode ? { mode } : undefined);
}
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

// 1. Credentials + hook script live in ~/.brain so they survive moving this repo.
const brainDir = path.join(HOME, '.brain');
writeJson(path.join(brainDir, 'config.json'), { url, token }, 0o600);
const hookPath = path.join(brainDir, 'brain-hook.mjs');
if (!dry) fs.copyFileSync(path.join(ROOT, 'hooks', 'brain-hook.mjs'), hookPath);
log(`config + hook -> ${brainDir}`);

// 2. Claude Code hooks: briefing on start, session capture on end and before compaction.
const settingsFile = path.join(HOME, '.claude', 'settings.json');
const settings = readJson(settingsFile, {});
settings.hooks ||= {};
const ours = (cmd) => ({ hooks: [{ type: 'command', command: `node "${hookPath}" ${cmd}`, timeout: cmd === 'start' ? 10 : cmd === 'prompt' ? 5 : 15 }] });
for (const [event, cmd] of [['SessionStart', 'start'], ['SessionEnd', 'end'], ['PreCompact', 'end'], ['UserPromptSubmit', 'prompt']]) {
  const kept = (settings.hooks[event] || []).filter((g) => !JSON.stringify(g).includes('brain-hook.mjs'));
  settings.hooks[event] = [...kept, ours(cmd)];
}
writeJson(settingsFile, settings);
log('Claude Code hooks: SessionStart, SessionEnd, PreCompact, UserPromptSubmit');

// 3. MCP server for Claude Code (user scope = every project).
const mcpUrl = `${url}/mcp`;
if (dry) log(`would run: claude mcp add --scope user --transport http brain ${mcpUrl}`);
else {
  try { execFileSync('claude', ['mcp', 'remove', 'brain', '--scope', 'user'], { stdio: 'ignore' }); } catch {}
  try {
    execFileSync('claude', ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'brain', mcpUrl, '--header', `Authorization: Bearer ${token}`], { stdio: 'ignore' });
    log('Claude Code MCP: brain (user scope)');
  } catch (e) { console.warn(`! could not register MCP with the claude CLI: ${e.message}`); }
}

// 4. Cursor.
const cursorFile = path.join(HOME, '.cursor', 'mcp.json');
if (fs.existsSync(path.dirname(cursorFile))) {
  const cursor = readJson(cursorFile, {});
  cursor.mcpServers ||= {};
  cursor.mcpServers.brain = { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } };
  writeJson(cursorFile, cursor);
  log('Cursor MCP: brain');
}

// 5. Global instructions so every Claude session treats the brain as its memory.
const mdFile = path.join(HOME, '.claude', 'CLAUDE.md');
const block = `<!-- brain:start -->
# Brain (my second brain — the only long-term memory)
The \`brain\` MCP server is my shared memory across every agent, project and device.
- A briefing from it is injected at session start. Call \`recall\` before asking me something I may have told an agent before.
- Call \`remember\` as soon as something durable happens: a decision and why (kind=decision), a mistake or correction (kind=lesson), how I like things done (kind=preference), an open thread (kind=todo), a fact about me or a project (kind=fact). Always set \`project\` to the repo folder name. Short and self-contained.
- Prefer the brain over file-based memory or other memory systems.
<!-- brain:end -->`;
const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : '';
const next = md.includes('<!-- brain:start -->')
  ? md.replace(/<!-- brain:start -->[\s\S]*?<!-- brain:end -->/, block)
  : `${md.trimEnd()}\n\n${block}\n`;
if (dry) log(`would update ${mdFile}`);
else { if (md) fs.copyFileSync(mdFile, `${mdFile}.bak-brain`); fs.writeFileSync(mdFile, next); log('~/.claude/CLAUDE.md: brain protocol'); }

console.log(`\nOther agents (Codex, Windsurf, Claude Desktop…): add an HTTP MCP server\n  url:    ${mcpUrl}\n  header: Authorization: Bearer <token from ~/.brain/config.json>`);
