import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { enablePush } from '../serviceWorkerRegistration';

const AuthContext = createContext(null);

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);

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

  // Resolve the profile for the signed-in user. We match by authUid first, then
  // fall back to matching the phone number (last 10 digits) so a user who just
  // verified via OTP — and whose authUid isn't linked yet — is found anyway. On
  // a phone match we link the authUid so subsequent lookups are direct.
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
          p = docs.find((u) => want && last10(u.phone) === want);
          if (p && p.authUid !== fbUser.uid) {
            try {
              await updateDoc(doc(db, 'users', p.id), { authUid: fbUser.uid });
            } catch (e) {
              // best-effort link; profile still resolves locally
            }
          }
        }

        setProfile(p || null);
        setLoading(false);
        if (p) enablePush(p.id);
      },
      () => setLoading(false)
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
