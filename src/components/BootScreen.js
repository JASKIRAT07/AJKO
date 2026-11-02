import { useEffect, useState } from 'react';
import { IcDiamond } from './Icons';

// Counts from `from` → `to` over `duration` ms with an ease-out curve. Respects
// reduced-motion (jumps straight to the end). Pure display — no side effects.
function useNumberTicker(from, to, duration) {
  const [n, setN] = useState(from);
  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(to); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic
      setN(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration]);
  return n;
}

// The opening experience: a shimmering AJKO wordmark, a loading number ticker,
// and a thin progress line — on a warm "linen" field. When `leaving` is true it
// tilts and lifts away (the container-scroll reveal into the app beneath).
export default function BootScreen({ leaving }) {
  const pct = useNumberTicker(0, 100, 1700);
  return (
    <div className={`boot ${leaving ? 'boot-leaving' : ''}`}>
      <div className="login-bg"><div className="blob blob1" /><div className="blob blob2" /></div>
      <div className="boot-inner">
        <div className="boot-mark"><IcDiamond size={34} color="#fff" /></div>
        <h1 className="boot-word shimmer-text">AJKO</h1>
        <div className="boot-ticker">{pct}<span className="boot-pct">%</span></div>
        <div className="boot-progress"><div className="boot-progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}
