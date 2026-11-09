# Contributing

Read [AGENTS.md](AGENTS.md) first — it is the map for humans and agents alike.

1. `git status --short`; keep other in-progress work untouched.
2. `npm run setup` (installs deps, enables the git hooks), then `npm run check`.
3. Branch `feat/<slug>` or `fix/<slug>` from `main`. Plan non-trivial work with
   [TASK_TEMPLATE](docs/agent-development/TASK_TEMPLATE.md).
4. Build in thin slices with a test per behavior change. UI follows [DESIGN.md](docs/DESIGN.md).
5. `npm run check` green, then a reviewer pass ([REVIEW.md](docs/agent-development/REVIEW.md))
   by someone (or an agent) other than the author.
6. `gh pr create --base main` using the PR template. Merging to `main` deploys production.

Skills for this repo live in `.agents/skills/` — start with `brain-code-principles`, `brain-ui`,
`ui-taste`, `code-review-and-quality` and `test-driven-development`.
