import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Remembers the window scroll position per history entry so Back / Forward
// returns you to the exact spot you left (e.g. an order list), instead of the
// top. New forward navigations start at the top. This is purely navigation /
// scroll-restoration behaviour — it reads no app state and changes no screen,
// data, or auth logic.
const positions = new Map();

export default function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const key = location.key;
  const keyRef = useRef(key);
  keyRef.current = key;

  // Take manual control of scroll restoration. The browser's default 'auto'
  // mode restores unreliably in an SPA where routes swap their content.
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = prev; };
  }, []);

  // Continuously remember this entry's scroll position while it's on screen.
  useEffect(() => {
    const save = () => positions.set(keyRef.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => { save(); window.removeEventListener('scroll', save); };
  }, [key]);

  // On navigation: restore on Back/Forward (POP); go to top on new pushes.
  // useLayoutEffect so the first restore happens AFTER the DOM commit but BEFORE
  // paint — the returning list is already scrolled on its first visible frame,
  // so it never flashes at the top then jumps.
  useLayoutEffect(() => {
    // Chat manages its own scroll (jumps to the newest message) — don't fight it.
    if (location.pathname.startsWith('/conversations')) return undefined;

    if (navType !== 'POP') {
      window.scrollTo(0, 0);
      return undefined;
    }

    const target = positions.get(key) || 0;
    if (target <= 0) return undefined; // nothing to restore

    window.scrollTo(0, target); // immediate, pre-paint restore

    // The list we're returning to re-loads asynchronously and its order cards /
    // images grow the page as they render, which shifts everything. So re-assert
    // the saved offset until it sticks: on every animation frame, on every
    // page-height change (ResizeObserver), for up to ~3s — then stop. A short
    // grace period ignores the back-gesture's own momentum; a real scroll after
    // that hands control straight back to the user.
    let done = false;
    let raf = 0;
    const start = performance.now();
    const GRACE = 500;   // ms — ignore input this long (skips swipe/trackpad momentum)
    const MAX = 3000;    // ms — give up after this

    const apply = () => { if (!done) window.scrollTo(0, target); };

    const onUserScroll = () => { if (performance.now() - start > GRACE) done = true; };

    const loop = () => {
      if (done) return;
      apply();
      if (performance.now() - start < MAX) raf = requestAnimationFrame(loop);
      else done = true;
    };

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(apply); // re-apply whenever content reflows
      ro.observe(document.body);
    }

    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchstart', onUserScroll, { passive: true });
    window.addEventListener('keydown', onUserScroll);
    raf = requestAnimationFrame(loop);

    return () => {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchstart', onUserScroll);
      window.removeEventListener('keydown', onUserScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
