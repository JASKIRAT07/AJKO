import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useChannels, decorateOrders } from '../hooks/useCollections';
import { matchesStageFilter } from '../utils/format';
import OrderCard from '../components/OrderCard';
import BottomNav from '../components/BottomNav';
import { IcSearch, IcPlus } from '../components/Icons';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'rework', label: 'Rework' },
  { key: 'ready', label: 'Ready' },
  { key: 'handedover', label: 'Handed over' },
  { key: 'overdue', label: 'Overdue' },
];

export default function Orders() {
  const { profile, isVendor } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: channels } = useChannels(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const [filter, setFilter] = useState('all');

  const channelCode = (id) => channels.find((c) => c.id === id)?.code || '';

  const list = orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return o.isOverdue;
    return matchesStageFilter(o.stage, filter);
  });

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Orders</h1>
        <button className="icon-btn" onClick={() => nav('/search')}><IcSearch size={18} /></button>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="pill-row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'chip-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="empty"><div className="big">📦</div>No orders here</div>
        ) : list.map((o) => <OrderCard key={o.id} order={o} channelCode={channelCode(o.channelId)} />)}
      </div>
      {!isVendor && <button className="fab" onClick={() => nav('/create')}><IcPlus size={26} /></button>}
      <BottomNav />
    </div>
  );
}
