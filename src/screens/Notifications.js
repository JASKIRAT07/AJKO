import { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useCollections';
import { markNotificationRead } from '../utils/actions';
import { formatDateTime } from '../utils/format';
import BottomNav from '../components/BottomNav';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New orders' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'message', label: 'Messages' },
];

const ICONS = {
  new: { e: '🆕', c: 'var(--primary)' },
  reminder: { e: '⏰', c: 'var(--amber)' },
  message: { e: '💬', c: 'var(--blue)' },
};

export default function Notifications() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: notes } = useNotifications(profile?.id);
  const [filter, setFilter] = useState('all');

  const list = notes.filter((n) => filter === 'all' || n.type === filter);

  const markAll = async () => {
    const batch = writeBatch(db);
    notes.filter((n) => !n.isRead).forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
    await batch.commit();
  };

  const open = (n) => { markNotificationRead(n.id); if (n.orderId) nav(`/order/${n.orderId}`); };

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Notifications</h1>
        <button className="btn btn-ghost" style={{ padding: '8px 12px' }} onClick={markAll}>Mark all read</button>
        <button className="icon-btn" onClick={() => nav('/notification-settings')}>⚙️</button>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="pill-row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {list.length === 0 ? (
          <div className="empty"><div className="big">🔔</div>You&apos;re all caught up</div>
        ) : list.map((n) => {
          const ic = ICONS[n.type] || ICONS.message;
          return (
            <div key={n.id} className="card card-tight" onClick={() => open(n)}
              style={{ marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', background: n.isRead ? '#fff' : 'var(--primary-soft)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${ic.c}1a`, fontSize: 18, flexShrink: 0 }}>{ic.e}</div>
              <div style={{ flex: 1 }}>
                <div className="row-between"><div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>{!n.isRead && <span className="unread-dot" />}</div>
                {n.body && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>{formatDateTime(n.timestamp)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
