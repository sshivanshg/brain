---
name: brain-code-principles
description: Brain's layering and code rules for the Hono server, MCP, hooks, CLI, PWA and Chrome extension. Use before adding a route, a store function, an MCP tool, a capture surface, or a web view.
---

# Brain code principles

Pair with [code-review-and-quality](../code-review-and-quality/SKILL.md) and
[test-driven-development](../test-driven-development/SKILL.md).

## Layering

```
capture surface (hooks · extension · CLI · PWA · MCP client)
      → HTTP API / MCP  (server/index.js routes, server/mcp.js tools — thin)
      → store           (server/store.js — the only place with SQL)
      → db              (server/db.js — schema + PGlite/Postgres adapter)
```

| Layer | Owns | Does not own |
|---|---|---|
| Route / MCP tool | parse input, call store, shape response | SQL, scrubbing rules |
| `store.js` | queries, upserts, briefing assembly, scrub on write | HTTP, auth |
| `util.js` | pure helpers: `scrub`, `dayOf`, `clip`, `orQuery` | I/O |
| `cortex.js` | optional LLM calls, always with a non-LLM fallback | storage |
| Hooks / extension / CLI | gather context, call the API with timeouts | business rules |

## Rules
- **Every write is scrubbed** (`scrub()` in the store), whoever writes.
- **Idempotent writers:** anything that can resend uses an `ext_key`
  (`session:<id>`, `browse:<day>:<url>`, `obsidian:<path>`, …).
- **Bounded:** every list query has a `LIMIT`; every outbound `fetch` has
  `AbortSignal.timeout`; hooks exit 0 and never block an agent.
- **Cold-start friendly:** no heavy work at import time on Vercel; reuse the pool.
- **Works without an API key:** any LLM feature must degrade to an extractive or
  agent-driven path (`dream` via Claude Code).
- **Small functions, early returns, no magic numbers;** name the constant.
- **No new dependency** without a line in the PR saying why the platform can't do it.
- **Web/extension:** vanilla JS, no build step; escape all user content (`esc()`),
  render markdown only through `md()`; tokens from `docs/DESIGN.md`, never literals.
- **Tests:** every behavior change adds a `test/*.test.js` case that fails without it
  (PGlite in a temp dir; no network).
