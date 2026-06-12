import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useUsers, useOrders, decorateOrders } from '../hooks/useCollections';
import { createMemberRecord, nextMemberCode } from '../utils/auth';
import { initials } from '../utils/format';
import BottomNav from '../components/BottomNav';
import { IcPlus, IcSearch } from '../components/Icons';

export default function Members() {
  const { profile } = useAuth();
  const { data: users } = useUsers();
  const { data: rawOrders } = useOrders(profile);
  const orders = useMemo(() => decorateOrders(rawOrders), [rawOrders]);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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

  const orderStats = (uid) => {
    const mine = orders.filter((o) => o.vendorId === uid);
    return {
      active: mine.filter((o) => o.stage !== 'ready').length,
      overdue: mine.filter((o) => o.isOverdue).length,
      done: mine.filter((o) => o.stage === 'ready').length,
    };
  };

  const toggleActive = (u) => updateDoc(doc(db, 'users', u.id), { isActive: u.isActive === false });

  return (
    <div className="app-shell">
      <div className="topbar"><h1>Members</h1></div>
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
          const os = orderStats(u.id);
          const inactive = u.isActive === false;
          return (
            <div key={u.id} className="card" style={{ marginBottom: 12, opacity: inactive ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={`avatar ${u.role === 'vendor' ? '' : 'blue'}`}>{u.role === 'vendor' ? (u.code?.replace('-', '')) : initials(u.name)}</div>
                <div style={{ flex: 1 }}>
                  <div className="row-between">
                    <div style={{ fontWeight: 800 }}>{u.name}</div>
                    <span className="badge" style={{ background: inactive ? '#f3f0ec' : '#ecfdf3', color: inactive ? 'var(--ink-faint)' : 'var(--green)' }}>{inactive ? 'Inactive' : 'Active'}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>{u.code} · {u.specialty || (u.role === 'vendor' ? 'Karigar' : 'Team')}</div>
                </div>
              </div>
              <div className="pill-row" style={{ marginTop: 10 }}>
                <span className="chip spec-chip">{os.active} active</span>
                <span className="chip spec-chip" style={{ color: 'var(--red)' }}>{os.overdue} overdue</span>
                <span className="chip spec-chip" style={{ color: 'var(--green)' }}>{os.done} done</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" style={{ flex: 1, padding: '9px' }} onClick={() => alert('Edit member — coming from order field customization roadmap.')}>Edit</button>
                <button className={inactive ? 'btn btn-primary' : 'btn btn-danger'} style={{ flex: 1, padding: '9px' }} onClick={() => toggleActive(u)}>{inactive ? 'Activate' : 'Deactivate'}</button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="fab" onClick={() => setShowAdd(true)}><IcPlus size={26} /></button>
      {showAdd && <AddMemberModal users={users} onClose={() => setShowAdd(false)} />}
      <BottomNav />
    </div>
  );
}

function AddMemberModal({ users, onClose }) {
  const [role, setRole] = useState('vendor');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const codes = users.map((u) => u.code);
      const code = nextMemberCode(role, codes);
      await createMemberRecord({ name, phone, role, code, specialty });
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
            <h3>Member created</h3>
            <p className="muted" style={{ textAlign: 'center' }}>{name} can now do <b>First time setup</b> with their phone to receive an OTP and set a password.</p>
            <button className="btn btn-primary btn-block" onClick={onClose}>Done</button>
          </div>
        ) : (<>
          <h3 style={{ marginTop: 0 }}>Add member</h3>
          <div className="field"><label>Role</label>
            <div className="toggle"><button className={role === 'vendor' ? 'on' : ''} onClick={() => setRole('vendor')}>Vendor</button><button className={role === 'team' ? 'on' : ''} onClick={() => setRole('team')}>Team member</button></div>
          </div>
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
          <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></div>
          <div className="field"><label>{role === 'vendor' ? 'Specialty' : 'Designation'}</label><input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder={role === 'vendor' ? 'e.g. Karigar, Polish' : 'e.g. Sales'} /></div>
          <button className="btn btn-primary btn-block" disabled={busy || !name || !phone} onClick={create}>{busy ? 'Creating…' : 'Create member & send OTP'}</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
        </>)}
      </div>
    </div>
  );
}
