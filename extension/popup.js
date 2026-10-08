const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

(async () => {
  const s = await chrome.storage.local.get(['url', 'token', 'paused', 'queue', 'stats']);
  const url = s.url || 'http://localhost:4321';
  const headers = { Authorization: `Bearer ${s.token || ''}` };
  $('paused').checked = Boolean(s.paused);
  $('queued').textContent = Object.keys(s.queue || {}).length;
  $('open').onclick = () => chrome.tabs.create({ url });
  $('opts').onclick = () => chrome.runtime.openOptionsPage();
  $('paused').onchange = async (e) => { await chrome.storage.local.set({ paused: e.target.checked }); chrome.runtime.sendMessage({ type: 'badge' }); };

  if (!s.token) { $('status').textContent = 'not connected'; $('status').className = 'bad'; return; }
  try {
    const res = await fetch(`${url}/api/stats`, { headers });
    if (!res.ok) throw new Error(res.status);
    const st = await res.json();
    $('pages').textContent = st.pages_today;
    $('mem').textContent = st.today;
    $('status').textContent = s.stats?.error || 'connected';
    $('status').className = s.stats?.error ? 'bad' : 'good';
  } catch {
    $('status').textContent = 'offline';
    $('status').className = 'bad';
  }

  $('save').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    $('save').textContent = 'Saving…';
    const r = await chrome.runtime.sendMessage({ type: 'save', tabId: tab.id, note: $('note').value.trim(), kind: $('kind').value });
    $('save').textContent = r?.ok ? 'Saved ✓' : 'Failed';
    if (r?.ok) { $('note').value = ''; setTimeout(() => window.close(), 700); }
  };

  let timer;
  $('q').oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = $('q').value.trim();
      if (!q) { $('results').innerHTML = ''; return; }
      const rows = await fetch(`${url}/api/memories?q=${encodeURIComponent(q)}&limit=6`, { headers }).then((r) => r.json()).catch(() => []);
      $('results').innerHTML = rows.map((m) => `<a class="hit" data-id="${m.id}"><span class="k">${esc(m.kind)}${m.project ? ` · ${esc(m.project)}` : ''}</span>${esc(m.title)}</a>`).join('') || '<p class="muted">Nothing found.</p>';
      $('results').querySelectorAll('.hit').forEach((a) => { a.onclick = () => chrome.tabs.create({ url: `${url}/#/m/${a.dataset.id}` }); });
    }, 220);
  };
  chrome.runtime.sendMessage({ type: 'flush' });
})();
