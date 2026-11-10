import { DEFAULT_BLOCKLIST, originPattern, normalizeUrl } from './lib.js';

const $ = (id) => document.getElementById(id);
const CAPTURE = { origins: ['<all_urls>'] };
const welcome = new URLSearchParams(location.search).has('welcome');
if (!welcome) $('title').textContent = 'Brain settings';

function show(el, kind, text) { el.className = `state ${kind}`; el.textContent = text; }

(async () => {
  const s = await chrome.storage.local.get(['url', 'token', 'minDwell', 'mode', 'blocklist']);
  $('url').value = s.url || '';
  $('token').value = s.token || '';
  $('minDwell').value = s.minDwell ?? 20;
  $('mode').value = s.mode || 'full';
  $('blocklist').value = (s.blocklist || DEFAULT_BLOCKLIST).join('\n');
  await renderCapture();
  if (!s.url) $('url').focus();
})();

async function renderCapture() {
  const on = await chrome.permissions.contains(CAPTURE);
  $('grant').hidden = on;
  $('revoke').hidden = !on;
  $('capState').textContent = on ? '— on' : '— off';
}

// Explains each failure in terms of what to do next.
async function check(url, token) {
  let health;
  try {
    const res = await fetch(`${url}/api/health`);
    health = await res.json();
  } catch {
    throw new Error(`Couldn't reach ${url}. Check the address and that your Brain is running.`);
  }
  if (!health?.ok) throw new Error(`${url} answered, but it doesn't look like a Brain server.`);
  const res = await fetch(`${url}/api/stats`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new Error('Your Brain is up, but it rejected that token. Create a new one and paste it again.');
  if (!res.ok) throw new Error(`Your Brain is up, but /api/stats answered ${res.status}.`);
  return res.json();
}

$('test').onclick = async () => {
  const url = normalizeUrl($('url').value);
  const token = $('token').value.trim();
  const origin = originPattern(url);
  if (!origin) return show($('conn'), 'bad', 'Enter the full address, starting with https:// (or http://localhost).');
  if (!token) return show($('conn'), 'bad', 'Paste an access token too.');
  // Must run first, inside the click, so Chrome shows its prompt.
  const allowed = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  if (!allowed) return show($('conn'), 'bad', `Chrome needs permission to talk to ${new URL(url).host}. Click Test connection again and choose Allow.`);
  $('test').disabled = true;
  show($('conn'), '', 'Checking your Brain…');
  try {
    const st = await check(url, token);
    await chrome.storage.local.set({ url, token });
    show($('conn'), 'ok', `✓ Connected — ${st.total ?? 'your'} memories in your Brain. Saved.`);
  } catch (err) {
    show($('conn'), 'bad', err.message);
  } finally {
    $('test').disabled = false;
  }
};

$('grant').onclick = async () => {
  const ok = await chrome.permissions.request(CAPTURE).catch(() => false);
  await renderCapture();
  show($('msg'), ok ? 'ok' : 'bad', ok ? '✓ Page capture is on.' : 'Page capture stays off. You can turn it on here any time.');
};
$('revoke').onclick = async () => {
  await chrome.permissions.remove(CAPTURE); // the Brain origin was granted separately and stays
  await renderCapture();
  show($('msg'), 'ok', 'Page capture is off. Nothing new will be read from pages.');
};

$('save').onclick = async () => {
  const blocklist = $('blocklist').value.split('\n').map((l) => l.trim()).filter(Boolean);
  await chrome.storage.local.set({ minDwell: Math.max(0, Number($('minDwell').value) || 0), mode: $('mode').value, blocklist });
  show($('msg'), 'ok', `✓ Saved. ${blocklist.length} sites are never captured.`);
};
$('reset').onclick = () => {
  $('blocklist').value = DEFAULT_BLOCKLIST.join('\n');
  show($('msg'), '', 'Default blocklist restored — Save preferences to keep it.');
};
