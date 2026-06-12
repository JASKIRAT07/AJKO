import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChannels, useUsers, useOrders, decorateOrders } from '../hooks/useCollections';
import BottomNav from '../components/BottomNav';
import { useMemo } from 'react';

export default function Channels() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: channels } = useChannels(profile);
  const { data: users } = useUsers();
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  const vendor = (id) => users.find((u) => u.id === id);

  return (
    <div className="app-shell">
      <div className="topbar"><h1>Channels</h1></div>
      <div className="screen screen-pad-bottom">
        {channels.length === 0 ? (
          <div className="empty"><div className="big">💬</div>No channels yet</div>
        ) : channels.map((c) => {
          const v = vendor(c.vendorId);
          const cOrders = orders.filter((o) => o.channelId === c.id);
          const overdue = cOrders.filter((o) => o.isOverdue).length;
          const active = cOrders.filter((o) => o.stage !== 'ready').length;
          return (
            <div key={c.id} className={`card ${overdue ? 'glow-red' : ''}`} style={{ marginBottom: 12, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }} onClick={() => nav(`/channel/${c.id}`)}>
              <div className="avatar">{v?.code?.replace('-', '') || '?'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{v?.code || 'Channel'} <span className="faint" style={{ fontWeight: 500 }}>· {v?.specialty || 'Karigar'}</span></div>
                <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{active} active · {cOrders.length} total</div>
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
