import { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { initials } from '../utils/format';
import { RoleBadge } from '../components/Badges';
import BottomNav from '../components/BottomNav';

export default function Profile() {
  const { profile, isVendor, logout } = useAuth();
  if (!profile) return null;

  return (
    <div className="app-shell">
      <div className="topbar"><h1>Profile</h1></div>
      <div className="screen screen-pad-bottom">
        <div className="center-col" style={{ marginBottom: 20 }}>
          <div className={`avatar lg ${isVendor ? '' : 'blue'}`}>{isVendor ? (profile.code?.split('-').pop() || initials(profile.name)) : initials(profile.name)}</div>
          <h2 style={{ margin: '12px 0 4px' }}>{isVendor ? profile.code : profile.name}</h2>
          <RoleBadge role={profile.role} />
          {isVendor && <div className="faint" style={{ marginTop: 6 }}>{profile.specialty || 'Karigar'}</div>}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginTop: 0 }}>Account</div>
          <InfoRow k="Name" v={profile.name} />
          {profile.phone && <InfoRow k="Phone" v={profile.phone} />}
          {profile.email && !isVendor && <InfoRow k="Email" v={profile.email} />}
          <InfoRow k="Code" v={profile.code} />
        </div>

        <EditProfile profile={profile} isVendor={isVendor} />
        <ChangePassword />

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row-between" onClick={() => alert('Notification settings are in the Alerts tab.')} style={{ cursor: 'pointer' }}>
            <span style={{ fontWeight: 600 }}>🔔 Notifications</span><span className="faint">›</span>
          </div>
          <div className="divider" />
          <div className="row-between"><span style={{ fontWeight: 600 }}>🌐 Language</span><span className="faint">English ›</span></div>
        </div>

        <button className="btn btn-danger btn-block" onClick={logout}>Sign out</button>
      </div>
      <BottomNav />
    </div>
  );
}

function EditProfile({ profile, isVendor }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [specialty, setSpecialty] = useState(profile.specialty || '');
  const [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    try {
      await updateDoc(doc(db, 'users', profile.id), { name, phone, specialty });
      setMsg('✓ Profile updated');
    } catch (e) { setMsg(e.message || 'Failed'); }
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row-between" onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }}>
        <span style={{ fontWeight: 600 }}>✏️ Edit profile</span><span className="faint">{open ? '▾' : '›'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 8 }}><label>{isVendor ? 'Specialty' : 'Designation'}</label><input className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></div>
          <button className="btn btn-primary btn-block" disabled={!name} onClick={save}>Save changes</button>
          {msg && <p style={{ fontSize: 13, marginBottom: 0, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    try { await updatePassword(auth.currentUser, pw); setMsg('✓ Password updated'); setPw(''); }
    catch (e) { setMsg(e.code?.includes('recent-login') ? 'Please sign in again, then retry.' : (e.message || 'Failed')); }
  };
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row-between" onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }}>
        <span style={{ fontWeight: 600 }}>🔒 Change password</span><span className="faint">{open ? '▾' : '›'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
          <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={pw.length < 6} onClick={save}>Update password</button>
          {msg && <p style={{ fontSize: 13, marginBottom: 0, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

export function InfoRow({ k, v }) {
  return (
    <div className="row-between" style={{ padding: '7px 0' }}>
      <span className="faint" style={{ fontSize: 13 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{v || '—'}</span>
    </div>
  );
}
