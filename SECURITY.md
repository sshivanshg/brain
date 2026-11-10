# Security policy

Brain stores people's working lives: sessions, decisions, browsing. We take reports seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private
[security advisory form](https://github.com/sshivanshg/brain/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within 72 hours and a fix or a plan within 14 days. We credit reporters in the
release notes unless you'd rather stay anonymous.

## Scope

In scope: the server (`server/`), MCP endpoint, OAuth flow, hooks, CLI, Chrome extension and web app.
Especially interesting: auth bypass, token leakage, secrets surviving `scrub()`, XSS in the web app
or extension, SSRF through skill import, and anything that exposes one user's memories to another.

## Supported versions

Only `main` is supported. Self-hosters should update regularly.

## Hardening notes for self-hosters

- Use a long random `BRAIN_TOKEN` (`openssl rand -base64 32`) and never commit it.
- Serve over HTTPS only.
- Brain redacts common secret formats before storing, but treat it as sensitive data anyway.
