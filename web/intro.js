// First-load intro: the neural field ignites from one point — nodes fire outward,
// synapses connect, then the wordmark resolves. ≤1.6s, skippable, once per session;
// a plain crossfade of the wordmark under prefers-reduced-motion.
import { introMode, fieldBudget } from './lib.js';

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

export function playIntro() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = introMode({ seen: seen(), reducedMotion });
  if (mode === 'none') return;
  markSeen();
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
