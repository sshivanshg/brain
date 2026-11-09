#!/usr/bin/env node
// One runner for every quality gate. `npm run check` runs them all (what CI runs).
//   node scripts/quality.mjs [check|syntax|design|manifests|test]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES = ['server', 'web', 'extension', 'hooks', 'scripts', 'bin', 'api', 'test'];
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)])) : []);
const files = SOURCES.flatMap((d) => walk(path.join(ROOT, d)));
let failed = 0;
const fail = (msg) => { failed++; console.error(`✖ ${msg}`); };

function syntax() {
  for (const f of files.filter((f) => /\.(m?js)$/.test(f))) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) fail(`syntax ${path.relative(ROOT, f)}\n${r.stderr}`);
  }
}

// Colours belong in token blocks only (:root, colour-scheme media, [data-theme]); never inline in rules or JS.
// Brace depth tracks which block a line is in, so responsive @media blocks are still linted.
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/;
const TOKEN_SCOPE = /(:root|prefers-color-scheme|\[data-theme)/;
function design() {
  for (const f of files.filter((f) => /(web|extension)\/.*\.(css|js|html)$/.test(f) && !f.endsWith('sw.js'))) {
    let depth = 0;
    let tokenDepth = null; // depth at which the current token scope opened
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (tokenDepth === null && TOKEN_SCOPE.test(line) && line.includes('{')) tokenDepth = depth;
      const inTokens = tokenDepth !== null;
      depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (tokenDepth !== null && depth <= tokenDepth) tokenDepth = null;
      if (inTokens || line.includes('design-ok') || /^\s*(\/\/|\*|<meta|<link)/.test(line) || /^\s*--[\w-]+\s*:/.test(line)) return;
      const code = line.replace(/(href|src)="[^"]*"|'#\/[^']*'|`#\/[^`]*`/g, '');
      if (COLOUR.test(code)) fail(`design ${path.relative(ROOT, f)}:${i + 1} raw colour — use a token (docs/DESIGN.md)`);
    });
  }
}

function manifests() {
  for (const f of ['extension/manifest.json', 'web/manifest.webmanifest', 'vercel.json', 'package.json']) {
    try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { fail(`manifest ${f}: ${e.message}`); }
  }
}

function test() {
  const r = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) fail(`tests${r.error ? `: ${r.error.message}` : ''}`);
}

const mode = process.argv[2] || 'check';
const steps = { syntax, design, manifests, test };
for (const [name, fn] of Object.entries(steps)) if (mode === 'check' || mode === name) fn();
if (failed) { console.error(`\n${failed} problem(s)`); process.exit(1); }
console.log(`✔ ${mode} passed`);
