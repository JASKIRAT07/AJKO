import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { IcBack } from '../components/Icons';
import {
  requestPush, isIOS, isStandalone, notificationPermission,
} from '../serviceWorkerRegistration';

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
        <PushDeviceCard userId={profile?.id} />
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
          The toggles above control which alerts you get. To actually receive them on this phone or computer, turn on “Push on this device” at the top.
        </p>
      </div>
    </div>
  );
}

// Per-device push enablement: ask permission (button tap, required by iOS) and
// register this device's FCM token. Shows the right install steps per platform.
function PushDeviceCard({ userId }) {
  const [perm, setPerm] = useState(notificationPermission());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ios = isIOS();
  const standalone = isStandalone();
  const enabled = perm === 'granted';

  const enable = async () => {
    setMsg(''); setBusy(true);
    const res = await requestPush(userId);
    setBusy(false);
    if (res.ok) { setPerm('granted'); setMsg('✅ Push is on for this device.'); return; }
    if (res.reason === 'ios-needs-install') setMsg('On iPhone/iPad you must add AJKO to your Home Screen first (steps below), open it from there, then tap Enable.');
    else if (res.reason === 'denied') setMsg('Notifications are blocked for this site. Allow them in your browser settings, then tap Enable again.');
    else if (res.reason === 'unsupported') setMsg('This browser can’t do push notifications. Try Chrome (Android) or an installed app (iOS 16.4+).');
    else if (res.reason === 'dismissed') setMsg('You dismissed the permission prompt. Tap Enable to try again.');
    else setMsg('Could not enable push. Please try again.');
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700 }}>Push on this device</div>
      <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
        {enabled
          ? 'This device is set up to receive push notifications, even when the app is closed.'
          : 'Turn this on so you’re alerted even when AJKO is closed. Do this once on each phone/computer you use.'}
      </div>

      {enabled ? (
        <div style={{ marginTop: 10, color: '#16a34a', fontWeight: 600, fontSize: 13 }}>✅ Enabled on this device</div>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={enable}>
          {busy ? 'Enabling…' : 'Enable push on this device'}
        </button>
      )}

      {msg && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{msg}</div>}

      {ios && !standalone && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--primary-soft)', borderRadius: 12, fontSize: 13, lineHeight: 1.5 }}>
          <b>iPhone / iPad — add to Home Screen first</b>
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Open this site in <b>Safari</b> (not Chrome).</li>
            <li>Tap the <b>Share</b> icon (square with an up-arrow).</li>
            <li>Choose <b>Add to Home Screen</b> → <b>Add</b>.</li>
            <li>Open <b>AJKO</b> from the new Home Screen icon, come back here, and tap <b>Enable push</b>.</li>
          </ol>
        </div>
      )}

      {!ios && !standalone && (
        <div className="faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
          <b>Android:</b> tap the browser menu (⋮) → <b>Install app</b> / <b>Add to Home screen</b> for the best experience, then Enable push.
        </div>
      )}
    </div>
  );
}
