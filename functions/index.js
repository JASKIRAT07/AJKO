/**
 * AJKO Cloud Functions — scoped, private notifications (FCM push + WhatsApp).
 *
 * FCM push text:
 *   new       → "New Order — AO-001"          (vendor members of the order's channel only)
 *   message   → "New message in <channel>"    (that channel's members + admins, not the sender)
 *   reminder  → "You have pending orders"      (each vendor, only if THEY have New-stage orders)
 *
 * WhatsApp Cloud API templates (vendor phone from the member doc; sent alongside
 * FCM, never blocking it — a WhatsApp failure only logs):
 *   new_order_alert        (order create)     [appOrderNo, itemName, dueDate]
 *   order_rework           (stage → rework)   [appOrderNo, itemName, reworkNote|—]
 *   order_details_updated  (detail edited)    [appOrderNo, "what changed"]
 *   daily_pending_reminder (11:00 & 15:00)    [count, order nos]
 *   order_overdue          (10:00 IST)        [count, order nos]
 *   due_tomorrow           (18:00 IST)        [count, tomorrow date, order nos]
 *
 * Per-user toggles (notificationPrefs, all default ON):
 *   vendor → newOrderAlert, reminder11am, reminder3pm, chatNotifications
 *   team   → chatNotifications
 *   admin  → chatNotifications
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// WhatsApp Cloud API credentials (set via `firebase functions:secrets:set`).
const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const WHATSAPP_PHONE_ID = defineSecret('WHATSAPP_PHONE_ID');
const WA_SECRETS = [WHATSAPP_TOKEN, WHATSAPP_PHONE_ID];

// Cloudflare Stream (order videos). Account ID is not secret; the token is.
const CF_ACCOUNT_ID = 'f638cad0889e1f394fe94793d056f5d1';
const CF_STREAM_TOKEN = defineSecret('CF_STREAM_TOKEN');

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

// ---- WhatsApp Cloud API -----------------------------------------------------

// Normalize an Indian phone to 91XXXXXXXXXX (WhatsApp wire format).
function normalizeWa(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) return d; // already correct
  d = d.replace(/^0+/, '').slice(-10);                 // drop leading 0s, keep last 10
  return d.length === 10 ? `91${d}` : '';
}

// Firestore Timestamp / Date / string → JS Date (or null).
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v._seconds != null) return new Date(v._seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// "24 June 2026" in IST.
function formatDMY(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}
// "2026-06-24" in IST (for date comparisons).
function istYMD(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const DONE_STAGES = ['ready', 'handedover'];
const isPending = (stage) => !DONE_STAGES.includes(stage);

// Sort orders by their numeric AO- number, ascending.
function sortByNo(list) {
  const n = (o) => parseInt(String(o.appOrderNo || '').replace(/\D/g, ''), 10) || 0;
  return [...list].sort((a, b) => n(a) - n(b));
}
const orderNos = (list) => list.map((o) => o.appOrderNo).join(', ');

// Active vendor member(s) of a channel.
async function channelVendors(channelId) {
  if (!channelId) return [];
  const snap = await db.collection('users').where('channelId', '==', channelId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'vendor' && u.isActive !== false);
}

// Shared sender. NEVER throws — a WhatsApp failure only logs.
async function sendWhatsAppTemplate(toPhone, templateName, bodyParams) {
  try {
    const to = normalizeWa(toPhone);
    if (!to) { logger.warn(`WA ${templateName}: no valid phone`, toPhone); return; }
    const parameters = (bodyParams || []).map((v) => ({
      type: 'text',
      text: (v === null || v === undefined || v === '') ? '—' : String(v),
    }));

    // Defensive: if the secret was accidentally stored with the ID doubled
    // (e.g. "1222…32421222…3242"), collapse it so the path has it exactly once.
    let phoneId = String(WHATSAPP_PHONE_ID.value()).trim();
    const half = phoneId.slice(0, phoneId.length / 2);
    if (phoneId.length % 2 === 0 && half && half + half === phoneId) {
      logger.warn('WHATSAPP_PHONE_ID looks doubled — collapsing to a single ID. Consider resetting the secret.');
      phoneId = half;
    }
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    logger.info(`WA ${templateName} POST ${url}`); // ID must appear exactly once

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN.value()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: 'en' }, components: [{ type: 'body', parameters }] },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      logger.error(`WA ${templateName} HTTP ${res.status}`, t);
    } else {
      logger.info(`WA ${templateName} → ${to}`);
    }
  } catch (e) {
    logger.error(`WA ${templateName} error`, e);
  }
}

// Send a template to every vendor of a channel that has a phone.
async function waToChannelVendors(channelId, templateName, params) {
  const vendors = await channelVendors(channelId);
  await Promise.all(vendors.map((v) => {
    if (!v.phone) { logger.info(`WA ${templateName}: vendor ${v.id} has no phone, skipping`); return Promise.resolve(); }
    return sendWhatsAppTemplate(v.phone, templateName, params);
  }));
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

// ---- WhatsApp: new order → vendor(s) of the channel (idempotent) ------------
exports.waNewOrderAlert = onDocumentCreated({ document: 'orders/{id}', secrets: WA_SECRETS }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const o = snap.data();
  if (!o || o.isDraft || !o.channelId) return;
  if (o.waNewOrderSent === true) return; // already sent

  await waToChannelVendors(o.channelId, 'new_order_alert', [
    o.appOrderNo, o.itemName, formatDMY(toDate(o.dueDate)),
  ]);
  await snap.ref.update({ waNewOrderSent: true }).catch((e) => logger.error('mark waNewOrderSent failed', e));
});

// ---- WhatsApp: order UPDATE → rework or "New (Edited)" stage transitions -----
// Edits ride the reliable stage-transition path: the client logs changes[] and
// moves the order to "newedited", and we fire order_details_updated off THAT.
exports.waOnOrderUpdate = onDocumentUpdated({ document: 'orders/{id}', secrets: WA_SECRETS }, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || after.isDraft || !after.channelId) return;

  // (a) Stage moved INTO rework.
  if (before.stage !== 'rework' && after.stage === 'rework') {
    await waToChannelVendors(after.channelId, 'order_rework', [
      after.appOrderNo, after.itemName, after.reworkNote || '—',
    ]);
  }

  // (b) Stage moved INTO "New (Edited)" — describe the newly-appended changes.
  if (before.stage !== 'newedited' && after.stage === 'newedited') {
    const prevLen = Array.isArray(before.changes) ? before.changes.length : 0;
    const fresh = (Array.isArray(after.changes) ? after.changes : []).slice(prevLen);
    const desc = fresh.length
      ? fresh.map((c) => `${c.label || c.field}: ${c.from} → ${c.to}`).join('; ')
      : 'Order details updated';
    await waToChannelVendors(after.channelId, 'order_details_updated', [after.appOrderNo, desc]);
  }
});

// ---- 4. Daily reminders (11:00 & 15:00 IST), individual per vendor ----------
// FCM push keeps its original behavior (nudge when the channel has NEW orders).
// WhatsApp daily_pending_reminder is sent ALONGSIDE it for any pending order.
async function runReminder(prefKey) {
  const [usersSnap, ordersSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('orders').get(),
  ]);

  const newByChannel = {};
  const pendingByChannel = {};
  ordersSnap.docs.forEach((d) => {
    const o = { id: d.id, ...d.data() };
    if (o.isDraft || !o.channelId) return;
    if (o.stage === 'new') newByChannel[o.channelId] = (newByChannel[o.channelId] || 0) + 1;
    if (isPending(o.stage)) (pendingByChannel[o.channelId] = pendingByChannel[o.channelId] || []).push(o);
  });

  const vendors = usersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.role === 'vendor' && u.isActive !== false);

  let fcmCount = 0;
  await Promise.all(vendors.map(async (v) => {
    if (v.notificationPrefs?.[prefKey] === false || !v.channelId) return;

    // FCM push (unchanged): only when the channel has NEW-stage orders.
    if (newByChannel[v.channelId]) {
      await createNotification(v.id, { type: 'reminder', title: 'You have pending orders' });
      fcmCount++;
    }

    // WhatsApp: any pending order (New / In progress / Rework) in the channel.
    const pend = sortByNo(pendingByChannel[v.channelId] || []);
    if (pend.length > 0) {
      if (v.phone) await sendWhatsAppTemplate(v.phone, 'daily_pending_reminder', [String(pend.length), orderNos(pend)]);
      else logger.info(`WA daily_pending_reminder: vendor ${v.id} has no phone, skipping`);
    }
  }));
  logger.info(`${prefKey}: FCM reminded ${fcmCount} vendor(s)`);
}

exports.remind11am = onSchedule({ schedule: '0 11 * * *', timeZone: 'Asia/Kolkata', secrets: WA_SECRETS }, () => runReminder('reminder11am'));
exports.remind3pm = onSchedule({ schedule: '0 15 * * *', timeZone: 'Asia/Kolkata', secrets: WA_SECRETS }, () => runReminder('reminder3pm'));

// ---- WhatsApp: overdue (10:00 IST) and due-tomorrow (18:00 IST) -------------
async function pendingOrdersByChannel() {
  const snap = await db.collection('orders').get();
  const map = {};
  snap.docs.forEach((d) => {
    const o = { id: d.id, ...d.data() };
    if (o.isDraft || !o.channelId || !isPending(o.stage)) return;
    (map[o.channelId] = map[o.channelId] || []).push(o);
  });
  return map;
}

async function activeVendors() {
  const snap = await db.collection('users').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'vendor' && u.isActive !== false);
}

exports.orderOverdueReminder = onSchedule({ schedule: '0 10 * * *', timeZone: 'Asia/Kolkata', secrets: WA_SECRETS }, async () => {
  const today = istYMD(new Date());
  const [byCh, vendors] = await Promise.all([pendingOrdersByChannel(), activeVendors()]);
  await Promise.all(vendors.map(async (v) => {
    if (!v.channelId) return;
    const list = sortByNo((byCh[v.channelId] || []).filter((o) => {
      const ymd = istYMD(toDate(o.dueDate));
      return ymd && ymd < today;
    }));
    if (list.length === 0) return;
    if (!v.phone) { logger.info(`WA order_overdue: vendor ${v.id} has no phone, skipping`); return; }
    await sendWhatsAppTemplate(v.phone, 'order_overdue', [String(list.length), orderNos(list)]);
  }));
});

exports.dueTomorrowReminder = onSchedule({ schedule: '0 18 * * *', timeZone: 'Asia/Kolkata', secrets: WA_SECRETS }, async () => {
  const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrow = istYMD(tomorrowDate);
  const tomorrowLabel = formatDMY(tomorrowDate);
  const [byCh, vendors] = await Promise.all([pendingOrdersByChannel(), activeVendors()]);
  await Promise.all(vendors.map(async (v) => {
    if (!v.channelId) return;
    const list = sortByNo((byCh[v.channelId] || []).filter((o) => istYMD(toDate(o.dueDate)) === tomorrow));
    if (list.length === 0) return;
    if (!v.phone) { logger.info(`WA due_tomorrow: vendor ${v.id} has no phone, skipping`); return; }
    await sendWhatsAppTemplate(v.phone, 'due_tomorrow', [String(list.length), tomorrowLabel, orderNos(list)]);
  }));
});

// ---- Cloudflare Stream: order videos (signed) ------------------------------
// Mint a one-time direct-upload URL. The phone uploads the raw file straight to
// Cloudflare (no transcoding on the phone). requireSignedURLs → playback needs a
// signed token (see getStreamToken). The token never reaches the browser.
exports.createStreamUpload = onCall({ secrets: [CF_STREAM_TOKEN] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_STREAM_TOKEN.value()}`, 'Content-Type': 'application/json' },
    // Public playback: the jewellery clips are non-sensitive and the WhatsApp
    // watch link must keep working for karigars days later, no signed token.
    body: JSON.stringify({ maxDurationSeconds: 120, requireSignedURLs: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    logger.error('Stream direct_upload failed', data);
    throw new HttpsError('internal', 'Could not start video upload.');
  }
  return { uploadURL: data.result.uploadURL, uid: data.result.uid };
});

// Public playback info for one video (host + duration + ready). No signed token
// — the video is public, so playback is <host>/<uid>/iframe. Used by the in-app
// player and the order-card thumbnail.
async function fetchStreamDetails(uid) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${CF_STREAM_TOKEN.value()}` },
  });
  const d = await res.json().catch(() => ({}));
  let host = 'iframe.videodelivery.net';
  let ready = false;
  let duration = 0;
  if (d.success && d.result) {
    ready = d.result.status && d.result.status.state === 'ready';
    duration = d.result.duration || 0;
    if (d.result.thumbnail) { try { host = new URL(d.result.thumbnail).host; } catch (e) { /* keep default */ } }
  }
  return { uid, host, ready, duration };
}

exports.getStreamInfo = onCall({ secrets: [CF_STREAM_TOKEN] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = String(req.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'Missing video id.');
  try {
    return await fetchStreamDetails(uid);
  } catch (e) {
    logger.warn('getStreamInfo failed', uid, e);
    return { uid, host: 'iframe.videodelivery.net', ready: false, duration: 0 };
  }
});

// PUBLIC (no auth): data for the branded watch page — the order's number/name
// and all its videos' playback info. Reads the order with admin privileges and
// returns ONLY non-sensitive fields.
exports.getWatchData = onCall({ secrets: [CF_STREAM_TOKEN] }, async (req) => {
  const orderId = String(req.data?.orderId || '').trim();
  if (!orderId) return { found: false };
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) return { found: false };
  const o = snap.data();
  const vids = Array.isArray(o.videos) ? o.videos : [];
  const videos = await Promise.all(vids.map(async (v) => {
    try { return await fetchStreamDetails(v.uid); }
    catch (e) { logger.warn('watch details failed', v.uid, e); return { uid: v.uid, host: 'iframe.videodelivery.net', ready: false, duration: 0 }; }
  }));
  return { found: true, appOrderNo: o.appOrderNo || '', itemName: o.itemName || '', videos };
});

// Mint a short-lived signed playback token for one video, plus the account's
// stream host (derived from the thumbnail URL) so the client can embed the
// in-app player. Requires sign-in.
exports.getStreamToken = onCall({ secrets: [CF_STREAM_TOKEN] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = String(req.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'Missing video id.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`;
  const authHeader = { Authorization: `Bearer ${CF_STREAM_TOKEN.value()}` };

  const exp = Math.floor(Date.now() / 1000) + 4 * 3600; // 4h
  const tokRes = await fetch(`${base}/${uid}/token`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ exp }),
  });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !tok.success) {
    logger.error('Stream token failed', tok);
    throw new HttpsError('internal', 'Could not get video token.');
  }

  let host = 'iframe.videodelivery.net';
  let ready = false;
  try {
    const detRes = await fetch(`${base}/${uid}`, { headers: authHeader });
    const det = await detRes.json();
    if (det.success && det.result) {
      ready = det.result.status && det.result.status.state === 'ready';
      if (det.result.thumbnail) host = new URL(det.result.thumbnail).host;
    }
  } catch (e) {
    logger.warn('Stream details fetch failed', e);
  }
  return { token: tok.result.token, host, ready };
});

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

// Called by the app AFTER auth (OTP or email/password). Finds the caller's user
// doc, links their authUid, and stamps role/channels onto their auth token via
// custom claims — all with admin privileges, so security rules never block it.
// The client must refresh its token (getIdToken(true)) afterwards.
exports.resolveProfile = onCall(async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Not signed in.');
  const uid = auth.uid;
  const token = auth.token || {};
  const users = db.collection('users');
  const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);

  let id = null;
  let data = null;

  // 1) By authUid (already linked).
  const byUid = await users.where('authUid', '==', uid).limit(1).get();
  if (!byUid.empty) { id = byUid.docs[0].id; data = byUid.docs[0].data(); }

  // 2) By phone (OTP) — only an unlinked or own doc, never hijack another's.
  if (!id && token.phone_number) {
    const want = last10(token.phone_number);
    const all = await users.get();
    const hit = all.docs.find((d) => {
      const u = d.data();
      return want && last10(u.phone) === want && (!u.authUid || u.authUid === uid);
    });
    if (hit) {
      id = hit.id; data = hit.data();
      if (data.authUid !== uid) { await users.doc(id).update({ authUid: uid }); data.authUid = uid; }
    }
  }

  // 3) By email.
  if (!id && token.email) {
    const s = await users.where('email', '==', String(token.email).toLowerCase()).limit(1).get();
    if (!s.empty && (!s.docs[0].data().authUid || s.docs[0].data().authUid === uid)) {
      id = s.docs[0].id; data = s.docs[0].data();
      if (data.authUid !== uid) { await users.doc(id).update({ authUid: uid }); data.authUid = uid; }
    }
  }

  if (!id) return { found: false };
  if (data.isActive === false) return { found: true, isActive: false };

  // Stamp role + channels onto the auth token (read directly by security rules).
  const channels = data.role === 'vendor'
    ? (data.channelId ? [data.channelId] : [])
    : (data.assignedChannels || []);
  await admin.auth().setCustomUserClaims(uid, {
    role: data.role,
    userId: id,
    channels,
    isActive: data.isActive !== false,
  });

  return { found: true, isActive: true, profile: { id, ...data } };
});
