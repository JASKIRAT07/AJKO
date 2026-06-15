import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { IcBack } from '../components/Icons';

// Exactly the toggles each role gets. All default ON.
const ROWS = {
  vendor: [
    { key: 'newOrderAlert', title: 'New order alert', desc: 'Push the moment a new order is assigned to your channel.' },
    { key: 'reminder11am', title: '11 AM reminder', desc: 'Daily 11 AM nudge — only if you have orders still in New.' },
    { key: 'reminder3pm', title: '3 PM reminder', desc: 'Daily 3 PM nudge — only if you have orders still in New.' },
    { key: 'chatNotifications', title: 'Chat notifications', desc: 'Push when a new message arrives in your channels.' },
  ],
  team: [
    { key: 'chatNotifications', title: 'Chat notifications', desc: 'Push when a new message arrives in your channels.' },
  ],
  admin: [
    { key: 'chatNotifications', title: 'Chat notifications', desc: 'Push when a new message arrives in any channel.' },
  ],
};

export default function NotificationSettings() {
  const { profile, role } = useAuth();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState(profile?.notificationPrefs || {});
  const [saved, setSaved] = useState(false);
  const rows = ROWS[role] || ROWS.team;

  const isOn = (key) => prefs[key] !== false; // default ON
  const toggle = async (key) => {
    const next = { ...prefs, [key]: !isOn(key) };
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
        {rows.map((r) => (
          <div key={r.key} className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{r.title}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{r.desc}</div>
            </div>
            <button className={`switch ${isOn(r.key) ? 'on' : ''}`} onClick={() => toggle(r.key)} aria-pressed={isOn(r.key)}><span className="knob" /></button>
          </div>
        ))}
        <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
          Push notifications require allowing notifications when the app asks, and work best with the app added to your home screen.
        </p>
      </div>
    </div>
  );
}
