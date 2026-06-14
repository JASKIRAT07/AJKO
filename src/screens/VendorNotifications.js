import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { IcBack } from '../components/Icons';

const DEFAULTS = { newOrderAlert: true, dailyReminders: true };

export default function VendorNotifications() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState({ ...DEFAULTS, ...(profile?.notificationPrefs || {}) });
  const [saved, setSaved] = useState(false);

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaved(false);
    await updateDoc(doc(db, 'users', profile.id), { notificationPrefs: next });
    setSaved(true);
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
        <h1 style={{ fontSize: 18 }}>Notifications</h1>
        {saved && <span className="faint" style={{ fontSize: 12 }}>✓ Saved</span>}
      </div>
      <div className="screen screen-pad-bottom">
        <Row
          title="New order alert"
          desc="Get a push the moment a new order is assigned to your channel."
          on={prefs.newOrderAlert}
          onToggle={() => toggle('newOrderAlert')}
        />
        <Row
          title="Daily reminders"
          desc="Push at 11 AM and 3 PM each day if you still have orders in the New stage."
          on={prefs.dailyReminders}
          onToggle={() => toggle('dailyReminders')}
        />
        <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
          Push notifications require allowing notifications in your browser and an installed app (Add to Home Screen).
        </p>
      </div>
    </div>
  );
}

function Row({ title, desc, on, onToggle }) {
  return (
    <div className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{desc}</div>
      </div>
      <button className={`switch ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}><span className="knob" /></button>
    </div>
  );
}
