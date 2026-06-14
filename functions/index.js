/**
 * AJKO Cloud Functions — vendor push notifications.
 *
 *  - pushOnNotification     : delivers any `notifications/{id}` doc as an FCM push
 *                             to that user's devices, honouring the recipient's
 *                             notificationPrefs (newOrderAlert / dailyReminders).
 *                             New-order docs are written by the app the instant an
 *                             order is created (#29), so those push immediately.
 *  - dailyVendorReminders   : runs at 11:00 and 15:00 IST; for each vendor who has
 *                             daily reminders enabled and still has orders in the
 *                             New stage, creates a reminder notification (#26/#28).
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Which notification types each preference toggle controls.
function allowedByPrefs(type, prefs = {}) {
  if (type === 'new') return prefs.newOrderAlert !== false;        // default on
  if (type === 'reminder') return prefs.dailyReminders !== false;  // default on
  return true; // any other notification type is always delivered
}

/* ------------------------------------------------------------------ *
 * 1. Deliver notification docs as pushes
 * ------------------------------------------------------------------ */
exports.pushOnNotification = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data();
  if (!n?.userId) return;

  const userSnap = await db.collection('users').doc(n.userId).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();

  if (!allowedByPrefs(n.type, user.notificationPrefs)) {
    logger.info(`Prefs disable '${n.type}' for ${n.userId}; skipping push.`);
    return;
  }

  const tokens = user.fcmTokens || [];
  if (tokens.length === 0) return;

  const message = {
    tokens,
    notification: { title: n.title || 'AJKO', body: n.body || '' },
    data: { type: String(n.type || ''), orderId: String(n.orderId || '') },
    webpush: {
      fcmOptions: { link: n.orderId ? `/order/${n.orderId}` : '/' },
      notification: { icon: '/logo192.png', badge: '/logo192.png' },
    },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    await cleanupTokens(n.userId, tokens, res);
    logger.info(`Pushed to ${n.userId}: ${res.successCount}/${tokens.length}`);
  } catch (e) {
    logger.error('Push failed', e);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Daily 11:00 + 15:00 IST reminders for un-started (New) orders
 * ------------------------------------------------------------------ */
exports.dailyVendorReminders = onSchedule(
  { schedule: '0 11,15 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const [usersSnap, ordersSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('orders').where('stage', '==', 'new').get(),
    ]);

    // Count New-stage orders per channel.
    const newByChannel = {};
    ordersSnap.docs.forEach((d) => {
      const o = d.data();
      if (o.isDraft) return;
      if (o.channelId) newByChannel[o.channelId] = (newByChannel[o.channelId] || 0) + 1;
    });

    const vendors = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.role === 'vendor' && u.isActive !== false
        && (u.notificationPrefs?.dailyReminders !== false)
        && u.channelId && newByChannel[u.channelId]);

    await Promise.all(vendors.map((v) => db.collection('notifications').add({
      userId: v.id,
      type: 'reminder',
      title: 'Orders waiting to be started',
      body: `You have ${newByChannel[v.channelId]} order(s) still in New. Please start work.`,
      orderId: null,
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })));

    logger.info(`Daily reminders sent to ${vendors.length} vendor(s).`);
  }
);

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */
async function cleanupTokens(userId, tokens, res) {
  const bad = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        bad.push(tokens[i]);
      }
    }
  });
  if (bad.length) {
    await db.collection('users').doc(userId).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...bad),
    }).catch(() => {});
  }
}
