/**
 * AJKO Cloud Functions — push notifications.
 *
 * Design
 *  - `pushOnNotification`   : fires whenever a `notifications/{id}` doc is created
 *                             and delivers it as an FCM push to that user's devices.
 *                             Because the app writes a notification doc for every
 *                             new order and stage change, those become pushes for
 *                             free — no duplication.
 *  - `scheduledReminders`   : runs hourly and *creates* notification docs for the
 *                             time-based rules (overdue, due today, stale in-progress,
 *                             ready-not-collected, new-not-acknowledged). Those docs
 *                             then flow through `pushOnNotification`.
 *
 * Recipients
 *  - Store alerts go to active admins + team members (honouring each user's
 *    notificationSettings.roles).
 *  - The assigned vendor also gets overdue / due-today / new-order alerts.
 *
 * Throttling
 *  - Each order carries a `reminders` map ({ overdue: <ms>, dueToday: <ms>, ... })
 *    so a given reminder type isn't re-sent before its interval elapses.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Store operates in India — used for quiet-hours math.
const TZ = 'Asia/Kolkata';
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Default cadences (per reminder type). Per-user fine-tuning from
// notificationSettings can be layered on later; these are sensible store defaults.
const INTERVAL = {
  overdue: 2 * HOUR,
  dueToday: 3 * HOUR,
  newAck: 2 * HOUR,       // new order not acknowledged
  newAckFirst: 2 * HOUR,  // grace before the first nudge
  inProgressStale: 24 * HOUR,
  readyUncollected: 1 * DAY,
};

/* ------------------------------------------------------------------ *
 * 1. Deliver every notification doc as a push
 * ------------------------------------------------------------------ */
exports.pushOnNotification = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data();
  if (!n?.userId) return;

  const userSnap = await db.collection('users').doc(n.userId).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();
  const tokens = user.fcmTokens || [];
  if (tokens.length === 0) return;

  // Respect quiet hours: in-app doc still exists, we just skip the push.
  if (inQuietHours(user.notificationSettings)) {
    logger.info(`Quiet hours for ${n.userId}; skipping push.`);
    return;
  }

  const message = {
    tokens,
    notification: { title: n.title || 'AJKO', body: n.body || '' },
    data: {
      type: String(n.type || ''),
      orderId: String(n.orderId || ''),
    },
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
 * 2. Hourly reminder sweep
 * ------------------------------------------------------------------ */
exports.scheduledReminders = onSchedule('every 60 minutes', async () => {
  const now = Date.now();
  const [usersSnap, ordersSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('orders').get(),
  ]);

  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const storeUsers = users.filter(
    (u) => (u.role === 'admin' || u.role === 'team') && u.isActive !== false
  );

  let processed = 0;

  for (const doc of ordersSnap.docs) {
    const o = { id: doc.id, ...doc.data() };
    if (o.isDraft) continue;

    const reminders = o.reminders || {};
    const updates = {};
    const dueMs = toMillis(o.dueDate);
    const createdMs = toMillis(o.createdAt) || now;
    const lastStageMs = lastStageUpdate(o) || createdMs;
    const vendor = users.find((u) => u.id === o.vendorId);
    const storeFor = (type) => storeRecipients(storeUsers, type);

    const due = (type, interval) => now - (reminders[type] || 0) >= interval;
    const fire = async (type, recipients, title, body) => {
      const targets = [...new Set(recipients.filter(Boolean))];
      await Promise.all(targets.map((uid) => createNotification(uid, { type: notifType(type), title, body, orderId: o.id })));
      updates[`reminders.${type}`] = now;
      processed += 1;
    };

    if (o.stage === 'ready') {
      // ready, not collected
      const readyMs = stageReachedAt(o, 'ready') || lastStageMs;
      if (now - readyMs >= INTERVAL.readyUncollected && due('readyUncollected', INTERVAL.readyUncollected)) {
        await fire('readyUncollected', storeFor('ready'), 'Ready order not collected',
          `${o.appOrderNo} · ${o.itemName} has been ready for a while.`);
      }
    } else {
      // overdue
      if (dueMs && dueMs < startOfTodayMs(now) && due('overdue', INTERVAL.overdue)) {
        await fire('overdue', [...storeFor('overdue'), o.vendorId], 'Order overdue',
          `${o.appOrderNo} · ${o.itemName} is past its due date.`);
      } else if (dueMs && isToday(dueMs, now) && due('dueToday', INTERVAL.dueToday)) {
        // due today
        await fire('dueToday', [...storeFor('due'), o.vendorId], 'Due today',
          `${o.appOrderNo} · ${o.itemName} is due today.`);
      }

      // new order not acknowledged by vendor
      if (o.stage === 'new' && now - createdMs >= INTERVAL.newAckFirst && due('newAck', INTERVAL.newAck)) {
        await fire('newAck', [o.vendorId], 'Order awaiting acknowledgement',
          `${o.appOrderNo} · ${o.itemName} hasn't been started yet.`);
      }

      // in progress, no update
      if (o.stage === 'inprogress' && now - lastStageMs >= INTERVAL.inProgressStale && due('inProgressStale', INTERVAL.inProgressStale)) {
        await fire('inProgressStale', storeFor('stage'), 'No update on in-progress order',
          `${o.appOrderNo} · ${o.itemName} hasn't progressed in a while.`);
      }
    }

    if (Object.keys(updates).length) {
      await doc.ref.update(updates).catch((e) => logger.warn('reminder update failed', e));
    }
  }

  logger.info(`Reminder sweep done. Reminders fired: ${processed}`);
});

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */
function createNotification(userId, { type, title, body, orderId }) {
  return db.collection('notifications').add({
    userId, type, title, body, orderId: orderId || null,
    isRead: false, timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Map internal reminder keys to the app's notification `type` filter buckets.
function notifType(key) {
  if (key === 'overdue') return 'overdue';
  if (key === 'dueToday') return 'due';
  if (key === 'readyUncollected') return 'ready';
  if (key === 'inProgressStale') return 'stage';
  if (key === 'newAck') return 'new';
  return 'message';
}

// Which store users want this alert, based on their notificationSettings.roles.
function storeRecipients(storeUsers, _type) {
  return storeUsers
    .filter((u) => {
      const roles = u.notificationSettings?.roles || 'both';
      if (roles === 'both') return true;
      return roles === u.role;
    })
    .map((u) => u.id);
}

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

function inQuietHours(settings) {
  if (!settings?.quietStart || !settings?.quietEnd) return false;
  const nowHM = nowHourMinuteInTZ();
  const start = hm(settings.quietStart);
  const end = hm(settings.quietEnd);
  if (start === end) return false;
  // overnight window (e.g. 22:00 → 07:00)
  if (start > end) return nowHM >= start || nowHM < end;
  return nowHM >= start && nowHM < end;
}

function nowHourMinuteInTZ() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}
function hm(s) { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); }

function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  if (v._seconds) return v._seconds * 1000;
  const d = new Date(v); return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function lastStageUpdate(o) {
  const hist = o.stageHistory || [];
  return hist.reduce((max, h) => Math.max(max, toMillis(h.at)), 0);
}
function stageReachedAt(o, stage) {
  const hist = o.stageHistory || [];
  const entry = [...hist].reverse().find((h) => h.stage === stage);
  return entry ? toMillis(entry.at) : 0;
}

function startOfTodayMs(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function isToday(ms, now) {
  const a = new Date(ms); const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
