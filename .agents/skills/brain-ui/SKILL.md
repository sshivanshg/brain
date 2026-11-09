---
name: brain-ui
description: Brain's UI/UX system for the PWA (web/) and Chrome extension (extension/). Use before designing, building or reviewing any screen, component, state, copy or motion; pair with ui-taste and apple-design for craft.
---

# Brain UI

The source of truth is [docs/DESIGN.md](../../../docs/DESIGN.md) — read it first.
For craft and references use [ui-taste](../ui-taste/SKILL.md); for motion, gestures
and depth use [apple-design](../apple-design/SKILL.md).

## Before building
1. Name the screen's one job and its one primary action.
2. List every state you will design: first-run, loading skeleton, empty + next action,
   error + recovery, offline, success, long text, permission denied.
3. Check it on a 375px phone and a desktop width, light and dark.

## While building
- Tokens only (`var(--…)`); add a token to both theme blocks if one is missing.
- 44px targets, visible focus, `aria-label` on icon buttons, AA contrast.
- Feedback on touch-down; never block UI on the network for something optimistic-safe.
- `prefers-reduced-motion`: crossfade only.
- Copy: short, personal, specific. Never "Submit", "Error occurred", "No data".

## Done means
Screenshots (phone + desktop, light + dark) attached to the PR, every listed state
shown or explained, and a design review: would this look out of place next to
Linear, Things or Arc? If it looks like a template, it isn't done.
