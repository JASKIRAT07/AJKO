import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUsers, useCalls } from '../hooks/useCollections';
import { updateVendorAiSettings } from '../utils/actions';
import { toDate, formatDateTime } from '../utils/format';
import BottomNav from '../components/BottomNav';
import { IcBell } from '../components/Icons';

function fmtDur(sec) {
  if (!sec || sec < 0) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}
function ymd(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Status → compact badge. upset wins, then picked up, else no answer.
function statusBadge(c) {
  if (c.upset) return { cls: 'upset', label: '⚠ Upset' };
  if (c.pickedUp) return { cls: 'picked', label: 'Picked up' };
  return { cls: 'nopick', label: 'No answer' };
}

function CallRow({ call, label, onClick }) {
  const s = statusBadge(call);
  const d = toDate(call.at);
  const dur = call.pickedUp ? fmtDur(call.durationSec) : '';
  return (
    <div className="aic-row" onClick={onClick}>
      <div>
        <div className="nm">{label}</div>
        <div className="dt">{d ? formatDateTime(d) : '—'}{dur ? ` · ${dur}` : ''}</div>
      </div>
      <div className="rgt">
        <span className={`aic-dotb ${s.cls}`}>{s.label}</span>
        <span className="chev">›</span>
      </div>
    </div>
  );
}

function VendorSettingRow({ vendor }) {
  const on = vendor.aiCallsEnabled !== false; // default ON
  const follow = vendor.followUpCount || 0;
  const rating = vendor.responsivenessRating; // { label, pct, tone } once real data exists
  const toggle = () => updateVendorAiSettings(vendor.id, { aiCallsEnabled: !on }).catch(() => {});
  const setFollow = (n) => updateVendorAiSettings(vendor.id, { followUpCount: n }).catch(() => {});

  return (
    <div className="aic-kari">
      <div className="krow">
        <div className="kname">{vendor.code || vendor.name}</div>
        {rating && rating.pct != null
          ? <div className={`aic-rate ${rating.tone || 'g'}`}>{rating.label} · {rating.pct}%</div>
          : <div className="aic-rate none">No rating yet</div>}
      </div>
      <div className="aic-ctrl">
        <span className="lab">AI calls</span>
        <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on}><span className="knob" /></button>
      </div>
      <div className="aic-ctrl">
        <span className="lab">Follow-up if missed</span>
        <select className="select" style={{ width: 'auto', padding: '8px 12px' }} value={follow} onChange={(e) => setFollow(Number(e.target.value))}>
          <option value={0}>0</option>
          <option value={1}>1</option>
        </select>
      </div>
    </div>
  );
}

export default function AICalls() {
  const nav = useNavigate();
  const { data: users } = useUsers();
  const { data: calls } = useCalls(true); // admin-only route
  const vendors = useMemo(() => users.filter((u) => u.role === 'vendor' && u.isActive !== false), [users]);
  const vendorName = (id) => {
    const v = users.find((u) => u.id === id);
    return v ? (v.code || v.name) : (id || 'Vendor');
  };

  const [tab, setTab] = useState('log'); // 'log' | 'vendors'
  const [vendorFilter, setVendorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = calls.filter((c) => {
    if (vendorFilter !== 'all' && c.vendorId !== vendorFilter) return false;
    if (dateFilter && ymd(toDate(c.at)) !== dateFilter) return false;
    return true;
  });

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>AI Calls</h1>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        <div className="toggle" style={{ display: 'flex', width: '100%', marginBottom: 14 }}>
          <button className={tab === 'log' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('log')}>Call log</button>
          <button className={tab === 'vendors' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('vendors')}>Vendors</button>
        </div>

        {tab === 'log' ? (
          <>
            <div className="aic-filters">
              <select className="select" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
                <option value="all">All vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.code || v.name}</option>)}
              </select>
              <input className="input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            </div>

            {filtered.length === 0 ? (
              <div className="empty"><div className="big">📞</div>No calls yet — calls will appear here once the AI calling agent is live.</div>
            ) : (
              filtered.map((c) => <CallRow key={c.id} call={c} label={vendorName(c.vendorId)} onClick={() => nav(`/ai-calls/${c.id}`)} />)
            )}
          </>
        ) : (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>📞 Vendor settings &amp; rating</div>
            {vendors.length === 0
              ? <div className="empty"><div className="big">👥</div>No vendors yet</div>
              : vendors.map((v) => <VendorSettingRow key={v.id} vendor={v} />)}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
