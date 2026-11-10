// Hero constellation: nodes sampled inside a brain silhouette, synapses between neighbours,
// pulses travelling along links, nodes that lean toward the cursor. Ignites like the intro.
// Sized to its container, DPR-capped, paused off-screen or in a hidden tab,
// a single still frame under prefers-reduced-motion. Colours come from CSS tokens.
import { fieldBudget, brainNodes, brainLinks, heroGeometry, heroNodeCount, BRAIN_SEED } from './lib.js';

const IGNITE = 1400;
const ease = (t) => 1 - (1 - t) ** 3;

export function mountBrain(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = canvas.parentElement;
  let w = 0, h = 0, s = 1, cx = 0, cy = 0, nodes = [], links = [], adj = [], col = {}, raf = 0, visible = true;
  const ptr = { x: -9999, y: -9999 };
  const pulses = [];
  let start = performance.now();
  // While the landing intro flies its constellation in, this canvas waits (one rAF loop at a time).
  let held = document.documentElement.classList.contains('intro-run');

  const readTokens = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    col = { node: v('--field-node'), line: v('--field-line'), signal: v('--signal') || v('--accent'), glow: v('--signal-glow') || v('--accent-soft') };
  };

  function layout() {
    const r = host.getBoundingClientRect();
    w = r.width; h = r.height;
    const budget = fieldBudget({ width: innerWidth, dpr: devicePixelRatio, reducedMotion: reduced });
    canvas.width = Math.round(w * budget.dpr); canvas.height = Math.round(h * budget.dpr);
    ctx.setTransform(budget.dpr, 0, 0, budget.dpr, 0, 0);
    ({ s, cx, cy } = heroGeometry(w, h));
    const unit = brainNodes(heroNodeCount(innerWidth), BRAIN_SEED);
    nodes = unit.map((n, i) => ({ ...n, ax: cx + n.x * s, ay: cy + n.y * s, x: cx, y: cy, ph: i * 1.7, glow: 0, d: Math.random() * 0.3 }));
    links = brainLinks(unit, { reach: 0.32, perNode: 4 });
    adj = nodes.map(() => []);
    links.forEach(([i, j], k) => { adj[i].push(k); adj[j].push(k); });
    pulses.length = 0;
    for (let k = 0; k < (innerWidth < 700 ? 6 : 12); k++) spawn(Math.floor(Math.random() * links.length));
    readTokens();
  }

  function spawn(k, from) {
    if (!links.length) return;
    const [i, j] = links[k];
    const a = from === j ? j : i;
    pulses.push({ k, a, b: a === i ? j : i, t: 0, v: 0.6 + Math.random() * 0.6 });
  }

  function step(now, dt) {
    const life = reduced ? 1 : Math.min(1, (now - start) / IGNITE);
    const sec = now / 1000;
    for (const n of nodes) {
      let p = ease(Math.max(0, Math.min(1, (life - n.d) / 0.7)));
      let tx = n.ax + (reduced ? 0 : Math.sin(sec * 0.4 + n.ph) * 2.5);
      let ty = n.ay + (reduced ? 0 : Math.cos(sec * 0.35 + n.ph) * 2.5);
      const dx = tx - ptr.x, dy = ty - ptr.y, d = Math.hypot(dx, dy);
      const near = Math.max(0, 1 - d / 140);
      if (near > 0 && !reduced) { tx += (dx / (d || 1)) * near * 14; ty += (dy / (d || 1)) * near * 14; }
      n.near = near;
      const p1 = reduced ? 1 : p;
      n.x = cx + (tx - cx) * p1; n.y = cy + (ty - cy) * p1; n.p = p1;
      n.glow = Math.max(0, n.glow - dt * 1.6);
    }
    if (reduced || life < 0.55) return;
    for (let q = pulses.length - 1; q >= 0; q--) {
      const u = pulses[q];
      u.t += dt * u.v;
      if (u.t >= 1) {
        nodes[u.b].glow = 1;
        pulses.splice(q, 1);
        const next = adj[u.b].filter((k) => k !== u.k);
        spawn(next.length ? next[Math.floor(Math.random() * next.length)] : Math.floor(Math.random() * links.length), u.b);
      }
    }
  }

  function draw(now) {
    const life = reduced ? 1 : Math.min(1, (now - start) / IGNITE);
    ctx.clearRect(0, 0, w, h);
    const linkA = Math.max(0, Math.min(1, (life - 0.3) / 0.5));
    ctx.lineWidth = 0.7;
    for (const [i, j] of links) {
      const a = nodes[i], b = nodes[j];
      const hot = Math.max(a.near, b.near, a.glow * 0.6, b.glow * 0.6);
      ctx.globalAlpha = linkA * (0.35 + hot * 0.6);
      ctx.strokeStyle = hot > 0.1 ? col.signal : col.line;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.fillStyle = col.signal;
    for (const u of pulses) {
      const a = nodes[u.a], b = nodes[u.b];
      const x = a.x + (b.x - a.x) * u.t, y = a.y + (b.y - a.y) * u.t;
      ctx.globalAlpha = 0.25 * linkA; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = linkA; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    for (const n of nodes) {
      const hot = Math.max(n.near, n.glow, 1 - n.p);
      if (hot > 0.2) { ctx.globalAlpha = hot * 0.5; ctx.fillStyle = col.glow; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 7 * hot, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = Math.min(1, n.p * 0.8 + hot * 0.4);
      ctx.fillStyle = hot > 0.2 ? col.signal : col.node;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 0.8 + hot * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(now, dt); draw(now);
    raf = !reduced && visible && !document.hidden ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf && !held && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const local = (e) => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; };
  const onMove = (e) => { local(e); kick(); };
  const onLeave = () => { ptr.x = ptr.y = -9999; };
  const onDown = (e) => {
    local(e);
    if (reduced) return;
    let best = -1, bd = 60;
    nodes.forEach((n, i) => { const d = Math.hypot(n.x - ptr.x, n.y - ptr.y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    nodes[best].glow = 1;
    for (const k of adj[best]) spawn(k, best);
    if (pulses.length > 40) pulses.splice(0, pulses.length - 40);
    kick();
  };
  const onVis = () => kick();
  const onIntroDone = () => { held = false; start = performance.now() - IGNITE; kick(); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  const ro = new ResizeObserver(() => { layout(); if (reduced) draw(performance.now()); kick(); });
  const themeWatch = new MutationObserver(() => { readTokens(); if (reduced) draw(performance.now()); });
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { readTokens(); if (reduced) draw(performance.now()); };

  layout();
  step(performance.now(), 0); draw(performance.now());
  if (held) { start = -Infinity; step(performance.now(), 0); draw(performance.now()); }
  if (!reduced) kick();
  addEventListener('brain:intro-done', onIntroDone);
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  io.observe(canvas); ro.observe(host);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  scheme.addEventListener?.('change', onScheme);

  return function destroy() {
    cancelAnimationFrame(raf); raf = 0;
    canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('brain:intro-done', onIntroDone);
    io.disconnect(); ro.disconnect(); themeWatch.disconnect(); scheme.removeEventListener?.('change', onScheme);
  };
}
