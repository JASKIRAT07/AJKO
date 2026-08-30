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

    // Restore the saved offset. List content loads async, so retry across a few
    // frames until the page is tall enough to reach it — or the user takes over.
    const target = positions.get(key) || 0;
    let raf;
    let tries = 0;
    let done = false;
    const stop = () => { done = true; };
    const restore = () => {
      if (done) return;
      window.scrollTo(0, target);
      tries += 1;
      if (Math.abs(window.scrollY - target) > 2 && tries < 40) {
        raf = requestAnimationFrame(restore);
      }
    };
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    raf = requestAnimationFrame(restore);
    return () => {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
