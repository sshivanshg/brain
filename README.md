# brain

A private second brain that every agent, browser tab and device writes into — and reads from.

- **One memory for every agent.** A built-in MCP server (`/mcp`) gives Claude Code, Cursor, Codex, Windsurf, Claude Desktop — anything that speaks MCP — the same tools: `brief`, `remember`, `recall`, `timeline`, `dream`…
- **Agents write without being asked.** Claude Code hooks inject a project briefing at session start and ship every session (prompts, files changed, outcome) to the brain when it ends or compacts. A global instruction tells agents to save decisions, lessons and preferences the moment they happen.
- **Your browsing, compacted.** The Chrome extension records pages you actually read (focused time, not open tabs), what you copy, and everything your browser agent opens. Each night the day is consolidated into a digest and the raw pages are trimmed.
- **Phone-first web app.** Installable PWA: Today, Search, Ask, Projects, Browsing, Library, voice Capture, share-sheet target.
- **Yours.** Single-user token, secrets redacted before anything is stored, one-click JSON export, runs on any Postgres.

```
 Claude Code ──hooks──┐        ┌── Web app / PWA (phone, desktop)
 Cursor, Codex… ─MCP──┤        ├── Chrome extension
 iOS Shortcut ──REST──┼─ brain ┤
                      │ server │── Postgres (tsvector search)
                      └────────┘── optional cortex (Claude API): summaries, digests, answers
```

## Run it locally

```bash
npm install
npm start                # http://localhost:4321, embedded Postgres (PGlite) in ./data
cat data/token.txt       # your access token
```

Keep it running in the background on macOS (starts at login):

```bash
npm run service
```

## Wire up your agents

```bash
npm run connect                                   # local
npm run connect -- --url https://brain.you.dev --token brn_…   # after hosting
```

This writes `~/.brain/config.json`, adds `SessionStart` / `SessionEnd` / `PreCompact` hooks to `~/.claude/settings.json`, registers the `brain` MCP server for Claude Code (user scope) and Cursor, and adds a short "Brain protocol" block to `~/.claude/CLAUDE.md`. Every file it touches is backed up as `*.bak-brain` first. Re-running is safe.

In Claude Code you also get two commands from the MCP server: `/mcp__brain__dream` (consolidate past days into digests, lessons and profile updates) and `/mcp__brain__catch-me-up`.

## Import what you already have

```bash
npm run import          # agent-hub (skills, agents, prompts, playbooks, Claude memories) + every prompt in ~/.claude/history.jsonl
```

Moving from local to hosted: Settings → Export in the web app, then `npm run import -- --from-export brain-export.json --url https://… --token …`.

## Chrome extension

1. `chrome://extensions` → Developer mode → **Load unpacked** → the `extension/` folder.
2. In its settings, enter the brain URL and token → **Test connection**.

- Pages count after 20s of focused reading (configurable) or when you copy text from them.
- Tabs inside a tab group named "Claude"/"agent" are always logged and tagged `chrome-agent`.
- Email, banking, payments and password managers are blocked by default; incognito is never captured; "Pause capture" in the popup.
- Right-click → Save page / selection / link, or `Alt+Shift+B`.

## Phone

Open the brain URL on your phone → Share → **Add to Home Screen**. Capture supports dictation. On Android the app appears in the share sheet. For an iOS Shortcut: `POST /api/capture` with `{"text": "…"}` and `Authorization: Bearer <token>`.

## Host it

It's a plain Node server + Postgres, so any host works (Railway, Render, Fly, a VPS…):

- `DATABASE_URL` — any Postgres (Neon, Supabase, Railway…). Schema is created on boot.
- `BRAIN_TOKEN` — required in production (`node -e "console.log('brn_'+require('crypto').randomBytes(24).toString('base64url'))"`).
- `BRAIN_TZ`, `BRAIN_OWNER`, optional `ANTHROPIC_API_KEY` — see `.env.example`.
- `Dockerfile` included; otherwise `npm start` on Node ≥ 20.

Then re-run `npm run connect -- --url … --token …` on each machine and update the extension settings.

## API

All routes need `Authorization: Bearer <token>`.

| Route | |
|---|---|
| `GET /api/memories?q=&kind=&project=&day=&since=` | search (websearch syntax: quotes, `or`, `-not`) or list |
| `POST /api/memories` | `{kind, content, title?, project?, tags?, url?, pinned?}` |
| `GET/PATCH/DELETE /api/memories/:id` | read, edit, archive |
| `POST /api/capture` | quick note / link from anywhere |
| `POST /api/capture/browse` | page visits (extension) |
| `POST /api/sessions` | agent session transcript (hooks) |
| `GET /api/brief?project=` | the briefing agents get |
| `POST /api/ask` | `{question}` → answer with sources |
| `GET /api/stats`, `/api/projects`, `/api/digest?day=`, `/api/export` | |
| `POST /mcp` | MCP (Streamable HTTP) |

Kinds: `note session decision lesson preference profile todo fact browse highlight bookmark voice digest prompt prompt-log skill agent playbook doc memory`.

## Develop

```bash
npm run dev     # restart on change
npm test        # store + scrubber tests against a throwaway PGlite
```
