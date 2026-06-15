import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { setPasswordForNewUser } from '../utils/auth';
import { IcDiamond } from '../components/Icons';

// Shown after OTP: first-time users set a password (skippable), and the
// forgot-password flow forces a reset (flag 'ajko_set_pw').
export default function SetPassword() {
  const { profile, logout } = useAuth();
  const nav = useNavigate();
  const reset = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ajko_set_pw') === '1';
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const clearFlag = () => { try { sessionStorage.removeItem('ajko_set_pw'); } catch { /* ignore */ } };

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await setPasswordForNewUser(profile, pw); // links/updates password + sets passwordSet
      clearFlag();
      nav('/');
    } catch (e) {
      setErr(e.code?.includes('weak-password') ? 'Password too weak (min 6 characters).' : (e.message || 'Could not set password.'));
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', profile.id), { setupComplete: true });
      clearFlag();
      nav('/');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="login-bg"><div className="blob blob1" /><div className="blob blob2" /></div>
      <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', padding: '24px 22px' }}>
        <div className="center-col" style={{ marginBottom: 24 }}>
          <div className="logo-mark"><IcDiamond size={40} color="#fff" /></div>
          <h2 style={{ margin: '14px 0 2px' }}>{reset ? 'Reset your password' : `Welcome, ${profile?.code}`}</h2>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{reset ? 'Choose a new password for your account.' : 'Set a password for faster logins next time.'}</p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: -6 }}>{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || pw.length < 6} onClick={save}>{busy ? 'Saving…' : (reset ? 'Update password' : 'Set password & continue')}</button>
          {!reset && <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={skip}>Skip — I’ll use OTP</button>}
        </div>

        <p className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
          <span className="link" onClick={() => { clearFlag(); logout(); }}>Sign out</span>
        </p>
      </div>
    </div>
  );
}
