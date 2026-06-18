import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection, query, where, limit, getDocs, doc, setDoc, updateDoc, onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { phoneVariants } from '../utils/auth';
import { enablePush } from '../serviceWorkerRegistration';

const AuthContext = createContext(null);

export const AUTH_BUILD = 'push-v11';

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

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
        setAuthError('');
        // Make sure the auth token is fully ready before any Firestore call.
        await fbUser.getIdToken();
        if (cancelled) return;

        let d;
        try {
          d = await findUserDoc();
        } catch (e) {
          if (!cancelled) { setAuthError(`lookup denied: ${e.code || ''} ${e.message || e}`); setProfile(null); setLoading(false); }
          return;
        }
        if (cancelled) return;
        if (!d) {
          setAuthError(`no users doc · uid=${fbUser.uid.slice(0, 6)}… · email=${fbUser.email || '—'} · phone=${fbUser.phoneNumber || '—'}`);
          setProfile(null); setLoading(false); return;
        }

        const data = d.data();
        if (data.isActive === false) { await signOut(auth); setProfile(null); setLoading(false); return; }

        // Self-heal the authUid link if needed (non-fatal — mirror can also be
        // authorized by email/phone match).
        if (data.authUid !== fbUser.uid) {
          await updateDoc(doc(db, 'users', d.id), { authUid: fbUser.uid }).catch((e) => console.error('authUid link failed', e));
        }
        // The mirror MUST exist for any screen to read — surface the exact
        // reason if the rules block it instead of half-logging-in.
        try {
          await setDoc(mirrorRef, {
            userId: d.id, role: data.role, channelId: data.channelId || null, isActive: data.isActive !== false,
          });
        } catch (e) {
          if (!cancelled) {
            setAuthError(`mirror write blocked: ${e.code || ''} ${e.message || e}`);
            setProfile(null); setLoading(false);
          }
          return;
        }
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
        if (!cancelled) { setAuthError(`resolve failed: ${e.code || ''} ${e.message || e}`); setProfile(null); setLoading(false); }
      }
    })();

    return () => { cancelled = true; if (unsubDoc) unsubDoc(); };
  }, [fbUser]);

  const value = {
    fbUser,
    profile,
    loading,
    authError,
    build: AUTH_BUILD,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    isTeam: profile?.role === 'team',
    isVendor: profile?.role === 'vendor',
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
