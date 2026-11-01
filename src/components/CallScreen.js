// Full-screen in-call UI for Do Calls — a WhatsApp-style call screen shown while
// a browser call is dialing / ringing / connected, and removed when it ends.
// Controls: mute (mic) with a live mic-level meter, speaker on/off, and end.
import { IcPhone, IcMic } from './Icons';

function initials(name) {
  if (!name) return '📞';
  return name.split(/[\s-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CallScreen({ call, duration, micLevel, muted, speakerOn, onMute, onSpeaker, onEnd }) {
  if (!call) return null;
  const connected = call.state === 'connected';
  const stateText = call.state === 'dialing' ? 'Calling…' : call.state === 'ringing' ? 'Ringing…' : fmt(duration);
  const level = Math.min(1, Math.max(0, micLevel || 0));

  return (
    <div className="cs-back">
      <style>{`
        .cs-back{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
          background:linear-gradient(180deg,#0f1f17,#0a1410);color:#fff;padding:48px 24px max(32px,env(safe-area-inset-bottom));}
        .cs-avatar{width:120px;height:120px;border-radius:50%;display:grid;place-items:center;font-size:40px;font-weight:800;
          background:linear-gradient(135deg,#1f8f5f,#0e6b43);box-shadow:0 10px 40px rgba(16,185,129,.35);}
        .cs-ring{position:relative}
        .cs-ring::before,.cs-ring::after{content:"";position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(34,197,94,.55);
          animation:csPulse 1.8s ease-out infinite}
        .cs-ring::after{animation-delay:.9s}
        @keyframes csPulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.5);opacity:0}}
        @media (prefers-reduced-motion:reduce){.cs-ring::before,.cs-ring::after{animation:none;opacity:0}}
        .cs-btn{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;font-size:22px;color:#fff;
          background:rgba(255,255,255,.14);transition:background .15s, transform .1s}
        .cs-btn:active{transform:scale(.92)}
        .cs-btn.off{background:#fff;color:#0a1410}
        .cs-end{width:66px;height:66px;border-radius:50%;background:#ef4444;display:grid;place-items:center;color:#fff}
        .cs-meter{width:160px;height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}
        .cs-meter>div{height:100%;background:#22c55e;border-radius:3px;transition:width .1s linear}
      `}</style>

      {/* Who + state */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <div className="faint" style={{ color: '#7fd9a6', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          AJKO · Masked call
        </div>
        <div className={call.state === 'ringing' || call.state === 'dialing' ? 'cs-ring' : ''} style={{ display: 'inline-block' }}>
          <div className="cs-avatar">{initials(call.label)}</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 22 }}>{call.label}</div>
        <div style={{ fontSize: 16, color: '#9fe3bf', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{stateText}</div>
      </div>

      {/* Live mic indicator (so you can SEE the mic is on) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {connected ? (
          <>
            <div style={{ fontSize: 12, color: muted ? '#f87171' : '#9fe3bf' }}>
              {muted ? '🔇 Mic muted' : '🎤 Mic live'}
            </div>
            <div className="cs-meter"><div style={{ width: `${muted ? 0 : Math.round(level * 100)}%` }} /></div>
          </>
        ) : <div style={{ height: 26 }} />}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ textAlign: 'center' }}>
          <button className={`cs-btn ${muted ? 'off' : ''}`} onClick={onMute} aria-label="Mute">
            <IcMic size={22} />
          </button>
          <div style={{ fontSize: 11, marginTop: 6, color: '#cfeede' }}>{muted ? 'Unmute' : 'Mute'}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className={`cs-btn ${speakerOn ? '' : 'off'}`} onClick={onSpeaker} aria-label="Speaker">
            <span style={{ fontSize: 22 }}>{speakerOn ? '🔊' : '🔈'}</span>
          </button>
          <div style={{ fontSize: 11, marginTop: 6, color: '#cfeede' }}>Speaker</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className="cs-end" onClick={onEnd} aria-label="End call" style={{ transform: 'rotate(135deg)' }}>
            <IcPhone size={26} />
          </button>
          <div style={{ fontSize: 11, marginTop: 6, color: '#cfeede' }}>End</div>
        </div>
      </div>
    </div>
  );
}
