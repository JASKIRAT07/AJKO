import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChannels, useUsers, useOrders, decorateOrders } from '../hooks/useCollections';
import BottomNav from '../components/BottomNav';

export default function Channels() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: channels } = useChannels(profile);
  const { data: users } = useUsers();
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  return (
    <div className="app-shell">
      <div className="topbar"><h1>Channels</h1></div>
      <div className="screen screen-pad-bottom">
        {channels.length === 0 ? (
          <div className="empty"><div className="big">💬</div>No channels yet</div>
        ) : channels.map((c) => {
          const cOrders = orders.filter((o) => o.channelId === c.id);
          const overdue = cOrders.filter((o) => o.isOverdue).length;
          const active = cOrders.filter((o) => o.stage !== 'ready').length;
          const vendorCount = users.filter((u) => u.role === 'vendor' && u.channelId === c.id).length;
          return (
            <div key={c.id} className={`card ${overdue ? 'glow-red' : ''}`} style={{ marginBottom: 12, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }} onClick={() => nav(`/channel/${c.id}`)}>
              <div className="avatar" style={{ fontSize: 13 }}>{c.code}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.code}{c.name && c.name !== c.code ? <span className="faint" style={{ fontWeight: 500 }}> · {c.name}</span> : null}</div>
                <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{vendorCount} vendor{vendorCount === 1 ? '' : 's'} · {active} active · {cOrders.length} total</div>
              </div>
              {overdue > 0 && <span className="badge" style={{ background: '#fde8e8', color: 'var(--red)' }}>{overdue} overdue</span>}
            </div>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
