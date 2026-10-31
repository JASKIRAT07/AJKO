// Plivo Browser SDK integration for AJKO "Do Calls".
// Logs the staff browser in as a Plivo endpoint (via a short-lived JWT from the
// plivoBrowserToken Cloud Function) and places WebRTC calls. The karigar number
// + vendorId ride along as X-PH headers so the server answer_url can mask + log.
import { useEffect, useRef, useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export function usePlivoBrowser(enabled) {
  const ref = useRef(null);
  const [status, setStatus] = useState('idle'); // idle|connecting|ready|error|unprovisioned
  const [call, setCall] = useState(null);        // { state, label }

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
        c.on('onLogin', () => !cancelled && setStatus('ready'));
        c.on('onLoginFailed', () => !cancelled && setStatus('error'));
        c.on('onCallRemoteRinging', () => !cancelled && setCall((x) => (x ? { ...x, state: 'ringing' } : x)));
        c.on('onCallAnswered', () => !cancelled && setCall((x) => (x ? { ...x, state: 'connected' } : x)));
        c.on('onCallTerminated', () => !cancelled && setCall(null));
        c.on('onCallFailed', () => !cancelled && setCall(null));

        const { data } = await httpsCallable(functions, 'plivoBrowserToken')();
        if (cancelled) return;
        c.loginWithAccessToken(data.token);
      } catch (e) {
        if (cancelled) return;
        // failed-precondition → Plivo not provisioned yet.
        setStatus(String(e && e.code).includes('failed-precondition') ? 'unprovisioned' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      try { ref.current?.client?.logout(); } catch (e) { /* noop */ }
    };
  }, [enabled]);

  const placeCall = useCallback((karigarPhone, vendor) => {
    const c = ref.current?.client;
    const digits = String(karigarPhone || '').replace(/[^0-9]/g, '');
    if (!c || status !== 'ready' || !digits) return false;
    setCall({ state: 'dialing', label: vendor?.code || vendor?.name || digits });
    try {
      c.call(digits, { 'X-PH-Karigar': digits, 'X-PH-Vendorid': (vendor?.id || '').replace(/[^A-Za-z0-9]/g, '') });
      return true;
    } catch (e) {
      setCall(null);
      return false;
    }
  }, [status]);

  const hangup = useCallback(() => {
    try { ref.current?.client?.hangup(); } catch (e) { /* noop */ }
    setCall(null);
  }, []);

  return { status, call, placeCall, hangup };
}
