import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, limit,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
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

  // Live profile from users where authUid == current uid
  useEffect(() => {
    if (!fbUser) return undefined;
    setLoading(true);
    const q = query(collection(db, 'users'), where('authUid', '==', fbUser.uid), limit(1));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const p = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
        setProfile(p);
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
