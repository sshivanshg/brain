// Queues page visits locally and ships them to the brain once a minute.
// A page counts once you've actually read it (min dwell) or copied from it; pages your
// browser agent opens (tabs in a "Claude"/"agent" tab group) always count, tagged chrome-agent.
import { DEFAULT_BLOCKLIST, CHAT_HOSTS, blocked } from './lib.js';

const DEFAULTS = {
  url: '',
  token: '',
  minDwell: 20,
  mode: 'full', // 'full' = readable text, 'titles' = title + url only
  paused: false,
  blocklist: DEFAULT_BLOCKLIST,
};

const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) });
const today = () => new Date().toLocaleDateString('en-CA');

// Serialize every read-modify-write of the queue.
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

// Page capture needs the optional <all_urls> grant; content.js is only registered once the
// user has given it on the setup page, and unregistered the moment it is revoked.
const CAPTURE = { id: 'capture', matches: ['http://*/*', 'https://*/*'], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true };
async function syncCaptureScript() {
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [CAPTURE.id] })).length > 0;
  if (granted && !registered) await chrome.scripting.registerContentScripts([CAPTURE]);
  if (!granted && registered) await chrome.scripting.unregisterContentScripts({ ids: [CAPTURE.id] });
}
chrome.permissions.onAdded.addListener(() => syncCaptureScript());
chrome.permissions.onRemoved.addListener(() => syncCaptureScript());

async function isAgentTab(tab) {
  if (!tab || tab.groupId === undefined || tab.groupId === -1) return false;
  try { return /claude|agent|mcp|operator/i.test((await chrome.tabGroups.get(tab.groupId)).title || ''); } catch { return false; }
}

async function handleVisit(page, tab) {
  const s = await settings();
  if (s.paused || tab?.incognito || !/^https?:/.test(page.url || '')) return;
  if (s.url && page.url.startsWith(s.url)) return;
  if (blocked(page.url, s.blocklist)) return;
  if (CHAT_HOSTS.includes(new URL(page.url).hostname)) return; // saved as conversations by chat.js instead
  const agent = await isAgentTab(tab);
  if (page.seen && !agent) return; // ordinary tabs must earn their place with real reading time
  await serial(async () => {
    const { queue = {} } = await chrome.storage.local.get('queue');
    const q = queue[page.url] || { url: page.url, dwell: 0, highlights: [], first: Date.now() };
    q.title = page.title || q.title;
    q.description = page.description || q.description;
    if (s.mode === 'full' && page.text && (!q.text || page.text.length > q.text.length)) q.text = page.text;
    q.dwell += page.dwell || 0;
    q.highlights.push(...(page.highlights || []));
    q.agent = q.agent || agent;
    q.last = Date.now();
    queue[page.url] = q;
    await chrome.storage.local.set({ queue });
  });
}

async function flush() {
  const s = await settings();
  if (!s.token || !s.url) return;
  await serial(async () => {
    const { queue = {}, sent = {} } = await chrome.storage.local.get(['queue', 'sent']);
    const day = today();
    const ready = [];
    const keep = {};
    for (const [key, q] of Object.entries(queue)) {
      const already = sent[key] === day;
      if (q.agent || q.highlights.length || q.dwell >= s.minDwell || (already && q.dwell > 0)) ready.push(q);
      else if (Date.now() - q.last < 6 * 3600e3) keep[key] = q;
    }
    if (!ready.length) return chrome.storage.local.set({ queue: keep });
    try {
      const res = await fetch(`${s.url}/api/capture/browse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'chrome' },
        body: JSON.stringify(ready.map((q) => ({ url: q.url, title: q.title, description: q.description, text: q.text, dwell: q.dwell, highlights: q.highlights, source: q.agent ? 'chrome-agent' : 'chrome', at: q.first }))),
      });
      if (!res.ok) throw new Error(String(res.status));
      const nextSent = Object.fromEntries(Object.entries(sent).filter(([, d]) => d === day));
      for (const q of ready) nextSent[q.url] = day;
      const { stats = {} } = await chrome.storage.local.get('stats');
      const count = (stats.day === day ? stats.count : 0) + ready.filter((q) => sent[q.url] !== day).length;
      await chrome.storage.local.set({ queue: keep, sent: nextSent, stats: { day, count, lastSync: Date.now(), error: null } });
    } catch (err) {
      for (const q of ready) keep[q.url] = q;
      await chrome.storage.local.set({ queue: keep, stats: { ...(await chrome.storage.local.get('stats')).stats, error: `Sync failed (${err.message})` } });
    }
  });
}

async function remember(body) {
  const s = await settings();
  if (!s.token || !s.url) throw new Error('Set your brain URL and token in the extension options.');
  const res = await fetch(`${s.url}/api/memories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'chrome' },
    body: JSON.stringify({ source: 'chrome', ...body }),
  });
  if (!res.ok) throw new Error(`Brain said ${res.status}`);
  return res.json();
}

async function brainFetch(p, opts = {}) {
  const s = await settings();
  if (!s.token || !s.url) throw new Error('Set your brain URL and token in the extension options.');
  const res = await fetch(`${s.url}${p}`, { ...opts, headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json', 'X-Brain-Source': 'chrome' } });
  if (!res.ok) throw new Error(`Brain said ${res.status}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

// What to paste into a web chat: memories matching what you've typed, or your general briefing.
async function chatContext(query) {
  if (!query) return (await brainFetch('/api/brief')).replace(/^# .*\n/, '').replace(/\n_Save decisions[\s\S]*$/, '').slice(0, 3000);
  const { sources } = await brainFetch('/api/ask', { method: 'POST', body: JSON.stringify({ question: query }) });
  if (!sources.length) return '(nothing relevant in the brain)';
  return sources.slice(0, 6).map((m) => `- [${m.kind}${m.project ? ` · ${m.project}` : ''} · ${m.day}] ${m.title}: ${String(m.summary || m.body || '').replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
}

// Prefer the capture script; without the capture grant, activeTab (the click/shortcut) lets us read the page once.
function extractInPage() {
  const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || '';
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  return { url: location.href.split('#')[0], title: document.title, description: meta('description') || meta('og:description'), text: (root?.innerText || '').slice(0, 12000), selection: String(getSelection() || '').trim() };
}
async function pageOf(tab) {
  try { return await chrome.tabs.sendMessage(tab.id, { type: 'extract' }); } catch { /* not injected */ }
  try { return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractInPage }))[0].result; } catch { return { url: tab.url, title: tab.title, text: '' }; }
}

async function savePage(tab, note = '', kind = 'bookmark') {
  if (tab?.incognito) throw new Error('Incognito tabs are never saved.');
  const p = await pageOf(tab);
  const body = [note, p.selection ? `> ${p.selection.replace(/\n/g, '\n> ')}` : '', p.description || '', p.text ? p.text.slice(0, 6000) : ''].filter(Boolean).join('\n\n');
  return remember({ kind, title: p.title || tab.title, url: p.url || tab.url, body, summary: note || p.description || null });
}

function flash(text) {
  chrome.action.setBadgeBackgroundColor({ color: '#0057a8' }); // design-ok: badge API takes literals (--accent)
  chrome.action.setBadgeText({ text });
  setTimeout(() => refreshBadge(), 2500);
}
async function refreshBadge() {
  const { paused, token, url } = await settings();
  if (!token || !url) {
    chrome.action.setBadgeBackgroundColor({ color: '#a3261b' }); // design-ok: badge API takes literals (--danger)
    return chrome.action.setBadgeText({ text: 'set' });
  }
  chrome.action.setBadgeBackgroundColor({ color: '#4a3f35' }); // design-ok: badge API takes literals (--muted)
  chrome.action.setBadgeText({ text: paused ? 'off' : '' });
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.create({ id: 'page', title: 'Save page to Brain', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'selection', title: 'Save selection to Brain', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'link', title: 'Save link to Brain', contexts: ['link'] });
  chrome.alarms.create('flush', { periodInMinutes: 1 });
  refreshBadge();
  syncCaptureScript();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
});
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('flush', { periodInMinutes: 1 }); refreshBadge(); syncCaptureScript(); });
chrome.storage.onChanged.addListener((changes) => { if (changes.token || changes.url || changes.paused) refreshBadge(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'flush') flush(); });

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'page') await savePage(tab);
    if (info.menuItemId === 'selection') await remember({ kind: 'highlight', title: tab.title, url: tab.url, body: info.selectionText });
    if (info.menuItemId === 'link') await remember({ kind: 'bookmark', title: info.linkUrl, url: info.linkUrl, body: `Saved from ${tab.title}\n${tab.url}` });
    flash('✓');
  } catch { flash('!'); }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'save-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { await savePage(tab); flash('✓'); } catch { flash('!'); }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'visit') { handleVisit(msg.page, sender.tab).finally(() => reply({ ok: true })); return true; }
  if (msg.type === 'save') { chrome.tabs.get(msg.tabId).then((tab) => savePage(tab, msg.note, msg.kind)).then((m) => reply({ ok: true, id: m.id }), (e) => reply({ ok: false, error: e.message })); return true; }
  if (msg.type === 'chat-context') { chatContext(msg.query).then((context) => reply({ ok: true, context }), (e) => reply({ ok: false, error: e.message })); return true; }
  if (msg.type === 'chat-save') { if (sender.tab?.incognito) { reply({ ok: false }); return false; } settings().then((s) => (s.paused ? null : brainFetch('/api/sessions', { method: 'POST', body: JSON.stringify({ session_id: msg.session_id, agent: msg.agent, title: msg.title, transcript: msg.transcript, first_prompt: msg.title }) }))).then(() => reply({ ok: true }), () => reply({ ok: false })); return true; }
  if (msg.type === 'flush') { flush().then(() => reply({ ok: true })); return true; }
  if (msg.type === 'badge') { refreshBadge(); }
  return false;
});
