# Phase 2 — daily-life brain (2026-10-10)

Surfaces chosen: phone/web app (A), terminal/Claude Code (D), and web agents. No server-side API key: all AI work runs through Claude Code on the owner's subscription.

| # | Piece | Status |
|---|---|---|
| 4 | `brain` CLI: brief, ask/find, add, today, dream, handoff | in progress |
| 2 | Nightly dream via a scheduled Claude Code task (`/mcp__brain__dream`) | in progress |
| 1 | Morning brief as web push from the installed PWA | next |
| 5 | Correction → lesson hook (UserPromptSubmit) | next |
| 9 | Extension in chatgpt.com / claude.ai / gemini: "brief me" button + save conversations | planned |
| 7 | OAuth on /mcp for claude.ai custom connectors | planned |
| 8 | ChatGPT Custom GPT action (OpenAPI) | planned |
| 6 | Cross-agent handoff (`brain handoff`, picked up by the next brief) | planned |
| 3 | iOS Shortcut capture | planned |

Constraints: no Anthropic key on the server (cortex stays off); hosted on Vercel + the owner's Neon Postgres; nothing breaks existing agent connections.
