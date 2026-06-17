// Registers the PWA service worker and (optionally) wires up FCM web push.
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app, db, VAPID_KEY } from './firebase';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      // ONE worker for scope "/" — it handles BOTH app-shell caching and FCM
      // background push. Two workers at the same scope clobber each other and
      // break push.
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (e) {
      // service worker registration is best-effort
      console.warn('SW registration failed', e);
    }
  });
}

// Call after login to enable push for the current user.
export async function enablePush(userId) {
  try {
    if (!VAPID_KEY) { console.warn('[push] no VAPID key'); return; }
    if (!(await isSupported())) { console.warn('[push] FCM not supported in this browser'); return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { console.warn('[push] permission:', permission); return; }

    const messaging = getMessaging(app);
    // Use OUR merged worker explicitly (the one that has onBackgroundMessage),
    // not whatever navigator.serviceWorker.ready happens to resolve to.
    const reg = (await navigator.serviceWorker.getRegistration('/service-worker.js'))
      || (await navigator.serviceWorker.ready);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token && userId) {
      await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) });
      console.log('[push] token registered for', userId);
    } else {
      console.warn('[push] no token returned');
    }
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (title) new Notification(title, { body, icon: '/logo192.png' });
    });
  } catch (e) {
    console.warn('[push] setup failed', e);
  }
}
