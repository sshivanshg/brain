#!/usr/bin/env node
// Validates extension/manifest.json and zips extension/ into dist/brain-extension-<version>.zip
// (the file uploaded to the Chrome Web Store and attached to GitHub Releases).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
export const EXT = path.join(ROOT, 'extension');
const BROAD = /^(<all_urls>|\*:\/\/\*\/.*|https?:\/\/\*\/.*)$/;

// Every file the manifest points at, so a typo fails here instead of in Chrome.
function referencedFiles(m) {
  const files = [m.background?.service_worker, m.action?.default_popup, m.options_page, m.options_ui?.page];
  files.push(...Object.values(m.icons || {}), ...Object.values(m.action?.default_icon || {}));
  for (const cs of m.content_scripts || []) files.push(...(cs.js || []), ...(cs.css || []));
  for (const w of m.web_accessible_resources || []) files.push(...(w.resources || []).filter((r) => !r.includes('*')));
  return files.filter(Boolean);
}

export function validateManifest(m, dir = EXT) {
  const errs = [];
  if (m.manifest_version !== 3) errs.push('manifest_version must be 3');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) errs.push(`version "${m.version}" must be semver MAJOR.MINOR.PATCH`);
  if (!m.name || !m.description) errs.push('name and description are required');
  if ((m.description || '').length > 132) errs.push('description must be ≤132 characters (Web Store limit)');
  if (!m.minimum_chrome_version) errs.push('minimum_chrome_version is required');
  for (const h of m.host_permissions || []) if (BROAD.test(h)) errs.push(`host_permissions must not include ${h} (<all_urls>-style); move it to optional_host_permissions`);
  for (const cs of m.content_scripts || []) for (const h of cs.matches || []) if (BROAD.test(h)) errs.push(`content_scripts must not match ${h}; register it after permission is granted`);
  for (const f of referencedFiles(m)) if (!fs.existsSync(path.join(dir, f))) errs.push(`missing file: ${f}`);
  return errs;
}

function pack() {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const errs = validateManifest(m);
  if (errs.length) { console.error(errs.map((e) => `✖ ${e}`).join('\n')); process.exit(1); }
  const out = path.join(ROOT, 'dist', `brain-extension-${m.version}.zip`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  const r = spawnSync('zip', ['-r', '-X', '-q', out, '.', '-x', '.*', '*/.*'], { cwd: EXT, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`✖ zip failed${r.error ? `: ${r.error.message}` : ''} (needs the zip CLI)`); process.exit(1); }
  console.log(`✔ ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) pack();
