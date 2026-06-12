import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useUsers, decorateOrders } from '../hooks/useCollections';
import { greeting, todayLong, initials } from '../utils/format';
import { RoleBadge } from '../components/Badges';
import OrderCard from '../components/OrderCard';
import BottomNav from '../components/BottomNav';
import { IcSearch, IcBell, IcPlus, IcDiamond } from '../components/Icons';

export default function Home() {
  const { profile, isVendor } = useAuth();
  if (!profile) return null;
  return isVendor ? <VendorHome /> : <DashboardHome />;
}

function DashboardHome() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: users } = useUsers();
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const vendors = users.filter((u) => u.role === 'vendor');
  const vendorName = (id) => users.find((u) => u.id === id)?.code || '';
  const creatorName = (id) => users.find((u) => u.id === id)?.name || 'Unknown';

  const [stageFilter, setStageFilter] = useState(null);
  const [vendorFilter, setVendorFilter] = useState('all');

  const counts = {
    new: orders.filter((o) => o.stage === 'new').length,
    inprogress: orders.filter((o) => o.stage === 'inprogress').length,
    ready: orders.filter((o) => o.stage === 'ready').length,
    overdue: orders.filter((o) => o.isOverdue).length,
  };

  const filtered = orders.filter((o) => {
    if (stageFilter === 'overdue') return o.isOverdue;
    if (stageFilter && o.stage !== stageFilter) return false;
    if (vendorFilter !== 'all' && o.vendorId !== vendorFilter) return false;
    return true;
  });

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="logo-mark" style={{ width: 38, height: 38, borderRadius: 12, animation: 'none' }}><IcDiamond size={20} color="#fff" /></div>
        <h1>AJKO</h1>
        <button className="icon-btn" onClick={() => nav('/search')}><IcSearch size={18} /></button>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>{greeting()},</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{profile.name}</div>
            <div className="faint" style={{ fontSize: 12 }}>{todayLong()}</div>
          </div>
          <RoleBadge role={profile.role} />
        </div>

        <div className="stat-row">
          <StatCard label="New" num={counts.new} color="var(--new)" active={stageFilter === 'new'} onClick={() => setStageFilter(stageFilter === 'new' ? null : 'new')} />
          <StatCard label="In progress" num={counts.inprogress} color="var(--blue)" active={stageFilter === 'inprogress'} onClick={() => setStageFilter(stageFilter === 'inprogress' ? null : 'inprogress')} />
          <StatCard label="Ready" num={counts.ready} color="var(--green)" active={stageFilter === 'ready'} onClick={() => setStageFilter(stageFilter === 'ready' ? null : 'ready')} />
        </div>

        {counts.overdue > 0 && (
          <div className={`card glow-red`} style={{ marginTop: 12, cursor: 'pointer' }}
            onClick={() => setStageFilter(stageFilter === 'overdue' ? null : 'overdue')}>
            <div className="row-between">
              <div style={{ fontWeight: 800, color: 'var(--red)' }}>⚠️ {counts.overdue} overdue order{counts.overdue > 1 ? 's' : ''}</div>
              <span className="faint" style={{ fontSize: 12 }}>{stageFilter === 'overdue' ? 'Showing' : 'Tap to view'}</span>
            </div>
          </div>
        )}

        <div className="pill-row" style={{ marginTop: 16 }}>
          <button className={`chip ${vendorFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setVendorFilter('all')}>All vendors</button>
          {vendors.map((v) => (
            <button key={v.id} className={`chip ${vendorFilter === v.id ? 'chip-active' : ''}`} onClick={() => setVendorFilter(v.id)}>{v.code}</button>
          ))}
        </div>

        <div className="section-title">{stageFilter ? `${filtered.length} order${filtered.length === 1 ? '' : 's'}` : 'Recent orders'}</div>
        {filtered.length === 0 ? (
          <div className="empty"><div className="big">📦</div>No orders yet</div>
        ) : (
          filtered.map((o) => (
            <OrderCard key={o.id} order={o} vendorName={vendorName(o.vendorId)} createdByName={profile.role === 'team' ? creatorName(o.createdBy) : null} />
          ))
        )}
      </div>

      <button className="fab" onClick={() => nav('/create')}><IcPlus size={26} /></button>
      <BottomNav />
    </div>
  );
}

function StatCard({ label, num, color, active, onClick }) {
  return (
    <button className="stat-card" onClick={onClick} style={active ? { boxShadow: `0 0 0 2px ${color}, var(--shadow)` } : {}}>
      <div className="num" style={{ color }}>{num}</div>
      <div className="lbl">{label}</div>
    </button>
  );
}

function VendorHome() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  const active = orders.filter((o) => o.stage !== 'ready').length;
  const overdue = orders.filter((o) => o.isOverdue).length;
  const done = orders.filter((o) => o.stage === 'ready').length;
  const channels = [...new Set(orders.map((o) => o.channelId).filter(Boolean))];

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="avatar" style={{ width: 38, height: 38 }}>{profile.code?.replace('-', '') || initials(profile.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{profile.code}</div>
          <div className="faint" style={{ fontSize: 12 }}>{profile.specialty || 'Karigar'}</div>
        </div>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        {overdue > 0 && (
          <div className="card glow-red" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, color: 'var(--red)' }}>⚠️ {overdue} order{overdue > 1 ? 's' : ''} overdue — please prioritise</div>
          </div>
        )}

        <div className="stat-row" style={{ marginBottom: 18 }}>
          <div className="stat-card"><div className="num" style={{ color: 'var(--blue)' }}>{active}</div><div className="lbl">Active</div></div>
          <div className="stat-card"><div className="num" style={{ color: 'var(--red)' }}>{overdue}</div><div className="lbl">Overdue</div></div>
          <div className="stat-card"><div className="num" style={{ color: 'var(--green)' }}>{done}</div><div className="lbl">Done</div></div>
        </div>

        <div className="section-title">My channels</div>
        {channels.length === 0 ? (
          <div className="empty"><div className="big">💬</div>No channels assigned yet</div>
        ) : (
          channels.map((cid) => {
            const cOrders = orders.filter((o) => o.channelId === cid);
            const cOverdue = cOrders.filter((o) => o.isOverdue).length;
            return (
              <div key={cid} className="card" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => nav(`/channel/${cid}`)}>
                <div className="row-between">
                  <div style={{ fontWeight: 700 }}>💬 Channel</div>
                  <span className="faint" style={{ fontSize: 12 }}>{cOrders.length} orders</span>
                </div>
                {cOverdue > 0 && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6, fontWeight: 700 }}>{cOverdue} overdue</div>}
              </div>
            );
          })
        )}

        <div className="section-title">Recent orders</div>
        {orders.slice(0, 20).map((o) => <OrderCard key={o.id} order={o} />)}
      </div>
      <BottomNav />
    </div>
  );
}
