// Intros, skippable (click, key, wheel, touch), a 300ms crossfade under reduced motion.
// Landing ('hero', every load): one big 3D brain ignites full screen, then shrinks and flies into the
// hero while the page rises in around it (~3.2s). App routes ('full', once per session): a radial ignite.
import { introMode, introPhase, introSpeed, INTRO, fieldBudget, cloudBudget, cloudView, projectCloud, heroYaw, HERO_PITCH } from './lib.js';
import { cloudScene, cloudLook, drawCloud, stepCloud, spawnPulse, fireNode, nearestNode, activationOrder } from './brain.js';

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

// Landing intro, one rAF loop over INTRO's four acts (ms):
//   spark 0–500: a single point ignites, HUD fades in at the edges.
//   grow 500–1400: the spark fires; an activation wave travels synapse by synapse through the 3D cloud,
//     nodes flare as it reaches them, the camera dollies out.
//   name 1400–2000: a second wave sweeps front to back while the wordmark resolves.
//   land 2000–3200: the brain shrinks and flies (with motion trails) onto the hero rect and pose; the page
//     rises in around it; the overlay dissolves and the landing canvas (the very same scene object, same
//     projection) takes over without a jump.
const GROW_ZOOM = 1.22; // camera starts close and dollies out
const NAME_ZOOM = 0.94;
const SPIN = 0.6; // radians of yaw shed on the way to the hero pose
const START_PITCH = -0.06;
const ARC = 0.05; // the flight bows upward by this share of the viewport height
const REVEAL_AT = 0.3; // share of the flight after which the page rises in
const FLARE = 0.8;
const PHONE_FIT = 2.2; // on a portrait phone the brain spans nearly the full width
const TRAIL = 0.8; // share of the previous frame wiped while flying
const FLIGHT_SPARKS = 8; // nodes that fire as the brain takes off
const SECONDARY = 0.2; // chance a newly reached node fires an action potential of its own
const HUD_EVERY = 4; // frames between readout updates
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

function heroRect(h) {
  const r = document.getElementById('brain')?.getBoundingClientRect();
  return r && r.width > 40 && r.bottom > 0 && r.top < h ? r : null;
}

function cinema(el, speed, onLand, onDone) {
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
  const W = innerWidth, H = innerHeight, phone = W < 700;
  const { dpr } = cloudBudget(W, devicePixelRatio);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = cloudScene(W), look = cloudLook();
  const tick = getComputedStyle(document.documentElement).getPropertyValue('--tick').trim();
  const seed = nearestNode(sc, -0.05, -0.12, 0.12), at = activationOrder(sc, seed), lit = new Uint8Array(sc.n);
  const full = phone ? { cx: W / 2, cy: H * 0.42, s: Math.min(W / PHONE_FIT, H / PHONE_FIT) } : cloudView(W, H * 0.86, { left: 0, top: H * 0.02 });
  const bg = el.querySelector('.intro-bg'), hud = { nodes: el.querySelector('[data-hud=nodes]'), links: el.querySelector('[data-hud=links]'), pose: el.querySelector('[data-hud=pose]'), t: el.querySelector('[data-hud=t]') };
  let hero = null, act = 'spark', frames = 0, raf = 0, prev = 0, clock = 0;
  // The intro clock advances only with drawn frames, and at most one frame-budget per frame:
  // if the page is busy loading, the animation waits instead of silently skipping ahead.
  const MAX_STEP = 1000 / 30;

  const camera = (ms, ph) => {
    const u = Math.min(1, ms / INTRO.total);
    const zoom = lerp(GROW_ZOOM, 1, easeOut(ph.grow)) * lerp(1, NAME_ZOOM, easeInOut(ph.name));
    let view = { cx: full.cx, cy: full.cy, s: full.s * zoom };
    if (hero) {
      const k = easeInOut(ph.land);
      view = { cx: lerp(view.cx, hero.cx, k), cy: lerp(view.cy, hero.cy, k) - Math.sin(Math.PI * k) * H * ARC, s: lerp(view.s, hero.s, k) };
    }
    return { view, yaw: heroYaw(0) + SPIN * (1 - easeSine(u)), pitch: lerp(START_PITCH, HERO_PITCH, easeSine(u)) };
  };

  // the wave front: hop by hop from the spark during grow; nodes flare and sometimes fire on arrival
  const advance = (front, ph) => {
    let count = 0;
    for (let i = 0; i < sc.n; i++) {
      if (!lit[i] && front >= at[i]) {
        lit[i] = 1; sc.glow[i] = Math.max(sc.glow[i], FLARE);
        const deg = sc.start[i + 1] - sc.start[i];
        if (deg && Math.random() < SECONDARY) spawnPulse(sc, sc.adj[sc.start[i] + Math.floor(Math.random() * deg)], i, 3 + Math.random() * 2, 3);
      }
      count += lit[i];
    }
    if (ph.name > 0 && ph.name < 1) {
      const X = -1.15 + 2.3 * easeInOut(ph.name);
      for (let i = 0; i < sc.n; i++) {
        const d = Math.abs(sc.pos[i * 3] - X);
        if (d < 0.07) sc.glow[i] = Math.max(sc.glow[i], 1 - d / 0.07);
      }
    }
    return count;
  };

  const spark = (ms, ph, view) => {
    const P = sc.proj, x = P[seed * 4], y = P[seed * 4 + 1];
    const on = easeOut(ph.spark) * (1 - 0.85 * easeOut(ph.grow));
    if (on <= 0.01) return;
    const flicker = 0.88 + 0.12 * Math.sin(ms * 0.045) * Math.sin(ms * 0.017);
    const R = view.s * (0.08 + 0.22 * ph.spark) * flicker;
    ctx.globalCompositeOperation = look.blend;
    ctx.globalAlpha = on; ctx.drawImage(look.glow, x - R, y - R, R * 2, R * 2);
    const c = 7 + 5 * on;
    ctx.drawImage(look.core, x - c, y - c, c * 2, c * 2);
    const sw = W * 0.42 * on, sh = 3 + 3 * on; // anamorphic streak
    ctx.globalAlpha = on * 0.7; ctx.drawImage(look.glow, x - sw, y - sh, sw * 2, sh * 2);
    // reticle: four hairlines with a gap, fading as the network takes over
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = on * (1 - ph.grow);
    ctx.strokeStyle = tick; ctx.lineWidth = 1;
    const g = 18 + 10 * ph.spark, l = 10;
    ctx.beginPath();
    ctx.moveTo(x - g - l, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + g + l, y);
    ctx.moveTo(x, y - g - l); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + g + l);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const readouts = (ms, count, cam) => {
    if (frames++ % HUD_EVERY) return;
    let links = 0;
    for (let e = 0; e < sc.links.length; e += 2) links += lit[sc.links[e]] & lit[sc.links[e + 1]];
    hud.nodes.textContent = String(count).padStart(4, '0');
    hud.links.textContent = String(links).padStart(4, '0');
    hud.pose.textContent = `${((cam.yaw * 180) / Math.PI).toFixed(1)}° ${((cam.pitch * 180) / Math.PI).toFixed(1)}°`;
    hud.t.textContent = (ms / 1000).toFixed(2);
  };

  const frame = (now) => {
    const step = Math.min(MAX_STEP, prev ? now - prev : 0) * speed;
    prev = now;
    clock += step;
    const ms = clock, dt = step / 1000;
    const ph = introPhase(ms);
    if (act === 'spark' && ph.grow > 0) { act = 'grow'; fireNode(sc, seed, 4, 2); }
    if (act === 'grow' && ph.name > 0) { act = 'name'; el.classList.add('name'); }
    if (act === 'name' && ph.land > 0) {
      act = 'land';
      const r = heroRect(H);
      hero = r && cloudView(r.width, r.height, r);
      el.classList.add('land');
      for (let q = 0; q < FLIGHT_SPARKS; q++) fireNode(sc, Math.floor(Math.random() * sc.n), 2.6, 3);
    }
    if (act === 'land' && ph.land >= REVEAL_AT) { act = 'reveal'; onLand(); }
    const front = ph.grow > 0 ? Math.min(1, ph.grow ** 0.85 * 1.04) : -1;
    const count = advance(front, ph);
    stepCloud(sc, dt);
    const cam = camera(ms, ph);
    const flying = hero && ph.land > 0.04 && ph.land < 0.9;
    if (flying) { // motion trails: fade the last frame instead of wiping it
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = TRAIL; ctx.fillStyle = look.col.text;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } else ctx.clearRect(0, 0, W, H);
    projectCloud(sc.pos, sc.proj, cam.view, cam.yaw, cam.pitch);
    spark(ms, ph, cam.view);
    if (front >= 0) drawCloud(ctx, sc, look, { ...cam, at, front, projected: true, alpha: hero ? 1 : 1 - easeInOut(ph.land) });
    bg.style.opacity = String(1 - easeInOut(Math.max(0, Math.min(1, (ph.land - 0.2) / 0.7))));
    readouts(ms, count, cam);
    if (ph.done) { raf = 0; onDone({ n: sc.n, glow: sc.glow, pulse: sc.pulse }); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); raf = 0; };
}

const OVERLAY = `<div class="intro-bg"></div><canvas class="intro-field"></canvas>
  <div class="intro-hud"><i></i><i></i><i></i><i></i>
    <p class="hud-tl">nodes <b data-hud="nodes">0000</b> · synapses <b data-hud="links">0000</b></p>
    <p class="hud-tr">pose <b data-hud="pose">0.0° 0.0°</b></p>
    <p class="hud-bl">t+<b data-hud="t">0.00</b>s</p>
  </div>
  <div class="intro-title"><div class="intro-name">${[...'brain'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div><p class="intro-tag">One memory for every AI you use</p></div>
  <p class="intro-note">Tap or press any key to skip</p>`;
const SKIP_EVENTS = ['keydown', 'wheel', 'touchstart', 'pointerdown'];

function playHero(speed) {
  const root = document.documentElement;
  const el = document.createElement('div');
  el.className = 'intro hero';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = OVERLAY;
  document.body.append(el);
  root.style.setProperty('--intro-k', String(1 / speed));
  root.classList.add('intro-run', 'intro-fly');
  let done = false;
  const finish = (detail, skipped) => {
    if (done) return;
    done = true;
    stop();
    for (const t of SKIP_EVENTS) removeEventListener(t, skip, true);
    document.removeEventListener('visibilitychange', onHide);
    root.classList.remove('intro-run', 'intro-fly');
    dispatchEvent(new CustomEvent('brain:intro-done', { detail }));
    if (!skipped) { el.remove(); root.style.removeProperty('--intro-k'); return; }
    el.classList.add('out');
    setTimeout(() => { el.remove(); root.style.removeProperty('--intro-k'); }, 320);
  };
  const skip = () => finish(null, true);
  const onHide = () => { if (document.hidden) skip(); };
  const stop = cinema(el, speed, () => root.classList.remove('intro-run'), (detail) => finish(detail, false));
  for (const t of SKIP_EVENTS) addEventListener(t, skip, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onHide);
}

export function playIntro({ landing = false } = {}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const debug = introSpeed(location.search); // ?introSpeed=0.25 replays the intro slowed down
  const mode = introMode({ seen: seen() && debug === null, reducedMotion, landing });
  if (mode === 'none') return;
  markSeen();
  if (mode === 'hero') { playHero(debug ?? 1); return; }
  const el = document.createElement('div');
  el.className = `intro ${mode}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `${mode === 'full' ? '<canvas class="intro-field"></canvas>' : ''}<div class="intro-word">brain</div><p class="intro-note">Tap to skip</p>`;
  document.body.append(el);
  if (mode === 'fade') { // a single 300ms crossfade, nothing moves
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('out')));
    setTimeout(() => el.remove(), 340);
    return;
  }
  const stop = ignite(el.querySelector('canvas'));
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
  setTimeout(finish, DURATION + 100);
}
