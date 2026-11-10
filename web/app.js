// Brain web app — no build step, no framework. Hash routes, one render() per view.
import { parseRoute, resolveRoute, searchPath, mcpUrl, kindGlyph, kindVar, specimenMeta } from './lib.js';
import { playIntro } from './intro.js';
import { mountField } from './field.js';

const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
const TOKEN_KEY = 'brain.token';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// ---------- api ----------
async function api(path, opts = {}) {
  if (navigator.onLine === false) throw new Error('You’re offline. Your brain will be here when you reconnect.');
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${store.get(TOKEN_KEY) || ''}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'web', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 401) { store.set(TOKEN_KEY, null); healthP = null; renderLogin('That token didn’t work.'); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kindTag = (k) => `<span class="kind" style="--c: var(--k-${kindVar(k)})"><i aria-hidden="true">${kindGlyph(k)}</i>${esc(k)}</span>`;
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const today = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
const niceDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const mins = (sec) => (sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec}s`);

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// Small, safe markdown: escape first, then format.
function md(src) {
  const blocks = [];
  let s = esc(src || '').replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code) => { blocks.push(code); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t) => t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\[#(\d+)\]|\(#(\d+)\)/g, (_, a, b) => `<a class="cite" href="#/m/${a || b}">#${a || b}</a>`)
    .replace(/⟦/g, '<mark>').replace(/⟧/g, '</mark>');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split('\n')) {
    let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) { close(); out.push(`<pre><code>${blocks[m[1]]}</code></pre>`); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(?:\[( |x)\]\s+)?(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${m[1] === 'x' ? '☑ ' : m[1] === ' ' ? '☐ ' : ''}${inline(m[2])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^&gt;\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if (/^-{3,}$/.test(line.trim())) { close(); out.push('<hr>'); continue; }
    close();
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('\n').replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${blocks[i]}</code>`);
}

function card(m) {
  const text = m.snippet ? md(m.snippet.replace(/\n+/g, ' ')) : esc(m.summary || (m.body || '').replace(/[#*`>]/g, '').slice(0, 400));
  const [, ...rest] = specimenMeta(m, ago(m.created_at));
  return `<a class="mem" href="#/m/${m.id}">
    <div class="mem-top">${kindTag(m.kind)}${rest.map((x) => `<span>${esc(x)}</span>`).join('')}${m.source ? `<span>${esc(m.source)}</span>` : ''}${m.pinned ? '<span class="pin">◉ pinned</span>' : ''}${m.meta?.dwell ? `<span>${mins(m.meta.dwell)} read</span>` : ''}</div>
    <div class="mem-title">${esc(m.title)}</div>
    <div class="mem-body">${text}</div>
    ${m.url ? `<div class="mem-url">${esc(domain(m.url))}</div>` : ''}
  </a>`;
}
const stream = (rows, empty = 'Nothing here yet.') => (rows.length ? `<div class="stream">${rows.map(card).join('')}</div>` : `<div class="empty">${empty}</div>`);

// ---------- neural field (one canvas behind every view) ----------
let fieldStop = null;
let fieldSeq = 0;
function setField(opts) {
  fieldSeq++;
  fieldStop?.(); fieldStop = null;
  const canvas = $('#field');
  if (!canvas) return;
  document.body.classList.toggle('has-field', !!opts);
  if (opts) fieldStop = mountField(canvas, { ...opts, tip: $('#field-tip') });
}
// Home: start ambient and faint, then swap in real memories when they arrive.
async function memoryField() {
  setField({ intensity: 0.35 });
  const mine = fieldSeq;
  try {
    const rows = await api('/api/memories?limit=120');
    if (mine === fieldSeq && rows.length) setField({ memories: rows, intensity: 0.55 });
  } catch {}
}

// ---------- icons ----------
const ICON = {
  today: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  ask: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  projects: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  browsing: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  library: '<path d="M4 4h5v16H4zM10 4h5v16h-5zM16 5l4 1-3 14-4-1z"/>',
  capture: '<path d="M12 5v14M5 12h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
const NAV = [['today', 'Home', '#/'], ['ask', 'Ask', '#/ask'], ['projects', 'Projects', '#/projects'], ['browsing', 'Browsing', '#/browsing'], ['library', 'Library', '#/library'], ['capture', 'Capture', '#/capture'], ['settings', 'Settings', '#/settings']];
const TABS = ['today', 'ask', 'projects', 'browsing', 'settings'];

let healthP = null;
const health = () => (healthP ||= api('/api/health').catch((e) => { healthP = null; throw e; }));

function frame(active, content, { search = true } = {}) {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/"><span class="brand-dot"></span>brain</a>
      <nav class="nav">${NAV.map(([k, label, href], i) => `<a href="${href}" class="${k === active ? 'on' : ''}"${k === active ? ' aria-current="page"' : ''}><span class="nav-n">${String(i + 1).padStart(2, '0')}</span>${label}</a>`).join('')}</nav>
      <div class="side-foot"><a href="#/about">Why brain</a><span id="health"></span></div>
    </aside>
    <main>
      ${search ? `<div class="top">
        <form class="searchbox" id="topsearch" role="search">${icon('search')}<input name="q" aria-label="Search your brain" placeholder="Ask your mind…" autocomplete="off"><kbd>/</kbd></form>
        <a class="btn primary" href="#/capture">+ Capture</a>
      </div>` : ''}
      <div id="view">${content}</div>
    </main>
    <nav class="tabbar">${TABS.map((k) => { const [, label, href] = NAV.find((n) => n[0] === k); return `<a href="${href}" class="${k === active ? 'on' : ''}">${icon(k)}${label}</a>`; }).join('')}</nav>
    <a class="fab" href="#/capture" aria-label="Capture">${icon('capture')}</a>
  </div>`;
  const ts = $('#topsearch');
  if (ts) ts.onsubmit = (e) => { e.preventDefault(); location.hash = `#/search?q=${encodeURIComponent(e.target.q.value)}`; };
  health().then((h) => { const el = $('#health'); if (el) el.textContent = `${h.db} · cortex ${h.cortex ? 'on' : 'off'}`; }).catch(() => {});
  return $('#view');
}
// Skeletons shaped like the content they stand in for.
const skelCards = (n = 3) => `<div class="stream" aria-busy="true" aria-label="Loading">${'<div class="mem skel"><i></i><i></i><i></i></div>'.repeat(n)}</div>`;
const loading = (active) => frame(active, `<div class="skel-h"></div>${skelCards(4)}`);
const fig = (n, label, extra = '') => `<p class="fig"><span>FIG. ${String(n).padStart(2, '0')} — ${esc(label)}</span>${extra ? `<span>${extra}</span>` : ''}</p>`;
function params() { return parseRoute(location.hash).params; }
function failState(err, retryLabel = 'Try again') {
  return `<div class="empty fail" role="alert"><p>${esc(err.message === 'Failed to fetch' ? 'Couldn’t reach your brain. Check the connection.' : err.message)}</p><button class="btn" data-retry>${retryLabel}</button></div>`;
}
function bindRetry(el, fn) { el.querySelectorAll('[data-retry]').forEach((b) => { b.onclick = fn; }); }

// ---------- home: search first, today below ----------
const SEARCH_KINDS = ['all', 'decision', 'lesson', 'preference', 'todo', 'session', 'note', 'browse', 'digest', 'skill'];
async function viewHome() {
  const p = params();
  let q = p.get('q') || '';
  let kind = p.get('kind') || 'all';
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const v = frame('today', `
    <section class="home-search">
      <p class="fig"><span>FIG. 01 — RECALL</span><span id="statline">${esc(niceDay(today()).toUpperCase())}</span></p>
      <p class="greet" id="greet">${greet}.</p>
      <form class="bigsearch" id="bigsearch" role="search">
        <input id="q" name="q" type="search" enterkeyhint="search" aria-label="Search your brain" placeholder="Ask your mind…" autocomplete="off" value="${esc(q)}">
        <span class="badge" id="sem" hidden title="Results match meaning, not just words">semantic</span>
        <kbd>/</kbd>
      </form>
      <div class="chips" role="group" aria-label="Filter by kind">${SEARCH_KINDS.map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === kind}" class="${k === kind ? 'on' : ''}">${k}</button>`).join('')}</div>
    </section>
    <section id="results" aria-live="polite"></section>
    <section id="today-feed">${skelCards(3)}</section>`, { search: false });
  const input = $('#q', v);
  const results = $('#results', v);
  let seq = 0;
  const sync = () => history.replaceState(null, '', q || kind !== 'all' ? `#/search?q=${encodeURIComponent(q)}${kind !== 'all' ? `&kind=${kind}` : ''}` : '#/');
  async function runSearch() {
    sync();
    $('#today-feed', v).hidden = !!(q || kind !== 'all');
    if (!q && kind === 'all') { results.innerHTML = ''; return; }
    const my = ++seq;
    results.innerHTML = skelCards(3);
    try {
      const rows = await api(searchPath(q, kind));
      if (my !== seq) return;
      results.innerHTML = `<h2>${q ? `Specimens for “${esc(q)}”` : `All ${esc(kind)}s`} <span class="count">${rows.length}</span></h2>
        ${rows.length ? stream(rows) : `<div class="empty"><p>Nothing ${q ? `matches “${esc(q)}”` : 'of that kind yet'}.</p><div class="actions center"><a class="btn" href="#/ask">Ask instead</a><a class="btn" href="#/capture${q ? `?text=${encodeURIComponent(q)}` : ''}">Capture it</a></div></div>`}`;
    } catch (err) {
      if (my !== seq || err.message === 'unauthorized') return;
      results.innerHTML = failState(err);
      bindRetry(results, runSearch);
    }
  }
  let t;
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = input.value.trim(); runSearch(); }, 220); };
  $('#bigsearch', v).onsubmit = (e) => { e.preventDefault(); clearTimeout(t); q = input.value.trim(); runSearch(); input.blur(); };
  v.querySelectorAll('.chips button').forEach((b) => {
    b.onclick = () => {
      kind = b.dataset.k;
      v.querySelectorAll('.chips button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      runSearch();
    };
  });
  health().then((h) => {
    if (h.semantic) $('#sem', v).hidden = false;
    if (h.owner) $('#greet', v).innerHTML = `${greet}, <em>${esc(h.owner)}</em>.`;
    if (h.semantic) $('#bigsearch', v).classList.add('semantic');
  }).catch(() => {});
  if (q || kind !== 'all') runSearch();
  else if (location.hash.startsWith('#/search')) input.focus();
  loadFeed($('#today-feed', v));
  memoryField();
}

async function loadFeed(el) {
  const t = today();
  el.innerHTML = skelCards(3);
  try {
    const [stats, rows, digestRes] = await Promise.all([
      api('/api/stats'), api(`/api/memories?day=${t}&limit=60&status=any`), api(`/api/digest?day=${shift(t, -1)}`),
    ]);
    const line = $('#statline');
    if (line) line.textContent = `${niceDay(t)} · ${stats.total.toLocaleString()} memories · ${stats.projects} projects`.toUpperCase();
    const heat = new Map(stats.heat.map((h) => [h.day, h.count]));
    const max = Math.max(1, ...stats.heat.map((h) => h.count));
    const start = shift(t, -(7 * 17 - 1) - new Date(`${t}T12:00:00`).getDay());
    const cells = [];
    for (let d = start; d <= t; d = shift(d, 1)) {
      const c = heat.get(d) || 0;
      cells.push(`<i title="${d}: ${c}" data-l="${c ? Math.min(4, Math.ceil((c / max) * 4)) : 0}"></i>`);
    }
    const agents = rows.filter((r) => r.kind !== 'browse');
    const pages = rows.filter((r) => r.kind === 'browse');
    const digest = digestRes.digest;
    el.innerHTML = `
      <div class="tiles">
        <div class="tile"><b>${stats.today}</b><span>captured today</span></div>
        <div class="tile"><b>${stats.sessions_today}</b><span>agent sessions</span></div>
        <div class="tile"><b>${stats.pages_today}</b><span>pages read</span></div>
        <div class="tile"><b>${stats.knowledge}</b><span>decisions & lessons</span></div>
      </div>
      <h2>Activity <span class="count">17 wk</span></h2>
      <div class="heat-wrap"><div class="heat">${cells.join('')}</div><div class="heat-legend"><span>17 weeks</span><span>${stats.bySource.slice(0, 4).map((s) => `${esc(s.source)} ${s.count}`).join(' · ')}</span></div></div>
      ${digest ? `<h2>Yesterday, digested</h2><div class="card digest md">${md(digest.body)}</div>` : ''}
      <h2>Agents & notes today <span class="count">${agents.length}</span></h2>
      ${agents.length ? stream(agents) : '<div class="empty"><p>Quiet so far. Sessions from Claude Code and anything you capture land here.</p><div class="actions center"><a class="btn primary" href="#/capture">Capture a thought</a></div></div>'}
      <h2>Reading today <span class="count">${pages.length}</span></h2>
      ${stream(pages.slice(0, 12), 'Install the Chrome extension to capture what you read.')}`;
  } catch (err) {
    if (err.message === 'unauthorized') return;
    el.innerHTML = failState(err);
    bindRetry(el, () => loadFeed(el));
  }
}

// ---------- landing ----------
const DIAGRAM = `<svg class="l-diagram" viewBox="0 0 600 180" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
  <g class="d-lines"><path d="M60 90 H270"/><path d="M330 90 H540"/><path d="M60 90 C120 20 200 20 270 70"/><path d="M330 110 C400 160 480 160 540 90"/><path d="M300 30 V150"/></g>
  <g class="d-nodes"><circle cx="60" cy="90" r="7"/><circle cx="300" cy="90" r="12"/><circle cx="540" cy="90" r="7"/></g>
  <g class="d-labels"><text x="60" y="128">CAPTURE</text><text x="300" y="132">REMEMBER</text><text x="540" y="128">RECALL</text></g>
</svg>`;
function viewLanding(signedIn) {
  const mcp = mcpUrl(location.origin);
  const cta = signedIn ? '<a class="btn primary lg" href="#/">Back to your brain</a>' : '<a class="btn primary lg" href="#/login">Open your brain</a>';
  const sec = (n, label, body, note = '') => `<section class="l-sec"><p class="l-label"><span class="l-n">${n}</span>${label}</p><div class="l-body">${body}</div>${note ? `<aside class="l-note">${note}</aside>` : ''}</section>`;
  app.innerHTML = `<div class="landing">
    <header class="l-top"><a class="brand" href="#/"><span class="brand-dot"></span>brain</a><span class="l-coord" aria-hidden="true">N° 001 · ARCHIVE OF A MIND</span>${signedIn ? '<a class="btn ghost" href="#/">Your brain</a>' : '<a class="btn ghost" href="#/login">Sign in</a>'}</header>
    <section class="l-hero">
      <p class="fig"><span>FIG. 00 — SPECIMEN</span><span>ONE MEMORY · EVERY AGENT</span></p>
      <h1 class="display">The brain <em>between</em> you and your AI.</h1>
      <div class="l-hero-foot">
        <p class="lede">Claude Code, Cursor, ChatGPT and your browser read and write one memory. Yours. Switch models; what you know stays.</p>
        ${cta}
      </div>
    </section>
    ${sec('01', 'The problem', '<h2 class="l-h">Your memory is scattered across vendors.</h2><p>Every assistant keeps its own notes and forgets them on the next tab. Decisions live in one chat, lessons in another, the article that changed your mind in a third.</p>', 'Three tools, three memories, none of them yours.')}
    ${sec('02', 'The brain', '<h2 class="l-h">One archive. Every agent reads it first.</h2><p>Each session starts with a short briefing of what matters, and ends by writing back what it learned. You own the database.</p>', 'MCP · HTTP · Chrome')}
    ${sec('03', 'The loop', `<h2 class="l-h">Capture → Remember → Recall.</h2>${DIAGRAM}<ol class="l-legend"><li><b>Capture.</b> Sessions, decisions, pages you read, a thought you type.</li><li><b>Remember.</b> Kept short, deduped, searchable by meaning.</li><li><b>Recall.</b> Briefings on start; search when an agent needs more.</li></ol>`)}
    ${sec('04', 'Connect', `<h2 class="l-h">One endpoint for every client.</h2>
      <div class="copyrow"><code id="mcpurl">${esc(mcp)}</code><button class="btn" id="copymcp" aria-label="Copy MCP URL">Copy</button></div>
      <dl class="l-clients">
        <dt>Claude Code</dt><dd><code>claude mcp add --transport http brain ${esc(mcp)}</code></dd>
        <dt>Cursor</dt><dd>Settings → MCP → add server URL</dd>
        <dt>claude.ai</dt><dd>Settings → Connectors → add custom connector</dd>
        <dt>Chrome</dt><dd>The brain extension captures what you read</dd>
      </dl>`, 'Bring your token. Nothing leaves without it.')}
    <footer class="l-foot"><p class="l-label"><span class="l-n">05</span>Ownership</p><p class="display-sm">Self-hosted. <em>Yours.</em></p>${cta}</footer>
  </div>`;
  $('#copymcp').onclick = async () => {
    try { await navigator.clipboard.writeText(mcp); toast('MCP URL copied'); } catch { toast('Select the URL and copy it'); }
  };
  setField({ intensity: 1 });
  window.scrollTo(0, 0);
}

const chatLog = [];
async function viewAsk() {
  const v = frame('ask', '');
  const draw = () => {
    v.innerHTML = `<h1>Ask your <em>brain</em></h1>
      <p class="sub">Questions are answered from your own memories, with sources.</p>
      <div class="chat">${chatLog.map((m) => (m.q ? `<div class="bubble q">${esc(m.q)}</div>` : `<div class="bubble a">${m.pending ? 'Thinking…' : m.html}</div>`)).join('')}</div>
      <form id="askf" class="row"><input class="field" name="q" placeholder="What did I decide about payouts? What was that article on Neon branching?" autocomplete="off"><button class="btn primary" style="flex:none">Ask</button></form>`;
    $('#askf', v).onsubmit = async (e) => {
      e.preventDefault();
      const question = e.target.q.value.trim();
      if (!question) return;
      chatLog.push({ q: question });
      const slot = { pending: true };
      chatLog.push(slot);
      draw();
      try {
        const r = await api('/api/ask', { method: 'POST', body: { question } });
        slot.html = `${r.answer ? `<div class="md">${md(r.answer)}</div>` : `<p class="sub" style="margin:0 0 10px">${r.cortex ? 'No answer found.' : 'Add ANTHROPIC_API_KEY on the server for written answers. Closest memories:'}</p>`}
          ${r.sources.length ? `<h2 style="margin-top:18px">Sources</h2>${stream(r.sources.slice(0, r.answer ? 6 : 10))}` : ''}`;
      } catch (err) { slot.html = esc(err.message); }
      slot.pending = false;
      draw();
    };
    $('#askf input', v).focus();
  };
  draw();
}

async function viewProjects() {
  const v = loading('projects');
  const rows = await api('/api/projects');
  v.innerHTML = `<h1>Projects</h1><p class="sub">Everything your agents have learned, per project.</p>
    ${rows.length ? `<div class="grid">${rows.map((p) => `<a class="proj" href="#/project/${encodeURIComponent(p.project)}"><h3>${esc(p.project)}</h3><p>${p.count} memories · ${p.sessions} sessions · ${p.knowledge} decisions/lessons</p><p>active ${ago(p.last_active)} ago</p></a>`).join('')}</div>` : '<div class="empty">No projects yet.</div>'}`;
}

async function viewProject(name) {
  const v = loading('projects');
  const [brief, rows] = await Promise.all([api(`/api/brief?project=${encodeURIComponent(name)}`), api(`/api/memories?project=${encodeURIComponent(name)}&limit=50`)]);
  v.innerHTML = `<h1>${esc(name)}</h1><p class="sub">This is the briefing every agent gets when it opens this project.</p>
    <div class="card md">${md(brief.replace(/^# .*\n/, ''))}</div>
    <h2>Timeline <span class="count">${rows.length}</span></h2>${stream(rows)}`;
}

async function viewBrowsing() {
  const day = params().get('day') || today();
  const v = loading('browsing');
  const [rows, d] = await Promise.all([api(`/api/memories?kind=browse&day=${day}&limit=200&status=any`), api(`/api/digest?day=${day}`)]);
  const total = rows.reduce((s, r) => s + (r.meta?.dwell || 0), 0);
  const agentPages = rows.filter((r) => r.source === 'chrome-agent').length;
  v.innerHTML = `<div class="daybar"><a class="btn sm" href="#/browsing?day=${shift(day, -1)}">←</a><b>${niceDay(day)}</b>${day < today() ? `<a class="btn sm" href="#/browsing?day=${shift(day, 1)}">→</a>` : ''}</div>
    <p class="sub">${rows.length} pages · ${mins(total)} reading${agentPages ? ` · ${agentPages} by your browser agent` : ''}</p>
    ${d.digest ? `<div class="card digest md">${md(d.digest.body)}</div><h2>Raw pages (compacted)</h2>` : ''}
    ${stream(rows.sort((a, b) => (b.meta?.dwell || 0) - (a.meta?.dwell || 0)), 'Nothing read this day.')}`;
}

const LIB = ['skill', 'agent', 'prompt', 'playbook', 'doc'];
async function viewLibrary() {
  const kind = params().get('kind') || 'skill';
  const v = loading('library');
  const rows = await api(`/api/memories?kind=${kind}&limit=200`);
  v.innerHTML = `<h1>Library</h1><p class="sub">Your skills, agents, prompts and playbooks — synced from agent-hub.</p>
    <div class="chips">${LIB.map((k) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${k}s</button>`).join('')}</div>
    ${rows.length ? `<div class="grid">${rows.map((m) => `<a class="proj" href="#/m/${m.id}"><h3 style="font-size:20px">${esc(m.title)}</h3><p>${esc((m.summary || m.body || '').replace(/[#*`>-]/g, '').slice(0, 140))}</p>${m.project ? `<p style="margin-top:8px"><span class="chip">${esc(m.project)}</span></p>` : ''}</a>`).join('')}</div>` : '<div class="empty">Run <code>npm run import</code> to pull in agent-hub.</div>'}`;
  v.querySelectorAll('.chips button').forEach((b) => { b.onclick = () => { location.hash = `#/library?kind=${b.dataset.k}`; }; });
}

async function viewMemory(id) {
  const v = loading('');
  const m = await api(`/api/memories/${id}`);
  v.innerHTML = `<div class="detail-head">${kindTag(m.kind)}${m.project ? `<a class="chip" href="#/project/${encodeURIComponent(m.project)}">${esc(m.project)}</a>` : ''}<span>${esc(m.source)}</span><span>${niceDay(m.day)}</span>${m.meta?.dwell ? `<span>${mins(m.meta.dwell)} read · ${m.meta.visits} visit${m.meta.visits > 1 ? 's' : ''}</span>` : ''}<span>#${m.id}</span></div>
    <h1 style="font-size:clamp(28px,4vw,38px)">${esc(m.title)}</h1>
    ${m.url ? `<p><a class="md" href="${esc(m.url)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(m.url)}</a></p>` : ''}
    ${m.summary && m.summary !== m.body ? `<div class="card" style="margin:14px 0"><div class="sub" style="margin:0">${esc(m.summary)}</div></div>` : ''}
    ${m.meta?.highlights?.length ? `<h2>Highlights</h2><div class="card md">${m.meta.highlights.map((h) => `<blockquote>${esc(h)}</blockquote>`).join('')}</div>` : ''}
    <div class="actions">
      <button class="btn sm" id="copy">Copy</button>
      <button class="btn sm" id="pin">${m.pinned ? 'Unpin' : 'Pin to briefings'}</button>
      <button class="btn sm" id="edit">Edit</button>
      <button class="btn sm ghost" id="arch">${m.status === 'archived' ? 'Restore' : 'Archive'}</button>
    </div>
    <div class="card md" id="body">${md(m.body)}</div>`;
  $('#copy', v).onclick = async () => { await navigator.clipboard.writeText(m.body); toast('Copied'); };
  $('#pin', v).onclick = async () => { await api(`/api/memories/${id}`, { method: 'PATCH', body: { pinned: !m.pinned } }); viewMemory(id); };
  $('#arch', v).onclick = async () => { await api(`/api/memories/${id}`, { method: 'PATCH', body: { status: m.status === 'archived' ? 'active' : 'archived' } }); toast('Done'); history.back(); };
  $('#edit', v).onclick = () => {
    $('#body', v).outerHTML = `<form id="ef"><input class="field" name="title" value="${esc(m.title)}"><div class="row"><select class="field" name="kind">${['note', 'decision', 'lesson', 'preference', 'todo', 'fact', 'profile', m.kind].filter((k, i, a) => a.indexOf(k) === i).map((k) => `<option ${k === m.kind ? 'selected' : ''}>${k}</option>`).join('')}</select><input class="field" name="project" placeholder="project" value="${esc(m.project || '')}"></div><textarea class="big" name="body" style="margin-top:10px">${esc(m.body)}</textarea><div class="row"><button class="btn primary" style="flex:none">Save</button></div></form>`;
    $('#ef', v).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      await api(`/api/memories/${id}`, { method: 'PATCH', body: { title: f.title.value, kind: f.kind.value, project: f.project.value || null, body: f.body.value } });
      toast('Saved');
      viewMemory(id);
    };
  };
}

async function viewCapture() {
  const p = params();
  const projects = await api('/api/projects').catch(() => []);
  const v = frame('capture', `<h1>Capture</h1><p class="sub">A thought, a link, a decision. Type it or say it.</p>
    <form id="cf">
      <textarea class="big" name="text" placeholder="What’s on your mind?">${esc([p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join('\n'))}</textarea>
      <div class="row">
        <button type="button" class="mic" id="mic" title="Dictate">${icon('mic')}</button>
        <select class="field" name="kind">${['note', 'decision', 'lesson', 'preference', 'todo', 'fact', 'bookmark', 'voice'].map((k) => `<option>${k}</option>`).join('')}</select>
        <input class="field" name="project" list="projlist" placeholder="project (optional)">
        <datalist id="projlist">${projects.map((x) => `<option value="${esc(x.project)}">`).join('')}</datalist>
      </div>
      <div class="row"><button class="btn primary">Save to brain</button></div>
    </form>`);
  const f = $('#cf', v);
  f.text.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const text = f.text.value.trim();
    if (!text) return;
    const url = (text.match(/https?:\/\/\S+/) || [])[0];
    const m = await api('/api/capture', { method: 'POST', body: { text, kind: f.kind.value, project: f.project.value || undefined, url, source: matchMedia('(max-width: 860px)').matches ? 'phone' : 'web' } });
    toast('Saved');
    location.hash = `#/m/${m.id}`;
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('#mic', v);
  if (!SR) { mic.style.display = 'none'; return; }
  let rec = null;
  mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    const base = f.text.value ? `${f.text.value.trim()} ` : '';
    rec.onresult = (e) => { f.text.value = base + Array.from(e.results).map((r) => r[0].transcript).join(''); };
    rec.onend = () => { mic.classList.remove('live'); rec = null; if (f.kind.value === 'note') f.kind.value = 'voice'; };
    rec.start();
    mic.classList.add('live');
  };
}

async function viewSettings() {
  const origin = location.origin;
  const v = frame('settings', '');
  const h = await health();
  v.innerHTML = `<h1>Settings</h1><p class="sub">Database: ${h.db} · Cortex (server-side AI): ${h.cortex ? 'on' : 'off — summaries are extractive; run /mcp__brain__dream from Claude Code'}</p>
    <h2>Connect an agent</h2>
    <div class="card snippet">
      <p class="sub" style="margin:0">Claude Code (every project):</p>
      <pre>claude mcp add --scope user --transport http brain ${esc(origin)}/mcp --header "Authorization: Bearer YOUR_TOKEN"</pre>
      <p class="sub" style="margin:0">Cursor / Windsurf / any MCP client:</p>
      <pre>{ "mcpServers": { "brain": { "url": "${esc(origin)}/mcp", "headers": { "Authorization": "Bearer YOUR_TOKEN" } } } }</pre>
      <p class="sub" style="margin:0">Or wire everything on a machine at once: <code>npm run connect -- --url ${esc(origin)}</code></p>
    </div>
    <h2>Capture from your phone</h2>
    <div class="card snippet"><p class="sub" style="margin:0">Add this page to your home screen (Share → Add to Home Screen). For an iOS Shortcut, POST JSON <code>{"text": "…"}</code> to:</p><pre>${esc(origin)}/api/capture   (header Authorization: Bearer YOUR_TOKEN)</pre></div>
    <h2>Your data</h2>
    <div class="actions"><button class="btn" id="exp">Export everything (JSON)</button><button class="btn" id="push">Enable morning brief</button><button class="btn" id="theme">Toggle theme</button><button class="btn ghost" id="out">Sign out on this device</button></div>`;
  $('#exp', v).onclick = async () => {
    const data = await api('/api/export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `brain-export-${today()}.json`;
    a.click();
  };
  $('#push', v).onclick = async () => {
    try {
      const { key } = await api('/api/push/key');
      if (!key) return toast('Push is not configured on the server');
      if ((await Notification.requestPermission()) !== 'granted') return toast('Notifications blocked');
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (ch) => ch.charCodeAt(0)) });
      await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
      await api('/api/push/test', { method: 'POST' });
      toast('Morning brief on — test sent');
    } catch (err) { toast(`Couldn’t enable: ${err.message}`); }
  };
  $('#theme', v).onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('brain.theme', next);
  };
  $('#out', v).onclick = () => { store.set(TOKEN_KEY, null); healthP = null; location.hash = '#/about'; };
}

function renderLogin(error) {
  setField(null);
  app.innerHTML = `<div class="login"><form class="card" id="lf">
    <a class="brand" href="#/about"><span class="brand-dot"></span>brain</a>
    <p class="fig"><span>FIG. 00 — ACCESS</span></p>
    <h1 class="login-h">Open your <em>brain</em></h1>
    <p class="sub">Paste your access token (from <code>data/token.txt</code> or your host’s <code>BRAIN_TOKEN</code>).</p>
    ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
    <label class="sr" for="tok">Access token</label>
    <input class="field" id="tok" name="t" type="password" placeholder="brn_…" autocomplete="current-password" required>
    <div class="row"><button class="btn primary">Open my brain</button></div>
    <p class="sub small"><a href="#/about">What is this?</a></p></form></div>`;
  $('#tok').focus();
  $('#lf').onsubmit = (e) => {
    e.preventDefault();
    store.set(TOKEN_KEY, e.target.t.value.trim());
    healthP = null;
    if (location.hash === '#/' || !location.hash) route(); else location.hash = '#/';
  };
}

// ---------- router ----------
async function route() {
  const { path } = parseRoute(location.hash);
  const signedIn = !!store.get(TOKEN_KEY);
  const view = resolveRoute(path, signedIn);
  if (view !== 'home') setField(null);
  try {
    if (view === 'landing') return viewLanding(signedIn);
    if (view === 'login') return renderLogin();
    if (view === 'home') { if (path === '/login') { location.hash = '#/'; return; } await viewHome(); }
    else if (view === 'ask') await viewAsk();
    else if (view === 'projects') await viewProjects();
    else if (view === 'project') await viewProject(decodeURIComponent(path.slice(9)));
    else if (view === 'browsing') await viewBrowsing();
    else if (view === 'library') await viewLibrary();
    else if (view === 'capture') await viewCapture();
    else if (view === 'settings') await viewSettings();
    else if (view === 'memory') await viewMemory(path.slice(3));
    else location.hash = '#/';
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    const el = $('#view') || frame('', '');
    el.innerHTML = failState(err);
    bindRetry(el, route);
  }
}

function syncOnline() {
  let bar = $('#offline');
  if (navigator.onLine) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'offline'; bar.className = 'offline'; bar.setAttribute('role', 'status'); bar.textContent = 'Offline — showing what’s on screen. New captures wait until you reconnect.'; document.body.append(bar); }
}

const savedTheme = store.get('brain.theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
window.addEventListener('hashchange', route);
window.addEventListener('online', () => { syncOnline(); route(); });
window.addEventListener('offline', syncOnline);
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
    const box = $('#q') || $('#topsearch input');
    if (box) { e.preventDefault(); box.focus(); box.select(); } else if (store.get(TOKEN_KEY)) { e.preventDefault(); location.hash = '#/search'; }
  }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
playIntro();
syncOnline();
route();
