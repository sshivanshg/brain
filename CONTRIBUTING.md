# Contributing to Brain

Thanks for helping. Brain is small on purpose: plain Node, no framework in the web app, one
Postgres table. Changes that keep it that way are easiest to land.

## Ground rules

- Be kind — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Security issues go through [SECURITY.md](SECURITY.md), never public issues.
- By contributing you agree your work is licensed under [AGPL-3.0](LICENSE).

## Getting started

```bash
git clone https://github.com/sshivanshg/brain && cd brain
nvm use                 # Node 24
npm run setup           # deps + git hooks
npm run dev             # http://localhost:4321, PGlite in ./data
npm run check           # what CI runs: syntax, design lint, manifests, tests
```

Read [AGENTS.md](AGENTS.md) — the map of the codebase for humans and coding agents alike.

## Where things live

| Path | |
|---|---|
| `server/store.js` | all SQL (the only place queries live, besides the schema in `db.js`) |
| `server/index.js` | thin HTTP routes |
| `server/mcp.js`, `server/skills.js` | MCP tools |
| `web/` | the PWA — vanilla ES modules, no build step |
| `extension/` | Chrome extension (MV3) |
| `hooks/`, `bin/`, `scripts/` | Claude Code hooks, CLI, setup/import scripts |

## Making a change

1. Open or pick an issue; for anything non-trivial, agree on the approach first.
2. Branch from `main`: `feat/<slug>` or `fix/<slug>`.
3. Work in thin slices with a test for each behaviour change (`node --test`).
4. UI work follows [docs/DESIGN.md](docs/DESIGN.md): tokens only, every state designed,
   44px targets, works at 375px and 200% zoom. `npm run check:design` enforces the tokens.
5. `npm run check` must pass. Explain any new dependency in the PR.
6. Open a PR with the template. A reviewer other than the author checks it against
   [REVIEW.md](docs/agent-development/REVIEW.md) (correctness, readability, architecture,
   security & privacy, performance).

## Rules that fail review

- A write path that skips `scrub()`, or a secret in tracked files.
- SQL outside `server/store.js` / `server/db.js`.
- A capture surface that can block the user's agent (hooks must time out and exit 0).
- Hard-coded colours, radii or spacing in `web/` or `extension/`.

## Using coding agents

Agents are welcome. Repo skills live in `.agents/skills/` (start with `brain-code-principles`,
`brain-ui`, `code-review-and-quality`, `test-driven-development`). You're responsible for what
your agent submits — review it like your own code.
