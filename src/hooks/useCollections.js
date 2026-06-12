// Real-time Firestore collection hooks for AJKO
import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getUrgency } from '../utils/format';

function useLiveQuery(buildQuery, deps) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setData([]); setLoading(false); return undefined; }
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
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
  }, [profile?.id, profile?.role, profile?.channelId]);
}

export function useUsers() {
  return useLiveQuery(() => query(collection(db, 'users'), orderBy('createdAt', 'desc')), []);
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
  return useLiveQuery(() => {
    if (!channelId) return null;
    return query(
      collection(db, 'messages'),
      where('channelId', '==', channelId),
      orderBy('timestamp', 'asc')
    );
  }, [channelId]);
}

export function useOrderMessages(orderId) {
  return useLiveQuery(() => {
    if (!orderId) return null;
    return query(
      collection(db, 'messages'),
      where('orderId', '==', orderId),
      orderBy('timestamp', 'asc')
    );
  }, [orderId]);
}

export function useNotifications(userId) {
  return useLiveQuery(() => {
    if (!userId) return null;
    return query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
  }, [userId]);
}

// Derived helpers
export function decorateOrders(orders) {
  return orders.map((o) => {
    const urg = getUrgency(o.dueDate, o.stage);
    return { ...o, urgency: urg, isOverdue: urg.overdue };
  });
}
