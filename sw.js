/* sw.js — offline + installability.
 * App shell is cached on install (cache-first). Third-party ESM/CSS from the
 * CDN is cached at runtime (stale-while-revalidate) so glance works offline
 * after the first successful load. Bump CACHE to invalidate. */

const CACHE = 'glance-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './src/main.js',
  './src/pipeline.js',
  './src/theme.js',
  './src/files.js',
  './src/icons.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache shell items individually so one 404 doesn't fail the whole install.
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
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
  const isCDN = url.origin === 'https://esm.sh';
  const sameOrigin = url.origin === self.location.origin;

  if (isCDN) {
    // stale-while-revalidate for CDN modules/styles
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (sameOrigin) {
    // cache-first for the app shell, fall back to network (and cache it)
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached)
      )
    );
  }
});
