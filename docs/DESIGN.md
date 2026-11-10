# Brain design system

Brain is a **neural archive — readable first**. Warm paper/ink duality, one soft phosphor
signal colour, an upright serif for display set against a highly legible sans for everything
you read, hairline rules. A brain-shaped constellation of nodes and synapses is the landing
hero; a living field made of real memories sits behind home.
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

| Token | Light (cool paper) | Dark (Jarvis black) | Use |
|---|---|---|---|
| `--bg` | `#eef3f8` | `#05070a` | page |
| `--surface` / `--surface-2` | `#f8fbfd` / `#e1e9f1` | `#0a0f16` / `#0f1620` | index cards / inset, skeletons |
| `--line` | `#c3d0dd` | `#1b2836` | hairlines; `--text` is used for heavy rules |
| `--text` / `--muted` / `--faint` | `#08111c` / `#2f4256` / `#5c6f83` | `#e6eef7` / `#a8b9cb` / `#6d8196` | ink scale; body text ≥ 7:1 (text 17:1 both; muted 9.2:1 light, 10.1:1 dark); faint ≥ 4.5:1, meta only |
| `--accent` | `#0057a8` | `#3fd0ff` | the one signal colour: holographic cyan-blue (6.4:1 light, 11.2:1 dark as text) |
| `--signal` / `--signal-glow` | `#0a74c9` / 22% | `#3fd0ff` / 28% | canvas pulses, lit nodes and their halo |
| `--mark` | blue 20% | cyan 22% | search-hit highlight |
| `--danger` | `#b3261e` | `#ff6b6b` | destructive, recording |
| `--field-node` / `--field-line` | navy 60% / deep blue 32% | ice 62% / dim blue 30% | neural field canvas; lines are the secondary, dimmer blue |
| `--tick` / `--hud-grid` | blue 45% / 6% | cyan 50% / 3.5% | HUD: corner ticks on cards, faint grid behind the hero brain only (never behind body text) |
| `--grain` / `--grain-opacity` | cool SVG noise / 0.035 | same / 0.025 | barely-there grain, below content (z-index 0) |
| `--k-*` | per memory kind (cool-led: blue, violet, teal, mint, sky, lavender; rose/amber/gold for lesson/todo/highlight) | same | kind glyph + field node colour only |

**Why cyan on black ("Jarvis"):** a holographic HUD signal on near-pure black — a live readout,
not a brand fill. One accent only; lines use a dimmer blue so the cyan stays reserved for
what is active (pulses, focus rings with a soft glow, the primary action). On cool paper the
hue deepens to `#0057a8` so it passes AA as text.

- **Type (readability first):** `--sans` Inter for all body, labels, nav, buttons and meta,
  sentence case, 16px/1.6 in the app and 17px on the landing, prose capped at ~68ch.
  `--serif` Instrument Serif **upright** for display (landing hero 44–76px, section heads
  32–48px, page h1 36–56px, card titles 24px); italic only for a single accent word (`<em>`).
  `--mono` JetBrains Mono only for ids, URLs, code and kbd. No uppercase tracked mono labels.
- **Kinds** are a glyph (◆ decision, ▲ lesson, ● preference, □ todo, ◇ session…) in the
  kind pigment, never a pill. Map lives in `web/lib.js`.
- **Radius:** `--radius` 3px (index cards, controls). Circles only for nodes, mic and FAB.
- **Spacing:** 4px grid — 4, 8, 12, 16, 24, 32, 48. Page gutter 16px on phone.
- **Neural field (app home):** ≤110 nodes desktop / 48 phone, DPR capped at 2 / 1.5, paused when the
  tab is hidden, one still frame under reduced motion. App routes ignite it in ≤1.6s, once per session, skippable.
- **Landing brain (`web/brain.js`):** a 3D point cloud sampled in a brain volume (`inBrain3`: two
  hemispheres split by the fissure, frontal/occipital/temporal lobes, cerebellum, stem; `brainCloud`
  in `web/lib.js`, cortex-biased): 520 nodes desktop / 150 phone, synapses to nearest neighbours via a
  spatial grid (`cloudLinks`), plus "cortex dust" (`brainDust`, 2400 / 900 1px specks on the surface
  where a fold pattern runs) so gyri and the silhouette read. Perspective projection (`projectCloud`)
  with depth-scaled size, alpha and a soft sprite for far nodes (depth of field). Action potentials
  travel along synapses and cascade a few hops; nodes flare on arrival. Glow is prerendered radial
  sprites tinted from tokens, additive (`lighter`) in dark and normal blending on paper; never
  `shadowBlur`. The hero sways slowly (`heroYaw`), tilts toward the cursor and a tap fires a node.
- **Landing field:** the landing draws the hero brain *and* a calm field of sample memories
  (`SAMPLE_MEMORIES`, five projects) on the one fixed `#field` canvas in one rAF loop. Nodes are
  coloured by kind, linked within a project, sit in three parallax layers as you scroll, drop to a
  whisper behind text blocks (`calmAt`) and around the brain, and show the memory title on hover.
  It is a backdrop: it never competes with the brain or the copy.
- **Landing intro (`web/intro.js`, mode `hero`, every landing load):** spark (0–0.5s, HUD ticks and
  readouts fade in at the edges) → an activation wave grows the network hop by hop from the spark
  (0.5–1.4s) → a sweep fires front to back while the wordmark resolves (1.4–2.0s) → the big brain
  shrinks and flies onto the hero rect and pose with motion trails while the page rises in and the
  overlay dissolves (2.0–3.2s). The intro and the landing share the *same* scene object and
  projection, so the hand-off has no jump. Click, key, wheel or touch skips; a hidden tab skips.
  Reduced motion: a 300ms crossfade and a still frame. `?introSpeed=0.25` slows it for frame capture.
- **Landing structure:** hero (headline, one-line value prop, "Open your brain" + "How it
  works"), works-with strip, 3 steps, live search demo, connect (MCP URL copy), FAQ, final CTA.

## Anti-slop list
No generic SaaS look (blue/violet accent, white cards on grey, centred hero + three cards), no decoration without a job,
no spinners over content or fake progress, no fades on everything, no emoji as UI icons
(the 🧠 chat button is the one deliberate exception), no "feels native" claims without a
recording of it running.
