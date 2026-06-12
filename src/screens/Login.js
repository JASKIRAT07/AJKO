import { useState, useRef } from 'react';
import {
  passwordLogin, startPhoneOtp, confirmOtp, setPasswordForNewUser,
  resetPasswordAfterOtp, findUserByLoginId, bootstrapFirstAdmin,
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
  const [pendingUser, setPendingUser] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [resetFlow, setResetFlow] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const otpRefs = useRef([]);

  const reset = () => {
    setErr(''); setStep('id'); setOtp(['', '', '', '', '', '']);
    setConfirmation(null); setPendingUser(null); setNewPass('');
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
      const u = await findUserByLoginId(loginId);
      if (!u) throw new Error('No account found. Ask your admin to add you first.');
      const { confirmation: c, user } = await startPhoneOtp(loginId);
      setConfirmation(c); setPendingUser(user); setStep('otp');
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
      setStep('password');
    } catch (e) {
      setErr(friendly(e));
    } finally { setBusy(false); }
  };

  const finishSetup = async () => {
    setErr(''); setBusy(true);
    try {
      if (resetFlow) await resetPasswordAfterOtp(newPass);
      else await setPasswordForNewUser(pendingUser, newPass);
      // signed in now → app routes to home automatically
    } catch (e) {
      setErr(friendly(e));
    } finally { setBusy(false); }
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

        {!showBootstrap && (
          <div className="toggle" style={{ alignSelf: 'center', marginBottom: 22 }}>
            <button className={mode === MODES.SIGNIN ? 'on' : ''} onClick={() => { setMode(MODES.SIGNIN); reset(); setResetFlow(false); }}>Sign in</button>
            <button className={mode === MODES.SETUP ? 'on' : ''} onClick={() => { setMode(MODES.SETUP); reset(); setResetFlow(false); }}>First time setup</button>
          </div>
        )}

        <div className="card" style={{ padding: 20 }}>
          {showBootstrap ? (
            <Bootstrap onBack={() => setShowBootstrap(false)} />
          ) : mode === MODES.SIGNIN ? (
            <>
              <div className="field">
                <label>Phone or email</label>
                <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="98765 43210 or you@store.com" />
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
                {resetFlow ? 'Reset your password with an OTP sent to your phone.' : 'Verify your phone to set your password for the first time.'}
              </p>
              {step === 'id' && (
                <>
                  <div className="field">
                    <label>Phone or email</label>
                    <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="98765 43210" />
                  </div>
                  {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
                  <button className="btn btn-primary btn-block" disabled={busy} onClick={sendOtp}>{busy ? 'Sending…' : 'Send OTP'}</button>
                </>
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
              {step === 'password' && (
                <>
                  <div className="field">
                    <label>New password</label>
                    <input className="input" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="At least 6 characters" />
                  </div>
                  {err && <p style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}
                  <button className="btn btn-primary btn-block" disabled={busy || newPass.length < 6} onClick={finishSetup}>{busy ? 'Saving…' : 'Set password & continue'}</button>
                </>
              )}
            </>
          )}
        </div>

        {!showBootstrap && (
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
