// In-call UI for Do Calls — a WhatsApp-style call screen (dialing/ringing/
// connected) with mute, live mic meter, speaker toggle, duration, minimize, and
// end. Minimizing collapses it to a slim top header; tapping the header reopens
// the full screen. Removed entirely when the call ends.
import { IcPhone } from './Icons';

function initials(name) {
  if (!name) return '📞';
  return name.split(/[\s-]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CallScreen({
  call, duration, micLevel, muted, speakerOn, minimized,
  onMute, onSpeaker, onEnd, onMinimize, onExpand,
}) {
  if (!call) return null;
  const connected = call.state === 'connected';
  const stateText = call.state === 'dialing' ? 'Calling…' : call.state === 'ringing' ? 'Ringing…' : fmt(duration);
  const level = Math.min(1, Math.max(0, micLevel || 0));

  const styleTag = (
    <style>{`
      .cs-back{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
        background:radial-gradient(1200px 600px at 50% -10%,#15352a 0%,#0b1712 55%,#070d0a 100%);color:#fff;
        padding:40px 24px max(32px,env(safe-area-inset-bottom));}
      .cs-avatar{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;font-size:40px;font-weight:800;
        background:linear-gradient(135deg,#1f8f5f,#0c5c39);box-shadow:0 12px 44px rgba(16,185,129,.4),inset 0 0 0 1px rgba(255,255,255,.08);}
      .cs-ring{position:relative}
      .cs-ring::before,.cs-ring::after{content:"";position:absolute;inset:-12px;border-radius:50%;border:2px solid rgba(34,197,94,.55);animation:csP 1.8s ease-out infinite}
      .cs-ring::after{animation-delay:.9s}
      @keyframes csP{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.55);opacity:0}}
      @media (prefers-reduced-motion:reduce){.cs-ring::before,.cs-ring::after{animation:none;opacity:0}}
      .cs-top{width:100%;max-width:var(--maxw);display:flex;justify-content:flex-start}
      .cs-min{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.12);display:grid;place-items:center;color:#fff;font-size:20px}
      .cs-btn{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:24px;color:#fff;background:rgba(255,255,255,.14);transition:background .15s,transform .1s}
      .cs-btn:active{transform:scale(.92)}
      .cs-btn.on{background:#fff;color:#0a1410}
      .cs-end{width:68px;height:68px;border-radius:50%;background:#ef4444;display:grid;place-items:center;color:#fff;box-shadow:0 8px 24px rgba(239,68,68,.45)}
      .cs-meter{width:170px;height:6px;border-radius:3px;background:rgba(255,255,255,.16);overflow:hidden}
      .cs-meter>div{height:100%;background:#22c55e;border-radius:3px;transition:width .1s linear}
      .cs-bar{position:fixed;left:50%;transform:translateX(-50%);top:0;width:100%;max-width:var(--maxw);z-index:70;padding:8px 12px;}
      .cs-bar-inner{display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,#0e6b43,#12835a);color:#fff;border-radius:14px;padding:8px 10px;box-shadow:0 6px 20px rgba(16,185,129,.35);cursor:pointer}
      .cs-bar-av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto}
      .cs-bar-end{width:36px;height:36px;border-radius:50%;background:#ef4444;display:grid;place-items:center;color:#fff;flex:0 0 auto}
    `}</style>
  );

  // Minimized → slim top header; tap it to reopen.
  if (minimized) {
    return (
      <div className="cs-bar">
        {styleTag}
        <div className="cs-bar-inner" onClick={onExpand}>
          <div className="cs-bar-av">{initials(call.label)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{call.label}</div>
            <div style={{ fontSize: 12, opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>{stateText}{muted ? ' · muted' : ''}</div>
          </div>
          <button className="cs-bar-end" onClick={(e) => { e.stopPropagation(); onEnd(); }} aria-label="End call" style={{ transform: 'rotate(135deg)' }}>
            <IcPhone size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-back">
      {styleTag}

      {/* Minimize */}
      <div className="cs-top">
        <button className="cs-min" onClick={onMinimize} aria-label="Minimize">⌄</button>
      </div>

      {/* Who + state */}
      <div style={{ textAlign: 'center', marginTop: -8 }}>
        <div style={{ color: '#7fd9a6', fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14 }}>AJKO · Masked call</div>
        <div className={!connected ? 'cs-ring' : ''} style={{ display: 'inline-block' }}>
          <div className="cs-avatar">{initials(call.label)}</div>
        </div>
        <div style={{ fontSize: 27, fontWeight: 800, marginTop: 22 }}>{call.label}</div>
        <div style={{ fontSize: 16, color: '#9fe3bf', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{stateText}</div>
      </div>

      {/* Live mic indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 34 }}>
        {connected && (
          <>
            <div style={{ fontSize: 12, color: muted ? '#f87171' : '#9fe3bf' }}>{muted ? '🔇 Your mic is muted' : '🎤 Mic is live'}</div>
            <div className="cs-meter"><div style={{ width: `${muted ? 0 : Math.round(level * 100)}%` }} /></div>
          </>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}>
        <div style={{ textAlign: 'center' }}>
          <button className={`cs-btn ${muted ? 'on' : ''}`} onClick={onMute} aria-label="Mute mic">
            <span style={{ fontSize: 24 }}>{muted ? '🔇' : '🎤'}</span>
          </button>
          <div style={{ fontSize: 11, marginTop: 7, color: '#cfeede' }}>{muted ? 'Unmute' : 'Mute'}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className={`cs-btn ${speakerOn ? '' : 'on'}`} onClick={onSpeaker} aria-label="Speaker">
            <span style={{ fontSize: 24 }}>{speakerOn ? '🔊' : '🔈'}</span>
          </button>
          <div style={{ fontSize: 11, marginTop: 7, color: '#cfeede' }}>{speakerOn ? 'Speaker on' : 'Speaker off'}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className="cs-end" onClick={onEnd} aria-label="End call" style={{ transform: 'rotate(135deg)' }}>
            <IcPhone size={27} />
          </button>
          <div style={{ fontSize: 11, marginTop: 7, color: '#cfeede' }}>End</div>
        </div>
      </div>
    </div>
  );
}
