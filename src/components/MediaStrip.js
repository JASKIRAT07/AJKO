import { useState, useRef, useEffect } from 'react';

// Fullscreen image with double-tap / double-click + pinch zoom and pan.
// Two iOS/Safari pitfalls are handled:
//  1) At rest (scale 1) the image carries NO transform and NO will-change, so it
//     is a plain, always-painted element — avoids the bug where a persistently
//     composited <img> only repaints while touched ("blank until press-and-hold").
//  2) The image is NEVER hidden by React state. Safari often does not fire onLoad
//     for a CACHED image, so gating visibility on onLoad left it invisible over
//     the dark backdrop (a black screen). Instead the image is always visible and
//     a spinner sits BEHIND it; the spinner is cleared via onLoad OR the img's
//     `complete` flag on mount. onError shows a clear message, never a black void.
function ZoomableImage({ src, alt }) {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const g = useRef({});
  const mouse = useRef(null);
  const lastTap = useRef(0);
  const stop = (e) => e.stopPropagation();
  const zoomed = t.scale > 1;

  // Cached images may not fire onLoad in Safari — detect via `complete` on mount.
  useEffect(() => {
    setLoaded(false); setFailed(false);
    const im = imgRef.current;
    if (im && im.complete && im.naturalWidth > 0) setLoaded(true);
  }, [src]);

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
    <>
      {!loaded && !failed && <div className="lightbox-spin"><div className="spinner" /></div>}
      {failed && (
        <div className="lightbox-fail">
          <div style={{ fontSize: 34, marginBottom: 10 }}>🖼️</div>
          Couldn’t load this image.<br />Check your connection and try again.
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
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
          // Only capture the gesture while zoomed; otherwise behave like a normal image.
          touchAction: zoomed ? 'none' : 'auto',
          // No transform / no layer promotion at rest → the image always paints on iOS.
          transform: zoomed ? `translate(${t.x}px, ${t.y}px) scale(${t.scale})` : 'none',
          transition: (g.current.mode || mouse.current) ? 'none' : 'transform .18s ease',
          willChange: zoomed ? 'transform' : 'auto',
          cursor: zoomed ? 'grab' : 'zoom-in',
          position: 'relative',
          zIndex: 2, // sits above the spinner that is behind it
          display: failed ? 'none' : 'block',
          maxWidth: '100%',
          maxHeight: '86vh',
          objectFit: 'contain',
          borderRadius: 12,
        }}
      />
    </>
  );
}

export default function MediaStrip({ media = [], single }) {
  const [lightbox, setLightbox] = useState(null); // {url, isVideo}
  const close = () => setLightbox(null);

  // While the viewer is open: close on Escape and lock background scroll.
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [lightbox]);

  if (!media || media.length === 0) return null;

  const open = (e, item) => { e.stopPropagation(); setLightbox(item); };

  return (
    <>
      <div className={`media-strip ${single || media.length === 1 ? 'single' : ''}`}>
        {media.map((m, i) => {
          const url = typeof m === 'string' ? m : m.url;
          const isVideo = (typeof m === 'object' && m.type === 'video') || /\.(mp4|mov|webm)/i.test(url || '');
          return isVideo
            ? <video key={i} src={url} controls playsInline preload="metadata" onClick={(e) => open(e, { url, isVideo })} />
            : (
              <img
                key={i}
                src={url}
                alt={`media ${i + 1}`}
                loading="lazy"
                decoding="async"
                onClick={(e) => open(e, { url, isVideo })}
                onError={(e) => { e.currentTarget.style.opacity = '0'; }}
              />
            );
        })}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={close} role="dialog" aria-modal="true">
          {/* Big, always-working close button. Explicit handler (does not rely on
              bubbling) + high z-index so taps always land on it. */}
          <button
            type="button"
            className="lightbox-close"
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); close(); }}
          >
            ✕
          </button>
          {/* Tapping the media itself should NOT close (so you can zoom); only the
              dark backdrop and the ✕ close. */}
          <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
            {lightbox.isVideo
              ? <video src={lightbox.url} controls autoPlay playsInline />
              : <ZoomableImage src={lightbox.url} alt="full size" />}
          </div>
          <div className="lightbox-hint">Tap ✕ or outside the image to close</div>
        </div>
      )}
    </>
  );
}
