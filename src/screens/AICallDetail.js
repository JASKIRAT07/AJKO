import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useUsers } from '../hooks/useCollections';
import { toDate, formatDateTime } from '../utils/format';
import Loader from '../components/Loader';
import { IcBack } from '../components/Icons';

function fmtDur(sec) {
  if (!sec || sec < 0) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export default function AICallDetail() {
  const { callId } = useParams();
  const nav = useNavigate();
  const { data: users } = useUsers();
  const [call, setCall] = useState(undefined); // undefined = loading, null = missing

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'calls', callId), (s) => setCall(s.exists() ? { id: s.id, ...s.data() } : null));
    return unsub;
  }, [callId]);

  if (call === undefined) return <Loader text="Loading call…" />;

  const back = (
    <div className="topbar">
      <button className="icon-btn" onClick={() => nav(-1)}><IcBack size={18} /></button>
      <h1 style={{ fontSize: 18 }}>Call detail</h1>
    </div>
  );

  if (!call) {
    return (
      <div className="app-shell">
        {back}
        <div className="screen"><div className="empty"><div className="big">📞</div>This call isn’t available.</div></div>
      </div>
    );
  }

  const v = users.find((u) => u.id === call.vendorId);
  const name = v ? (v.code || v.name) : (call.vendorName || 'Vendor');
  const d = toDate(call.at);
  const dur = fmtDur(call.durationSec);

  return (
    <div className="app-shell">
      {back}
      <div className="screen screen-pad-bottom">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{name}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{d ? formatDateTime(d) : '—'}</div>
        </div>

        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {call.pickedUp ? <span className="aic-badge picked">Picked up</span> : <span className="aic-dotb nopick" style={{ fontSize: 11, padding: '5px 11px' }}>No answer</span>}
          {dur && <span className="aic-badge dur">{dur}</span>}
          {call.upset && <span className="aic-badge upset">⚠ Got upset</span>}
        </div>

        <div className="aic-rec">
          <span style={{ fontSize: 18 }}>🎧</span>
          {call.recordingUrl
            ? <audio src={call.recordingUrl} controls preload="none" style={{ flex: 1, height: 38, maxWidth: '100%' }} />
            : <span className="muted" style={{ fontSize: 13 }}>No recording available.</span>}
        </div>

        <div className="aic-trbox">
          <span className="lbl">Transcript</span>
          {call.transcript
            ? <p style={{ whiteSpace: 'pre-wrap' }}>{call.transcript}</p>
            : <p className="muted">No transcript available.</p>}
        </div>

        {call.note && <div className="aic-trbox" style={{ marginTop: 12 }}><span className="lbl">Note</span><p>{call.note}</p></div>}

        {call.upset && (
          <div className="aic-flagbox">⚠ Vendor upset — AI calls to {name} auto-paused</div>
        )}
      </div>
    </div>
  );
}
