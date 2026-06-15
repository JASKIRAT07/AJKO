/**
 * AJKO Cloud Functions — scoped, private push notifications.
 *
 * Notification types & push text:
 *   new       → "New Order — AO-001"          (vendor members of the order's channel only)
 *   message   → "New message in <channel>"    (that channel's members + admins, not the sender)
 *   reminder  → "You have pending orders"      (each vendor, only if THEY have New-stage orders)
 *
 * Per-user toggles (notificationPrefs, all default ON):
 *   vendor → newOrderAlert, reminder11am, reminder3pm, chatNotifications
 *   team   → chatNotifications
 *   admin  → chatNotifications
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

// ---- helpers ----------------------------------------------------------------
function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const set = new Set();
  if (raw) set.add(String(raw).trim());
  if (digits) { set.add(digits); set.add(`+${digits}`); }
  if (last10) { set.add(last10); set.add(`+91${last10}`); set.add(`91${last10}`); set.add(`0${last10}`); }
  return [...set].filter(Boolean).slice(0, 10);
}

function createNotification(userId, { type, title, body = '', orderId = null }) {
  if (!userId) return Promise.resolve();
  return db.collection('notifications').add({
    userId, type, title, body, orderId, isRead: false,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Whether a push should be delivered, based on the recipient's toggles.
// (Reminders are already gated when created, so they're always allowed here.)
function allowedByPrefs(type, prefs = {}) {
  if (type === 'new') return prefs.newOrderAlert !== false;
  if (type === 'message') return prefs.chatNotifications !== false;
  return true;
}

async function cleanupTokens(userId, tokens, res) {
  const bad = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) bad.push(tokens[i]);
    }
  });
  if (bad.length) {
    await db.collection('users').doc(userId).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...bad),
    }).catch(() => {});
  }
}

// ---- 1. Deliver every notification doc as an FCM push -----------------------
exports.pushOnNotification = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data();
  if (!n?.userId) return;

  const userSnap = await db.collection('users').doc(n.userId).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();

  if (!allowedByPrefs(n.type, user.notificationPrefs)) return;

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
  } catch (e) {
    logger.error('Push failed', e);
  }
});

// ---- 2. Chat message → that channel's members (+ admins), not the sender ----
exports.notifyOnMessage = onDocumentCreated('messages/{id}', async (event) => {
  const m = event.data?.data();
  if (!m || !m.channelId) return;
  if (m.type === 'stage' || m.type === 'order') return; // system entries, not chat

  const [chSnap, adminsSnap] = await Promise.all([
    db.collection('channels').doc(m.channelId).get(),
    db.collection('users').where('role', '==', 'admin').get(),
  ]);
  if (!chSnap.exists) return;

  const ch = chSnap.data();
  const channelName = ch.name || ch.code || 'channel';
  const members = ch.memberIds || [];               // assigned team + channel vendors
  const admins = adminsSnap.docs.map((d) => d.id);  // admins are in every channel
  const recipients = [...new Set([...members, ...admins])].filter((uid) => uid && uid !== m.senderId);

  await Promise.all(recipients.map((uid) => createNotification(uid, {
    type: 'message',
    title: `New message in ${channelName}`,
    orderId: m.orderId || null,
  })));
});

// ---- 3. New order → only the vendor members of that order's channel ---------
exports.notifyOnOrder = onDocumentCreated('orders/{id}', async (event) => {
  const o = event.data?.data();
  if (!o || o.isDraft || !o.channelId) return;

  const snap = await db.collection('users').where('channelId', '==', o.channelId).get();
  const vendors = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.role === 'vendor' && u.isActive !== false);

  await Promise.all(vendors.map((v) => createNotification(v.id, {
    type: 'new',
    title: `New Order — ${o.appOrderNo || ''}`,
    orderId: event.params.id,
  })));
});

// ---- 4. Daily reminders (11:00 & 15:00 IST), individual per vendor ----------
async function runReminder(prefKey) {
  const [usersSnap, ordersSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('orders').where('stage', '==', 'new').get(),
  ]);

  const newByChannel = {};
  ordersSnap.docs.forEach((d) => {
    const o = d.data();
    if (o.isDraft) return;
    if (o.channelId) newByChannel[o.channelId] = (newByChannel[o.channelId] || 0) + 1;
  });

  // A vendor is reminded only if THEIR channel has New-stage orders and their toggle is on.
  const vendors = usersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.role === 'vendor' && u.isActive !== false
      && u.notificationPrefs?.[prefKey] !== false
      && u.channelId && newByChannel[u.channelId]);

  await Promise.all(vendors.map((v) => createNotification(v.id, {
    type: 'reminder',
    title: 'You have pending orders',
  })));
  logger.info(`${prefKey}: reminded ${vendors.length} vendor(s)`);
}

exports.remind11am = onSchedule({ schedule: '0 11 * * *', timeZone: 'Asia/Kolkata' }, () => runReminder('reminder11am'));
exports.remind3pm = onSchedule({ schedule: '0 15 * * *', timeZone: 'Asia/Kolkata' }, () => runReminder('reminder3pm'));

// ---- 5. Private pre-login lookups -------------------------------------------
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
  return { found: true, isActive: u.isActive !== false, phone: u.phone || '' };
});

exports.checkAdminExists = onCall(async () => {
  const snap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  return { exists: !snap.empty };
});
