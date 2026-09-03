import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders, useUsersOnce, useChannels, decorateOrders } from '../hooks/useCollections';
import { initials, isDone, matchesStageFilter } from '../utils/format';
import { RoleBadge } from '../components/Badges';
import OrderCard from '../components/OrderCard';
import GreetingMascot from '../components/GreetingMascot';
import BottomNav from '../components/BottomNav';
import { IcSearch, IcBell, IcPlus, IcDiamond } from '../components/Icons';

export default function Home() {
  const { profile, isVendor } = useAuth();
  if (!profile) return null;
  return isVendor ? <VendorHome /> : <DashboardHome />;
}

function DashboardHome() {
  const { profile, build } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: users } = useUsersOnce();
  const { data: channels } = useChannels(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const channelCode = (id) => channels.find((c) => c.id === id)?.code || '';
  const creatorName = (id) => users.find((u) => u.id === id)?.name || 'Unknown';

  // Remember the dashboard's selected channel/stage filter so returning here
  // (e.g. Back from an order) lands on the same tab, not reset to "All channels".
  const [stageFilter, setStageFilter] = useState(() => sessionStorage.getItem('ajko_dash_stage') || null);
  const [channelFilter, setChannelFilter] = useState(() => sessionStorage.getItem('ajko_dash_channel') || 'all');
  useEffect(() => {
    if (stageFilter) sessionStorage.setItem('ajko_dash_stage', stageFilter);
    else sessionStorage.removeItem('ajko_dash_stage');
  }, [stageFilter]);
  useEffect(() => { sessionStorage.setItem('ajko_dash_channel', channelFilter); }, [channelFilter]);

  // Render only a page of cards at a time (counts/data below still use ALL
  // orders — only the rendered list is capped). Resets when the filter changes.
  const [shown, setShown] = useState(20);
  useEffect(() => { setShown(20); }, [stageFilter, channelFilter]);

  // Keep the selected channel visible in the horizontal bar on return (the bar's
  // own scrollLeft resets to 0 on remount). Scrolls ONLY the bar horizontally —
  // never the page — so the vertical order-list restoration is untouched.
  const channelBarRef = useRef(null);
  const activeChipRef = useRef(null);
  useEffect(() => {
    if (channelFilter === 'all') return;
    const bar = channelBarRef.current;
    const chip = activeChipRef.current;
    if (!bar || !chip) return;
    const barRect = bar.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta = (chipRect.left - barRect.left) - (bar.clientWidth / 2) + (chipRect.width / 2);
    bar.scrollLeft = Math.max(0, bar.scrollLeft + delta);
  }, [channelFilter, channels.length]);

  const newEdited = orders.filter((o) => o.stage === 'newedited').length;
  const counts = {
    new: orders.filter((o) => o.stage === 'new').length + newEdited, // rolls up New (Edited)
    newEdited,
    inprogress: orders.filter((o) => o.stage === 'inprogress').length,
    rework: orders.filter((o) => o.stage === 'rework').length,
    ready: orders.filter((o) => o.stage === 'ready').length,
    overdue: orders.filter((o) => o.isOverdue).length,
  };

  const filtered = orders.filter((o) => {
    if (channelFilter !== 'all' && o.channelId !== channelFilter) return false;
    if (!stageFilter) return true;
    if (stageFilter === 'overdue') return o.isOverdue;
    return matchesStageFilter(o.stage, stageFilter);
  });

  return (
    <div className="app-shell">
      <div className="faint" style={{ textAlign: 'center', fontSize: 10, padding: '4px 0 0', opacity: 0.6 }}>build {build}</div>
      <div className="topbar">
        <div className="logo-mark" style={{ width: 38, height: 38, borderRadius: 12, animation: 'none' }}><IcDiamond size={20} color="#fff" /></div>
        <h1>AJKO</h1>
        <button className="icon-btn" onClick={() => nav('/search')}><IcSearch size={18} /></button>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <GreetingMascot profile={profile} orders={orders} />
          <RoleBadge role={profile.role} />
        </div>

        <div className="stat-row four">
          <StatCard label="New" sub={counts.newEdited > 0 ? `${counts.newEdited} edited` : ''} num={counts.new} color="var(--new)" active={stageFilter === 'new'} onClick={() => setStageFilter(stageFilter === 'new' ? null : 'new')} />
          <StatCard label="In progress" num={counts.inprogress} color="var(--blue)" active={stageFilter === 'inprogress'} onClick={() => setStageFilter(stageFilter === 'inprogress' ? null : 'inprogress')} />
          <StatCard label="Rework" num={counts.rework} color="var(--amber)" active={stageFilter === 'rework'} onClick={() => setStageFilter(stageFilter === 'rework' ? null : 'rework')} />
          <StatCard label="Ready" num={counts.ready} color="var(--green)" active={stageFilter === 'ready'} onClick={() => setStageFilter(stageFilter === 'ready' ? null : 'ready')} />
        </div>

        {counts.overdue > 0 && (
          <div className="card glow-red" style={{ marginTop: 12, cursor: 'pointer' }}
            onClick={() => setStageFilter(stageFilter === 'overdue' ? null : 'overdue')}>
            <div className="row-between">
              <div style={{ fontWeight: 800, color: 'var(--red)' }}>⚠️ {counts.overdue} overdue order{counts.overdue > 1 ? 's' : ''}</div>
              <span className="faint" style={{ fontSize: 12 }}>{stageFilter === 'overdue' ? 'Showing' : 'Tap to view'}</span>
            </div>
          </div>
        )}

        <div className="pill-row channel-bar" style={{ marginTop: 16 }} ref={channelBarRef}>
          <button className={`chip ${channelFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setChannelFilter('all')}>All channels</button>
          {channels.map((c) => (
            <button key={c.id} ref={channelFilter === c.id ? activeChipRef : null} className={`chip ${channelFilter === c.id ? 'chip-active' : ''}`} onClick={() => setChannelFilter(c.id)}>{c.code}</button>
          ))}
        </div>

        <div className="section-title">{stageFilter ? `${filtered.length} order${filtered.length === 1 ? '' : 's'}` : 'Recent orders'}</div>
        {filtered.length === 0 ? (
          <div className="empty"><div className="big">📦</div>No orders yet</div>
        ) : (
          <>
            {filtered.slice(0, shown).map((o) => (
              <OrderCard key={o.id} order={o} channelCode={channelCode(o.channelId)} createdByName={profile.role === 'team' ? creatorName(o.createdBy) : null} />
            ))}
            {filtered.length > shown && (
              <button className="btn btn-ghost btn-block" style={{ marginTop: 4 }} onClick={() => setShown((n) => n + 20)}>
                Load more ({filtered.length - shown} more)
              </button>
            )}
          </>
        )}
      </div>

      <button className="fab" onClick={() => nav('/create')}><IcPlus size={26} /></button>
      <BottomNav />
    </div>
  );
}

function StatCard({ label, num, color, active, onClick, sub }) {
  return (
    <button className="stat-card" onClick={onClick} style={active ? { boxShadow: `0 0 0 2px ${color}, var(--shadow)` } : {}}>
      <div className="num" style={{ color }}>{num}</div>
      <div className="lbl">{label}{sub ? <span className="faint" style={{ display: 'block', fontSize: 10, fontWeight: 600 }}>{sub}</span> : null}</div>
    </button>
  );
}

function VendorHome() {
  const { profile, build } = useAuth();
  const nav = useNavigate();
  const { data: rawOrders } = useOrders(profile);
  const { data: channels } = useChannels(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);

  const active = orders.filter((o) => !isDone(o.stage)).length;
  const overdue = orders.filter((o) => o.isOverdue).length;
  const done = orders.filter((o) => isDone(o.stage)).length;

  return (
    <div className="app-shell">
      <div className="faint" style={{ textAlign: 'center', fontSize: 10, padding: '4px 0 0', opacity: 0.6 }}>build {build}</div>
      <div className="topbar">
        <div className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{profile.code?.split('-').pop() || initials(profile.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{profile.code}</div>
          <div className="faint" style={{ fontSize: 12 }}>{profile.specialty || 'Karigar'}</div>
        </div>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        <div style={{ marginBottom: 16 }}>
          <GreetingMascot profile={profile} orders={orders} />
        </div>

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
          channels.map((c) => {
            const cOrders = orders.filter((o) => o.channelId === c.id);
            const cOverdue = cOrders.filter((o) => o.isOverdue).length;
            return (
              <div key={c.id} className="card" style={{ marginBottom: 12, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }} onClick={() => nav(`/conversations?channel=${c.id}`)}>
                <div className="avatar" style={{ fontSize: 13 }}>{c.code}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.code}{c.name && c.name !== c.code ? <span className="faint" style={{ fontWeight: 500 }}> · {c.name}</span> : null}</div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{cOrders.length} orders</div>
                </div>
                {cOverdue > 0 && <span className="badge" style={{ background: '#fde8e8', color: 'var(--red)' }}>{cOverdue} overdue</span>}
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
