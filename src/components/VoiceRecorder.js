import { useRef, useState, useEffect } from 'react';
import { IcMic } from './Icons';
import { supportedAudioMime } from '../utils/upload';

// Records a voice note via MediaRecorder and returns the Blob via onRecorded.
export default function VoiceRecorder({ value, onRecorded, onClear }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = supportedAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/mp4' });
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      alert('Microphone permission needed to record a voice note.');
    }
  };

  const stop = () => {
    recRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="card-tight card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button type="button" className={`round-btn ${recording ? 'soft' : 'primary'}`} onClick={recording ? stop : start} style={recording ? { color: 'var(--red)' } : {}}>
        {recording ? '⏹' : <IcMic size={20} />}
      </button>
      <div style={{ flex: 1 }}>
        {recording ? (
          <div className="wave">
            {Array.from({ length: 18 }).map((_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.06}s` }} />
            ))}
          </div>
        ) : value ? (
          <audio src={typeof value === 'string' ? value : URL.createObjectURL(value)} controls style={{ width: '100%', height: 36 }} />
        ) : (
          <span className="muted" style={{ fontSize: 14 }}>Tap mic to record a voice note</span>
        )}
      </div>
      <span className="faint" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>{recording ? mmss : ''}</span>
      {value && !recording && <button type="button" className="link" onClick={onClear}>✕</button>}
    </div>
  );
}
