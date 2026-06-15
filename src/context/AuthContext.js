import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, where, limit, getDocs, doc, setDoc, updateDoc, onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { phoneVariants } from '../utils/auth';
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

  useEffect(() => {
    if (!fbUser) return undefined;
    let cancelled = false;
    let unsubDoc = null;
    setLoading(true);

    const mirrorRef = doc(db, 'accounts', fbUser.uid);
    const ensureMirror = (id, data) => setDoc(mirrorRef, {
      userId: id,
      role: data.role,
      channelId: data.channelId || null,
      isActive: data.isActive !== false,
    }).catch((e) => console.error('mirror write failed', e));

    // Authoritative lookup of the caller's user doc: authUid → email → phone
    // (all +91 / bare / 0-prefix variants). Works for admin, team and vendor.
    const findUserDoc = async () => {
      const users = collection(db, 'users');
      let s = await getDocs(query(users, where('authUid', '==', fbUser.uid), limit(1)));
      if (!s.empty) return s.docs[0];
      if (fbUser.email) {
        s = await getDocs(query(users, where('email', '==', fbUser.email.toLowerCase()), limit(1)));
        if (!s.empty) return s.docs[0];
      }
      if (fbUser.phoneNumber) {
        s = await getDocs(query(users, where('phone', 'in', phoneVariants(fbUser.phoneNumber))));
        if (!s.empty) return s.docs[0];
      }
      return null;
    };

    (async () => {
      try {
        // Make sure the auth token is fully ready before any Firestore call.
        await fbUser.getIdToken();
        if (cancelled) return;

        const d = await findUserDoc();
        if (cancelled) return;
        if (!d) { setProfile(null); setLoading(false); return; } // truly not found

        const data = d.data();
        if (data.isActive === false) { await signOut(auth); setProfile(null); setLoading(false); return; }

        // Self-heal the authUid link if needed, then guarantee the mirror exists.
        if (data.authUid !== fbUser.uid) {
          await updateDoc(doc(db, 'users', d.id), { authUid: fbUser.uid }).catch((e) => console.error('authUid link failed', e));
        }
        await ensureMirror(d.id, data);
        if (cancelled) return;

        // Live profile from the single users doc.
        unsubDoc = onSnapshot(doc(db, 'users', d.id), async (snap) => {
          if (!snap.exists()) { setProfile(null); return; }
          const p = { id: snap.id, ...snap.data() };
          if (p.isActive === false) { await signOut(auth); return; }
          setProfile(p);
          setLoading(false);
          enablePush(p.id);
          ensureMirror(p.id, p); // keep mirror in sync with role/channel changes
        });
      } catch (e) {
        console.error('auth resolve failed', e);
        if (!cancelled) { setProfile(null); setLoading(false); }
      }
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
