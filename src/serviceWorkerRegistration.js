// Registers the PWA service worker and wires up FCM web push.
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

// ---- device / permission helpers (used by the UI) ---------------------------
export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

// True when launched from the home-screen icon (installed PWA). iOS web push
// ONLY works in this mode.
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const notificationPermission = () =>
  (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';

// Gets an FCM token for this device and saves it on the user doc, so the
// pushOnNotification Cloud Function can deliver to it. Also wires foreground
// messages to a visible notification.
async function registerToken(userId) {
  if (!VAPID_KEY) return { ok: false, reason: 'no-vapid' };
  if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
  const messaging = getMessaging(app);
  // Use OUR merged worker explicitly (the one with onBackgroundMessage).
  const reg = (await navigator.serviceWorker.getRegistration('/service-worker.js'))
    || (await navigator.serviceWorker.ready);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (token && userId) {
    await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) });
    console.log('[push] token registered for', userId);
  }
  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    if (title && typeof Notification !== 'undefined') new Notification(title, { body, icon: '/logo192.png' });
  });
  return token ? { ok: true } : { ok: false, reason: 'no-token' };
}

// Silent: on login, (re)register a token ONLY if the user already granted
// permission. Never prompts — prompting must come from a button tap (iOS rule).
export async function enablePush(userId) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    await registerToken(userId);
  } catch (e) {
    console.warn('[push] silent enable failed', e);
  }
}

// From a button tap: ask for permission, then register. Returns a status the UI
// can explain to the user.
export async function requestPush(userId) {
  try {
    if (typeof Notification === 'undefined' || !(await isSupported())) {
      return { ok: false, reason: 'unsupported' };
    }
    // iOS only delivers web push when the app is installed to the home screen.
    if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' };

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    return await registerToken(userId);
  } catch (e) {
    console.warn('[push] request failed', e);
    return { ok: false, reason: 'error', error: String(e?.message || e) };
  }
}
