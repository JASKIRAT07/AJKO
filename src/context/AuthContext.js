import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { enablePush } from '../serviceWorkerRegistration';

const AuthContext = createContext(null);

const sigOf = (u) => `${u.role}|${(u.assignedChannels || []).join(',')}|${u.channelId || ''}|${u.isActive !== false}`;

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Establish context via resolveProfile (server-side: links authUid + sets the
  // role/channel custom claims), then refresh the token so the claims take
  // effect for Firestore rules. No direct collection reads before this.
  useEffect(() => {
    if (!fbUser) return undefined;
    let cancelled = false;
    let unsubDoc = null;
    let lastSig = '';
    setLoading(true);

    const resolveAndRefresh = async () => {
      const res = await httpsCallable(functions, 'resolveProfile')();
      const d = res?.data || {};
      if (!d.found || d.isActive === false) return d;
      await auth.currentUser.getIdToken(true); // pick up the new claims
      return d;
    };

    (async () => {
      let d;
      try {
        d = await resolveAndRefresh();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('resolveProfile failed', e);
        if (!cancelled) { setProfile(null); setLoading(false); }
        return;
      }
      if (cancelled) return;
      if (!d.found) { setProfile(null); setLoading(false); return; }
      if (d.isActive === false) { await signOut(auth); setProfile(null); setLoading(false); return; }

      const p = d.profile;
      lastSig = sigOf(p);
      setProfile(p);
      setLoading(false);
      enablePush(p.id);

      // Live profile updates (single-doc read; allowed for any signed-in user).
      unsubDoc = onSnapshot(doc(db, 'users', p.id), async (snap) => {
        if (!snap.exists()) return;
        const np = { id: snap.id, ...snap.data() };
        if (np.isActive === false) { await signOut(auth); return; }
        // If role/channels/active changed, re-stamp claims + refresh token.
        const ns = sigOf(np);
        if (ns !== lastSig) {
          lastSig = ns;
          try {
            await httpsCallable(functions, 'resolveProfile')();
            await auth.currentUser.getIdToken(true);
          } catch { /* best effort */ }
        }
        setProfile(np);
      });
    })();

    return () => { cancelled = true; if (unsubDoc) unsubDoc(); };
  }, [fbUser]);

  const value = {
    fbUser,
    profile,
    loading,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    isTeam: profile?.role === 'team',
    isVendor: profile?.role === 'vendor',
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
