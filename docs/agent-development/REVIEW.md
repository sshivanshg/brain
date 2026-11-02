# Reviewer brief

Review every non-trivial change before merge. Do not rubber-stamp.
The author of a diff may not approve it. Do not merge or hand off with
**Critical** or **Required** findings still open.

Read [code-review-and-quality](../../.agents/skills/code-review-and-quality/SKILL.md).
For auth/OAuth, capture surfaces, scrubbing or schema, also apply
[security-and-hardening](../../.agents/skills/security-and-hardening/SKILL.md).

## Five-axis review

1. **Correctness** — matches the task; error, empty and offline paths covered;
   tests assert behavior, not implementation trivia.
2. **Readability** — a second engineer can follow it without the author.
   Small functions, early returns, no packed one-liners.
3. **Architecture** — fits the layout: `server/store.js` owns SQL, routes stay thin,
   `server/mcp.js` only adapts tools to the store, the web app never builds SQL-ish
   logic, capture surfaces (hooks, extension, CLI) only talk to the HTTP API.
4. **Security & privacy** — every write path goes through `scrub()`; no secrets in
   logs, URLs or commits; master token vs OAuth access token scopes respected;
   nothing new captured without a blocklist/opt-out story.
5. **Performance** — no unbounded queries (every list has a LIMIT), no per-request
   heavy setup on Vercel cold starts, outbound fetches have timeouts.

## Ratchet

Fail the review (Required or Critical) if any of these land:

- A write path that bypasses `scrub()`, or a token/secret in tracked files.
- SQL outside `server/store.js` (except schema in `server/db.js` and push subs).
- A capture surface that blocks the user's agent (hooks must time out and exit 0).
- A hardcoded colour, radius or spacing literal in `web/` or `extension/` that
  isn't a token (see [DESIGN.md](../DESIGN.md)).
- A new dependency without a reason in the PR.

## Severity

| Label | Meaning |
| --- | --- |
| **Critical:** | Blocks merge — security, data loss, broken behavior |
| *(no prefix)* / **Required** | Must fix before merge or handoff |
| **Optional:** / **Consider:** | Suggestion |
| **Nit:** | Style only; author may ignore |
| **FYI** | Context; no action |

Lead with correctness and security. A few high-conviction comments beat a
long nit list. "LGTM" without evidence of the five axes is not a review.
