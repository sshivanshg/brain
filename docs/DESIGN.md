# Brain design system

Brain should feel like a calm, precise instrument you trust with your whole working life:
quiet ink surfaces, one violet accent, editorial serif headlines, dense but legible data.
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

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f4ef` | `#0c0b10` | page |
| `--surface` / `--surface-2` | `#ffffff` / `#efece4` | `#15141b` / `#1d1b25` | cards / inset, chips |
| `--line` | `#e2ddd1` | `#2a2733` | borders |
| `--text` / `--muted` / `--faint` | `#1c1a17` / `#6f6a60` / `#a19b8f` | `#ece9f3` / `#9a95a8` / `#6b6678` | ink scale |
| `--accent` | `#6d4dff` | `#9d86ff` | the one action colour |
| `--k-*` | per memory kind | same | kind dots only (session, decision, lesson…) |

- **Type:** `--serif` Instrument Serif for display (h1 34–48px, tiles), `--sans` Inter 15px body,
  `--mono` JetBrains Mono for code/URLs. Uppercase 13px/600 tracked section labels.
- **Radius:** `--radius` 14px cards; 9–12px controls; 999px pills.
- **Spacing:** 4px grid — 4, 8, 12, 16, 24, 32, 48. Page gutter 16px on phone.

## Anti-slop list
No generic SaaS look (blue accent, white cards on grey), no decoration without a job,
no spinners over content or fake progress, no fades on everything, no emoji as UI icons
(the 🧠 chat button is the one deliberate exception), no "feels native" claims without a
recording of it running.
