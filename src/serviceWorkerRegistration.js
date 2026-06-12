// Registers the PWA service worker and (optionally) wires up FCM web push.
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app, db, VAPID_KEY } from './firebase';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      // App shell / offline cache
      await navigator.serviceWorker.register('/service-worker.js');
      // FCM background handler
      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (e) {
      // service worker registration is best-effort
      console.warn('SW registration failed', e);
    }
  });
}

// Call after login to enable push for the current user.
export async function enablePush(userId) {
  try {
    if (!VAPID_KEY) return; // no VAPID key configured yet
    if (!(await isSupported())) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const messaging = getMessaging(app);
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token && userId) {
      await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) });
    }
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (title) new Notification(title, { body, icon: '/logo192.png' });
    });
  } catch (e) {
    console.warn('Push setup failed', e);
  }
}
