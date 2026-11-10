import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, EXT } from '../scripts/pack-extension.mjs';
import { originPattern, blocked, DEFAULT_BLOCKLIST } from '../extension/lib.js';

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

test('extension manifest is release-ready MV3', () => {
  assert.deepEqual(validateManifest(manifest, EXT), []);
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(!(manifest.host_permissions || []).some((h) => h === '<all_urls>' || /^\*:\/\/\*\/|^https?:\/\/\*\//.test(h)), 'no broad required hosts');
  assert.ok(manifest.optional_host_permissions.includes('<all_urls>'));
  assert.ok(manifest.minimum_chrome_version);
  assert.equal(manifest.homepage_url, 'https://github.com/sshivanshg/brain');
});

test('validateManifest flags broad hosts, bad versions and missing files', () => {
  const bad = { ...manifest, version: '1.0', host_permissions: ['<all_urls>'], icons: { 16: 'icons/nope.png' } };
  const errs = validateManifest(bad, EXT).join('\n');
  assert.match(errs, /version/);
  assert.match(errs, /all_urls/);
  assert.match(errs, /nope\.png/);
});

test('originPattern turns a Brain URL into a host permission', () => {
  assert.equal(originPattern('https://brain.example.com/'), 'https://brain.example.com/*');
  assert.equal(originPattern('http://localhost:4321'), 'http://localhost/*');
  assert.equal(originPattern('not a url'), null);
});

test('default blocklist covers banking, email and password managers', () => {
  for (const u of ['https://mail.google.com/x', 'https://www.chase.com/', 'https://my.1password.com/', 'https://onlinebanking.example.com/']) assert.ok(blocked(u, DEFAULT_BLOCKLIST), u);
  assert.ok(!blocked('https://example.com/post', DEFAULT_BLOCKLIST));
});
