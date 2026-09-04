import { useState, useRef } from 'react';

// Fullscreen image with pinch / double-tap zoom + pan. Lightweight (no library):
// touch handles pinch & pan; double-tap (and double-click) toggle zoom; mouse
// drag pans when zoomed; wheel zooms on desktop. touch-action:none so the
// browser doesn't hijack the gesture. Only the viewer gains zoom — nothing about
// upload/storage/thumbnails/sharing changes.
function ZoomableImage({ src, alt }) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const g = useRef({});
  const mouse = useRef(null);
  const lastTap = useRef(0);
  const stop = (e) => e.stopPropagation();

  const dist = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  const toggle = () => setT((p) => (p.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }));

  const onTouchStart = (e) => {
    stop(e);
    if (e.touches.length === 2) {
      g.current = { mode: 'pinch', d0: dist(e.touches), s0: t.scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) { toggle(); lastTap.current = 0; g.current = {}; return; }
      lastTap.current = now;
      g.current = { mode: 'pan', x0: e.touches[0].clientX, y0: e.touches[0].clientY, tx0: t.x, ty0: t.y };
    }
  };
  const onTouchMove = (e) => {
    if (!g.current.mode) return;
    stop(e);
    if (g.current.mode === 'pinch' && e.touches.length === 2) {
      const s = Math.min(4, Math.max(1, g.current.s0 * (dist(e.touches) / g.current.d0)));
      setT((p) => (s <= 1 ? { scale: 1, x: 0, y: 0 } : { ...p, scale: s }));
    } else if (g.current.mode === 'pan' && e.touches.length === 1 && t.scale > 1) {
      setT((p) => ({ ...p, x: g.current.tx0 + (e.touches[0].clientX - g.current.x0), y: g.current.ty0 + (e.touches[0].clientY - g.current.y0) }));
    }
  };
  const onTouchEnd = (e) => { stop(e); g.current = {}; setT((p) => (p.scale <= 1 ? { scale: 1, x: 0, y: 0 } : p)); };

  const onWheel = (e) => { stop(e); const s = Math.min(4, Math.max(1, t.scale - e.deltaY * 0.002)); setT((p) => (s <= 1 ? { scale: 1, x: 0, y: 0 } : { ...p, scale: s })); };
  const onMouseDown = (e) => { if (t.scale > 1) { stop(e); mouse.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; } };
  const onMouseMove = (e) => { if (mouse.current) { stop(e); setT((p) => ({ ...p, x: mouse.current.tx + (e.clientX - mouse.current.x), y: mouse.current.ty + (e.clientY - mouse.current.y) })); } };
  const onMouseUp = () => { mouse.current = null; };

  return (
    <img
      src={src}
      alt={alt}
      onClick={stop}
      onDoubleClick={(e) => { stop(e); toggle(); }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        touchAction: 'none',
        transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
        transition: g.current.mode || mouse.current ? 'none' : 'transform .18s ease',
        cursor: t.scale > 1 ? 'grab' : 'zoom-in',
        maxWidth: '100%',
        maxHeight: '100%',
        borderRadius: 12,
        willChange: 'transform',
      }}
    />
  );
}

export default function MediaStrip({ media = [], single }) {
  const [lightbox, setLightbox] = useState(null); // {url, isVideo}
  if (!media || media.length === 0) return null;

  const open = (e, item) => { e.stopPropagation(); setLightbox(item); };

  return (
    <>
      <div className={`media-strip ${single || media.length === 1 ? 'single' : ''}`}>
        {media.map((m, i) => {
          const url = typeof m === 'string' ? m : m.url;
          const isVideo = (typeof m === 'object' && m.type === 'video') || /\.(mp4|mov|webm)/i.test(url || '');
          return isVideo
            ? <video key={i} src={url} controls playsInline onClick={(e) => open(e, { url, isVideo })} />
            : <img key={i} src={url} alt={`media ${i + 1}`} onClick={(e) => open(e, { url, isVideo })} />;
        })}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Close">✕</button>
          {lightbox.isVideo
            ? <video src={lightbox.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
            : <ZoomableImage src={lightbox.url} alt="full size" />}
        </div>
      )}
    </>
  );
}
