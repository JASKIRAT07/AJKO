import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getWatchData } from '../utils/stream';
import { IcDiamond } from '../components/Icons';

const ORANGE = '#ff6b35';
const BG = '#faf7f4';

function fmtDuration(sec) {
  if (!sec || sec < 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// PUBLIC per-order video watch page (no login). Branded AJKO; shows all of an
// order's videos as tiles and plays them in-app in an overlay player.
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

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#241c19', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: '24px 18px 40px', flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg,#ff8a5b,${ORANGE})`, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(255,107,53,.35)' }}>
            <IcDiamond size={24} color="#fff" />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE, letterSpacing: '.04em', textTransform: 'uppercase' }}>Order Video · AJKO</div>
        </div>

        {state === 'ready' && (
          <>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '18px 0 4px', letterSpacing: '-0.02em' }}>Order {data.appOrderNo}</h1>
            <div style={{ color: '#6b625c', fontSize: 15, marginBottom: 22 }}>
              {data.itemName}{videos.length ? ` · ${videos.length} video${videos.length === 1 ? '' : 's'}` : ''}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎥 Is order ke saare videos</div>

            {videos.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', color: '#6b625c' }}>No videos for this order.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {videos.map((v, i) => {
                  const thumb = v.ready && v.host ? `https://${v.host}/${v.uid}/thumbnails/thumbnail.jpg?width=640&height=480&fit=crop` : null;
                  return (
                    <button key={v.uid} onClick={() => v.ready && setActive(v)} style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: '#111', cursor: v.ready ? 'pointer' : 'default', padding: 0, textAlign: 'left' }}>
                      {thumb
                        ? <img src={thumb} alt={`Video ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#fff', opacity: 0.8, fontSize: 13 }}>🎥 Processing…</div>}
                      {/* index */}
                      <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{i + 1}</span>
                      {/* duration */}
                      {v.ready && fmtDuration(v.duration) && (
                        <span style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 6, fontSize: 11, padding: '2px 6px' }}>{fmtDuration(v.duration)}</span>
                      )}
                      {/* play overlay */}
                      {v.ready && (
                        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,107,53,.92)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20, paddingLeft: 4, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>▶</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {state === 'loading' && <div style={{ marginTop: 40, textAlign: 'center', color: '#6b625c' }}>Loading…</div>}
        {state === 'notfound' && <div style={{ marginTop: 40, textAlign: 'center', color: '#6b625c' }}>This order link isn’t available.</div>}
        {state === 'error' && <div style={{ marginTop: 40, textAlign: 'center', color: '#6b625c' }}>Couldn’t load the videos. Please try again.</div>}
      </div>

      <div style={{ textAlign: 'center', padding: '16px', color: '#a79f98', fontSize: 12 }}>Powered by AJKO</div>

      {/* Player overlay */}
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
