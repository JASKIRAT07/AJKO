// Firestore write helpers for AJKO
import {
  collection, addDoc, doc, updateDoc, serverTimestamp, arrayUnion, getDocs, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { STAGE_ORDER, stageInfo } from './format';

export async function moveStage(order, direction, actor) {
  const idx = STAGE_ORDER.indexOf(order.stage);
  const nextIdx = Math.min(STAGE_ORDER.length - 1, Math.max(0, idx + direction));
  if (nextIdx === idx) return;
  const fromStage = order.stage;
  const nextStage = STAGE_ORDER[nextIdx];
  // Full audit entry: who, when, from → to, and direction.
  const entry = {
    stage: nextStage,
    fromStage,
    direction: direction > 0 ? 'forward' : 'back',
    by: actor?.code || actor?.name || 'system',
    byName: actor?.name || '',
    byId: actor?.id || '',
    at: Date.now(),
  };
  await updateDoc(doc(db, 'orders', order.id), {
    stage: nextStage,
    stageHistory: arrayUnion(entry),
  });
  // log a stage-change message in the channel
  if (order.channelId) {
    await addDoc(collection(db, 'messages'), {
      channelId: order.channelId,
      orderId: order.id,
      senderId: actor?.id || '',
      senderCode: actor?.code || actor?.name || '',
      content: `${order.appOrderNo}: ${stageInfo(fromStage).label} → ${stageInfo(nextStage).label}`,
      type: 'stage',
      timestamp: serverTimestamp(),
    });
  }
  // notify the order creator
  await notify({
    userId: order.createdBy,
    type: 'stage',
    title: 'Stage updated',
    body: `${order.appOrderNo} moved to ${stageInfo(nextStage).label} by ${entry.by}`,
    orderId: order.id,
  });
}

export async function sendMessage({ channelId, orderId = null, sender, content, type = 'text' }) {
  if (!content?.trim() && type === 'text') return;
  await addDoc(collection(db, 'messages'), {
    channelId,
    orderId,
    senderId: sender?.id || '',
    senderCode: sender?.code || sender?.name || '',
    content,
    type,
    timestamp: serverTimestamp(),
  });
}

export async function notify({ userId, type, title, body, orderId = null }) {
  if (!userId) return;
  await addDoc(collection(db, 'notifications'), {
    userId, type, title, body, orderId, isRead: false, timestamp: serverTimestamp(),
  });
}

export async function markNotificationRead(id) {
  await updateDoc(doc(db, 'notifications', id), { isRead: true });
}

export async function createOrder(data) {
  const ref = await addDoc(collection(db, 'orders'), {
    ...data,
    stage: 'new',
    stageHistory: [{
      stage: 'new',
      fromStage: null,
      direction: 'create',
      by: data.createdByCode || 'system',
      byName: data.createdByName || '',
      byId: data.createdBy || '',
      at: Date.now(),
    }],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOrder(id, data) {
  await updateDoc(doc(db, 'orders', id), data);
}

export async function fetchAllOrderNumbers() {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => d.data().appOrderNo).filter(Boolean);
}

// Admin creates a vendor channel (e.g. code "THG"). Code must be unique.
export async function createChannel({ code, name }) {
  const clean = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) throw new Error('Channel code is required.');
  const dupe = await getDocs(query(collection(db, 'channels'), where('code', '==', clean)));
  if (!dupe.empty) throw new Error(`Channel code "${clean}" already exists.`);
  const ref = await addDoc(collection(db, 'channels'), {
    code: clean,
    name: name?.trim() || clean,
    memberIds: [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Add a user to a channel's member list (idempotent).
export async function addUserToChannel(channelId, userId) {
  if (!channelId || !userId) return;
  await updateDoc(doc(db, 'channels', channelId), { memberIds: arrayUnion(userId) });
}
