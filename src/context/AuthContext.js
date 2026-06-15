import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, where, limit, getDocs, getDoc, doc, setDoc, updateDoc, onSnapshot,
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
    const writeMirror = (id, data) => setDoc(mirrorRef, {
      userId: id,
      role: data.role,
      channelId: data.channelId || null,
      isActive: data.isActive !== false,
    }).catch((e) => console.error('mirror write failed', e));

    // Find the caller's user doc by authUid, then email, then phone.
    const findUserDoc = async () => {
      let s = await getDocs(query(collection(db, 'users'), where('authUid', '==', fbUser.uid), limit(1)));
      if (!s.empty) return s.docs[0];
      if (fbUser.email) {
        s = await getDocs(query(collection(db, 'users'), where('email', '==', fbUser.email.toLowerCase()), limit(1)));
        if (!s.empty) return s.docs[0];
      }
      if (fbUser.phoneNumber) {
        s = await getDocs(query(collection(db, 'users'), where('phone', 'in', phoneVariants(fbUser.phoneNumber))));
        if (!s.empty) return s.docs[0];
      }
      return null;
    };

    (async () => {
      try {
        await fbUser.getIdToken(); // ensure the token is ready before any read

        // Fast path: existing mirror.
        let userId = null;
        try {
          const accSnap = await getDoc(mirrorRef);
          if (accSnap.exists() && accSnap.data().userId) userId = accSnap.data().userId;
        } catch { /* mirror not readable yet — fall through to lookup */ }

        // Otherwise resolve from the users collection (migration on first login).
        if (!userId) {
          const d = await findUserDoc();
          if (cancelled) return;
          if (!d) { setProfile(null); setLoading(false); return; }

          const data = d.data();
          userId = d.id;
          if (data.isActive === false) { await signOut(auth); setProfile(null); setLoading(false); return; }

          // Self-heal the authUid (e.g. changed by a prior OTP), best-effort.
          if (data.authUid !== fbUser.uid) {
            await updateDoc(doc(db, 'users', userId), { authUid: fbUser.uid }).catch((e) => console.error('authUid link failed', e));
          }
          await writeMirror(userId, data);
        }

        if (cancelled) return;

        // Live profile from the single users doc.
        unsubDoc = onSnapshot(doc(db, 'users', userId), async (snap) => {
          if (!snap.exists()) { setProfile(null); setLoading(false); return; }
          const p = { id: snap.id, ...snap.data() };
          if (p.isActive === false) { await signOut(auth); return; }
          setProfile(p);
          setLoading(false);
          enablePush(p.id);
          writeMirror(p.id, p);
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
