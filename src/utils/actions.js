// Firestore write helpers for AJKO
import {
  collection, addDoc, doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
  arrayUnion, arrayRemove, getDocs, query, where, writeBatch, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { STAGE_ORDER, formatAppOrderNo, formatDate } from './format';
import { normalizePhone } from './auth';

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
  // Audit trail lives on the order (stageHistory). No notification on stage
  // changes — only new-order, chat, and the daily reminders notify.
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

// Admin-only soft delete: keep the doc so the conversation still reads in order,
// but replace its content with a "deleted" placeholder. Rules allow only admins
// to update messages.
export async function deleteMessageAsAdmin(id) {
  await updateDoc(doc(db, 'messages', id), {
    deleted: true,
    deletedAt: serverTimestamp(),
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

// Material fields — changing any of these logs a change trail, flips edited:true,
// and pulls the order back to "New (Edited)". Trivial fields (extra details,
// size, width, pieces, sample) do NOT.
const MATERIAL_FIELDS = [
  ['itemName', 'Item name'],
  ['weight', 'Weight'],
  ['purity', 'Purity'],
  ['look', 'Look'],
  ['dueDate', 'Due date'],
  ['designDetails', 'Design details'],
];

function fmtFieldValue(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'weight') return `${v}g`;
  if (key === 'dueDate') return formatDate(v);
  return String(v);
}
function fieldChanged(key, a, b) {
  if (key === 'dueDate') return (a ? formatDate(a) : '') !== (b ? formatDate(b) : '');
  return String(a ?? '') !== String(b ?? '');
}

// Edit an order. Without `original`, it's a plain field write. With `original`,
// material changes are diffed → changes[] trail + edited flag + a move to
// "New (Edited)" (except a Handed-over order, which stays put but still logs).
// Returns the count of material changes.
export async function updateOrder(id, data, { original, actor } = {}) {
  if (!original) {
    await updateDoc(doc(db, 'orders', id), data);
    return 0;
  }

  const changes = [];
  for (const [key, label] of MATERIAL_FIELDS) {
    if (fieldChanged(key, original[key], data[key])) {
      changes.push({
        field: key,
        label,
        from: fmtFieldValue(key, original[key]),
        to: fmtFieldValue(key, data[key]),
        at: Date.now(),
        editedBy: actor?.name || actor?.code || 'Unknown',
        editedById: actor?.id || '',
      });
    }
  }

  if (changes.length === 0) {
    await updateDoc(doc(db, 'orders', id), data);
    return 0;
  }

  const update = { ...data, edited: true, changes: arrayUnion(...changes) };

  // Handed-over orders are the one exception: NOT pulled back (admin uses the
  // manual Rework action for those). Everything else → New (Edited).
  if (original.stage !== 'handedover') {
    update.stage = 'newedited';
    update.stageHistory = arrayUnion({
      stage: 'newedited',
      fromStage: original.stage,
      direction: 'edited',
      by: actor?.code || actor?.name || 'system',
      byName: actor?.name || '',
      byId: actor?.id || '',
      at: Date.now(),
    });
  }

  await updateDoc(doc(db, 'orders', id), update);
  return changes.length;
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

// Admin: edit a member's details. Handles vendor channel reassignment (single)
// and team channel membership (multiple).
export async function updateMember(user, { name, phone, specialty, channelId, code, channelIds }) {
  const patch = { name, phone: normalizePhone(phone), specialty: specialty || '' };

  if (user.role === 'vendor' && channelId && channelId !== user.channelId) {
    patch.channelId = channelId;
    patch.assignedChannels = [channelId];
    if (code) patch.code = code;
    if (user.channelId) await removeUserFromChannel(user.channelId, user.id);
    await addUserToChannel(channelId, user.id);
  }

  if (user.role === 'team' && Array.isArray(channelIds)) {
    const prev = user.assignedChannels || [];
    patch.assignedChannels = channelIds;
    for (const cid of channelIds) if (!prev.includes(cid)) await addUserToChannel(cid, user.id);
    for (const cid of prev) if (!channelIds.includes(cid)) await removeUserFromChannel(cid, user.id);
  }

  await updateDoc(doc(db, 'users', user.id), patch);
}

// Admin: delete a member record. (Their Firebase Auth login, if any, must be
// removed separately via the Admin SDK — not possible from the browser.)
export async function deleteMember(user) {
  const cids = new Set([...(user.assignedChannels || []), ...(user.channelId ? [user.channelId] : [])]);
  for (const cid of cids) await removeUserFromChannel(cid, user.id);
  await deleteDoc(doc(db, 'users', user.id));
}

// Admin: delete a channel and its orders + messages. Vendors (who belong only
// to this channel) are removed too; team members just lose this channel.
export async function deleteChannel(channelId) {
  const [orders, messages, members] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('channelId', '==', channelId))),
    getDocs(query(collection(db, 'messages'), where('channelId', '==', channelId))),
    getDocs(query(collection(db, 'users'), where('assignedChannels', 'array-contains', channelId))),
  ]);
  const batch = writeBatch(db);
  orders.docs.forEach((d) => batch.delete(d.ref));
  messages.docs.forEach((d) => batch.delete(d.ref));
  members.docs.forEach((d) => {
    const u = d.data();
    if (u.role === 'vendor') batch.delete(d.ref);
    else batch.update(d.ref, { assignedChannels: (u.assignedChannels || []).filter((x) => x !== channelId) });
  });
  batch.delete(doc(db, 'channels', channelId));
  await batch.commit();
}

// Admin: add/remove a team member to/from a channel.
export async function setTeamChannelMembership(user, channelId, add) {
  if (add) {
    await updateDoc(doc(db, 'channels', channelId), { memberIds: arrayUnion(user.id) });
    await updateDoc(doc(db, 'users', user.id), { assignedChannels: arrayUnion(channelId) });
  } else {
    await updateDoc(doc(db, 'channels', channelId), { memberIds: arrayRemove(user.id) });
    await updateDoc(doc(db, 'users', user.id), { assignedChannels: arrayRemove(channelId) });
  }
}

// Admin: delete an order and its messages.
export async function deleteOrder(orderId) {
  const msgs = await getDocs(query(collection(db, 'messages'), where('orderId', '==', orderId)));
  const batch = writeBatch(db);
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'orders', orderId));
  await batch.commit();
}
