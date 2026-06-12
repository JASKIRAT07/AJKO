/* AJKO Firebase Cloud Messaging background worker.
   Uses the compat builds because service workers can't use ES modules from npm. */
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
  const orderId = event.notification.data?.orderId;
  const url = orderId ? `/order/${orderId}` : '/';
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.navigate(url).then(() => c.focus()); }
    return clients.openWindow(url);
  }));
});
