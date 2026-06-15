import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useChannels, useOrders, decorateOrders } from '../hooks/useCollections';
import { createMemberRecord, nextVendorCode, nextTeamCode, nextAdminCode } from '../utils/auth';
import {
  createChannel, updateChannel, deleteChannel, updateMember, deleteMember, setTeamChannelMembership,
} from '../utils/actions';
import { initials } from '../utils/format';
import { RoleBadge } from '../components/Badges';
import BottomNav from '../components/BottomNav';
import { IcPlus, IcSearch, IcChannels } from '../components/Icons';

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
  const [editUser, setEditUser] = useState(null);

  const channelName = (cid) => { const c = channels.find((x) => x.id === cid); return c ? c.code : '—'; };

  // Members scoped to the current tab (before search) — drives the stat counts.
  const scoped = users.filter((u) => {
    if (tab === 'vendors') return u.role === 'vendor';
    if (tab === 'team') return u.role === 'team';
    if (tab === 'admins') return u.role === 'admin';
    return true; // All
  });
  const filtered = scoped.filter((u) => (
    !q || `${u.name} ${u.code} ${u.specialty || ''}`.toLowerCase().includes(q.toLowerCase())
  ));

  const stats = {
    total: scoped.length,
    active: scoped.filter((u) => u.isActive !== false).length,
    inactive: scoped.filter((u) => u.isActive === false).length,
  };

  const orderStats = (u) => {
    const mine = u.role === 'vendor'
      ? orders.filter((o) => o.channelId === u.channelId)
      : orders.filter((o) => o.createdBy === u.id);
    return {
      active: mine.filter((o) => o.stage !== 'ready' && o.stage !== 'handedover').length,
      overdue: mine.filter((o) => o.isOverdue).length,
      done: mine.filter((o) => o.stage === 'ready' || o.stage === 'handedover').length,
    };
  };

  const activeAdmins = users.filter((u) => u.role === 'admin' && u.isActive !== false);
  // Guards so you can't lock everyone out of the admin role.
  const adminActionBlocked = (u, action) => {
    if (u.role !== 'admin') return false;
    if (u.id === profile.id) { alert(`You can't ${action} your own admin account.`); return true; }
    if (u.isActive !== false && activeAdmins.length <= 1) { alert('At least one active admin must remain.'); return true; }
    return false;
  };

  const toggleActive = (u) => {
    if (u.isActive !== false && adminActionBlocked(u, 'deactivate')) return;
    updateDoc(doc(db, 'users', u.id), { isActive: u.isActive === false });
  };
  const removeMember = async (u) => {
    if (adminActionBlocked(u, 'delete')) return;
    if (!window.confirm(`Delete ${u.name} (${u.code})? This removes their record permanently. (Their login, if any, must be removed from the Firebase console.)`)) return;
    await deleteMember(u);
  };

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

        <div className="toggle" style={{ marginBottom: 14, display: 'flex', width: '100%' }}>
          <button className={tab === 'all' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('all')}>All</button>
          <button className={tab === 'vendors' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('vendors')}>Vendors</button>
          <button className={tab === 'team' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('team')}>Team</button>
          <button className={tab === 'admins' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setTab('admins')}>Admins</button>
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
          const isAdminRow = u.role === 'admin';
          return (
            <div key={u.id} className="card" style={{ marginBottom: 12, opacity: inactive ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={`avatar ${isVendor ? '' : 'blue'}`}>{isVendor ? codeSuffix(u.code) : initials(u.name)}</div>
                <div style={{ flex: 1 }}>
                  <div className="row-between">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800 }}>{u.name}</span>
                      <RoleBadge role={u.role} />
                    </div>
                    <span className="badge" style={{ background: inactive ? '#f3f0ec' : '#ecfdf3', color: inactive ? 'var(--ink-faint)' : 'var(--green)' }}>{inactive ? 'Inactive' : 'Active'}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {u.code}{u.specialty ? ` · ${u.specialty}` : (isVendor ? ' · Karigar' : isAdminRow ? ' · Owner' : ' · Team')}
                  </div>
                  {isVendor && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Channel: {channelName(u.channelId)}</div>}
                </div>
              </div>
              {!isAdminRow && (
                <div className="pill-row" style={{ marginTop: 10 }}>
                  <span className="chip spec-chip">{os.active} active</span>
                  <span className="chip spec-chip" style={{ color: 'var(--red)' }}>{os.overdue} overdue</span>
                  <span className="chip spec-chip" style={{ color: 'var(--green)' }}>{os.done} done</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '9px' }} onClick={() => setEditUser(u)}>Edit</button>
                <button className={inactive ? 'btn btn-primary' : 'btn btn-ghost'} style={{ flex: 1, padding: '9px' }} onClick={() => toggleActive(u)}>{inactive ? 'Activate' : 'Deactivate'}</button>
                <button className="btn btn-danger" style={{ flex: '0 0 auto', padding: '9px 12px' }} onClick={() => removeMember(u)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="fab" onClick={() => setShowAdd(true)}><IcPlus size={26} /></button>
      {showAdd && <AddMemberModal users={users} channels={channels} onClose={() => setShowAdd(false)} />}
      {editUser && <EditMemberModal user={editUser} users={users} channels={channels} onClose={() => setEditUser(null)} />}
      {showChannels && <ChannelsModal channels={channels} users={users} orders={orders} onClose={() => setShowChannels(false)} />}
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
  const [channelIds, setChannelIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const toggleCid = (cid) => setChannelIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const channel = channels.find((c) => c.id === channelId);
  let previewCode = '—';
  if (role === 'admin') previewCode = nextAdminCode(users.filter((u) => u.role === 'admin').length);
  else if (role === 'team') previewCode = nextTeamCode(users.filter((u) => u.role === 'team').map((u) => u.code));
  else if (channel) previewCode = nextVendorCode(channel.code, users.filter((u) => u.role === 'vendor' && u.channelId === channelId).map((u) => u.code));
  const valid = name && phone && (role !== 'vendor' || channelId);

  const create = async () => {
    setBusy(true);
    try {
      const code = previewCode;
      await createMemberRecord({ name, phone, role, code, specialty, channelId: role === 'vendor' ? channelId : null, channelIds: role === 'team' ? channelIds : [] });
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
            <div className="toggle" style={{ display: 'flex', width: '100%' }}>
              <button className={role === 'vendor' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setRole('vendor')}>Vendor</button>
              <button className={role === 'team' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setRole('team')}>Team</button>
              <button className={role === 'admin' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setRole('admin')}>Admin</button>
            </div>
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
          {role === 'team' && (
            <div className="field"><label>Channels <span className="faint" style={{ fontWeight: 500 }}>(select one or more)</span></label>
              {channels.length === 0
                ? <div className="muted" style={{ fontSize: 13 }}>No channels yet — create one from the <b>Channels</b> button first.</div>
                : channels.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                    <input type="checkbox" checked={channelIds.includes(c.id)} onChange={() => toggleCid(c.id)} />
                    <span>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</span>
                  </label>
                ))}
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

function EditMemberModal({ user, users, channels, onClose }) {
  const isVendor = user.role === 'vendor';
  const isTeam = user.role === 'team';
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [specialty, setSpecialty] = useState(user.specialty || '');
  const [channelId, setChannelId] = useState(user.channelId || '');
  const [channelIds, setChannelIds] = useState(user.assignedChannels || []);
  const [busy, setBusy] = useState(false);
  const toggleCid = (cid) => setChannelIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const channelChanged = isVendor && channelId && channelId !== user.channelId;
  const newChannel = channels.find((c) => c.id === channelId);
  const newCode = channelChanged && newChannel
    ? nextVendorCode(newChannel.code, users.filter((u) => u.role === 'vendor' && u.channelId === channelId).map((u) => u.code))
    : user.code;

  const save = async () => {
    setBusy(true);
    try {
      await updateMember(user, {
        name, phone, specialty,
        channelId: isVendor ? channelId : null,
        code: channelChanged ? newCode : user.code,
        channelIds: isTeam ? channelIds : undefined,
      });
      onClose();
    } catch (e) { alert(e.message || 'Failed to update'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Edit {user.code}</h3>
        <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label>{isVendor ? 'Specialty' : 'Designation'}</label><input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></div>
        {isVendor && (
          <div className="field"><label>Channel</label>
            <select className="select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</option>)}
            </select>
            {channelChanged && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Code will change to <b>{newCode}</b></div>}
          </div>
        )}
        {isTeam && (
          <div className="field"><label>Channels <span className="faint" style={{ fontWeight: 500 }}>(select one or more)</span></label>
            {channels.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No channels yet.</div> : channels.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <input type="checkbox" checked={channelIds.includes(c.id)} onChange={() => toggleCid(c.id)} />
                <span>{c.code}{c.name && c.name !== c.code ? ` · ${c.name}` : ''}</span>
              </label>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || !name || !phone} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function ChannelsModal({ channels, users, orders, onClose }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [manageId, setManageId] = useState(null);

  const teamMembers = users.filter((u) => u.role === 'team');

  const add = async () => {
    setErr(''); setBusy(true);
    try { await createChannel({ code, name }); setCode(''); setName(''); }
    catch (e) { setErr(e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const saveName = async (c) => { await updateChannel(c.id, { name: editName.trim() || c.code }); setEditId(null); };

  const remove = async (c) => {
    const vCount = users.filter((u) => u.role === 'vendor' && u.channelId === c.id).length;
    const oCount = orders.filter((o) => o.channelId === c.id).length;
    if (!window.confirm(`Delete channel ${c.code}? This permanently removes its ${oCount} order(s), all messages${vCount ? `, and ${vCount} vendor(s)` : ''}. This cannot be undone.`)) return;
    try { await deleteChannel(c.id); }
    catch (e) { alert(`Delete failed: ${e.code || e.message}`); }
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
            <div key={c.id} className="card card-tight" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar" style={{ fontSize: 13 }}>{c.code}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.code}{c.name && c.name !== c.code ? <span className="faint" style={{ fontWeight: 500 }}> · {c.name}</span> : null}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{vCount} vendor{vCount === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <button className="link" onClick={() => { setManageId(manageId === c.id ? null : c.id); }}>{manageId === c.id ? 'Hide team' : 'Team'}</button>
                <button className="link" onClick={() => { setEditId(c.id); setEditName(c.name || ''); }}>Rename</button>
                <button className="link" style={{ color: 'var(--red)' }} onClick={() => remove(c)}>Delete</button>
              </div>
              {editId === c.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="New name" />
                  <button className="btn btn-primary" style={{ flex: '0 0 auto' }} onClick={() => saveName(c)}>Save</button>
                </div>
              )}
              {manageId === c.id && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>Team members in this channel (admins are always in; vendors are fixed to their channel):</div>
                  {teamMembers.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No team members yet.</div> : teamMembers.map((tm) => {
                    const inCh = (tm.assignedChannels || []).includes(c.id);
                    return (
                      <label key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                        <input type="checkbox" checked={inCh} onChange={() => setTeamChannelMembership(tm, c.id, !inCh)} />
                        <span>{tm.name} <span className="faint">· {tm.code}</span></span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
