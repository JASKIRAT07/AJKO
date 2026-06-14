// Firestore write helpers for AJKO
import {
  collection, addDoc, doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
  arrayUnion, arrayRemove, getDocs, query, where, writeBatch, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { STAGE_ORDER, stageInfo, formatAppOrderNo } from './format';

// Move an order to a specific stage, recording a full audit entry.
export async function setStage(order, toStage, actor) {
  const fromStage = order.stage;
  if (!toStage || toStage === fromStage) return;

  let direction;
  if (toStage === 'rework') direction = 'rework';
  else if (fromStage === 'rework') direction = 'forward'; // resuming work
  else {
    const fi = STAGE_ORDER.indexOf(fromStage);
    const ti = STAGE_ORDER.indexOf(toStage);
    direction = ti < fi ? 'back' : 'forward';
  }

  const entry = {
    stage: toStage,
    fromStage,
    direction,
    by: actor?.code || actor?.name || 'system',
    byName: actor?.name || '',
    byId: actor?.id || '',
    at: Date.now(),
  };
  await updateDoc(doc(db, 'orders', order.id), {
    stage: toStage,
    stageHistory: arrayUnion(entry),
  });
  // Audit trail lives on the order (stageHistory) — not in the chat.
  // notify the order creator
  await notify({
    userId: order.createdBy,
    type: 'stage',
    title: 'Stage updated',
    body: `${order.appOrderNo} moved to ${stageInfo(toStage).label} by ${entry.by}`,
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

// Allocates a monotonic order number from counters/orders (never reused, never
// decremented) and creates the order atomically. Returns { id, appOrderNo }.
export async function createOrder(data) {
  const counterRef = doc(db, 'counters', 'orders');
  const newId = doc(collection(db, 'orders')).id;
  let appOrderNo = '';
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const seq = (snap.exists() ? (snap.data().seq || 0) : 0) + 1;
    appOrderNo = formatAppOrderNo(seq);
    tx.set(counterRef, { seq }, { merge: true });
    tx.set(doc(db, 'orders', newId), {
      ...data,
      appOrderNo,
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
  });
  return { id: newId, appOrderNo };
}

export async function updateOrder(id, data) {
  await updateDoc(doc(db, 'orders', id), data);
}

// Peek the next order number for display (the real one is allocated on save).
export async function getNextOrderNoPreview() {
  const snap = await getDoc(doc(db, 'counters', 'orders'));
  const seq = (snap.exists() ? (snap.data().seq || 0) : 0) + 1;
  return formatAppOrderNo(seq);
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

export async function removeUserFromChannel(channelId, userId) {
  if (!channelId || !userId) return;
  await updateDoc(doc(db, 'channels', channelId), { memberIds: arrayRemove(userId) });
}

export async function updateChannel(id, data) {
  await updateDoc(doc(db, 'channels', id), data);
}

// Admin: edit a member's details. Handles vendor channel reassignment + code change.
export async function updateMember(user, { name, phone, specialty, channelId, code }) {
  const patch = { name, phone, specialty: specialty || '' };
  if (user.role === 'vendor' && channelId && channelId !== user.channelId) {
    patch.channelId = channelId;
    patch.assignedChannels = [channelId];
    if (code) patch.code = code;
    if (user.channelId) await removeUserFromChannel(user.channelId, user.id);
    await addUserToChannel(channelId, user.id);
  }
  await updateDoc(doc(db, 'users', user.id), patch);
}

// Admin: delete a member record. (Their Firebase Auth login, if any, must be
// removed separately via the Admin SDK — not possible from the browser.)
export async function deleteMember(user) {
  if (user.role === 'vendor' && user.channelId) {
    await removeUserFromChannel(user.channelId, user.id);
  }
  await deleteDoc(doc(db, 'users', user.id));
}

// Admin: delete a channel and all its orders + messages.
export async function deleteChannel(channelId) {
  const [orders, messages] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('channelId', '==', channelId))),
    getDocs(query(collection(db, 'messages'), where('channelId', '==', channelId))),
  ]);
  const batch = writeBatch(db);
  orders.docs.forEach((d) => batch.delete(d.ref));
  messages.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'channels', channelId));
  await batch.commit();
}

// Admin: delete an order and its messages.
export async function deleteOrder(orderId) {
  const msgs = await getDocs(query(collection(db, 'messages'), where('orderId', '==', orderId)));
  const batch = writeBatch(db);
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'orders', orderId));
  await batch.commit();
}
