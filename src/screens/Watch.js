import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getWatchData } from '../utils/stream';
import { IcDiamond } from '../components/Icons';
import Loader from '../components/Loader';

const ORANGE = '#ff6b35';
const BG = '#faf7f4';

function fmtDuration(sec) {
  if (!sec || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// PUBLIC per-order MEDIA page (no login). Branded AJKO; shows all of an order's
// videos (tiles → in-app player) AND its voice note (in-page audio player).
// Lazy: thumbnails small/lazy, the video player mounts on tap, the voice audio
// loads only when its play is tapped.
export default function Watch() {
  const { orderId } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notfound | error
  const [active, setActive] = useState(null); // video being played (overlay)

  useEffect(() => {
    let alive = true;
    getWatchData(orderId)
      .then((d) => {
        if (!alive) return;
        if (!d || !d.found) { setState('notfound'); return; }
        setData(d); setState('ready');
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [orderId]);

  const videos = data?.videos || [];
  const voiceNote = data?.voiceNote || null;

  const close = () => {
    try { window.close(); } catch (e) { /* noop */ }
    try { if (window.history.length > 1) window.history.back(); } catch (e) { /* noop */ }
  };

  const subParts = [];
  if (videos.length) subParts.push(`${videos.length} video${videos.length === 1 ? '' : 's'}`);
  if (voiceNote) subParts.push('1 voice note');
  const subline = [data?.itemName, subParts.join(', ')].filter(Boolean).join(' · ');

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#241c19', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: '18px 16px 32px', flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: `linear-gradient(135deg,#ff8a5b,${ORANGE})`, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(255,107,53,.35)' }}>
            <IcDiamond size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: ORANGE, letterSpacing: '.04em', textTransform: 'uppercase' }}>Order Media · AJKO</div>
          <button aria-label="Close" onClick={close} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.06)', color: '#6b625c', fontSize: 17, flexShrink: 0 }}>✕</button>
        </div>

        {state === 'ready' && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '16px 0 3px', letterSpacing: '-0.02em' }}>Order {data.appOrderNo}</h1>
            <div style={{ color: '#6b625c', fontSize: 14, marginBottom: 20 }}>{subline}</div>

            {videos.length > 0 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎥 Is order ke videos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {videos.map((v, i) => {
                    const thumb = v.ready && v.host ? `https://${v.host}/${v.uid}/thumbnails/thumbnail.jpg?width=640&height=480&fit=crop` : null;
                    return (
                      <button key={v.uid} onClick={() => v.ready && setActive(v)} style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: '#111', cursor: v.ready ? 'pointer' : 'default', padding: 0, textAlign: 'left' }}>
                        {thumb
                          ? <img src={thumb} alt={`Video ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', opacity: 0.8, fontSize: 13 }}>🎥 Processing…</div>}
                        <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{i + 1}</span>
                        {v.ready && fmtDuration(v.duration) && (
                          <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 6, fontSize: 11, padding: '2px 6px' }}>{fmtDuration(v.duration)}</span>
                        )}
                        {v.ready && (
                          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                            <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,107,53,.92)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20, paddingLeft: 4, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>▶</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {voiceNote && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, margin: `${videos.length ? 24 : 0}px 0 12px` }}>🎤 Voice note — sun-no</div>
                <div style={{ background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 10px rgba(90,58,26,.06)' }}>
                  {/* preload="none" → audio loads only when play is tapped */}
                  <audio src={voiceNote.url} controls preload="none" style={{ width: '100%', height: 44 }} />
                </div>
              </>
            )}

            {videos.length === 0 && !voiceNote && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', color: '#6b625c' }}>No media for this order.</div>
            )}
          </>
        )}

        {state === 'loading' && <Loader text="Loading…" full={false} />}
        {state === 'notfound' && <div style={{ marginTop: 40, textAlign: 'center', color: '#6b625c' }}>This order link isn’t available.</div>}
        {state === 'error' && <div style={{ marginTop: 40, textAlign: 'center', color: '#6b625c' }}>Couldn’t load the media. Please try again.</div>}
      </div>

      <div style={{ textAlign: 'center', padding: '16px', color: '#a79f98', fontSize: 12 }}>Powered by AJKO</div>

      {/* Video player overlay (unchanged) */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
          <button aria-label="Close" onClick={() => setActive(null)} style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 20 }}>✕</button>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
            <iframe
              title={`Order ${data?.appOrderNo} video`}
              src={`https://${active.host}/${active.uid}/iframe?autoplay=true`}
              style={{ border: 0, width: '100%', height: '100%' }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
}
