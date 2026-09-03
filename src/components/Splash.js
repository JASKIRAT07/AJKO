import { useMemo } from 'react';
import { IcDiamond } from './Icons';

const QUOTES = [
  { q: 'Quality is never an accident; it is always the result of intelligent effort.', a: 'John Ruskin' },
  { q: 'The craftsman’s hands hold the soul of the work.', a: 'Anonymous' },
  { q: 'Excellence is doing ordinary things extraordinarily well.', a: 'John W. Gardner' },
  { q: 'Hard work beats talent when talent doesn’t work hard.', a: 'Tim Notke' },
  { q: 'Details make perfection, and perfection is not a detail.', a: 'Leonardo da Vinci' },
  { q: 'The gold you shape today becomes someone’s forever.', a: 'Anonymous' },
  { q: 'Craftsmanship means dwelling on a task for a long time and doing it well.', a: 'Matthew Crawford' },
  { q: 'Great things are not done by impulse, but by a series of small things.', a: 'Vincent van Gogh' },
  { q: 'Patience and perseverance turn raw metal into art.', a: 'Anonymous' },
  { q: 'Pride in your craft is the difference between a job and a masterpiece.', a: 'Anonymous' },
];

export default function Splash() {
  const pick = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  return (
    <div className="splash">
      <div className="login-bg"><div className="blob blob1" /><div className="blob blob2" /></div>
      <div className="splash-inner">
        <div className="logo-mark" style={{ width: 96, height: 96, borderRadius: 30 }}><IcDiamond size={48} color="#fff" /></div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '18px 0 6px', letterSpacing: '-0.02em' }}>AJKO</h1>
        <p className="splash-quote">“{pick.q}”</p>
        <p className="splash-author">— {pick.a}</p>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="spinner" />
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Almost done…</div>
        </div>
      </div>
    </div>
  );
}
