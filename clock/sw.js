/* Yakō Clock service worker
   - The page is fetched from the network first so updates arrive right away,
     falling back to the cached copy after 2.5 s or when offline.
   - Textures, icons and fonts: cached copy first.
   - Weather (api.open-meteo.com) is never cached here; the page keeps its own last reading. */
const CACHE = 'yako-clock-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './tex/day.jpg', './tex/night.jpg', './tex/water.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yako-clock-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);

  if (req.mode === 'navigate' && url.pathname.startsWith(scope.pathname)) {
    const net = fetch(url.origin + url.pathname, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); }
      return res;
    });
    event.waitUntil(net.catch(() => {}));
    event.respondWith((async () => {
      const cached = await caches.match('./index.html');
      try {
        return await Promise.race([net, new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), cached ? 2500 : 15000))]);
      } catch {
        return cached || net;
      }
    })());
    return;
  }

  const cacheable = (url.origin === self.location.origin && url.pathname.startsWith(scope.pathname))
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
