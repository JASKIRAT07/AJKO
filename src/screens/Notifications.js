import { useState } from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useCollections';
import { markNotificationRead } from '../utils/actions';
import { formatDateTime } from '../utils/format';
import BottomNav from '../components/BottomNav';
import { useNavigate } from 'react-router-dom';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'stage', label: 'Stage updates' },
  { key: 'new', label: 'New orders' },
  { key: 'message', label: 'Messages' },
];

const ICONS = {
  overdue: { e: '⏰', c: 'var(--red)' },
  stage: { e: '🔁', c: 'var(--blue)' },
  due: { e: '📅', c: 'var(--primary)' },
  new: { e: '🆕', c: 'var(--primary)' },
  ready: { e: '✅', c: 'var(--green)' },
  message: { e: '💬', c: 'var(--ink-soft)' },
};

export default function Notifications() {
  const { profile, isAdmin } = useAuth();
  const nav = useNavigate();
  const { data: notes } = useNotifications(profile?.id);
  const [filter, setFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);

  const list = notes.filter((n) => filter === 'all' || n.type === filter);

  const markAll = async () => {
    const batch = writeBatch(db);
    notes.filter((n) => !n.isRead).forEach((n) => batch.update(doc(db, 'notifications', n.id), { isRead: true }));
    await batch.commit();
  };

  const open = (n) => { markNotificationRead(n.id); if (n.orderId) nav(`/order/${n.orderId}`); };

  if (showSettings) return <NotificationSettings profile={profile} isAdmin={isAdmin} onBack={() => setShowSettings(false)} />;

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Notifications</h1>
        <button className="btn btn-ghost" style={{ padding: '8px 12px' }} onClick={markAll}>Mark all read</button>
        <button className="icon-btn" onClick={() => setShowSettings(true)}>⚙️</button>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="pill-row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {list.length === 0 ? (
          <div className="empty"><div className="big">🔔</div>You're all caught up</div>
        ) : list.map((n) => {
          const ic = ICONS[n.type] || ICONS.message;
          return (
            <div key={n.id} className="card card-tight" onClick={() => open(n)}
              style={{ marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', background: n.isRead ? '#fff' : 'var(--primary-soft)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${ic.c}1a`, fontSize: 18, flexShrink: 0 }}>{ic.e}</div>
              <div style={{ flex: 1 }}>
                <div className="row-between"><div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>{!n.isRead && <span className="unread-dot" />}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.body}</div>
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

const DEFAULTS = {
  overdueRepeat: '2hr',
  dueTodayTime: '09:00',
  dueTodayRepeat: '3hr',
  newFirstReminder: 2,
  newRepeat: 2,
  newStopAfter: 12,
  inProgressNoUpdate: '24hr',
  readyNotCollected: '1d',
  quietStart: '22:00',
  quietEnd: '07:00',
  roles: 'both',
};

function NotificationSettings({ profile, isAdmin, onBack }) {
  const [s, setS] = useState({ ...DEFAULTS, ...(profile.notificationSettings || {}) });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setS((p) => ({ ...p, [k]: v })); setSaved(false); };
  const save = async () => { await updateDoc(doc(db, 'users', profile.id), { notificationSettings: s }); setSaved(true); };

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack}>←</button>
        <h1 style={{ fontSize: 18 }}>Notification settings</h1>
      </div>
      <div className="screen screen-pad-bottom">
        <Group title="Overdue orders">
          <Select label="Repeat reminder every" value={s.overdueRepeat} onChange={(v) => set('overdueRepeat', v)} options={[['1hr', 'Every 1 hour'], ['2hr', 'Every 2 hours'], ['3hr', 'Every 3 hours'], ['6hr', 'Every 6 hours'], ['custom', 'Custom']]} />
        </Group>
        <Group title="Due today">
          <Time label="Morning alert at" value={s.dueTodayTime} onChange={(v) => set('dueTodayTime', v)} />
          <Select label="Repeat every" value={s.dueTodayRepeat} onChange={(v) => set('dueTodayRepeat', v)} options={[['1hr', '1 hour'], ['2hr', '2 hours'], ['3hr', '3 hours'], ['6hr', '6 hours']]} />
        </Group>
        <Group title="New orders not acknowledged">
          <Num label="First reminder after (hours)" value={s.newFirstReminder} onChange={(v) => set('newFirstReminder', v)} />
          <Num label="Repeat every (hours)" value={s.newRepeat} onChange={(v) => set('newRepeat', v)} />
          <Num label="Stop after (hours)" value={s.newStopAfter} onChange={(v) => set('newStopAfter', v)} />
        </Group>
        <Group title="In progress, no update">
          <Select label="Remind after" value={s.inProgressNoUpdate} onChange={(v) => set('inProgressNoUpdate', v)} options={[['12hr', '12 hours'], ['24hr', '24 hours'], ['48hr', '48 hours']]} />
        </Group>
        <Group title="Ready, not collected">
          <Select label="Remind after" value={s.readyNotCollected} onChange={(v) => set('readyNotCollected', v)} options={[['1d', '1 day'], ['2d', '2 days']]} />
        </Group>
        <Group title="Quiet hours">
          <div className="row-2">
            <Time label="From" value={s.quietStart} onChange={(v) => set('quietStart', v)} />
            <Time label="To" value={s.quietEnd} onChange={(v) => set('quietEnd', v)} />
          </div>
        </Group>
        {isAdmin && (
          <Group title="Who gets these">
            <Select label="Roles" value={s.roles} onChange={(v) => set('roles', v)} options={[['admin', 'Admin only'], ['team', 'Team only'], ['both', 'Both']]} />
          </Group>
        )}
        <button className="btn btn-primary btn-block" onClick={save} style={{ marginTop: 8 }}>{saved ? '✓ Saved' : 'Save settings'}</button>
      </div>
    </div>
  );
}

const Group = ({ title, children }) => (
  <div className="card" style={{ marginBottom: 12 }}>
    <div style={{ fontWeight: 800, marginBottom: 12 }}>{title}</div>
    <div className="stack">{children}</div>
  </div>
);
const Select = ({ label, value, onChange, options }) => (
  <div className="field" style={{ margin: 0 }}><label>{label}</label>
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
);
const Time = ({ label, value, onChange }) => (
  <div className="field" style={{ margin: 0 }}><label>{label}</label><input className="input" type="time" value={value} onChange={(e) => onChange(e.target.value)} /></div>
);
const Num = ({ label, value, onChange }) => (
  <div className="field" style={{ margin: 0 }}><label>{label}</label><input className="input" type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>
);
