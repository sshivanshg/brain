import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, introMode, searchPath, mcpUrl, parseRoute } from '../web/lib.js';

test('signed-out visitors land on the manifesto for any route', () => {
  assert.equal(resolveRoute('/', false), 'landing');
  assert.equal(resolveRoute('/search', false), 'landing');
  assert.equal(resolveRoute('/about', false), 'landing');
  assert.equal(resolveRoute('/login', false), 'login');
});

test('signed-in routes map to views and /about stays reachable', () => {
  assert.equal(resolveRoute('/', true), 'home');
  assert.equal(resolveRoute('/about', true), 'landing');
  assert.equal(resolveRoute('/login', true), 'home');
  assert.equal(resolveRoute('/m/42', true), 'memory');
  assert.equal(resolveRoute('/project/x', true), 'project');
  assert.equal(resolveRoute('/nope', true), 'unknown');
});

test('intro plays once per session and only crossfades under reduced motion', () => {
  assert.equal(introMode({ seen: false, reducedMotion: false }), 'full');
  assert.equal(introMode({ seen: false, reducedMotion: true }), 'fade');
  assert.equal(introMode({ seen: true, reducedMotion: false }), 'none');
});

test('search path encodes the query and omits the all-kinds filter', () => {
  assert.equal(searchPath('neon branch', 'all'), '/api/memories?limit=40&q=neon%20branch');
  assert.equal(searchPath('', 'lesson'), '/api/memories?limit=40&kind=lesson');
});

test('route parsing splits path and query', () => {
  const r = parseRoute('#/search?q=a%20b&kind=todo');
  assert.equal(r.path, '/search');
  assert.equal(r.params.get('q'), 'a b');
  assert.equal(parseRoute('').path, '/');
});

test('mcp url is derived from origin', () => {
  assert.equal(mcpUrl('https://brain.example.com'), 'https://brain.example.com/mcp');
});
