// App shell cache so the PWA opens instantly (and offline). API calls always go to the network.
const CACHE = 'brain-shell-v7';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/lib.js', '/intro.js', '/field.js', '/brain.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp') || url.pathname === '/share') return;
  // Network first, fall back to cache — fresh when online, still works offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))),
  );
});

self.addEventListener('push', (e) => {
  const d = (() => { try { return e.data.json(); } catch { return { title: 'Brain', body: e.data?.text() || '' }; } })();
  e.waitUntil(self.registration.showNotification(d.title || 'Brain', { body: d.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow(e.notification.data?.url || '/'))));
});
