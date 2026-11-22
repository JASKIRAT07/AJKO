/* AJKO service worker — ONE worker for scope "/":
   (a) FCM background push, and (b) network-first app-shell caching.
   Registering two workers at the same scope makes them clobber each other and
   breaks push, so everything lives here. Uses the firebase compat builds
   because classic service workers can't import ES modules from npm. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyATpiZkyORCyC-aX2_1tGzWT5Wt2UM4P4g',
  authDomain: 'ajko-48799.firebaseapp.com',
  projectId: 'ajko-48799',
  storageBucket: 'ajko-48799.firebasestorage.app',
  messagingSenderId: '896852600820',
  appId: '1:896852600820:web:4fe14ce61ba1ca00113ba1',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'AJKO', {
    body: body || '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const orderId = event.notification.data && event.notification.data.orderId;
  const url = orderId ? `/order/${orderId}` : '/';
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.navigate(url).then(() => c.focus()); }
    return clients.openWindow(url);
  }));
});

/* ---- caching strategy (faster loads, never stale) -----------------------
   - Images (incl. Firebase Storage + Cloudflare Stream thumbs): stale-while-
     revalidate → instant on repeat views, refreshed in the background.
   - Content-hashed static assets (/static/js|css|media): cache-first → the app
     shell loads instantly on repeat visits (filenames change each deploy, so
     this is never stale).
   - index.html / navigations: network-first → new deploys are picked up at once.
   - Firestore / Auth / FCM / signed (expiring) URLs: never cached.            */
const CACHE = 'ajko-v4';
const IMG_CACHE = 'ajko-img-v2';
const KEEP = [CACHE, IMG_CACHE];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((c) => c.match(request).then((hit) => hit
    || fetch(request).then((res) => { if (res && res.ok) c.put(request, res.clone()).catch(() => {}); return res; })));
}
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((c) => c.match(request).then((hit) => {
    const net = fetch(request)
      // Cross-origin <img> loads (Firebase Storage, Stream thumbs) come back as
      // OPAQUE responses (status 0, ok=false) — they are cacheable and must be
      // stored, or images re-download on every navigation.
      .then((res) => { if (res && (res.ok || res.type === 'opaque')) c.put(request, res.clone()).catch(() => {}); return res; })
      .catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Expiring signed URLs (e.g. R2 recording playback) — never cache.
  if (/r2\.cloudflarestorage\.com/.test(url.host) || /[?&](X-Amz-|Signature=)/.test(request.url)) return;

  // Firestore / Realtime DB / Auth / FCM / gstatic — never touch.
  if (/firestore|firebaseio|identitytoolkit/.test(url.host)) return;
  if (url.host.includes('gstatic')) return;
  if (url.host.includes('googleapis') && !/firebasestorage/.test(url.host)) return;

  // Images → stale-while-revalidate (includes Firebase Storage + Stream thumbs).
  const isImage = request.destination === 'image'
    || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url.pathname)
    || /firebasestorage|cloudflarestream\.com|videodelivery\.net/.test(url.host);
  if (isImage) { e.respondWith(staleWhileRevalidate(request, IMG_CACHE)); return; }

  // Content-hashed static assets → cache-first.
  if (/\/static\/(js|css|media)\//.test(url.pathname)) { e.respondWith(cacheFirst(request, CACHE)); return; }

  // Everything else (index.html, navigations) → network-first.
  e.respondWith(
    fetch(request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
  );
});
