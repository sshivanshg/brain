// The landing's living layer, drawn on one fixed full-viewport canvas in one rAF loop:
// - the hero brain: a 3D point cloud (two hemispheres, cerebellum, stem), synapses between nearest
//   neighbours, action potentials travelling along them. The intro (web/intro.js) draws the *same*
//   scene with the same projection, lands on the hero rect and hands its glow and pulses over;
// - a field of sample memories behind every section, coloured by kind, clustered by project, in
//   parallax layers as you scroll, calm behind text, with a hover tooltip.
// Typed arrays, glow sprites prerendered once (additive in dark, normal blending on paper), DPR capped,
// paused in a hidden tab, a still frame (redrawn on scroll) under reduced motion. Colours from CSS tokens.
import { cloudBudget, cloudView, brainCloud, brainDust, cloudLinks, cloudAdjacency, hopDistances, projectCloud, heroYaw, HERO_PITCH, CLOUD_SEED, fieldBudget, landingField, calmAt, SAMPLE_MEMORIES, SAMPLE_PROJECTS, kindVar, kindGlyph } from './lib.js';

const PULSE_CAP = 180;
const DEPTH_ALPHA = [1, 0.7, 0.45, 0.26]; // link alpha, nearest bucket first
const GLOW_DECAY = 2.2; // per second: a flare, not a lamp
const MIN_UNIT = 0.62; // small brains keep legible nodes and pulses
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Deterministic for a viewport width and built once: the intro and the hero share this very object,
// so the brain that flies in is the brain that keeps living.
const DUST = { phone: 900, desk: 2400 };
const scenes = new Map();
export function cloudScene(width) {
  const nodes = cloudBudget(width).nodes;
  if (scenes.has(nodes)) return scenes.get(nodes);
  const { pos, size } = brainCloud(nodes, CLOUD_SEED);
  const n = size.length;
  const links = cloudLinks(pos, { reach: n < 200 ? 0.3 : 0.21, perNode: 4 });
  const { start, adj } = cloudAdjacency(n, links);
  const dust = brainDust(width < 700 ? DUST.phone : DUST.desk, CLOUD_SEED);
  const sc = { n, pos, size, links, start, adj, dust, dustProj: new Float32Array((dust.length / 3) * 4), proj: new Float32Array(n * 4), glow: new Float32Array(n), tips: new Float32Array(links.length * 1.5), pulse: pulses() };
  scenes.set(nodes, sc);
  return sc;
}
const pulses = () => ({ edge: new Uint16Array(PULSE_CAP), dir: new Uint8Array(PULSE_CAP), t: new Float32Array(PULSE_CAP), v: new Float32Array(PULSE_CAP), gen: new Uint8Array(PULSE_CAP), n: 0 });

export function nearestNode(sc, x, y, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < sc.n; i++) {
    const d = (sc.pos[i * 3] - x) ** 2 + (sc.pos[i * 3 + 1] - y) ** 2 + (sc.pos[i * 3 + 2] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// When each node lights up (0..1) in a wave from `seed`: by synapse hops, by distance if unreachable.
export function activationOrder(sc, seed) {
  const hop = hopDistances(sc.n, sc.links, seed), at = new Float32Array(sc.n);
  let maxHop = 1;
  for (const h of hop) if (h > maxHop) maxHop = h;
  const sx = sc.pos[seed * 3], sy = sc.pos[seed * 3 + 1], sz = sc.pos[seed * 3 + 2];
  for (let i = 0; i < sc.n; i++) {
    const far = Math.hypot(sc.pos[i * 3] - sx, sc.pos[i * 3 + 1] - sy, sc.pos[i * 3 + 2] - sz) / 1.9;
    at[i] = clamp01(hop[i] >= 0 ? (hop[i] / maxHop) * 0.8 + far * 0.2 : far);
  }
  return at;
}

// A radial glow sprite: stacked linear gradients approximate a soft falloff, then tinted with a token.
function sprite(size, colour, mask, layers) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), r = size / 2;
  for (const [reach, a] of layers) {
    const g = x.createRadialGradient(r, r, 0, r, r, r * reach);
    g.addColorStop(0, mask); g.addColorStop(1, 'transparent');
    x.globalAlpha = a; x.fillStyle = g; x.fillRect(0, 0, size, size);
  }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-in'; x.fillStyle = colour; x.fillRect(0, 0, size, size);
  return c;
}

export function cloudLook() {
  const root = document.documentElement, cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  const dark = cs.colorScheme.includes('dark');
  const mask = v('--mask-solid'), signal = v('--signal') || v('--accent');
  return {
    dark, blend: dark ? 'lighter' : 'source-over',
    col: { line: v('--field-line'), signal, text: v('--text'), dust: v('--field-node') },
    node: sprite(64, v('--field-node'), mask, [[0.16, 1], [0.32, 0.55], [1, dark ? 0.18 : 0.06]]),
    soft: sprite(64, v('--field-node'), mask, [[0.55, 0.5], [1, 0.35]]),
    glow: sprite(128, signal, mask, [[0.12, 0.9], [0.4, 0.45], [1, 0.3]]),
    core: sprite(64, dark ? v('--text') : signal, mask, [[0.3, 1], [0.6, 0.4]]),
    kind: Object.fromEntries([...new Set(SAMPLE_MEMORIES.map((m) => kindVar(m.kind)))].map((k) => [k, sprite(48, v(`--k-${k}`), mask, [[0.2, 1], [0.42, 0.45], [1, dark ? 0.16 : 0.05]])])),
  };
}

export function spawnPulse(sc, k, from, v, gen) {
  const p = sc.pulse;
  if (p.n >= PULSE_CAP) return;
  p.edge[p.n] = k; p.dir[p.n] = sc.links[k * 2] === from ? 0 : 1; p.t[p.n] = 0; p.v[p.n] = v; p.gen[p.n] = gen; p.n++;
}

// Fire every synapse of node i (a tap, or the spark): a burst that cascades `gen` hops.
export function fireNode(sc, i, v, gen) {
  sc.glow[i] = 1;
  for (let e = sc.start[i]; e < sc.start[i + 1]; e++) spawnPulse(sc, sc.adj[e], i, v * (0.85 + Math.random() * 0.3), gen);
}

// Advance action potentials; on arrival the node flares and, while generations remain, the signal
// continues down one or two other synapses: a cascade through the network.
export function stepCloud(sc, dt) {
  const p = sc.pulse, decay = dt * GLOW_DECAY;
  for (let i = 0; i < sc.n; i++) sc.glow[i] = Math.max(0, sc.glow[i] - decay);
  for (let q = p.n - 1; q >= 0; q--) {
    p.t[q] += dt * p.v[q];
    if (p.t[q] < 1) continue;
    const k = p.edge[q], to = sc.links[k * 2 + 1 - p.dir[q]], gen = p.gen[q], v = p.v[q];
    p.n--;
    p.edge[q] = p.edge[p.n]; p.dir[q] = p.dir[p.n]; p.t[q] = p.t[p.n]; p.v[q] = p.v[p.n]; p.gen[q] = p.gen[p.n];
    sc.glow[to] = 1;
    if (!gen) continue;
    const deg = sc.start[to + 1] - sc.start[to];
    for (let b = 0, forks = Math.random() < 0.35 ? 2 : 1; b < forks && deg > 1; b++) {
      const e = sc.adj[sc.start[to] + Math.floor(Math.random() * deg)];
      if (e !== k) spawnPulse(sc, e, to, v, gen - 1);
    }
  }
}

const depthBucket = (z) => Math.min(3, Math.max(0, Math.floor((z + 0.9) * 2.2)));

// Cortex dust: 1px specks by depth bucket, one fill style, no sprites.
const DUST_ALPHA = [1, 0.72, 0.45, 0.24];
function drawDust(ctx, sc, look, f, unit, alpha) {
  if (alpha <= 0.01) return;
  const D = projectCloud(sc.dust, sc.dustProj, f.view, f.yaw, f.pitch), px = 1.3 * unit;
  ctx.fillStyle = look.col.dust;
  for (let b = 0; b < 4; b++) {
    ctx.globalAlpha = DUST_ALPHA[b] * alpha;
    for (let o = 0; o < D.length; o += 4) {
      if (depthBucket(D[o + 3]) !== b) continue;
      const r = px * D[o + 2];
      ctx.fillRect(D[o] - r / 2, D[o + 1] - r / 2, r, r);
    }
  }
}

// One frame of the cloud. f: { view, yaw, pitch, at?, front?, alpha? }. With `at` and `front` the
// network is still growing: nodes appear as the front passes them and synapses grow toward later nodes,
// each growing tip a bright signal.
export function drawCloud(ctx, sc, look, f) {
  const P = f.projected ? sc.proj : projectCloud(sc.pos, sc.proj, f.view, f.yaw, f.pitch), L = sc.links, at = f.at, front = f.front ?? 1;
  const unit = Math.max(MIN_UNIT, f.view.s / 300), alpha = f.alpha ?? 1;
  const lw = Math.max(0.55, 0.8 * unit);
  ctx.globalCompositeOperation = look.blend;
  drawDust(ctx, sc, look, f, unit, alpha * (at ? clamp01((front - 0.25) / 0.6) : 1));
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = look.col.line;
  const tips = sc.tips;
  let nt = 0;
  for (let b = 0; b < 4; b++) {
    ctx.globalAlpha = DEPTH_ALPHA[b] * alpha;
    ctx.beginPath();
    for (let e = 0; e < L.length; e += 2) {
      const i = L[e], j = L[e + 1];
      if (depthBucket((P[i * 4 + 3] + P[j * 4 + 3]) / 2) !== b) continue;
      let a = i, c = j, g = 1;
      if (at) {
        if (at[j] < at[i]) { a = j; c = i; }
        g = clamp01((front - at[a]) / Math.max(0.015, at[c] - at[a]));
        if (g <= 0) continue;
        if (g < 1) { tips[nt++] = P[a * 4] + (P[c * 4] - P[a * 4]) * g; tips[nt++] = P[a * 4 + 1] + (P[c * 4 + 1] - P[a * 4 + 1]) * g; tips[nt++] = P[c * 4 + 2]; }
      }
      ctx.moveTo(P[a * 4], P[a * 4 + 1]);
      ctx.lineTo(P[a * 4] + (P[c * 4] - P[a * 4]) * g, P[a * 4 + 1] + (P[c * 4 + 1] - P[a * 4 + 1]) * g);
    }
    ctx.stroke();
  }
  // synapses next to a firing node carry the signal colour
  ctx.strokeStyle = look.col.signal;
  ctx.globalAlpha = 0.5 * alpha;
  ctx.beginPath();
  for (let e = 0; e < L.length; e += 2) {
    const i = L[e], j = L[e + 1];
    if (sc.glow[i] + sc.glow[j] < 1.2 || (at && (front < at[i] || front < at[j]))) continue;
    ctx.moveTo(P[i * 4], P[i * 4 + 1]); ctx.lineTo(P[j * 4], P[j * 4 + 1]);
  }
  ctx.stroke();

  for (let i = 0; i < sc.n; i++) {
    const o = i * 4, x = P[o], y = P[o + 1], p = P[o + 2], z = P[o + 3];
    const shown = at ? clamp01((front - at[i]) / 0.04) : 1;
    if (shown <= 0) continue;
    const r = (0.7 + sc.size[i] * 0.55) * unit * p;
    const a = alpha * shown * (0.3 + 0.7 * clamp01((1 - z) / 1.6));
    const blur = clamp01((z - 0.2) * 1.4);
    if (blur < 0.97) { ctx.globalAlpha = a * (1 - blur); ctx.drawImage(look.node, x - r * 6, y - r * 6, r * 12, r * 12); }
    if (blur > 0.03) { ctx.globalAlpha = a * blur * 0.7; ctx.drawImage(look.soft, x - r * 7, y - r * 7, r * 14, r * 14); }
    const g = sc.glow[i];
    if (g > 0.02) {
      const R = r * (6 + 7 * g);
      ctx.globalAlpha = alpha * g * 0.7; ctx.drawImage(look.glow, x - R, y - R, R * 2, R * 2);
      ctx.globalAlpha = alpha * g; ctx.drawImage(look.core, x - r * 3, y - r * 3, r * 6, r * 6);
    }
  }

  for (let q = 0; q < nt; q += 3) {
    const R = 14 * unit * tips[q + 2];
    ctx.globalAlpha = alpha * 0.9; ctx.drawImage(look.glow, tips[q] - R, tips[q + 1] - R, R * 2, R * 2);
    ctx.drawImage(look.core, tips[q] - R * 0.3, tips[q + 1] - R * 0.3, R * 0.6, R * 0.6);
  }

  drawPulses(ctx, sc, look, unit, lw, alpha);
}

// Action potentials: a short bright streak with a bloom at its head. Works for any scene whose proj
// holds [x, y, scale, …] per node.
function drawPulses(ctx, sc, look, unit, lw, alpha) {
  const pu = sc.pulse, P = sc.proj, L = sc.links;
  if (!pu.n) return;
  ctx.globalCompositeOperation = look.blend;
  ctx.strokeStyle = look.col.signal;
  ctx.lineWidth = lw * 1.8;
  ctx.globalAlpha = 0.8 * alpha;
  ctx.beginPath();
  for (let q = 0; q < pu.n; q++) {
    const k = pu.edge[q], a = L[k * 2 + pu.dir[q]] * 4, c = L[k * 2 + 1 - pu.dir[q]] * 4, t = pu.t[q], t0 = Math.max(0, t - 0.35);
    ctx.moveTo(P[a] + (P[c] - P[a]) * t0, P[a + 1] + (P[c + 1] - P[a + 1]) * t0);
    ctx.lineTo(P[a] + (P[c] - P[a]) * t, P[a + 1] + (P[c + 1] - P[a + 1]) * t);
  }
  ctx.stroke();
  for (let q = 0; q < pu.n; q++) {
    const k = pu.edge[q], a = L[k * 2 + pu.dir[q]] * 4, c = L[k * 2 + 1 - pu.dir[q]] * 4, t = pu.t[q];
    const x = P[a] + (P[c] - P[a]) * t, y = P[a + 1] + (P[c + 1] - P[a + 1]) * t, R = 11 * unit * P[c + 2];
    ctx.globalAlpha = alpha * 0.9; ctx.drawImage(look.glow, x - R, y - R, R * 2, R * 2);
    ctx.drawImage(look.core, x - R * 0.28, y - R * 0.28, R * 0.56, R * 0.56);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- the landing field of sample memories ----------
const FIELD_REACH = { phone: 130, desk: 230 }; // px between linked memories
const FIELD_DRIFT = { x: 9, y: 7 };
const LAYER_ALPHA = [0.28, 0.42, 0.6]; // the field stays a backdrop
const NEAR = 160; // px of cursor influence
const LINK_ALPHA = [0.15, 0.35, 0.6, 0.9];

function fieldScene(w, h, pageHeight) {
  const f = landingField(fieldBudget({ width: w }).nodes, { width: w, height: h, pageHeight });
  const R = w < 700 ? FIELD_REACH.phone : FIELD_REACH.desk, pos = new Float32Array(f.n * 3), size = new Float32Array(f.n);
  for (let i = 0; i < f.n; i++) {
    const p = SAMPLE_PROJECTS.indexOf(SAMPLE_MEMORIES[f.mem[i]].project);
    pos[i * 3] = f.x[i] / R; pos[i * 3 + 1] = f.y[i] / R; pos[i * 3 + 2] = (p * 3 + f.layer[i]) * 10; // links stay inside a project and a layer
    size[i] = 1 + ((i * 7) % 5) * 0.3;
  }
  const links = cloudLinks(pos, { reach: 1, perNode: 3 });
  const { start, adj } = cloudAdjacency(f.n, links);
  return { ...f, pageHeight, size, links, start, adj, proj: new Float32Array(f.n * 4), glow: new Float32Array(f.n), vis: new Float32Array(f.n), pulse: pulses() };
}

// Screen positions (with drift and parallax) and per-node visibility: calm behind text, brighter near
// the hero and the cursor.
function placeField(fs, { t, scroll, h, rects, ptr, focus }) {
  const P = fs.proj;
  for (let i = 0; i < fs.n; i++) {
    const x = fs.x[i] + Math.sin(t * 0.13 + i * 2.3) * FIELD_DRIFT.x, y = fs.y[i] - scroll * fs.depth[i] + Math.cos(t * 0.11 + i * 1.7) * FIELD_DRIFT.y;
    P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = fs.depth[i]; P[i * 4 + 3] = 0;
    if (y < -40 || y > h + 40) { fs.vis[i] = 0; continue; }
    const near = ptr.on ? Math.max(0, 1 - Math.hypot(x - ptr.x, y - ptr.y) / NEAR) : 0;
    const hero = focus ? Math.max(0, 1 - Math.hypot(x - focus.x, y - focus.y) / focus.r) : 0; // make way for the brain
    fs.vis[i] = Math.min(1, LAYER_ALPHA[fs.layer[i]] * calmAt(x, y, rects, scroll) * (1 - hero * 0.9) + near * 0.5);
  }
}

function drawField(ctx, fs, look, alpha) {
  const P = fs.proj, L = fs.links, V = fs.vis;
  ctx.globalCompositeOperation = look.blend;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = look.col.line;
  for (let b = 0; b < 4; b++) { // links batched by visibility so each batch is one stroke
    ctx.globalAlpha = LINK_ALPHA[b] * alpha;
    ctx.beginPath();
    for (let e = 0; e < L.length; e += 2) {
      const i = L[e], j = L[e + 1], v = Math.min(V[i], V[j]);
      if (v <= 0.02 || Math.min(3, (v * 4) | 0) !== b) continue;
      ctx.moveTo(P[i * 4], P[i * 4 + 1]); ctx.lineTo(P[j * 4], P[j * 4 + 1]);
    }
    ctx.stroke();
  }
  for (let i = 0; i < fs.n; i++) {
    if (V[i] <= 0.02) continue;
    const x = P[i * 4], y = P[i * 4 + 1], r = fs.size[i] * (0.7 + fs.depth[i] * 0.6), g = fs.glow[i];
    ctx.globalAlpha = V[i] * alpha;
    ctx.drawImage(look.kind[kindVar(SAMPLE_MEMORIES[fs.mem[i]].kind)], x - r * 5, y - r * 5, r * 10, r * 10);
    if (g > 0.02) {
      const R = r * (6 + 8 * g);
      ctx.globalAlpha = g * 0.7 * alpha * Math.max(0.3, V[i]); ctx.drawImage(look.glow, x - R, y - R, R * 2, R * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawPulses(ctx, fs, look, 0.75, 0.7, alpha * 0.8);
}

// Text blocks (page coordinates) the field stays quiet behind.
const CALM_SELECTOR = '.landing :is(h1, h2, h3, p, li, summary, dd, pre, code, input, .btn, .l-demo, .brand, .l-nav)';
function textRects() {
  const els = document.querySelectorAll(CALM_SELECTOR), out = new Float32Array(els.length * 4), y = scrollY;
  els.forEach((el, k) => { const r = el.getBoundingClientRect(); out.set([r.left, r.top + y, r.right, r.bottom + y], k * 4); });
  return out;
}

const IGNITE = 1200; // ms, when the landing mounts without the intro
const AMBIENT = { brain: 0.7, field: 0.9 }; // seconds between spontaneous action potentials
const TILT = { yaw: 0.45, pitch: 0.22, ease: 3 };
const HOVER = 16; // px to pick a memory under the cursor

// Fire one random synapse of a random (visible) node.
function ambientPulse(sc, v, gen, ok = () => true) {
  const i = Math.floor(Math.random() * sc.n), deg = sc.start[i + 1] - sc.start[i];
  if (deg && ok(i)) spawnPulse(sc, sc.adj[sc.start[i] + Math.floor(Math.random() * deg)], i, v * (0.8 + Math.random() * 0.4), gen);
}

export function mountLanding(canvas, heroEl, tip) {
  const ctx = canvas.getContext('2d');
  const root = document.documentElement, page = document.querySelector('.landing');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, sc = null, fs = null, look = null, at = null, rects = new Float32Array(0), heroBox = null;
  let raf = 0, clock = 0, born = -1, ambient = { brain: 0, field: 0 }, last = performance.now(), hover = -1;
  const ptr = { x: 0, y: 0, on: false }, tilt = { yaw: 0, pitch: 0 };
  // While the intro flies its cloud in, the field waits as a still frame (one rAF loop at a time).
  let held = root.classList.contains('intro-run');
  document.body.classList.add('has-field');

  function measure() {
    rects = textRects();
    const r = heroEl.getBoundingClientRect();
    heroBox = { left: r.left, top: r.top + scrollY, width: r.width, height: r.height };
    const ph = root.scrollHeight;
    if (!fs || Math.abs(fs.pageHeight - ph) > ph * 0.15) fs = fieldScene(w, h, ph);
  }
  function layout() {
    w = innerWidth; h = innerHeight;
    const { dpr } = cloudBudget(w, devicePixelRatio);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!sc || sc.n !== cloudBudget(w).nodes) { sc = cloudScene(w); at = activationOrder(sc, nearestNode(sc, 0, -0.1, 0.1)); }
    fs = null;
    measure();
    look = cloudLook();
  }

  const heroView = (scroll) => cloudView(heroBox.width, heroBox.height, { left: heroBox.left, top: heroBox.top - scroll });

  function draw(withBrain = !held) {
    const scroll = scrollY, view = heroView(scroll);
    ctx.clearRect(0, 0, w, h);
    placeField(fs, { t: clock, scroll, h, rects, ptr, focus: { x: view.cx, y: view.cy, r: view.s * 2.4 } });
    drawField(ctx, fs, look, 1);
    if (!withBrain || view.cy + view.s * 1.2 < 0 || view.cy - view.s * 1.2 > h) return;
    const growing = born >= 0 && !reduced;
    const front = growing ? Math.min(1.05, (performance.now() - born) / IGNITE) : 1;
    if (growing && front >= 1.05) born = -1;
    drawCloud(ctx, sc, look, { view, yaw: heroYaw(clock) + tilt.yaw, pitch: HERO_PITCH + tilt.pitch, at: growing ? at : null, front });
  }

  function step(dt) {
    clock += dt;
    const v = heroView(scrollY), inHero = ptr.on && Math.abs(ptr.x - v.cx) < v.s * 1.4 && Math.abs(ptr.y - v.cy) < v.s * 1.1;
    const ty = inHero ? ((ptr.x - v.cx) / v.s) * TILT.yaw * 0.5 : 0, tp = inHero ? ((ptr.y - v.cy) / v.s) * -TILT.pitch * 0.5 : 0;
    const k = 1 - Math.exp(-dt * TILT.ease);
    tilt.yaw += (ty - tilt.yaw) * k; tilt.pitch += (tp - tilt.pitch) * k;
    if ((ambient.brain -= dt) <= 0) { ambient.brain = AMBIENT.brain * (0.6 + Math.random() * 0.8); ambientPulse(sc, 1.8, 4); }
    if ((ambient.field -= dt) <= 0) { ambient.field = AMBIENT.field * (0.6 + Math.random() * 0.8); ambientPulse(fs, 0.9, 3, (i) => fs.vis[i] > 0.3); }
    if (inHero) {
      const P = sc.proj;
      for (let i = 0; i < sc.n; i++) {
        const d = Math.hypot(P[i * 4] - ptr.x, P[i * 4 + 1] - ptr.y);
        if (d < 70) sc.glow[i] = Math.max(sc.glow[i], 0.45 * (1 - d / 70));
      }
    }
    stepCloud(sc, dt); stepCloud(fs, dt);
  }

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); draw();
    raf = !document.hidden ? requestAnimationFrame(frame) : 0;
  };
  const still = () => { raf = 0; draw(); };
  const kick = () => {
    if (raf || held || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(reduced ? still : frame);
  };

  // hover a memory: tooltip with its title (never over links, buttons or text)
  function pick() {
    hover = -1;
    if (!ptr.on || calmAt(ptr.x, ptr.y, rects, scrollY) < 1) return;
    let bd = HOVER;
    for (let i = 0; i < fs.n; i++) {
      if (fs.vis[i] < 0.2) continue;
      const d = Math.hypot(fs.proj[i * 4] - ptr.x, fs.proj[i * 4 + 1] - ptr.y);
      if (d < bd) { bd = d; hover = i; }
    }
  }
  function showTip() {
    if (!tip) return;
    tip.hidden = hover < 0;
    if (hover < 0) return;
    const m = SAMPLE_MEMORIES[fs.mem[hover]];
    tip.textContent = `${kindGlyph(m.kind)} ${m.title}`;
    tip.style.transform = `translate(${Math.min(ptr.x + 14, w - 230)}px, ${ptr.y + 14}px)`;
    fs.glow[hover] = Math.max(fs.glow[hover], 0.8);
  }
  const onMove = (e) => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = e.pointerType === 'mouse' && !e.target.closest?.('a, button, input, textarea, select, label, summary');
    pick(); showTip(); kick();
  };
  const onLeave = () => { ptr.on = false; hover = -1; showTip(); };
  const onDown = (e) => {
    if (reduced) return;
    let best = -1, bd = 60;
    for (let i = 0; i < sc.n; i++) { const d = Math.hypot(sc.proj[i * 4] - e.clientX, sc.proj[i * 4 + 1] - e.clientY); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) fireNode(sc, best, 2.2, 5);
    kick();
  };
  const onScroll = () => { if (hover >= 0) onLeave(); kick(); };
  const onVis = () => kick();
  const onIntroDone = (e) => {
    held = false; born = -1; clock = 0;
    const d = e.detail;
    if (d?.n === sc.n) { sc.glow.set(d.glow); Object.assign(sc.pulse, d.pulse); }
    measure(); draw();
    kick();
  };
  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); draw(); kick(); }, 120); };
  const ro = new ResizeObserver(() => { measure(); if (!raf) draw(); });
  const restyle = () => { look = cloudLook(); draw(); };
  const themeWatch = new MutationObserver(restyle);
  const scheme = matchMedia('(prefers-color-scheme: dark)');

  layout();
  if (!held && !reduced) born = performance.now();
  draw();
  kick();
  addEventListener('brain:intro-done', onIntroDone);
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  heroEl.addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  if (page) ro.observe(page);
  document.fonts?.ready.then(() => { measure(); if (!raf) draw(); });
  themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  scheme.addEventListener?.('change', restyle);

  return function destroy() {
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('brain:intro-done', onIntroDone);
    removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
    heroEl.removeEventListener('pointerdown', onDown);
    removeEventListener('scroll', onScroll); removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    ro.disconnect(); themeWatch.disconnect(); scheme.removeEventListener?.('change', restyle);
    document.body.classList.remove('has-field');
    if (tip) tip.hidden = true;
    ctx.clearRect(0, 0, w, h);
  };
}
