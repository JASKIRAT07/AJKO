import { useState, useRef, useEffect } from 'react';
import {
  passwordLogin, startPhoneOtp, confirmOtp,
  findUserByLoginId, bootstrapFirstAdmin, adminExists, sendResetEmail,
} from '../utils/auth';
import { IcDiamond } from '../components/Icons';

const MODES = { SIGNIN: 'signin', SETUP: 'setup' };

export default function Login() {
  const [mode, setMode] = useState(MODES.SIGNIN);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // setup / reset state
  const [step, setStep] = useState('id'); // id → otp → password
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [confirmation, setConfirmation] = useState(null);
  const [resetFlow, setResetFlow] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(null); // null = unknown yet
  const otpRefs = useRef([]);

  useEffect(() => { adminExists().then(setHasAdmin).catch(() => setHasAdmin(true)); }, []);

  const reset = () => {
    setErr(''); setStep('id'); setOtp(['', '', '', '', '', '']);
    setConfirmation(null);
  };

  const doSignIn = async () => {
    setErr(''); setBusy(true);
    try {
      await passwordLogin(loginId, password);
    } catch (e) {
      setErr(friendly(e));
    } finally { setBusy(false); }
  };

  const sendOtp = async () => {
    setErr(''); setBusy(true);
    try {
      // Email accounts (e.g. admin) reset via an email link, not phone OTP.
      if (resetFlow && loginId.includes('@')) {
        await sendResetEmail(loginId);
        setStep('emailsent');
        return;
      }
      const u = await findUserByLoginId(loginId);
      if (!u) throw new Error('No account found. Ask your admin to add you first.');
      const { confirmation: c } = await startPhoneOtp(loginId);
      setConfirmation(c); setStep('otp');
    } catch (e) {
      setErr(friendly(e));
    } finally { setBusy(false); }
  };

  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val; setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const verifyOtp = async () => {
    setErr(''); setBusy(true);
    try {
      await confirmOtp(confirmation, otp.join(''));
      // Forgot-password: force the set-password screen after sign-in (the user
      // already has a password, so it won't appear on its own).
      if (resetFlow) sessionStorage.setItem('ajko_set_pw', '1');
      setStep('signingin');
    } catch (e) {
      setErr(friendly(e));
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="login-bg"><div className="blob blob1" /><div className="blob blob2" /></div>
      <div id="recaptcha-container" />

      <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', padding: '24px 22px' }}>
        <div className="center-col" style={{ marginBottom: 28 }}>
          <div className="logo-mark"><IcDiamond size={42} color="#fff" /></div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: '16px 0 2px', letterSpacing: '-0.02em' }}>AJKO</h1>
          <p className="muted" style={{ margin: 0 }}>Jewelry orders, handled.</p>
        </div>

        {!showBootstrap && !resetFlow && (
          <div className="toggle" style={{ alignSelf: 'center', marginBottom: 22 }}>
            <button className={mode === MODES.SIGNIN ? 'on' : ''} onClick={() => { setMode(MODES.SIGNIN); reset(); setResetFlow(false); }}>Sign in</button>
            <button className={mode === MODES.SETUP ? 'on' : ''} onClick={() => { setMode(MODES.SETUP); reset(); setResetFlow(false); }}>First time setup</button>
          </div>
        )}
        {!showBootstrap && resetFlow && (
          <h3 style={{ textAlign: 'center', marginBottom: 18 }}>Reset password</h3>
        )}

        <div className="card" style={{ padding: 20 }}>
          {showBootstrap ? (
            <Bootstrap onBack={() => setShowBootstrap(false)} />
          ) : mode === MODES.SIGNIN ? (
            <>
              <div className="field">
                <label>Phone number</label>
                <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="98765 43210" />
              </div>
              <div className="field">
                <label>Password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
              </div>
              {err && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: -6 }}>{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} onClick={doSignIn} style={{ marginTop: 4 }}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
                <span className="link" onClick={() => { setMode(MODES.SETUP); reset(); setResetFlow(true); }}>Forgot password?</span>
              </p>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
                {resetFlow ? 'Enter your phone for an OTP, or your email for a reset link.' : 'Verify your phone to set your password for the first time.'}
              </p>
              {step === 'id' && (
                <>
                  <div className="field">
                    <label>{resetFlow ? 'Phone or email' : 'Phone number'}</label>
                    <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder={resetFlow ? '98765 43210 or you@store.com' : '98765 43210'} />
                  </div>
                  {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
                  <button className="btn btn-primary btn-block" disabled={busy} onClick={sendOtp}>{busy ? 'Sending…' : (resetFlow && loginId.includes('@') ? 'Send reset link' : 'Send OTP')}</button>
                  {resetFlow && (
                    <p style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
                      <span className="link" onClick={() => { setMode(MODES.SIGNIN); reset(); setResetFlow(false); }}>Back to sign in</span>
                    </p>
                  )}
                </>
              )}
              {step === 'emailsent' && (
                <div className="center-col" style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 40 }}>📧</div>
                  <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>Password reset link sent to <b>{loginId}</b>. Check your inbox (and spam), set a new password, then sign in.</p>
                  <button className="btn btn-primary btn-block" onClick={() => { setMode(MODES.SIGNIN); reset(); setResetFlow(false); }}>Back to sign in</button>
                </div>
              )}
              {step === 'otp' && (
                <>
                  <div className="otp-row" style={{ margin: '8px 0 16px' }}>
                    {otp.map((d, i) => (
                      <input key={i} ref={(el) => { otpRefs.current[i] = el; }} value={d} inputMode="numeric" maxLength={1}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus(); }} />
                    ))}
                  </div>
                  {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
                  <button className="btn btn-primary btn-block" disabled={busy || otp.join('').length < 6} onClick={verifyOtp}>{busy ? 'Verifying…' : 'Verify'}</button>
                  <p style={{ textAlign: 'center', marginTop: 12, marginBottom: 0 }}><span className="link" onClick={sendOtp}>Resend OTP</span></p>
                </>
              )}
              {step === 'signingin' && (
                <div className="center-col" style={{ padding: '16px 0' }}>
                  <div className="spinner" />
                  <p className="muted" style={{ marginTop: 12 }}>Signing you in…</p>
                </div>
              )}
            </>
          )}
        </div>

        {!showBootstrap && hasAdmin === false && (
          <p className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
            New store? <span className="link" onClick={() => setShowBootstrap(true)}>Set up first admin</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Bootstrap({ onBack }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(''); setBusy(true);
    try { await bootstrapFirstAdmin({ name, email, password }); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Create the first admin</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>Only works once, while no users exist.</p>
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@store.com" /></div>
      <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || !name || !email || password.length < 6} onClick={go}>{busy ? 'Creating…' : 'Create admin'}</button>
      <p style={{ textAlign: 'center', marginTop: 12, marginBottom: 0 }}><span className="link" onClick={onBack}>Back to sign in</span></p>
    </>
  );
}

function friendly(e) {
  const c = e?.code || '';
  if (c.includes('wrong-password') || c.includes('invalid-credential')) return 'Wrong phone/email or password.';
  if (c.includes('user-not-found')) return 'No account found. Ask your admin to add you.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Try again later.';
  if (c.includes('invalid-verification-code')) return 'Incorrect OTP. Check and try again.';
  if (c.includes('billing-not-enabled') || c.includes('captcha')) return 'OTP service needs Firebase Phone Auth enabled (reCAPTCHA + billing).';
  if (c.includes('weak-password')) return 'Password too weak (min 6 characters).';
  return e?.message || 'Something went wrong.';
}
