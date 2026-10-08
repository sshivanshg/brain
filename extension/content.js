// Measures real reading time (tab visible + window focused), grabs readable text and
// anything you copy, and hands it to the background worker. Nothing leaves the browser from here.
(() => {
  if (window.__brain) return;
  window.__brain = true;

  const active = () => document.visibilityState === 'visible' && document.hasFocus();
  let since = active() ? Date.now() : null;
  let dwell = 0;
  const highlights = [];

  const tick = () => { if (since) { dwell += Date.now() - since; since = Date.now(); } };
  const pause = () => { tick(); since = null; };
  const resume = () => { if (!since && active()) since = Date.now(); };

  function extract() {
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || '';
    const root = document.querySelector('article, main, [role="main"]') || document.body;
    const text = (root?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
    return { url: location.href.split('#')[0], title: document.title || meta('og:title'), description: meta('description') || meta('og:description'), text };
  }

  function send(page) {
    try { chrome.runtime.sendMessage({ type: 'visit', page }); } catch { /* extension reloaded */ }
  }

  function report() {
    tick();
    const seconds = Math.round(dwell / 1000);
    if (seconds < 2 && !highlights.length) return;
    dwell = 0;
    send({ ...extract(), dwell: seconds, highlights: highlights.splice(0) });
  }

  // First sighting (dwell 0): lets the worker log pages an agent opens in a background tab.
  setTimeout(() => send({ ...extract(), dwell: 0, highlights: [], seen: true }), 4000);

  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? (report(), (since = null)) : resume()));
  window.addEventListener('focus', resume);
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', report);
  document.addEventListener('copy', () => {
    const s = String(getSelection() || '').trim();
    if (s.length > 20) highlights.push(s.slice(0, 1000));
  });
  setInterval(() => { if (active()) report(); }, 30000);

  let last = location.href;
  setInterval(() => { if (location.href !== last) { report(); last = location.href; } }, 1500);

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'extract') reply({ ...extract(), selection: String(getSelection() || '').trim() });
  });
})();
