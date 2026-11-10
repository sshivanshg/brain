// First-load intro, once per session, skippable, a plain wordmark crossfade under reduced motion.
// Landing ('hero'): a viewport-filling brain constellation ignites, the wordmark resolves, then every
// node flies to its matching node on the hero canvas while the page fades in (~2.2s).
// App routes ('full'): the shorter radial ignite.
import { introMode, fieldBudget, brainNodes, brainLinks, heroGeometry, heroNodeCount, brainPoint, BRAIN_SEED } from './lib.js';

const KEY = 'brain.intro';
const DURATION = 1500;
function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } }
function markSeen() { try { sessionStorage.setItem(KEY, '1'); } catch {} }
const ease = (t) => 1 - (1 - t) ** 3;

function ignite(canvas) {
  const ctx = canvas.getContext('2d');
  const w = innerWidth, h = innerHeight;
  const { dpr, nodes: count } = fieldBudget({ width: w, dpr: devicePixelRatio });
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement);
  const signal = cs.getPropertyValue('--accent').trim(), ink = cs.getPropertyValue('--field-node').trim();
  const reach = Math.hypot(w, h) * 0.55;
  const nodes = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    return { a, d: reach * (0.12 + Math.random() ** 0.7 * 0.88), delay: Math.random() * 0.25 };
  });
  const start = performance.now();
  let raf = 0;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    ctx.clearRect(0, 0, w, h);
    const pts = nodes.map((n) => {
      const p = ease(Math.max(0, Math.min(1, (t - n.delay) / 0.6)));
      return [w / 2 + Math.cos(n.a) * n.d * p, h / 2 + Math.sin(n.a) * n.d * p, p];
    });
    const link = Math.max(0, (t - 0.3) / 0.5);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = signal;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d > 120) continue;
        ctx.globalAlpha = Math.min(1, link) * (1 - d / 120) * 0.7;
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      }
    }
    for (const [x, y, p] of pts) {
      ctx.globalAlpha = p;
      ctx.fillStyle = p < 1 ? signal : ink;
      ctx.beginPath(); ctx.arc(x, y, 1.6 + (1 - p) * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

const HERO = { ignite: 900, morphAt: 1250, morph: 850, total: 2200 };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// One rAF loop draws the big brain, then morphs it onto the hero canvas's node positions.
function constellation(canvas, el, onMorph) {
  const ctx = canvas.getContext('2d');
  const w = innerWidth, h = innerHeight;
  const { dpr } = fieldBudget({ width: w, dpr: devicePixelRatio });
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const col = { node: v('--field-node'), line: v('--field-line'), signal: v('--signal'), glow: v('--signal-glow') };
  const unit = brainNodes(heroNodeCount(w), BRAIN_SEED);
  const links = brainLinks(unit, { reach: 0.32, perNode: 4 });
  const big = heroGeometry(w * 0.94, h * 0.92);
  const off = { left: w * 0.03, top: h * 0.03 };
  const from = unit.map((n) => brainPoint(n, big, off));
  const ox = off.left + big.cx, oy = off.top + big.cy;
  const delay = unit.map((n) => Math.min(0.35, Math.hypot(n.x, n.y) * 0.3));
  const pulses = Array.from({ length: Math.min(18, links.length) }, (_, k) => ({ k: (k * 37) % links.length, t: (k * 0.17) % 1, v: 1.1 + (k % 5) * 0.2 }));
  let to = null, morphed = false;
  const start = performance.now();
  let raf = 0, last = start;
  const tick = (now) => {
    const ms = now - start, dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!morphed && ms >= HERO.morphAt) {
      morphed = true;
      const target = document.getElementById('brain');
      if (target) {
        const r = target.getBoundingClientRect();
        const g = heroGeometry(r.width, r.height);
        to = unit.map((n) => brainPoint(n, g, r));
      }
      onMorph(!!to);
    }
    const life = clamp01(ms / HERO.ignite);
    const m = to ? easeInOut(clamp01((ms - HERO.morphAt) / HERO.morph)) : 0;
    const pts = from.map((f, i) => {
      const p = 1 - (1 - clamp01((life - delay[i]) / 0.65)) ** 3;
      let x = ox + (f.x - ox) * p, y = oy + (f.y - oy) * p;
      if (to) { x += (to[i].x - x) * m; y += (to[i].y - y) * m; }
      return { x, y, p };
    });
    ctx.clearRect(0, 0, w, h);
    const linkA = clamp01((life - 0.35) / 0.5) * (1 - m * 0.3);
    ctx.lineWidth = 0.7 + (1 - m) * 0.3;
    ctx.strokeStyle = col.line;
    ctx.globalAlpha = linkA * 0.8;
    ctx.beginPath();
    for (const [i, j] of links) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); }
    ctx.stroke();
    if (life > 0.5) {
      for (const u of pulses) {
        u.t += dt * u.v;
        if (u.t >= 1) { u.t = 0; u.k = (u.k * 7 + 13) % links.length; }
        const [i, j] = links[u.k], a = pts[i], b = pts[j];
        const x = a.x + (b.x - a.x) * u.t, y = a.y + (b.y - a.y) * u.t;
        ctx.fillStyle = col.glow; ctx.globalAlpha = linkA; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col.signal; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    const scale = 1 + (1 - m) * 0.5;
    for (let i = 0; i < pts.length; i++) {
      const { x, y, p } = pts[i], hot = 1 - p;
      if (hot > 0.05) { ctx.globalAlpha = hot * 0.6; ctx.fillStyle = col.glow; ctx.beginPath(); ctx.arc(x, y, 9 * hot + 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = Math.min(1, p * 0.85 + hot * 0.5);
      ctx.fillStyle = hot > 0.15 ? col.signal : col.node;
      ctx.beginPath(); ctx.arc(x, y, (unit[i].r + 0.8) * scale + hot * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (ms < HERO.total) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function playHero(el) {
  const root = document.documentElement;
  root.classList.add('intro-run', 'intro-fly');
  let done = false;
  const release = () => { root.classList.remove('intro-run'); };
  const stop = constellation(el.querySelector('canvas'), el, (landed) => {
    el.classList.add(landed ? 'morph' : 'out');
    release();
  });
  const finish = (skipped) => {
    if (done) return;
    done = true;
    stop();
    release();
    root.classList.remove('intro-fly');
    for (const [t, f] of SKIP) removeEventListener(t, f, true);
    dispatchEvent(new Event('brain:intro-done'));
    if (skipped) { el.classList.add('out'); setTimeout(() => el.remove(), 360); } else el.remove();
  };
  const skip = () => finish(true);
  const SKIP = [['keydown', skip], ['wheel', skip], ['touchmove', skip], ['pointerdown', skip]];
  for (const [t, f] of SKIP) addEventListener(t, f, { capture: true, passive: true });
  setTimeout(() => finish(false), HERO.total + 40);
}

export function playIntro({ landing = false } = {}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = introMode({ seen: seen(), reducedMotion, landing });
  if (mode === 'none') return;
  markSeen();
  if (mode === 'hero') {
    const el = document.createElement('div');
    el.className = 'intro hero';
    el.setAttribute('role', 'presentation');
    el.innerHTML = '<canvas class="intro-field" aria-hidden="true"></canvas><div class="intro-word">brain</div><p class="intro-note">Tap, scroll or press any key to skip</p>';
    document.body.append(el);
    playHero(el);
    return;
  }
  const el = document.createElement('div');
  el.className = `intro ${mode}`;
  el.setAttribute('role', 'presentation');
  el.innerHTML = `${mode === 'full' ? '<canvas class="intro-field" aria-hidden="true"></canvas>' : ''}<div class="intro-word">brain</div><p class="intro-note">Tap to skip</p>`;
  document.body.append(el);
  const stop = mode === 'full' ? ignite(el.querySelector('canvas')) : () => {};
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    stop();
    el.classList.add('out');
    removeEventListener('keydown', finish, true);
    setTimeout(() => el.remove(), 360);
  };
  el.addEventListener('pointerdown', finish);
  addEventListener('keydown', finish, true);
  setTimeout(finish, mode === 'full' ? DURATION + 100 : 300);
}
