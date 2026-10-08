const $ = (id) => document.getElementById(id);
const FIELDS = ['url', 'token', 'minDwell', 'mode', 'blocklist'];
const FALLBACK = { url: 'http://localhost:4321', minDwell: 20, mode: 'full' };

(async () => {
  const s = await chrome.storage.local.get(FIELDS);
  $('url').value = s.url || FALLBACK.url;
  $('token').value = s.token || '';
  $('minDwell').value = s.minDwell ?? FALLBACK.minDwell;
  $('mode').value = s.mode || FALLBACK.mode;
  // Show the worker's defaults until the user customises them.
  if (s.blocklist) $('blocklist').value = s.blocklist.join('\n');
  else $('blocklist').placeholder = 'Using the built-in list (email, banking, password managers, payments).';
})();

const read = () => ({
  url: $('url').value.trim().replace(/\/$/, ''),
  token: $('token').value.trim(),
  minDwell: Number($('minDwell').value) || 0,
  mode: $('mode').value,
  ...($('blocklist').value.trim() ? { blocklist: $('blocklist').value.split('\n').map((l) => l.trim()).filter(Boolean) } : {}),
});

$('save').onclick = async () => {
  await chrome.storage.local.set(read());
  $('msg').textContent = 'Saved.';
};

$('test').onclick = async () => {
  const { url, token } = read();
  $('msg').textContent = 'Testing…';
  try {
    const res = await fetch(`${url}/api/stats`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error('token rejected');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const st = await res.json();
    $('msg').textContent = `Connected — ${st.total} memories in your brain.`;
  } catch (err) {
    $('msg').textContent = `Couldn't connect: ${err.message}`;
  }
};
