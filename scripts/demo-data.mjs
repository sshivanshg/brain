// Generates server/demo-data.json: a fictional, heavily used brain for the public demo.
// Dates are stored as "days ago" + hour so the demo always looks current when it boots.
// Run: node scripts/demo-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const rows = [];
const add = (m) => rows.push({ hour: 9 + Math.floor(rnd() * 10), ago: 0, source: 'claude-code', tags: [], ...m });

const PROJECTS = {
  'atlas-web': 'Next.js dashboard for Atlas, a B2B invoicing SaaS',
  'atlas-api': 'Go API + Postgres behind Atlas',
  'pocket-ml': 'Receipt OCR + categorisation model',
  'field-notes': 'SwiftUI journaling app for hikers',
  'infra': 'Terraform, CI and observability for everything',
};

// ---------- profile + global preferences ----------
add({ kind: 'profile', title: 'About Maya', source: 'brain', ago: 80, body: `# Maya Okafor (demo person)

Independent full-stack engineer and indie hacker. Builds Atlas (B2B invoicing) with one co-founder and a few side projects.

- **Stack:** TypeScript, Next.js, Go, Postgres, SwiftUI, Terraform on AWS.
- **Works best:** mornings for deep work, afternoons for reviews and calls.
- **Cares about:** small PRs, boring tech, fast feedback loops, accessible UI.
- **Currently:** shipping Atlas usage-based billing, training a better receipt classifier, Field Notes 2.0 beta.` });

const prefs = [
  ['Small PRs with a test per behaviour', 'Keep every PR reviewable in one sitting (< 400 lines). Each behaviour change gets a test that failed first.'],
  ['Use pnpm, never npm, in JS repos', 'All JS repos use pnpm workspaces; npm lockfiles get deleted on sight.'],
  ['Explain trade-offs before big refactors', 'For anything touching more than 3 modules, write a 5-line plan with alternatives before coding.'],
  ['No AI co-author trailers in commits', 'Commits and PRs carry no AI attribution lines.'],
  ['Prefer Postgres over adding a new datastore', 'Queues, search and caches start in Postgres (SKIP LOCKED, tsvector, unlogged tables) until proven otherwise.'],
  ['Copy is short, confident and specific', 'Never "Something went wrong". Say what happened and what to do next.'],
  ['Dark mode and 44px touch targets by default', 'Every new screen ships with dark mode, visible focus and 44px targets.'],
  ['Feature flags for anything user-facing', 'Ship behind a flag, dogfood a week, then roll out.'],
];
prefs.forEach(([title, body], i) => add({ kind: 'preference', title, body, ago: 75 - i * 6, pinned: i < 2 }));

// ---------- per-project knowledge ----------
const K = {
  'atlas-web': {
    decisions: [
      ['Use React Server Components for the invoice list', 'Server components cut client JS by 38% on /invoices; interactivity stays in small client islands.'],
      ['TanStack Query only for client-side mutations', 'Reads come from RSC; mutations use TanStack Query with optimistic updates and rollback.'],
      ['Search runs as you type with a 220ms debounce', 'Feels instant without hammering the API; aborts in-flight requests on new input.'],
      ['Adopt Radix primitives, style with tokens', 'Accessibility for free; no component library theme fights.'],
      ['Usage-based billing UI shows projected month-end cost', 'Customers asked "what will I pay?" more than anything else in interviews.'],
    ],
    lessons: [
      ['Hydration mismatch from Date.now() in a server component', 'Render times on the client or pass a fixed timestamp from the server.'],
      ['Playwright flakes came from animations, not timing', 'Disable animations in test mode via prefers-reduced-motion emulation.'],
      ['Never put secrets in NEXT_PUBLIC_ env vars', 'They ship to the browser. Rotated the leaked Stripe restricted key.'],
    ],
    facts: [['Deployed on Vercel, preview per PR', 'Production branch is main; previews protected with password.'], ['Design tokens live in packages/ui/tokens.css', 'Colours, radii and spacing; lint blocks raw hex.']],
    todos: ['Empty state for the billing page', 'Keyboard shortcut cheat sheet (?)', 'Migrate charts to the new tokens'],
  },
  'atlas-api': {
    decisions: [
      ['Row-level security for tenant isolation', 'RLS over app-level filters so every query is scoped even if a handler forgets the tenant check.'],
      ['Background jobs on Postgres with SKIP LOCKED', 'No Redis. A jobs table with SKIP LOCKED handles 2k jobs/min with room to spare.'],
      ['Idempotency keys on every POST', 'Clients send Idempotency-Key; stored 24h; retries return the original response.'],
      ['Stripe metered billing, reported hourly', 'Hourly usage reports keep invoices accurate without hitting rate limits.'],
      ['sqlc for queries, no ORM', 'Typed queries generated from SQL; reviewers read real SQL.'],
    ],
    lessons: [
      ['Run migrations before deploying the worker', 'The worker crashed on a missing column; deploy order is migrate → api → worker.'],
      ['Connection storms after deploys', 'Use the pooled (-pooler) host and cap pool size at 10 per instance.'],
      ['Timezone bugs in monthly invoices', 'Store UTC, compute billing periods in the customer timezone, test DST boundaries.'],
      ['Stripe webhooks arrive out of order', 'Fetch the latest object from Stripe instead of trusting webhook payload order.'],
    ],
    facts: [['Production Postgres is on Neon, us-east-2', 'Branch per PR for previews; pooled connections.'], ['p95 latency budget is 250ms', 'Alert at 400ms for 5 minutes.']],
    todos: ['Rate limit the public API per key', 'Backfill usage for March', 'Add OpenAPI examples for webhooks'],
  },
  'pocket-ml': {
    decisions: [
      ['Fine-tune a small vision model instead of OCR + rules', 'Rules plateaued at 81% accuracy; fine-tuned model reached 93% on the holdout set.'],
      ['Label with a 2-pass review', 'Second reviewer only on disagreements; cut labelling time 40%.'],
      ['Track experiments in a single Postgres table', 'Good enough for 3 people; no MLflow server to babysit.'],
    ],
    lessons: [
      ['Data leakage via duplicated receipts', 'Same receipt photographed twice landed in train and test. Dedupe by perceptual hash first.'],
      ['Class imbalance hid a bad category', '"Travel" had 2% of samples; per-class recall exposed it.'],
    ],
    facts: [['Holdout set is frozen at 4,200 receipts', 'Never train on it; versioned in S3.']],
    todos: ['Try test-time augmentation', 'Calibrate confidence scores'],
  },
  'field-notes': {
    decisions: [
      ['SwiftData over Core Data for 2.0', 'Simpler model code; migration tested on 3 real user stores.'],
      ['Offline-first sync with CloudKit', 'Hikers have no signal; sync when back online, last-writer-wins per field.'],
      ['Map tiles cached per trail', 'Download a trail pack before leaving; 40MB average.'],
    ],
    lessons: [
      ['Background location drains battery', 'Use significant-change updates unless recording a track.'],
      ['TestFlight build rejected for missing privacy string', 'Add NSLocationAlwaysAndWhenInUseUsageDescription before upload.'],
    ],
    facts: [['Minimum iOS is 17', 'Covers 94% of active users.']],
    todos: ['Widget for today’s hike', 'Export notes as GPX + Markdown'],
  },
  infra: {
    decisions: [
      ['Terraform workspaces per environment', 'staging and prod share modules; state in S3 with locking.'],
      ['OpenTelemetry everywhere, one collector', 'Traces + metrics to one backend; sampling 10% in prod.'],
      ['CI runs on self-hosted runners', 'Hosted minutes ran out; one beefy runner is cheaper and faster.'],
    ],
    lessons: [
      ['Terraform destroyed a prod bucket on rename', 'Use moved blocks for renames and prevent_destroy on stateful resources.'],
      ['Alert fatigue from noisy disk alerts', 'Alert on time-to-full, not percentage.'],
    ],
    facts: [['On-call rotation is weekly', 'Runbooks live in infra/runbooks.']],
    todos: ['Rotate the CI deploy keys', 'Budget alert at 80% of monthly spend'],
  },
};

for (const [project, k] of Object.entries(K)) {
  k.decisions.forEach(([title, body]) => add({ kind: 'decision', project, title, body, ago: Math.floor(rnd() * 80) }));
  k.lessons.forEach(([title, body]) => add({ kind: 'lesson', project, title, body, ago: Math.floor(rnd() * 70) }));
  k.facts.forEach(([title, body]) => add({ kind: 'fact', project, title, body, ago: Math.floor(rnd() * 85), pinned: true }));
  k.todos.forEach((title) => add({ kind: 'todo', project, title, body: title, ago: Math.floor(rnd() * 20) }));
}

// ---------- agent sessions: the bulk of a busy brain ----------
const VERBS = ['Fixed', 'Added', 'Refactored', 'Investigated', 'Reviewed', 'Shipped', 'Tested', 'Profiled', 'Documented', 'Migrated'];
const THINGS = {
  'atlas-web': ['invoice table pagination', 'billing settings form', 'dark mode tokens', 'onboarding checklist', 'CSV export', 'search command palette', 'usage chart', 'team invites flow'],
  'atlas-api': ['webhook retries', 'usage aggregation job', 'tenant RLS policies', 'invoice PDF rendering', 'rate limiter', 'Stripe sync', 'audit log endpoint', 'API key rotation'],
  'pocket-ml': ['data loader', 'augmentation pipeline', 'eval script', 'label review tool', 'confusion matrix report', 'export to CoreML'],
  'field-notes': ['trail pack downloads', 'note editor', 'photo attachments', 'CloudKit sync conflicts', 'map clustering', 'widget timeline'],
  infra: ['Terraform modules', 'collector config', 'CI cache', 'backup restore drill', 'cost dashboard', 'DNS records'],
};
const AGENTS = ['claude-code', 'claude-code', 'claude-code', 'cursor', 'codex'];
for (let ago = 0; ago < 90; ago++) {
  const n = ago < 7 ? 5 : ago % 7 === 5 || ago % 7 === 6 ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const project = pick(Object.keys(THINGS));
    const thing = pick(THINGS[project]);
    const verb = pick(VERBS);
    add({
      kind: 'session', project, source: pick(AGENTS), ago,
      title: `${verb} ${thing}`,
      summary: `${verb} ${thing} in ${project}. ${pick(['Tests pass.', 'Opened a PR for review.', 'Left a follow-up todo.', 'Benchmarked before/after.', 'Paired with the reviewer agent.'])}`,
      body: `## Session\n\n**Goal:** ${verb.toLowerCase()} ${thing}.\n\n- Read the relevant modules and the brain briefing for ${project}.\n- ${pick(['Wrote a failing test first, then the fix.', 'Traced the issue to a missing index.', 'Split the change into two PRs.', 'Profiled and removed an N+1 query.', 'Updated docs and the changelog.'])}\n- ${pick(['All checks green.', 'Reviewer found one edge case; fixed.', 'Deployed to staging and smoke-tested.', 'Measured a 30% speed-up.'])}\n\n**Files:** ${pick(['src/', 'internal/', 'app/', 'modules/'])}${thing.replace(/\s+/g, '-')}.*`,
      meta: { prompts: 3 + Math.floor(rnd() * 20) },
    });
  }
}

// ---------- reading: browse + highlights ----------
const READS = [
  ['Postgres SKIP LOCKED job queues', 'https://example.com/postgres-skip-locked', 'How to build reliable job queues on plain Postgres.'],
  ['Hybrid search: BM25 + vectors with reciprocal rank fusion', 'https://example.com/hybrid-search', 'Combine keyword and semantic results with RRF.'],
  ['Designing idempotent APIs', 'https://example.com/idempotency', 'Idempotency keys, retries and safe replays.'],
  ['React Server Components in practice', 'https://example.com/rsc-practice', 'Where RSC shines and where client islands still matter.'],
  ['Model Context Protocol overview', 'https://modelcontextprotocol.io', 'An open protocol connecting AI apps to tools and data.'],
  ['WCAG contrast explained', 'https://example.com/contrast', 'Why 4.5:1 matters and how to test it.'],
  ['SwiftData migration guide', 'https://example.com/swiftdata', 'Schema versions and lightweight migrations.'],
  ['Reducing alert fatigue', 'https://example.com/alert-fatigue', 'Alert on symptoms, not causes.'],
  ['Fine-tuning small vision models', 'https://example.com/vision-finetune', 'Data quality beats model size.'],
  ['Terraform moved blocks', 'https://example.com/terraform-moved', 'Rename resources without destroying them.'],
  ['Usage-based pricing UX', 'https://example.com/usage-pricing', 'Show projected cost, not just consumption.'],
  ['OpenTelemetry sampling strategies', 'https://example.com/otel-sampling', 'Head vs tail sampling trade-offs.'],
];
for (let ago = 0; ago < 60; ago++) {
  for (let i = 0; i < (ago < 5 ? 4 : 2); i++) {
    const [title, url, summary] = pick(READS);
    add({ kind: 'browse', source: 'chrome', title, url, summary, body: `${summary}\n\nRead for ${30 + Math.floor(rnd() * 400)}s.`, ago, ext_key: `browse:${url}:${ago}:${i}`, meta: { dwell: 30 + Math.floor(rnd() * 400) } });
  }
}
READS.slice(0, 6).forEach(([title, url, summary]) => add({ kind: 'highlight', source: 'chrome', title, url, body: `> ${summary}`, ago: Math.floor(rnd() * 30) }));

// ---------- daily digests ----------
for (let ago = 1; ago <= 30; ago++) {
  const ps = [...new Set(rows.filter((r) => r.ago === ago && r.project).map((r) => r.project))];
  add({
    kind: 'digest', source: 'brain', ago, title: `Digest`,
    body: `## Worked on\n${ps.map((p) => `- **${p}**: ${rows.filter((r) => r.ago === ago && r.project === p && r.kind === 'session').map((r) => r.title.toLowerCase()).slice(0, 3).join('; ')}`).join('\n')}\n\n## Read & learned\n- ${pick(READS)[0]}\n- ${pick(READS)[0]}\n\n## Open threads\n- ${pick(Object.values(K)).todos[0]}`,
  });
}

// ---------- notes, prompts, skills ----------
const NOTES = [
  ['Pricing idea: annual plan with usage credits', 'Customers prepay credits; overage billed monthly.'],
  ['Interview notes: finance lead at a 30-person agency', 'Pain: chasing late invoices. Wants automatic reminders with tone control.'],
  ['Talk outline: "Boring tech for small teams"', '1. Postgres for everything 2. Monolith first 3. Feature flags 4. Measure before scaling'],
  ['Hike: Mount Tam loop, 14km', 'Test Field Notes offline sync on the ridge; no signal after the second fork.'],
];
NOTES.forEach(([title, body]) => add({ kind: 'note', source: 'phone', title, body, ago: Math.floor(rnd() * 40) }));
add({ kind: 'prompt', title: 'Code review prompt', body: 'Review this diff on five axes: correctness, readability, architecture, security, performance. Lead with the highest-risk finding.', ago: 50 });

const skillsDir = path.join(root, '.agents', 'skills');
for (const name of ['test-driven-development', 'code-review-and-quality', 'security-and-hardening', 'incremental-implementation', 'debugging-and-error-recovery', 'planning-and-task-breakdown']) {
  const file = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const md = fs.readFileSync(file, 'utf8');
  const description = md.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || '';
  add({ kind: 'skill', source: 'web', title: name, summary: description, body: md, ago: 40, tags: ['skill'], ext_key: `skill:*:${name}`, meta: { skill: { name, description } } });
}
add({ kind: 'skill', source: 'web', project: 'atlas-web', title: 'atlas-ui', summary: 'Atlas UI rules: tokens only, Radix primitives, every state designed, 44px targets.', body: '---\nname: atlas-ui\ndescription: Atlas UI rules: tokens only, Radix primitives, every state designed, 44px targets.\n---\n# Atlas UI\n\n- Colours, radii and spacing come from `packages/ui/tokens.css`.\n- Build on Radix primitives.\n- Design loading, empty, error and success states for every screen.\n- 44px minimum touch targets; visible focus rings.', ago: 30, tags: ['skill'], ext_key: 'skill:atlas-web:atlas-ui', meta: { skill: { name: 'atlas-ui' } } });

const out = path.join(root, 'server', 'demo-data.json');
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`wrote ${rows.length} demo memories → server/demo-data.json`);
