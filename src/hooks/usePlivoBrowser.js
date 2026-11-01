// Plivo Browser SDK integration for AJKO "Do Calls".
// Logs the staff browser in as a Plivo endpoint (JWT from plivoBrowserToken) and
// places WebRTC calls. Exposes a full in-call state: ringing/connected, live
// duration, mute (mic), speaker mute, and a live mic level so the UI can show a
// real call screen. The mic is only acquired when a call is placed (permOnClick)
// and released by the SDK when the call ends.
import { useEffect, useRef, useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export function usePlivoBrowser(enabled) {
  const ref = useRef(null);
  const [status, setStatus] = useState('idle'); // idle|connecting|ready|error|unprovisioned
  const [call, setCall] = useState(null);        // { state, label }
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);   // seconds, while connected
  const [micLevel, setMicLevel] = useState(0);   // 0..1 live mic input

  const startRef = useRef(0);
  const durTimer = useRef(null);
  const meterTimer = useRef(null);
  const micRaw = useRef(0);

  const clearTimers = () => {
    if (durTimer.current) { clearInterval(durTimer.current); durTimer.current = null; }
    if (meterTimer.current) { clearInterval(meterTimer.current); meterTimer.current = null; }
  };
  const resetCall = () => {
    clearTimers();
    setCall(null); setMuted(false); setSpeakerOn(true); setDuration(0); setMicLevel(0);
    micRaw.current = 0;
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
        // permOnClick → mic permission is only requested when a call is placed,
        // never on login. The SDK releases the mic when the call ends.
        const p = new Plivo({ debug: 'WARN', permOnClick: true, enableTracking: true, closeProtection: true });
        ref.current = p;
        const c = p.client;

        c.on('onLogin', () => !cancelled && setStatus('ready'));
        c.on('onLoginFailed', () => !cancelled && setStatus('error'));
        c.on('onCalling', () => !cancelled && setCall((x) => (x ? { ...x, state: 'dialing' } : x)));
        c.on('onCallRemoteRinging', () => !cancelled && setCall((x) => (x ? { ...x, state: 'ringing' } : x)));
        c.on('onCallAnswered', () => {
          if (cancelled) return;
          setCall((x) => (x ? { ...x, state: 'connected' } : x));
          startRef.current = Date.now();
          setDuration(0);
          clearTimers();
          durTimer.current = setInterval(() => setDuration(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
          meterTimer.current = setInterval(() => setMicLevel(micRaw.current), 120);
        });
        c.on('onCallTerminated', () => !cancelled && resetCall());
        c.on('onCallFailed', () => !cancelled && resetCall());
        // Live mic/speaker volume (~60/s). Keep the raw value in a ref; a 120ms
        // timer samples it into state so we don't re-render 60 times a second.
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
      cancelled = true;
      clearTimers();
      try { ref.current?.client?.logout(); } catch (e) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const placeCall = useCallback((karigarPhone, vendor) => {
    const c = ref.current?.client;
    const digits = String(karigarPhone || '').replace(/[^0-9]/g, '');
    if (!c || status !== 'ready' || !digits) return false;
    setMuted(false); setSpeakerOn(true); setDuration(0); setMicLevel(0);
    setCall({ state: 'dialing', label: vendor?.code || vendor?.name || digits });
    try {
      c.call(digits, { 'X-PH-Karigar': digits, 'X-PH-Vendorid': (vendor?.id || '').replace(/[^A-Za-z0-9]/g, '') });
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

  // Speaker on/off = mute/unmute the remote audio the SDK plays (the only <audio>
  // on the page during a call). Best-effort; never throws.
  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => {
      const next = !on;
      try { document.querySelectorAll('audio').forEach((el) => { el.muted = !next; }); } catch (e) { /* noop */ }
      return next;
    });
  }, []);

  return { status, call, muted, speakerOn, duration, micLevel, placeCall, hangup, toggleMute, toggleSpeaker };
}
