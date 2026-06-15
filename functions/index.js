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
const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// Plausible stored formats for a typed phone (mirror of the client helper).
function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const set = new Set();
  if (raw) set.add(String(raw).trim());
  if (digits) { set.add(digits); set.add(`+${digits}`); }
  if (last10) { set.add(last10); set.add(`+91${last10}`); set.add(`91${last10}`); set.add(`0${last10}`); }
  return [...set].filter(Boolean).slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Pre-login lookups (run with admin privileges so the users collection
 * can stay private). Callable without auth.
 * ------------------------------------------------------------------ */
exports.lookupLogin = onCall(async (req) => {
  const id = String(req.data?.loginId || '').trim();
  if (!id) return { found: false };
  const users = db.collection('users');
  let snap;
  if (id.includes('@')) {
    snap = await users.where('email', '==', id.toLowerCase()).limit(1).get();
  } else {
    const variants = phoneVariants(id);
    if (!variants.length) return { found: false };
    snap = await users.where('phone', 'in', variants).limit(1).get();
  }
  if (snap.empty) return { found: false };
  const u = snap.docs[0].data();
  // Minimal, non-sensitive: just what the login flow needs.
  return { found: true, isActive: u.isActive !== false, phone: u.phone || '' };
});

exports.checkAdminExists = onCall(async () => {
  const snap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  return { exists: !snap.empty };
});

// Create an in-app notification doc (pushOnNotification then delivers the push).
function createNotification(userId, { type, title, body, orderId = null }) {
  if (!userId) return Promise.resolve();
  return db.collection('notifications').add({
    userId, type, title, body, orderId, isRead: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

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
 * 2a. Chat message → notify ONLY that channel's members (+ admins),
 *     never the sender, never anyone outside the channel.
 * ------------------------------------------------------------------ */
exports.notifyOnMessage = onDocumentCreated('messages/{id}', async (event) => {
  const m = event.data?.data();
  if (!m || !m.channelId) return;
  if (m.type === 'stage' || m.type === 'order') return; // system entries, not chat

  const [chSnap, adminsSnap] = await Promise.all([
    db.collection('channels').doc(m.channelId).get(),
    db.collection('users').where('role', '==', 'admin').get(),
  ]);
  if (!chSnap.exists) return;

  const members = chSnap.data().memberIds || [];      // assigned team + channel vendors
  const admins = adminsSnap.docs.map((d) => d.id);    // admins are in every channel
  const recipients = [...new Set([...members, ...admins])].filter((uid) => uid && uid !== m.senderId);

  const preview = m.type === 'voice' ? '🎙️ Voice message'
    : m.type === 'image' ? '📷 Photo'
      : m.type === 'video' ? '🎥 Video'
        : String(m.content || '').slice(0, 90);

  await Promise.all(recipients.map((uid) => createNotification(uid, {
    type: 'message',
    title: `New message${m.senderCode ? ` · ${m.senderCode}` : ''}`,
    body: preview,
    orderId: m.orderId || null,
  })));
});

/* ------------------------------------------------------------------ *
 * 2b. New order → notify ONLY the vendor members of that order's channel.
 * ------------------------------------------------------------------ */
exports.notifyOnOrder = onDocumentCreated('orders/{id}', async (event) => {
  const o = event.data?.data();
  if (!o || o.isDraft || !o.channelId) return;

  const snap = await db.collection('users').where('channelId', '==', o.channelId).get();
  const vendors = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.role === 'vendor' && u.isActive !== false);

  await Promise.all(vendors.map((v) => createNotification(v.id, {
    type: 'new',
    title: 'New order assigned',
    body: `${o.appOrderNo || ''} · ${o.itemName || ''}`,
    orderId: event.params.id,
  })));
});

/* ------------------------------------------------------------------ *
 * 3. Daily 11:00 + 15:00 IST reminders for un-started (New) orders
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
