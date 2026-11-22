// Phone-ring bridge for AJKO "Do Calls" — the reliable replacement for browser
// (WebRTC) calling. There is NO browser mic/audio here: tapping Call asks the
// backend to ring the staff's own phone, then bridge to the vendor. This hook
// only places the call and tracks its live status (from the doCalls row) so the
// app can show a call card. The actual voice is a normal phone call.
import { useRef, useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { functions, db } from '../firebase';

export function usePhoneBridge() {
  const [call, setCall] = useState(null); // { state, label }
  const [duration, setDuration] = useState(0);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const unsub = useRef(null);
  const durTimer = useRef(null);
  const connectedAt = useRef(0);
  const clientCallId = useRef(null);

  const clearAll = () => {
    if (unsub.current) { try { unsub.current(); } catch (e) { /* noop */ } unsub.current = null; }
    if (durTimer.current) { clearInterval(durTimer.current); durTimer.current = null; }
  };
  const reset = () => {
    clearAll();
    setCall(null); setDuration(0); setPlacing(false); setMinimized(false);
    connectedAt.current = 0; clientCallId.current = null;
  };

  useEffect(() => () => clearAll(), []);

  const placeCall = useCallback(async (vendor) => {
    if (placing || clientCallId.current) return;
    setNote('');
    setPlacing(true);
    setCall({ state: 'dialing-staff', label: vendor?.code || vendor?.name || 'vendor' });
    try {
      const { data } = await httpsCallable(functions, 'plivoDialStaff')({ vendorId: vendor.id });
      const id = data && data.clientCallId;
      if (!id) { reset(); setNote('Could not start the call. Try again.'); return; }
      clientCallId.current = id;
      setPlacing(false);
      clearAll();
      unsub.current = onSnapshot(
        query(collection(db, 'doCalls'), where('clientCallId', '==', id)),
        (snap) => {
          if (snap.empty) return;
          const d = snap.docs[0].data();
          const ls = d.legStatus;
          if (d.status === 'completed' || d.status === 'failed' || ls === 'failed' || ls === 'ended') { reset(); return; }
          if (ls === 'answered') {
            setCall((x) => (x ? { ...x, state: 'connected' } : x));
            if (!connectedAt.current) {
              connectedAt.current = Date.now(); setDuration(0);
              durTimer.current = setInterval(() => setDuration(Math.floor((Date.now() - connectedAt.current) / 1000)), 1000);
            }
          } else if (ls === 'staff-answered' || ls === 'ringing') {
            setCall((x) => (x && x.state !== 'connected' ? { ...x, state: 'ringing-vendor' } : x));
          }
        },
        () => {},
      );
    } catch (e) {
      reset();
      setNote((e && e.message) || 'Could not start the call.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing]);

  const hangup = useCallback(() => {
    const id = clientCallId.current;
    if (id) { try { httpsCallable(functions, 'plivoEndCall')({ clientCallId: id }); } catch (e) { /* noop */ } }
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => setMinimized(false), []);

  return { call, duration, note, setNote, placing, minimized, placeCall, hangup, minimize, expand };
}
