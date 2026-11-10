// Living neural field: drifting nodes, synapses that brighten near the pointer.
// Ambient mode (landing) invents nodes; memory mode plots real memories by kind and project.
// Colours come from CSS tokens, so the field follows the theme. Pauses when hidden.
import { fieldBudget, clusterLayout, kindVar } from './lib.js';

const tokens = () => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { node: v('--field-node'), line: v('--field-line'), signal: v('--accent'), kind: (k) => v(`--k-${kindVar(k)}`) || v('--field-node') };
};

export function mountField(canvas, { memories = null, tip = null, intensity = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, budget, nodes = [], raf = 0, t0 = performance.now(), col = tokens(), hover = null;
  const ptr = { x: -9999, y: -9999 };
  const LINK = () => (w < 700 ? 90 : 130);

  function layout() {
    w = innerWidth; h = innerHeight;
    budget = fieldBudget({ width: w, dpr: devicePixelRatio, reducedMotion: reduced });
    canvas.width = Math.round(w * budget.dpr); canvas.height = Math.round(h * budget.dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(budget.dpr, 0, 0, budget.dpr, 0, 0);
    if (memories?.length) {
      nodes = clusterLayout(memories, { width: w, height: h, max: budget.nodes }).map((n, i) => ({ ...n, ax: n.x, ay: n.y, ph: i * 1.7, r: 2.4 }));
    } else {
      nodes = Array.from({ length: Math.round(budget.nodes * 0.8) }, (_, i) => {
        const x = Math.random() * w, y = Math.random() * h;
        return { x, y, ax: x, ay: y, ph: i * 2.3, r: 1 + Math.random() * 1.6 };
      });
    }
    col = tokens();
  }

  function step(t) {
    const s = (t - t0) / 1000;
    for (const n of nodes) {
      n.x = n.ax + Math.sin(s * 0.13 + n.ph) * 14;
      n.y = n.ay + Math.cos(s * 0.11 + n.ph * 1.3) * 10;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const L = LINK();
    ctx.lineWidth = 0.6;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (memories && a.project !== b.project) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > L) continue;
        const near = Math.max(0, 1 - Math.hypot((a.x + b.x) / 2 - ptr.x, (a.y + b.y) / 2 - ptr.y) / 180);
        ctx.globalAlpha = (1 - d / L) * (0.18 + near * 0.8) * intensity;
        ctx.strokeStyle = near > 0.05 ? col.signal : col.line;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (const n of nodes) {
      const near = Math.max(0, 1 - Math.hypot(n.x - ptr.x, n.y - ptr.y) / 160);
      ctx.globalAlpha = Math.min(1, (0.45 + near * 0.55) * intensity + (n === hover ? 1 : 0));
      ctx.fillStyle = memories ? col.kind(n.kind) : near > 0.2 ? col.signal : col.node;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + near * 1.6 + (n === hover ? 2.5 : 0), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const frame = (t) => { step(t); draw(); raf = budget.animate && !document.hidden ? requestAnimationFrame(frame) : 0; };
  const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(budget.animate ? frame : () => { raf = 0; draw(); }); };

  function pick(x, y) {
    if (!memories) return null;
    let best = null, bd = 18;
    for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  const onMove = (e) => {
    ptr.x = e.clientX; ptr.y = e.clientY;
    const over = !e.target.closest?.('a, button, input, textarea, select, label, form, .mem, .tile');
    hover = over ? pick(ptr.x, ptr.y) : null;
    if (tip) {
      tip.hidden = !hover;
      if (hover) { tip.textContent = hover.title || `#${hover.id}`; tip.style.transform = `translate(${Math.min(ptr.x + 14, w - 220)}px, ${ptr.y + 14}px)`; }
    }
    document.documentElement.classList.toggle('field-hot', !!hover);
    kick();
  };
  const onLeave = () => { ptr.x = ptr.y = -9999; hover = null; if (tip) tip.hidden = true; kick(); };
  const onClick = () => { if (hover) location.hash = `#/m/${hover.id}`; };
  const onVis = () => { if (!document.hidden) kick(); };
  let rz;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); kick(); }, 120); };
  const themeWatch = new MutationObserver(() => { col = tokens(); kick(); });
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { col = tokens(); kick(); };

  layout(); step(t0); draw(); kick();
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  addEventListener('click', onClick);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVis);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  scheme.addEventListener?.('change', onScheme);

  return function destroy() {
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onMove);
    document.removeEventListener('pointerleave', onLeave);
    removeEventListener('click', onClick); removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    themeWatch.disconnect(); scheme.removeEventListener?.('change', onScheme);
    document.documentElement.classList.remove('field-hot');
  };
}
