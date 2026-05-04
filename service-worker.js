const CACHE = 'vixe-extras-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/logo-vixe.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request).then(cached => {
      if (cached) return cached;
      return fetch(ev.request).then(resp => {
        const copy = resp.clone();
        if (resp.ok && new URL(ev.request.url).origin === location.origin) {
          caches.open(CACHE).then(c => c.put(ev.request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
