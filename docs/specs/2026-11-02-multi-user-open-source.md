# Spec: multi-user Brain + open source (2026-11-02)

## Intent
Anyone can sign up to the hosted Brain or self-host it, connect their agents, and get the
same "every agent already knows me" experience — with their memories invisible to everyone else.
The repo becomes a public AGPL-3.0 project people can trust and contribute to.

**Success**
- A new person goes from landing page → GitHub sign-in → first agent connected → first
  briefing in under 5 minutes, without reading docs.
- No request authenticated as user A can read, search, export or modify user B's data
  (proved by tests on every route and MCP tool).
- A stranger can clone, `npm run setup`, `npm run dev` and use it locally in one go.

## Decisions
| | Choice |
|---|---|
| Deployments | Both: hosted (Vercel + Neon) and self-host (Docker / Node + any Postgres, PGlite locally) |
| Sign-in | GitHub OAuth only (more providers later) |
| Agent auth | Per-user API keys (`brn_…`), many per user, named, revocable, shown once, stored hashed |
| License | AGPL-3.0 |
| Name | Brain |

## Modes
- **Multi-user** when `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set (hosted, or a team self-host).
  Optional `BRAIN_ALLOWED_GITHUB` (comma list of logins/orgs) to make an instance invite-only.
- **Single-user** otherwise (today's behaviour): `BRAIN_TOKEN` is the owner's key. Keeps
  local/self-host zero-config.

## Data model
- `users(id, github_id unique, login, name, avatar_url, created_at, last_seen_at)`
- `api_keys(id, user_id, name, prefix, hash, created_at, last_used_at, revoked_at)` — SHA-256 hash; the
  plaintext is shown once.
- `memories.user_id` NOT NULL, FK, indexed; `ext_key` unique per `(user_id, ext_key)`.
- `push_subs.user_id`.
- Web sessions: signed, httpOnly, SameSite=Lax cookie (HMAC with `SESSION_SECRET`), 30 days.
- Migration: existing rows are assigned to the instance owner (`BRAIN_OWNER_GITHUB`) on first sign-in.

## Isolation (defence in depth)
1. **Store is user-scoped:** `createStore(db, userId)`; every query takes `user_id` — no unscoped
   query path exists. A test enumerates every route and MCP tool with two users.
2. **Postgres row-level security** on `memories`, `api_keys`, `push_subs` keyed on
   `current_setting('app.user_id')`, set per request in a transaction. (Phase B — after 1 ships.)
3. Exports, digests, briefs, push and cron all iterate per user.

## Auth surfaces
- Web: `/auth/github` → GitHub → `/auth/github/callback` → cookie → app. Sign out clears it.
- API, hooks, CLI, extension: `Authorization: Bearer brn_…` (per-user key).
- MCP OAuth (claude.ai/ChatGPT connectors): the consent page uses the web session (sign in with
  GitHub if needed), then issues an access token bound to that user.
- Abuse: per-key rate limit, request body cap (1 MB), memory size cap, account deletion that
  really deletes.

## Onboarding (web)
1. Landing page (signed out): what it is, a 20-second demo, "Sign in with GitHub".
2. Welcome: name your first key → copy-ready setup for Claude Code (`npx brain-connect …`),
   Cursor, claude.ai connector, Chrome extension.
3. "Waiting for your first memory…" live check that turns green when an agent writes.
4. Optional imports: Obsidian vault (upload/zip), Claude Code memories.
Settings gains: API keys (create/revoke), connected apps, export, delete account.

## Open-source readiness
- `LICENSE` (AGPL-3.0), `SECURITY.md` (private disclosure), `CODE_OF_CONDUCT.md`, issue/PR templates,
  public README (hero, demo GIF, quickstart, self-host, architecture), `CONTRIBUTING.md` (exists).
- Remove owner-specific defaults (Ditch project names, vault paths, `Asia/Kolkata`, personal URLs);
  move them to env/config.
- Secret scan of the full git history before the repo goes public; rotate anything ever committed.
- Hosted instance gets a privacy page and terms (it stores other people's work context).
- Making the repo public is a separate, explicit owner step at the end.

## Delivery slices (each its own PR, tests first)
1. Users + GitHub sign-in + cookie sessions (single-user mode untouched).
2. `user_id` everywhere + user-scoped store + isolation test suite + owner migration.
3. Per-user API keys; hooks/CLI/extension/connect use them.
4. MCP OAuth bound to users.
5. Onboarding flow + landing page + settings (keys, delete account).
6. Postgres RLS.
7. Open-source pass: license, docs, de-personalising, history scan.
8. Go public (owner's call).

## Out of scope (now)
Teams/shared memories, billing, other sign-in providers, end-to-end encryption, native apps.
