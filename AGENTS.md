# Brain — agent guide

Keep this file small: it is a map, not a manual.

**What this is:** one memory layer for every AI agent the owner uses. Agents read a
briefing from it and write sessions, decisions, lessons and preferences into it.
Hosted on Vercel (`api/index.js` → `server/`), Postgres on Neon, PWA in `web/`,
Chrome extension in `extension/`, Claude Code hooks in `hooks/`, CLI in `bin/`.

## Current focus
See [docs/phase-2.md](docs/phase-2.md). Next theme: memory *quality* — well-written
lessons, dedupe, forgetting stale items — not more capture.

## Start here
1. `git status --short` — keep anyone else's in-progress work untouched.
2. `npm run setup` then `npm run check`. Record any failure that existed before you edit.
3. Work on a branch: `feat/<slug>` or `fix/<slug>` from `main`. `main` is production;
   it only moves through PRs (the pre-push hook enforces this).
4. Plan with [TASK_TEMPLATE](docs/agent-development/TASK_TEMPLATE.md) for anything non-trivial.
5. Before handing off: `npm run check` green, a fresh reviewer pass per
   [REVIEW.md](docs/agent-development/REVIEW.md), PR from the
   [template](.github/PULL_REQUEST_TEMPLATE.md) with evidence.

## Rules
- Evidence over claims: say what you ran and what it showed. A check you could not run
  is stated, never skipped silently.
- Every behavior change ships with a test that fails without it (`test/`).
- UI follows [docs/DESIGN.md](docs/DESIGN.md). Plain, generic or "clean but forgettable"
  is a failed review.
- Commit messages: imperative, short, no AI/co-author trailers. Commit only your task's files.
- Never commit `data/`, tokens, `.env*`, exports or connection strings.
- Use the brain itself: `brief` at start, `remember` decisions and lessons as they happen.

## Subagents
Give each one disjoint files and an exact brief (task, allowed paths, tests, evidence
required). Never commit subagent output without reading it. Agents live in
`.claude/agents/`; process skills in `.agents/skills/` (symlinked into `.claude/skills/`).

## Commands
| | |
|---|---|
| `npm run check` | syntax + design tokens + manifests + tests (what CI runs) |
| `npm run dev` | local server on :4321 with embedded PGlite |
| `npm test` | store/scrubber tests |
| `vercel deploy --prod` | production (normally via merge to `main`) |
