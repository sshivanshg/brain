# Brain design system

Brain is a **neural archive — the field notebook of a mind**. Warm paper/ink duality, one
phosphor signal colour, huge italic serif display set tight against mono specimen labels
(`FIG. 01 — RECALL`, counts, ids), hairline rules, numbered sections, marginalia. A living
neural field (canvas) sits behind the landing and, made of real memories, behind home.
**Plain, generic or "clean but forgettable" is a failed review.**

## Principles
- **One primary action per screen.** Capture is always one tap away (FAB on phone, button on desktop).
- **Anything in three taps.** Search is reachable from every screen with `/` or ⌘K.
- **Design every state:** first-run, loading (skeletons shaped like the content, not spinners
  over it), empty *with a next action*, error *with recovery*, offline, success, disabled,
  long text, permission denied (push, mic).
- **Respond on touch-down.** No action waits on the network to show feedback.
- **Motion has a job.** Short, interruptible; respect `prefers-reduced-motion`
  (keep crossfades, drop translation and loops).
- **Copy:** confident, personal, short. Never "Submit", "Error occurred", "No data".
  Say what happened and what to do next.

## Accessibility
44px minimum touch targets, WCAG AA 4.5:1 text contrast (`--faint` is for decoration and
placeholders only), visible focus rings, safe-area insets on phone, every icon button
has an `aria-label`, works with Dynamic Type / browser zoom at 200%.

## Tokens (`web/styles.css` `:root`; the extension mirrors them in `extension/ui.css`)
Never use a raw colour, radius or shadow outside the token blocks. A literal that appears
twice belongs in the tokens. One semantic colour per meaning.

| Token | Light (bone paper) | Dark (oxblood ink) | Use |
|---|---|---|---|
| `--bg` | `#ece4d6` | `#120d0c` | page |
| `--surface` / `--surface-2` | `#f4eee3` / `#e2d8c6` | `#1a1311` / `#241a17` | index cards / inset, skeletons |
| `--line` | `#cbbfa9` | `#3a2c27` | hairlines; `--text` is used for heavy rules |
| `--text` / `--muted` / `--faint` | `#1a1210` / `#5e5246` / `#9a8c7a` | `#ece4d6` / `#b3a593` / `#7a6c5f` | ink scale |
| `--accent` | `#3f5c00` | `#c8ff3d` | the one signal colour (phosphor lime) |
| `--mark` | lime 38% | lime 24% | search-hit highlight |
| `--danger` | `#a3261b` | `#ff6b55` | destructive, recording |
| `--field-node` / `--field-line` | ink 55% / 35% | bone 55% / 30% | neural field canvas |
| `--grain` / `--grain-opacity` | SVG fractal noise / 0.18 | same / 0.12 | film grain overlay |
| `--k-*` | per memory kind (pigments) | same | kind glyph + field node colour only |

**Why acid lime (phosphor):** it reads as a live signal on oxblood ink — an oscilloscope
trace, not a brand colour — and shares nothing with the violet/blue SaaS default. Orange was
rejected because it collides with the warm paper and the `decision`/`todo` kind pigments.
On bone paper the same hue is deepened to `#3f5c00` so it passes AA as text.

- **Type:** `--serif` Instrument Serif *italic* for display (landing up to ~148px, page h1
  40–72px, search input 40–96px, card titles 23px); `--mono` JetBrains Mono uppercase,
  tracked 0.1–0.14em, 10.5–12px for every label, button, meta strip and count; `--sans`
  Inter 15px for body prose only.
- **Kinds** are a glyph (◆ decision, ▲ lesson, ● preference, □ todo, ◇ session…) in the
  kind pigment, never a pill. Map lives in `web/lib.js`.
- **Radius:** `--radius` 3px (index cards, controls). Circles only for nodes, mic and FAB.
- **Spacing:** 4px grid — 4, 8, 12, 16, 24, 32, 48. Page gutter 16px on phone.
- **Neural field:** ≤110 nodes desktop / 48 phone, DPR capped at 2 / 1.5, paused when the
  tab is hidden, one still frame under reduced motion. Intro ignites it in ≤1.6s, once per
  session, skippable.

## Anti-slop list
No generic SaaS look (blue/violet accent, white cards on grey, centred hero + three cards), no decoration without a job,
no spinners over content or fake progress, no fades on everything, no emoji as UI icons
(the 🧠 chat button is the one deliberate exception), no "feels native" claims without a
recording of it running.
