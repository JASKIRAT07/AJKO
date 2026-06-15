import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useUsers, decorateOrders } from '../hooks/useCollections';
import { initials } from '../utils/format';
import { RoleBadge } from '../components/Badges';
import { InfoRow } from './Profile';
import BottomNav from '../components/BottomNav';

export default function Settings() {
  const { profile, logout } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: users } = useUsers();
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  if (!profile) return null;

  const stats = {
    orders: orders.length,
    overdue: orders.filter((o) => o.isOverdue).length,
    members: users.length,
    vendors: users.filter((u) => u.role === 'vendor').length,
  };

  return (
    <div className="app-shell">
      <div className="topbar"><h1>Settings</h1></div>
      <div className="screen screen-pad-bottom">
        <div className="center-col" style={{ marginBottom: 20 }}>
          <div className="avatar lg">{initials(profile.name)}</div>
          <h2 style={{ margin: '12px 0 4px' }}>{profile.name}</h2>
          <RoleBadge role={profile.role} />
        </div>

        <div className="stat-row" style={{ marginBottom: 14 }}>
          <div className="stat-card"><div className="num">{stats.orders}</div><div className="lbl">Orders</div></div>
          <div className="stat-card"><div className="num" style={{ color: 'var(--red)' }}>{stats.overdue}</div><div className="lbl">Overdue</div></div>
          <div className="stat-card"><div className="num">{stats.members}</div><div className="lbl">Members</div></div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginTop: 0 }}>Store</div>
          <Item label="👥 Manage members" onClick={() => nav('/members')} />
          <div className="divider" />
          <Item label="🔔 Notification settings" onClick={() => nav('/notifications')} />
          <div className="divider" />
          <Item label="🧩 Order field customization" onClick={() => alert('Field customization — purity & look options are editable per order via "Add custom".')} />
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginTop: 0 }}>Account</div>
          <InfoRow k="Name" v={profile.name} />
          <InfoRow k="Email" v={profile.email} />
          <InfoRow k="Phone" v={profile.phone || '—'} />
          <InfoRow k="Role" v="Administrator" />
          <div className="divider" />
          <Item label="✏️ Edit profile" onClick={() => nav('/profile')} />
          <div className="divider" />
          <Item label="🔒 Change password" onClick={() => nav('/profile')} />
        </div>

        <button className="btn btn-danger btn-block" onClick={logout}>Sign out</button>
      </div>
      <BottomNav />
    </div>
  );
}

function Item({ label, onClick }) {
  return (
    <div className="row-between" onClick={onClick} style={{ cursor: 'pointer', padding: '4px 0' }}>
      <span style={{ fontWeight: 600 }}>{label}</span><span className="faint">›</span>
    </div>
  );
}
