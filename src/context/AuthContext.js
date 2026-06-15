import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, onSnapshot, doc, updateDoc, setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { enablePush } from '../serviceWorkerRegistration';

const AuthContext = createContext(null);

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const mirrorSig = useRef('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        mirrorSig.current = '';
      }
    });
    return unsub;
  }, []);

  // Resolve the profile (by authUid, falling back to phone), enforce deactivation,
  // and maintain the rules-validated accounts/{uid} mirror BEFORE unblocking the
  // app, so role/channel-scoped queries succeed on first render.
  useEffect(() => {
    if (!fbUser) return undefined;
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'users'),
      async (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let p = docs.find((u) => u.authUid === fbUser.uid);

        if (!p && fbUser.phoneNumber) {
          const want = last10(fbUser.phoneNumber);
          const cand = docs.find((u) => want && last10(u.phone) === want);
          if (cand) {
            if (!cand.authUid) {
              // first-time link of an unlinked member to this phone identity
              try { await updateDoc(doc(db, 'users', cand.id), { authUid: fbUser.uid }); } catch { /* best effort */ }
              p = cand;
            } else if (cand.authUid === fbUser.uid) {
              p = cand;
            } else {
              // already linked to a different (e.g. email) account — don't hijack
              p = null;
            }
          }
        }

        // Deactivated accounts cannot use the app on ANY login path.
        if (p && p.isActive === false) {
          await signOut(auth);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (p) {
          const sig = `${p.id}|${p.role}|${p.channelId || ''}|${p.isActive !== false}`;
          if (sig !== mirrorSig.current) {
            try {
              await setDoc(doc(db, 'accounts', fbUser.uid), {
                userId: p.id,
                role: p.role,
                channelId: p.channelId || null,
                isActive: p.isActive !== false,
              });
              mirrorSig.current = sig;
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('account mirror write failed', e);
            }
          }
          enablePush(p.id);
        }

        setProfile(p || null);
        setLoading(false);
      },
      (err) => { console.error('users listener error', err); setLoading(false); }
    );
    return unsub;
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
