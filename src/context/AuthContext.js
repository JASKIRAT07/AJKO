import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { enablePush } from '../serviceWorkerRegistration';

const AuthContext = createContext(null);

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

  // Establish the user context via the resolveProfile Cloud Function (it finds
  // the user by phone/email/authUid, links the authUid, and creates/migrates
  // the accounts mirror — all server-side, so security rules never block it).
  // We do NOT read Firestore directly until the context exists.
  useEffect(() => {
    if (!fbUser) return undefined;
    let cancelled = false;
    let unsubDoc = null;
    setLoading(true);

    (async () => {
      let res;
      try {
        res = await httpsCallable(functions, 'resolveProfile')();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('resolveProfile failed', e);
        if (!cancelled) { setProfile(null); setLoading(false); }
        return;
      }
      if (cancelled) return;

      const d = res?.data || {};
      if (!d.found) { setProfile(null); setLoading(false); return; }
      if (d.isActive === false) { await signOut(auth); setProfile(null); setLoading(false); return; }

      const p = d.profile;
      setProfile(p);
      setLoading(false);
      enablePush(p.id);

      // Live updates on the single profile doc (allowed once signed in).
      unsubDoc = onSnapshot(doc(db, 'users', p.id), async (snap) => {
        if (!snap.exists()) return;
        const np = { id: snap.id, ...snap.data() };
        if (np.isActive === false) { await signOut(auth); return; }
        setProfile(np);
        // Keep the mirror in sync if role/channel/active changed.
        try {
          await setDoc(doc(db, 'accounts', fbUser.uid), {
            userId: np.id, role: np.role, channelId: np.channelId || null, isActive: np.isActive !== false,
          });
        } catch { /* best effort */ }
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
