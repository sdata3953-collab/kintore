/* 筋トレ日記 service worker
   - App shell is cached so the app opens even with no signal in the gym.
   - The page itself is fetched from the network first (to pick up updates),
     falling back to the cached copy after 2.5 seconds or when offline. */
const CACHE = 'kintore-diary-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The page: network first, cached copy when slow or offline
  if (req.mode === 'navigate') {
    const net = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
      }
      return res;
    });
    event.waitUntil(net.catch(() => {}));
    event.respondWith((async () => {
      const cached = await caches.match('./index.html');
      try {
        return await Promise.race([
          net,
          new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), cached ? 2500 : 15000)),
        ]);
      } catch {
        return cached || net;
      }
    })());
    return;
  }

  // Icons, manifest and web fonts: cached copy first, refreshed in the background
  const cacheable = url.origin === self.location.origin
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
