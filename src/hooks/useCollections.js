// Real-time Firestore collection hooks for AJKO
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getUrgency } from '../utils/format';

// Milliseconds from a Firestore Timestamp / Date / number (null-safe).
function ms(t) {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return typeof t === 'number' ? t : 0;
}

// sortFn is applied client-side so we can avoid composite (where + orderBy)
// indexes, which otherwise make the listener error out and return nothing.
function useLiveQuery(buildQuery, deps, sortFn) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setData([]); setLoading(false); return undefined; }
    const unsub = onSnapshot(q, (snap) => {
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (sortFn) rows = rows.sort(sortFn);
      setData(rows);
      setLoading(false);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.error('Firestore listener error', err);
      setLoading(false);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

// Orders, role-scoped. Vendors see their channel's orders; team/admin see all.
export function useOrders(profile) {
  return useLiveQuery(() => {
    if (!profile) return null;
    const base = collection(db, 'orders');
    if (profile.role === 'vendor') {
      if (!profile.channelId) return null;
      return query(base, where('channelId', '==', profile.channelId));
    }
    return query(base, orderBy('createdAt', 'desc'));
  }, [profile?.id, profile?.role, profile?.channelId], (a, b) => ms(b.createdAt) - ms(a.createdAt));
}

export function useUsers() {
  return useLiveQuery(
    () => collection(db, 'users'),
    [],
    (a, b) => ms(b.createdAt) - ms(a.createdAt)
  );
}

// Channels, role-scoped. Admin sees all; everyone else sees channels they belong to.
export function useChannels(profile) {
  return useLiveQuery(() => {
    if (!profile) return null;
    const base = collection(db, 'channels');
    if (profile.role === 'admin') return base;
    return query(base, where('memberIds', 'array-contains', profile.id));
  }, [profile?.id, profile?.role]);
}

export function useChannelMessages(channelId) {
  return useLiveQuery(
    () => (channelId ? query(collection(db, 'messages'), where('channelId', '==', channelId)) : null),
    [channelId],
    (a, b) => ms(a.timestamp) - ms(b.timestamp) // oldest → newest
  );
}

export function useOrderMessages(orderId) {
  return useLiveQuery(
    () => (orderId ? query(collection(db, 'messages'), where('orderId', '==', orderId)) : null),
    [orderId],
    (a, b) => ms(a.timestamp) - ms(b.timestamp)
  );
}

export function useNotifications(userId) {
  return useLiveQuery(
    () => (userId ? query(collection(db, 'notifications'), where('userId', '==', userId)) : null),
    [userId],
    (a, b) => ms(b.timestamp) - ms(a.timestamp) // newest first
  );
}

// Derived helpers
export function decorateOrders(orders) {
  return orders.map((o) => {
    const urg = getUrgency(o.dueDate, o.stage);
    return { ...o, urgency: urg, isOverdue: urg.overdue };
  });
}
