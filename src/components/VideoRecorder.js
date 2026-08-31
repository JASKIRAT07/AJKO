import { useEffect, useRef, useState } from 'react';
import { supportedVideoMime } from '../utils/videoUpload';

const MAX_SECONDS = 120; // matches the Stream maxDurationSeconds cap

// In-app video recorder that captures at ~720p via getUserMedia constraints —
// live capture, NOT re-encoding (no canvas/transcode grind). Falls back cleanly
// if the camera/recorder isn't available (caller keeps the file picker).
export default function VideoRecorder({ onDone, onClose }) {
  const videoRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      } catch (e) {
        setErr('Camera not available. Please use “Add media” to pick a video instead.');
      }
    })();
    return () => {
      cancelled = true;
      try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch (e) { /* noop */ }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => {
      setSecs((s) => {
        if (s + 1 >= MAX_SECONDS) { stopRec(); return MAX_SECONDS; }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const mime = supportedVideoMime();
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2500000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'video/mp4' });
        const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
        onDone(new File([blob], `order-video.${ext}`, { type: blob.type }));
      };
      rec.start();
      recRef.current = rec;
      setSecs(0);
      setRecording(true);
    } catch (e) {
      setErr('Could not start recording on this device. Please use “Add media” instead.');
    }
  };

  const stopRec = () => {
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch (e) { /* noop */ }
    setRecording(false);
  };

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Record video <span className="faint" style={{ fontWeight: 500 }}>· 720p</span></h3>
        {err ? (
          <>
            <p className="muted" style={{ fontSize: 14 }}>{err}</p>
            <button className="btn btn-primary btn-block" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 14, overflow: 'hidden' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {recording && (
                <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 8, fontSize: 12, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> {mmss}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {!recording
                ? <button className="btn btn-primary" style={{ flex: 1 }} onClick={startRec}>● Record</button>
                : <button className="btn btn-danger" style={{ flex: 1 }} onClick={stopRec}>■ Stop &amp; use</button>}
              <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>Cancel</button>
            </div>
            <p className="faint" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>Up to {MAX_SECONDS}s · saves at ~720p for a fast upload</p>
          </>
        )}
      </div>
    </div>
  );
}
