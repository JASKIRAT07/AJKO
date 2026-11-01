// Plivo Browser SDK integration for AJKO "Do Calls".
// Staff browser registers as a Plivo endpoint (JWT) and places masked WebRTC
// calls. Live state: dialing → ringing → connected (driven by the server's
// per-call legStatus so "Ringing / Picked up" are accurate, since the browser
// leg itself answers early). Mute (mic), speaker (output) on/off, live mic
// level, duration, minimize. Mic only acquired during a call (permOnClick).
import { useEffect, useRef, useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { functions, db } from '../firebase';

function setAllAudioMuted(muted) {
  try { document.querySelectorAll('audio').forEach((el) => { el.muted = muted; }); } catch (e) { /* noop */ }
}
function newCallId() {
  const u = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : '';
  return (u || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9]/g, '');
}

export function usePlivoBrowser(enabled) {
  const ref = useRef(null);
  const [status, setStatus] = useState('idle'); // idle|connecting|ready|error|unprovisioned
  const [call, setCall] = useState(null);        // { state, label }
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const startRef = useRef(0);
  const durTimer = useRef(null);
  const meterTimer = useRef(null);
  const micRaw = useRef(0);
  const speakerRef = useRef(true);
  const callIdRef = useRef(null);
  const unsubDoc = useRef(null);
  const connectedRef = useRef(false);

  const clearTimers = () => {
    if (durTimer.current) { clearInterval(durTimer.current); durTimer.current = null; }
    if (meterTimer.current) { clearInterval(meterTimer.current); meterTimer.current = null; }
  };
  const stopDocSub = () => { if (unsubDoc.current) { try { unsubDoc.current(); } catch (e) { /* noop */ } unsubDoc.current = null; } };
  const resetCall = () => {
    clearTimers(); stopDocSub();
    setCall(null); setMuted(false); setSpeakerOn(true); speakerRef.current = true;
    setDuration(0); setMicLevel(0); setMinimized(false); micRaw.current = 0;
    connectedRef.current = false; callIdRef.current = null;
  };

  const markConnected = () => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    setAllAudioMuted(!speakerRef.current);
    setCall((x) => (x ? { ...x, state: 'connected' } : x));
    startRef.current = Date.now();
    setDuration(0);
    clearTimers();
    durTimer.current = setInterval(() => setDuration(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    meterTimer.current = setInterval(() => setMicLevel(micRaw.current), 120);
  };

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setStatus('connecting');
        const mod = await import('plivo-browser-sdk');
        const Plivo = mod.default || mod.Plivo || mod;
        if (cancelled) return;
        const p = new Plivo({ debug: 'WARN', permOnClick: true, enableTracking: true, closeProtection: true });
        ref.current = p;
        const c = p.client;
        try { c.setRingTone(false); } catch (e) { /* no incoming ringtone */ }

        c.on('onLogin', () => !cancelled && setStatus('ready'));
        c.on('onLoginFailed', () => !cancelled && setStatus('error'));
        // Keep the caller's line silent while the karigar is dialed (no ringing "ting").
        c.on('onCalling', () => { if (cancelled) return; setAllAudioMuted(true); setCall((x) => (x ? { ...x, state: 'dialing' } : x)); });
        c.on('onCallRemoteRinging', () => { if (cancelled) return; setAllAudioMuted(true); setCall((x) => (x ? (x.state === 'connected' ? x : { ...x, state: 'ringing' }) : x)); });
        // The browser leg answers early (to run the Dial) — treat as "ringing",
        // NOT connected. Real connect comes from the server legStatus below.
        c.on('onCallAnswered', () => { if (cancelled) return; setAllAudioMuted(true); setCall((x) => (x ? (x.state === 'connected' ? x : { ...x, state: 'ringing' }) : x)); });
        c.on('onCallTerminated', () => !cancelled && resetCall());
        c.on('onCallFailed', () => !cancelled && resetCall());
        c.on('volume', (stats) => {
          const v = stats && (stats.inputVolume ?? stats.inputvolume ?? 0);
          micRaw.current = typeof v === 'number' ? (v > 1 ? v / 100 : v) : 0;
        });

        const { data } = await httpsCallable(functions, 'plivoBrowserToken')();
        if (cancelled) return;
        c.loginWithAccessToken(data.token);
      } catch (e) {
        if (cancelled) return;
        setStatus(String(e && e.code).includes('failed-precondition') ? 'unprovisioned' : 'error');
      }
    })();

    return () => {
      cancelled = true; clearTimers(); stopDocSub();
      try { ref.current?.client?.logout(); } catch (e) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const placeCall = useCallback((karigarPhone, vendor) => {
    const c = ref.current?.client;
    const digits = String(karigarPhone || '').replace(/[^0-9]/g, '');
    if (!c || status !== 'ready' || !digits) return false;
    setMuted(false); setSpeakerOn(true); speakerRef.current = true;
    setDuration(0); setMicLevel(0); setMinimized(false); connectedRef.current = false;
    const callId = newCallId();
    callIdRef.current = callId;
    setCall({ state: 'dialing', label: vendor?.code || vendor?.name || digits });
    // Live status from the server (accurate ringing / picked-up).
    stopDocSub();
    unsubDoc.current = onSnapshot(
      query(collection(db, 'doCalls'), where('clientCallId', '==', callId)),
      (snap) => {
        if (snap.empty) return;
        const ls = snap.docs[0].data().legStatus;
        if (ls === 'answered') markConnected();
        else if (ls === 'ringing') setCall((x) => (x && x.state !== 'connected' ? { ...x, state: 'ringing' } : x));
      },
      () => {},
    );
    try {
      c.call(digits, {
        'X-PH-Karigar': digits,
        'X-PH-Vendorid': (vendor?.id || '').replace(/[^A-Za-z0-9]/g, ''),
        'X-PH-Callid': callId,
      });
      return true;
    } catch (e) { resetCall(); return false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const hangup = useCallback(() => {
    try { ref.current?.client?.hangup(); } catch (e) { /* noop */ }
    resetCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    const c = ref.current?.client;
    if (!c) return;
    setMuted((m) => {
      try { if (m) c.unmute(); else c.mute(); } catch (e) { /* noop */ }
      return !m;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => {
      const next = !on;
      speakerRef.current = next;
      setAllAudioMuted(!next);
      return next;
    });
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => setMinimized(false), []);

  return {
    status, call, muted, speakerOn, duration, micLevel, minimized,
    placeCall, hangup, toggleMute, toggleSpeaker, minimize, expand,
  };
}
