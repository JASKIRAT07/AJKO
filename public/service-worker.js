/* AJKO app-shell service worker — basic offline support */
const CACHE = 'ajko-v1';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/logo192.png', '/logo512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request);
  // never cache Firebase/Firestore/Storage API traffic
  if (/firestore|googleapis|firebaseio|identitytoolkit|firebasestorage/.test(url.host)) return;

  // network-first for navigations (so deploys show up), cache fallback offline
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  // cache-first for static assets
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => cached))
  );
});
