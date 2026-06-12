import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useChannels, useOrders, decorateOrders } from '../hooks/useCollections';
import { createMemberRecord, nextVendorCode, nextTeamCode } from '../utils/auth';
import { createChannel } from '../utils/actions';
import { initials } from '../utils/format';
import BottomNav from '../components/BottomNav';
import { IcPlus, IcSearch, IcChannels } from '../components/Icons';

// THG-01 → "01" for compact avatars; falls back to initials.
const codeSuffix = (code) => (code && code.includes('-') ? code.split('-').pop() : code);

export default function Members() {
  const { profile } = useAuth();
  const { data: users } = useUsers();
  const { data: channels } = useChannels(profile);
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  const channelName = (cid) => { const c = channels.find((x) => x.id === cid); return c ? c.code : '—'; };

  const members = users.filter((u) => u.role !== 'admin');
  const filtered = members.filter((u) => {
    if (tab === 'vendors' && u.role !== 'vendor') return false;
    if (tab === 'team' && u.role !== 'team') return false;
    if (q && !`${u.name} ${u.code} ${u.specialty || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: members.length,
    active: members.filter((u) => u.isActive !== false).length,
    inactive: members.filter((u) => u.isActive === false).length,
  };

  const orderStats = (u) => {
    const mine = u.role === 'vendor'
      ? orders.filter((o) => o.channelId === u.channelId)
      : orders.filter((o) => o.createdBy === u.id);
    return {
      active: mine.filter((o) => o.stage !== 'ready').length,
      overdue: mine.filter((o) => o.isOverdue).length,
      done: mine.filter((o) => o.stage === 'ready').length,
    };
  };

  const toggleActive = (u) => updateDoc(doc(db, 'users', u.id), { isActive: u.isActive === false });

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Members</h1>
        <button className="btn btn-ghost" style={{ padding: '8px 12px', gap: 6 }} onClick={() => setShowChannels(true)}><IcChannels size={16} /> Channels</button>
      </div>
      <div className="screen screen-pad-bottom">
        <div className="card card-tight" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <IcSearch size={18} color="var(--ink-faint)" />
          <input className="input" style={{ border: 'none', padding: 4 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" />
        </div>

        <div className="toggle" style={{ marginBottom: 14 }}>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All</button>
          <button className={tab === 'vendors' ? 'on' : ''} onClick={() => setTab('vendors')}>Vendors</button>
          <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Team</button>
        </div>

        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="num">{stats.total}</div><div className="lbl">Total</div></div>
          <div className="stat-card"><div className="num" style={{ color: 'var(--green)' }}>{stats.active}</div><div className="lbl">Active</div></div>
          <div className="stat-card"><div className="num" style={{ color: 'var(--ink-faint)' }}>{stats.inactive}</div><div className="lbl">Inactive</div></div>
        </div>

        {filtered.length === 0 ? <div className="empty"><div className="big">👥</div>No members</div> : filtered.map((u) => {
          const os = orderStats(u);
          const inactive = u.isActive === false;
          const isVendor = u.role === 'vendor';
          return (
            <div key={u.id} className="card" style={{ marginBottom: 12, opacity: inactive ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={`avatar ${isVendor ? '' : 'blue'}`}>{isVendor ? codeSuffix(u.code) : initials(u.name)}</div>
                <div style={{ flex: 1 }}>
                  <div className="row-between">
                    <div style={{ fontWeight: 800 }}>{u.name}</div>
                    <span className="badge" style={{ background: inactive ? '#f3f0ec' : '#ecfdf3', color: inactive ? 'var(--ink-faint)' : 'var(--green)' }}>{inactive ? 'Inactive' : 'Active'}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {u.code}{u.specialty ? ` · ${u.specialty}` : (isVendor ? ' · Karigar' : ' · Team')}
                  </div>
                  {isVendor && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Channel: {channelName(u.channelId)}</div>}
                </div>
              </div>
              <div className="pill-row" style={{ marginTop: 10 }}>
                <span className="chip spec-chip">{os.active} active</span>
                <span className="chip spec-chip" style={{ color: 'var(--red)' }}>{os.overdue} overdue</span>
                <span className="chip spec-chip" style={{ color: 'var(--green)' }}>{os.done} done</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className={inactive ? 'btn btn-primary' : 'btn btn-danger'} style={{ flex: 1, padding: '9px' }} onClick={() => toggleActive(u)}>{inactive ? 'Activate' : 'Deactivate'}</button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="fab" onClick={() => setShowAdd(true)}><IcPlus size={26} /></button>
      {showAdd && <AddMemberModal users={users} channels={channels} onClose={() => setShowAdd(false)} />}
      {showChannels && <ChannelsModal channels={channels} users={users} onClose={() => setShowChannels(false)} />}
      <BottomNav />
    </div>
  );
}

function AddMemberModal({ users, channels, onClose }) {
  const [role, setRole] = useState('vendor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [channelId, setChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const channel = channels.find((c) => c.id === channelId);
  const previewCode = role === 'team'
    ? nextTeamCode(users.filter((u) => u.role === 'team').map((u) => u.code))
    : (channel ? nextVendorCode(channel.code, users.filter((u) => u.role === 'vendor' && u.channelId === channelId).map((u) => u.code)) : '—');

  const valid = name && phone && (role === 'team' || channelId);

  const create = async () => {
    setBusy(true);
    try {
      const code = previewCode;
      await createMemberRecord({ name, phone, role, code, specialty, channelId: role === 'vendor' ? channelId : null });
      setCreatedCode(code);
      setDone(true);
    } catch (e) { alert(e.message || 'Failed to add member'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="center-col" style={{ padding: 20 }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <h3>Member created — {createdCode}</h3>
            <p className="muted" style={{ textAlign: 'center' }}>{name} can now do <b>First time setup</b> with their phone to receive an OTP and set a password.</p>
            <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
          </div>
        ) : (<>
          <h3 style={{ marginTop: 0 }}>Add member</h3>
          <div className="field"><label>Role</label>
            <div className="toggle"><button className={role === 'vendor' ? 'on' : ''} onClick={() => setRole('vendor')}>Vendor</button><button className={role === 'team' ? 'on' : ''} onClick={() => setRole('team')}>Team member</button></div>
          </div>
          {role === 'vendor' && (
            <div className="field"><label>Channel <span className="req">*</span></label>
              {channels.length === 0
                ? <div className="muted" style={{ fontSize: 13 }}>No channels yet — create one from the <b>Channels</b> button first.</div>
                : <select className="select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                    <option value="">Select channel…</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</option>)}
                  </select>}
            </div>
          )}
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
          <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></div>
          <div className="field"><label>{role === 'vendor' ? 'Specialty' : 'Designation'}</label><input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={role === 'vendor' ? 'e.g. Karigar, Polish' : 'e.g. Sales'} /></div>
          <div className="card card-tight" style={{ background: 'var(--primary-soft)', marginBottom: 14 }}>
            <span className="faint" style={{ fontSize: 12 }}>Auto-generated code</span>
            <div style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: 18 }}>{previewCode}</div>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !valid} onClick={create}>{busy ? 'Creating…' : 'Create member & send OTP'}</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
        </>)}
      </div>
    </div>
  );
}

function ChannelsModal({ channels, users, onClose }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const add = async () => {
    setErr(''); setBusy(true);
    try { await createChannel({ code, name }); setCode(''); setName(''); }
    catch (e) { setErr(e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Vendor channels</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Create a channel first (e.g. <b>THG</b>), then add vendors to it — they’ll be coded THG-01, THG-02…</p>

        <div className="row-2" style={{ alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}><label>Code</label><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="THG" maxLength={6} /></div>
          <div className="field" style={{ margin: 0 }}><label>Name (optional)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="The House of Gold" /></div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
        <button className="btn btn-primary btn-block" style={{ margin: '12px 0 18px' }} disabled={busy || !code.trim()} onClick={add}>{busy ? 'Creating…' : 'Create channel'}</button>

        <div className="section-title" style={{ marginTop: 0 }}>Existing channels</div>
        {channels.length === 0 ? <p className="faint" style={{ fontSize: 13 }}>None yet.</p> : channels.map((c) => {
          const vCount = users.filter((u) => u.role === 'vendor' && u.channelId === c.id).length;
          return (
            <div key={c.id} className="card card-tight" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar" style={{ fontSize: 13 }}>{c.code}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.code}{c.name && c.name !== c.code ? <span className="faint" style={{ fontWeight: 500 }}> · {c.name}</span> : null}</div>
                <div className="faint" style={{ fontSize: 12 }}>{vCount} vendor{vCount === 1 ? '' : 's'}</div>
              </div>
            </div>
          );
        })}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
