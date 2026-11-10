import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkill, rawUrl, slug } from '../server/skills.js';

test('parseSkill reads frontmatter name and description', () => {
  const s = parseSkill('---\nname: brain-ui\ndescription: "UI rules for Brain"\n---\n# Title\nBody');
  assert.deepEqual(s, { name: 'brain-ui', description: 'UI rules for Brain' });
});

test('parseSkill falls back to heading and first paragraph', () => {
  const s = parseSkill('# Release Checklist\n\nSteps to ship safely.\n\n- one');
  assert.equal(s.name, 'Release Checklist');
  assert.equal(s.description, 'Steps to ship safely.');
});

test('rawUrl turns GitHub page links into raw files and rejects http', () => {
  assert.equal(rawUrl('https://github.com/a/b/blob/main/skills/x/SKILL.md'), 'https://raw.githubusercontent.com/a/b/main/skills/x/SKILL.md');
  assert.equal(rawUrl('https://github.com/a/b/tree/main/skills/x'), 'https://raw.githubusercontent.com/a/b/main/skills/x/SKILL.md');
  assert.throws(() => rawUrl('http://example.com/x.md'));
});

test('slug normalises names', () => assert.equal(slug(' Release Checklist! '), 'release-checklist'));
