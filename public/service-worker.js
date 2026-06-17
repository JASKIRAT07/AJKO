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

/* ---- app-shell caching (network-first so new deploys are never stale) ---- */
const CACHE = 'ajko-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (/firestore|googleapis|firebaseio|identitytoolkit|firebasestorage|gstatic/.test(url.host)) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
  );
});
