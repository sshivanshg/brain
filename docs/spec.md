# Brain — design (2026-10-08)

## Intent
A single, private, hosted long-term memory that replaces per-tool agent memory systems. Every agent and capture surface writes to it automatically; the owner can browse, search and ask it from any device.

**Success:** a new agent session in any project starts already knowing the owner's preferences, that project's decisions and lessons, and recent work — without the owner repeating themselves; and anything read, decided or asked in the last months can be found in seconds.

## Shape
One Node service (Hono) + Postgres. No queues, no vector DB, no build step.

- **Store** (`server/store.js`) — one `memories` table. `kind` distinguishes sessions, decisions, lessons, preferences, browsing, digests, imported skills, etc. Weighted `tsvector` for search; `ext_key` makes every writer idempotent (sessions upsert by session id, page visits by `browse:<day>:<url>`, imports by source path).
- **Writers** — REST (`/api/*`), MCP (`/mcp`), Claude Code hooks, Chrome extension, PWA capture, importer.
- **Briefing** — `brief(project)` assembles profile → preferences → lessons → decisions → open todos → recent sessions → latest digest. Injected by the SessionStart hook and available as an MCP tool.
- **Dreaming** — raw days (pages, sessions) are consolidated into one digest per day; raw browse rows are then marked `compacted` and trimmed. Run either server-side (when `ANTHROPIC_API_KEY` is set, hourly) or by any MCP agent via the `dream` / `save_digest` tools and the `/mcp__brain__dream` prompt — so the system works with no API key at all.
- **Cortex** (`server/cortex.js`) — optional Claude API calls for page/session summaries, digests and Ask answers; extractive fallbacks otherwise.

## Safety
- Single bearer token for everything; constant-time comparison; required in production.
- Secrets are redacted on every write path (keys, JWTs, bearer tokens, DB URLs with passwords, `password=`-style pairs, private keys).
- Extension: focused-time threshold, default blocklist (mail, banking, payments, password managers), incognito ignored, pause switch, titles-only mode.
- Export everything as JSON; schema is plain Postgres.

## Not yet (deliberately)
Embeddings/semantic search, multi-user, OAuth for chat-app connectors, mobile native app, auto-generated skills from repeated workflows. Each can be added without changing the data model.
