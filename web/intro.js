// First-load brain intro: outline draws itself, neurons light and connect, then it dissolves.
// Once per session; skippable; crossfade only under prefers-reduced-motion.
import { introMode } from './lib.js';

const KEY = 'brain.intro';
const half = `
  <path class="lobe" pathLength="1" d="M60 16C50 6 32 8 26 20C14 22 9 36 15 46C7 55 11 71 23 75C27 87 44 92 54 85C57 88 60 88 60 86V16"/>
  <path class="fold" pathLength="1" d="M30 34C38 30 44 36 42 44"/>
  <path class="fold" pathLength="1" d="M22 58C30 53 40 59 37 68"/>
  <path class="fold" pathLength="1" d="M46 22C51 28 49 34 44 37"/>
  <path class="fold" pathLength="1" d="M50 52C44 56 46 64 52 68"/>`;
const NODES = [[34, 30], [44, 46], [26, 52], [40, 70], [52, 30], [68, 28], [78, 46], [92, 52], [80, 70], [60, 54]];
const LINKS = [[0, 1], [1, 2], [1, 3], [1, 9], [4, 9], [4, 5], [5, 6], [6, 9], [6, 7], [7, 8], [8, 9], [3, 9]];
const svg = () => `<svg class="intro-mark" viewBox="0 0 120 100" aria-hidden="true">
  <g class="outline">${half}</g><g class="outline" transform="translate(120 0) scale(-1 1)">${half}</g>
  <g class="syn">${LINKS.map(([a, b], i) => `<line pathLength="1" style="--i:${i}" x1="${NODES[a][0]}" y1="${NODES[a][1]}" x2="${NODES[b][0]}" y2="${NODES[b][1]}"/>`).join('')}</g>
  <g class="neurons">${NODES.map(([x, y], i) => `<circle style="--i:${i}" cx="${x}" cy="${y}" r="2.2"/>`).join('')}</g>
</svg>`;

function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } }
function markSeen() { try { sessionStorage.setItem(KEY, '1'); } catch {} }

export function playIntro() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = introMode({ seen: seen(), reducedMotion });
  if (mode === 'none') return;
  markSeen();
  const el = document.createElement('div');
  el.className = `intro ${mode}`;
  el.setAttribute('role', 'presentation');
  el.innerHTML = `${mode === 'full' ? svg() : ''}<div class="intro-word">brain</div>`;
  document.body.append(el);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    removeEventListener('keydown', finish, true);
    setTimeout(() => el.remove(), 360);
  };
  el.addEventListener('pointerdown', finish);
  addEventListener('keydown', finish, true);
  setTimeout(finish, mode === 'full' ? 1400 : 300);
}
