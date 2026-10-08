#!/usr/bin/env node
// Keep the brain running on this Mac (login item via launchd) until it's hosted.
//   npm run service            install/refresh + start (re-run after pulling changes)
//   npm run service -- stop    uninstall
// macOS blocks background agents from reading ~/Documents, so the service runs from a copy
// in ~/.brain/app with its database in ~/.brain/data. The token stays the one in ./data/token.txt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.brain.server';
const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const domain = `gui/${process.getuid()}`;
const run = (...a) => { try { execFileSync('launchctl', a, { stdio: 'ignore' }); } catch {} };

run('bootout', `${domain}/${LABEL}`);
if (process.argv[2] === 'stop') {
  fs.rmSync(plist, { force: true });
  console.log('brain service removed');
  process.exit(0);
}

const HOME = path.join(os.homedir(), '.brain');
const APP = path.join(HOME, 'app');
fs.rmSync(APP, { recursive: true, force: true });
for (const part of ['server', 'web', 'node_modules', 'package.json']) fs.cpSync(path.join(ROOT, part), path.join(APP, part), { recursive: true });
fs.mkdirSync(path.join(HOME, 'data'), { recursive: true });
const tokenFile = path.join(ROOT, 'data', 'token.txt');
if (!fs.existsSync(tokenFile)) { console.error('Run `npm start` once first to create data/token.txt'); process.exit(1); }
const env = {
  PORT: process.env.PORT || '4321',
  BRAIN_TZ: process.env.BRAIN_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  BRAIN_TOKEN: fs.readFileSync(tokenFile, 'utf8').trim(),
  BRAIN_DATA_DIR: path.join(HOME, 'data', 'pglite'),
  PATH: process.env.PATH,
};
for (const k of ['BRAIN_OWNER', 'ANTHROPIC_API_KEY', 'BRAIN_MODEL']) if (process.env[k]) env[k] = process.env[k];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(APP, 'server', 'index.js')}</string></array>
  <key>WorkingDirectory</key><string>${APP}</string>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${v}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(HOME, 'server.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(HOME, 'server.log')}</string>
</dict></plist>
`;
fs.writeFileSync(plist, xml, { mode: 0o600 });
run('bootstrap', domain, plist);
console.log(`brain service installed -> http://localhost:${env.PORT} (logs: ~/.brain/server.log)`);
