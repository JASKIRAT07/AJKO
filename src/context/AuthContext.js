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
    }).catch((e) => { console.error('mirror write failed', e); });

    (async () => {
      try {
        // 1) Wait for the auth token to be fully ready before any Firestore call.
        await fbUser.getIdToken();
        if (cancelled) return;

        // 2) Read our own accounts mirror (allowed: request.auth.uid == uid).
        let userId = null;
        const accSnap = await getDoc(mirrorRef);
        if (accSnap.exists() && accSnap.data().userId) {
          userId = accSnap.data().userId;
        } else {
          // 3) No mirror yet (first-time setup) → find the user doc, link the
          //    authUid, and create the mirror.
          let snap = await getDocs(query(collection(db, 'users'), where('authUid', '==', fbUser.uid), limit(1)));
          if (snap.empty && fbUser.phoneNumber) {
            snap = await getDocs(query(collection(db, 'users'), where('phone', 'in', phoneVariants(fbUser.phoneNumber))));
          }
          if (snap.empty) { if (!cancelled) { setProfile(null); setLoading(false); } return; }

          const d = snap.docs[0];
          userId = d.id;
          const data = d.data();
          if (data.isActive === false) { await signOut(auth); if (!cancelled) { setProfile(null); setLoading(false); } return; }

          if (data.authUid !== fbUser.uid) {
            await updateDoc(doc(db, 'users', userId), { authUid: fbUser.uid }).catch((e) => console.error('authUid link failed', e));
          }
          await writeMirror(userId, data);
        }

        if (cancelled) return;

        // 4) Live profile from the single users doc.
        unsubDoc = onSnapshot(doc(db, 'users', userId), async (snap) => {
          if (!snap.exists()) { setProfile(null); setLoading(false); return; }
          const p = { id: snap.id, ...snap.data() };
          if (p.isActive === false) { await signOut(auth); return; }
          setProfile(p);
          setLoading(false);
          enablePush(p.id);
          writeMirror(p.id, p); // keep mirror in sync
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
