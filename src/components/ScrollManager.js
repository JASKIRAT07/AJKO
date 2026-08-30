import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Remembers the window scroll position per history entry so Back / Forward
// returns you to the exact spot you left (e.g. Search results), instead of the
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
  useEffect(() => {
    // Chat manages its own scroll (jumps to the newest message) — don't fight it.
    if (location.pathname.startsWith('/conversations')) return undefined;

    if (navType !== 'POP') {
      window.scrollTo(0, 0);
      return undefined;
    }

    const target = positions.get(key) || 0;
    if (target <= 0) return undefined; // nothing to restore

    // The list we're returning to re-loads asynchronously, and some screens
    // autofocus an input (which yanks scroll to the top). So keep re-asserting
    // the saved offset every frame for a short window — until the user actually
    // scrolls, at which point we hand control straight back to them.
    let done = false;
    let raf = 0;
    const start = performance.now();
    const cancel = () => { done = true; };
    const loop = () => {
      if (done) return;
      window.scrollTo(0, target);
      if (performance.now() - start < 2500) raf = requestAnimationFrame(loop);
    };
    // A real scroll gesture (not a tap) cancels restoration immediately.
    window.addEventListener('wheel', cancel, { passive: true, once: true });
    window.addEventListener('touchmove', cancel, { passive: true, once: true });
    window.addEventListener('keydown', cancel, { once: true });
    raf = requestAnimationFrame(loop);
    return () => {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('keydown', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
