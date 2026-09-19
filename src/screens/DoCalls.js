import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUsers, useChannels, useDoCalls } from '../hooks/useCollections';
import { toDate, formatDateTime } from '../utils/format';
import BottomNav from '../components/BottomNav';
import { IcBell, IcSearch } from '../components/Icons';

function ymd(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function fmtDur(sec) {
  if (!sec || sec < 0) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

// ── SINGLE INTEGRATION POINT ────────────────────────────────────────────────
// Placing the real masked staff→karigar call is NOT wired yet (telephony
// provider is switched on later). When it is, replace the body of this one
// function with the real trigger (e.g. an httpsCallable to a Cloud Function
// that calls Exotel's Connect API). Nothing else in this screen needs to change.
function placeDoCall(vendor, onNotice) {
  onNotice(`📞 Calling not yet enabled — “${vendor.code || vendor.name || 'vendor'}” will be called once telephony is switched on.`);
}

export default function DoCalls() {
  const nav = useNavigate();
  const { profile, isAdmin } = useAuth();
  const { data: users } = useUsers();
  const { data: channels } = useChannels(profile);
  const { data: doCalls } = useDoCalls(isAdmin); // NEW separate collection; empty for now

  const [tab, setTab] = useState('calls'); // 'calls' | 'recordings'

  // Active vendors (karigars) — SAME source the app uses everywhere else.
  const vendors = useMemo(
    () => users.filter((u) => u.role === 'vendor' && u.isActive !== false),
    [users]
  );
  const channelById = useMemo(() => {
    const m = {};
    channels.forEach((c) => { m[c.id] = c; });
    return m;
  }, [channels]);
  const channelLabel = (id) => {
    const c = channelById[id];
    if (!c) return 'Unassigned';
    return c.name && c.name !== c.code ? `${c.code} · ${c.name}` : (c.code || 'Channel');
  };
  const vendorName = (id) => {
    const v = users.find((u) => u.id === id);
    return v ? (v.code || v.name) : (id || 'Vendor');
  };

  // ---- Tab 1: Do Calls -------------------------------------------------------
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [chanSearch, setChanSearch] = useState(false);
  const [chanQuery, setChanQuery] = useState('');
  const [callNotice, setCallNotice] = useState('');

  const chanMatches = useMemo(() => {
    const q = chanQuery.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) => `${c.code || ''} ${c.name || ''}`.toLowerCase().includes(q));
  }, [channels, chanQuery]);
  const selectChannel = (id) => { setChannelFilter(id); window.scrollTo({ top: 0 }); };

  // Group vendors under their channel headings, applying the channel filter and
  // the name/code search box.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (v) => !q || `${v.code || ''} ${v.name || ''}`.toLowerCase().includes(q);
    const ordered = channelFilter === 'all'
      ? channels
      : channels.filter((c) => c.id === channelFilter);
    return ordered
      .map((c) => ({
        channel: c,
        members: vendors.filter((v) => v.channelId === c.id && match(v)),
      }))
      .filter((g) => g.members.length > 0);
  }, [channels, vendors, channelFilter, search]);

  // ---- Tab 2: Do Calls Recordings -------------------------------------------
  const [recVendor, setRecVendor] = useState('all');
  const [recChannel, setRecChannel] = useState('all');
  const [recDate, setRecDate] = useState('');
  const filteredRecordings = useMemo(() => doCalls.filter((c) => {
    if (recVendor !== 'all' && c.vendorId !== recVendor) return false;
    if (recChannel !== 'all' && c.channelId !== recChannel) return false;
    if (recDate && ymd(toDate(c.at)) !== recDate) return false;
    return true;
  }), [doCalls, recVendor, recChannel, recDate]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Do Calls</h1>
        <button className="icon-btn" onClick={() => nav('/notifications')}><IcBell size={18} /></button>
      </div>

      <div className="screen screen-pad-bottom">
        <div className="toggle" style={{ display: 'flex', width: '100%', marginBottom: 14 }}>
          <button className={tab === 'calls' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('calls')}>Do Calls</button>
          <button className={tab === 'recordings' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('recordings')}>Do Calls Recordings</button>
        </div>

        {tab === 'calls' ? (
          <>
            {/* Search vendors by name/code */}
            <div className="field" style={{ marginBottom: 10 }}>
              <input className="input" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a vendor by name or code…" />
            </div>

            {/* Channel selector — same pattern as the dashboard */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <button className="icon-btn" style={{ flexShrink: 0 }} aria-label="Search channels" onClick={() => { setChanQuery(''); setChanSearch(true); }}><IcSearch size={18} /></button>
              <div className="pill-row channel-bar" style={{ flex: 1 }}>
                <button className={`chip ${channelFilter === 'all' ? 'chip-active' : ''}`} onClick={() => selectChannel('all')}>All channels</button>
                {channels.map((c) => (
                  <button key={c.id} className={`chip ${channelFilter === c.id ? 'chip-active' : ''}`} onClick={() => selectChannel(c.id)}>{c.code}</button>
                ))}
              </div>
            </div>

            {callNotice && (
              <div className="card glow-orange" style={{ margin: '12px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13 }}>{callNotice}</div>
                <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setCallNotice('')}>OK</button>
              </div>
            )}

            {groups.length === 0 ? (
              <div className="empty"><div className="big">👥</div>No vendors found</div>
            ) : (
              groups.map((g) => (
                <div key={g.channel.id} style={{ marginTop: 8 }}>
                  <div className="section-title" style={{ marginTop: 8 }}>{channelLabel(g.channel.id)}</div>
                  {g.members.map((v) => (
                    <div className="aic-row" key={v.id}>
                      <div>
                        <div className="nm">{v.code || v.name}</div>
                        <div className="dt">{v.code && v.name && v.code !== v.name ? v.name : ''}</div>
                      </div>
                      <div className="rgt">
                        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => placeDoCall(v, setCallNotice)}>Call</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <div className="aic-filters" style={{ flexWrap: 'wrap' }}>
              <select className="select" value={recVendor} onChange={(e) => setRecVendor(e.target.value)}>
                <option value="all">All vendors</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.code || v.name}</option>)}
              </select>
              <select className="select" value={recChannel} onChange={(e) => setRecChannel(e.target.value)}>
                <option value="all">All channels</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
              <input className="input" type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
            </div>

            {filteredRecordings.length === 0 ? (
              <div className="empty"><div className="big">📞</div>No calls yet — call records will appear here once calling is switched on.</div>
            ) : (
              filteredRecordings.map((c) => {
                const d = toDate(c.at);
                const dur = fmtDur(c.durationSec);
                return (
                  <div className="card" key={c.id} style={{ marginBottom: 10 }}>
                    <div className="row-between">
                      <div>
                        <div style={{ fontWeight: 700 }}>{vendorName(c.vendorId)}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {channelLabel(c.channelId)}{d ? ` · ${formatDateTime(d)}` : ''}{dur ? ` · ${dur}` : ''}
                        </div>
                      </div>
                    </div>
                    {/* Recording player — populated once real recordings exist. */}
                    {c.recordingUrl
                      ? <audio src={c.recordingUrl} controls preload="none" style={{ width: '100%', height: 40, marginTop: 10 }} />
                      : <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>No recording available.</div>}
                    {/* Transcript — populated once real transcripts exist. */}
                    {c.transcript && (
                      <div className="aic-trbox" style={{ marginTop: 10 }}><span className="lbl">Transcript</span><p style={{ whiteSpace: 'pre-wrap' }}>{c.transcript}</p></div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {chanSearch && (
        <div className="modal-back" onClick={() => setChanSearch(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Find a channel</h3>
            <input className="input" autoComplete="off" value={chanQuery} onChange={(e) => setChanQuery(e.target.value)} placeholder="Type a channel code or name…" />
            <div style={{ marginTop: 12, maxHeight: '50vh', overflowY: 'auto' }}>
              <button className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', marginBottom: 6 }} onClick={() => { selectChannel('all'); setChanSearch(false); }}>All channels</button>
              {chanMatches.map((c) => (
                <button key={c.id} className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', marginBottom: 6, color: channelFilter === c.id ? 'var(--primary)' : undefined }} onClick={() => { selectChannel(c.id); setChanSearch(false); }}>
                  {c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}
                </button>
              ))}
              {chanMatches.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '8px 2px' }}>No channels match.</div>}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setChanSearch(false)}>Close</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
