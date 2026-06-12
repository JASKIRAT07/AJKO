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
  const nextStage = STAGE_ORDER[nextIdx];
  await updateDoc(doc(db, 'orders', order.id), {
    stage: nextStage,
    stageHistory: arrayUnion({
      stage: nextStage,
      by: actor?.code || actor?.name || 'system',
      at: Date.now(),
    }),
  });
  // log a stage-change message in the channel
  if (order.channelId) {
    await addDoc(collection(db, 'messages'), {
      channelId: order.channelId,
      orderId: order.id,
      senderId: actor?.id || '',
      senderCode: actor?.code || actor?.name || '',
      content: `${order.appOrderNo} → ${stageInfo(nextStage).label}`,
      type: 'stage',
      timestamp: serverTimestamp(),
    });
  }
  // notify the order creator + vendor
  await notify({
    userId: order.createdBy,
    type: 'stage',
    title: 'Stage updated',
    body: `${order.appOrderNo} moved to ${stageInfo(nextStage).label}`,
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
    stageHistory: [{ stage: 'new', by: data.createdByCode || 'system', at: Date.now() }],
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

// Ensure a channel exists for a vendor; returns its id.
export async function ensureVendorChannel(vendor, creator) {
  const snap = await getDocs(query(collection(db, 'channels'), where('vendorId', '==', vendor.id)));
  if (!snap.empty) return snap.docs[0].id;
  const ref = await addDoc(collection(db, 'channels'), {
    name: `${vendor.code} · ${vendor.specialty || 'Channel'}`,
    vendorId: vendor.id,
    memberIds: creator ? [creator.id] : [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
