// Auth helpers for AJKO.
//
// Model: the admin creates user records (no auth account yet). On first login the
// user verifies their phone via OTP, then sets a password which is *linked* to the
// same auth account, so future logins use email/password. Users who only have a
// phone get a synthesized login email (p<digits>@ajko.app) under the hood, so they
// can sign in by typing their phone number + password.
import {
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { auth, db, createRecaptcha } from '../firebase';

export function normalizePhone(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/[^\d+]/g, '');
  if (!p.startsWith('+')) {
    // default to India country code
    p = p.replace(/^0+/, '');
    p = `+91${p}`;
  }
  return p;
}

export function loginIdToEmail(id) {
  const v = String(id || '').trim();
  if (v.includes('@')) return v.toLowerCase();
  const digits = normalizePhone(v).replace(/\D/g, '');
  return `p${digits}@ajko.app`;
}

// Plausible stored formats for a typed phone, so lookup matches whether the
// number was saved with +91, a leading 0, or as bare digits.
export function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const set = new Set();
  if (raw) set.add(String(raw).trim());
  if (digits) { set.add(digits); set.add(`+${digits}`); }
  if (last10) {
    set.add(last10);
    set.add(`+91${last10}`);
    set.add(`91${last10}`);
    set.add(`0${last10}`);
  }
  return [...set].filter(Boolean).slice(0, 10);
}

export async function findUserByLoginId(id) {
  const v = String(id || '').trim();
  const users = collection(db, 'users');
  let snap;
  if (v.includes('@')) {
    snap = await getDocs(query(users, where('email', '==', v.toLowerCase())));
  } else {
    snap = await getDocs(query(users, where('phone', 'in', phoneVariants(v))));
  }
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// True if at least one admin account exists in Firestore.
export async function adminExists() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
  return !snap.empty;
}

export async function passwordLogin(loginId, password) {
  const email = loginIdToEmail(loginId);
  return signInWithEmailAndPassword(auth, email, password);
}

// Returns a confirmationResult to be used with confirmOtp().
export async function startPhoneOtp(loginId) {
  const user = await findUserByLoginId(loginId);
  if (!user) throw new Error('No account found. Ask your admin to add you first.');
  if (user.isActive === false) throw new Error('This account is inactive. Contact your admin.');
  const verifier = createRecaptcha('recaptcha-container');
  const confirmation = await signInWithPhoneNumber(auth, normalizePhone(user.phone), verifier);
  return { confirmation, user };
}

export async function confirmOtp(confirmation, code) {
  return confirmation.confirm(code); // signs the user in
}

// After OTP confirm (first-time setup): link an email+password to this account.
export async function setPasswordForNewUser(userDoc, password) {
  const email = userDoc.email || loginIdToEmail(userDoc.phone);
  const cred = EmailAuthProvider.credential(email, password);
  try {
    await linkWithCredential(auth.currentUser, cred);
  } catch (e) {
    // already linked (re-setup) → just update the password
    if (e.code === 'auth/provider-already-linked' || e.code === 'auth/email-already-in-use') {
      await updatePassword(auth.currentUser, password);
    } else {
      throw e;
    }
  }
  await updateDoc(doc(db, 'users', userDoc.id), {
    authUid: auth.currentUser.uid,
    email,
    passwordSet: true,
  });
}

// Forgot password via OTP: after OTP confirm, just set the new password.
export async function resetPasswordAfterOtp(newPassword) {
  await updatePassword(auth.currentUser, newPassword);
}

// Admin: create a member record (no auth account yet; created on first login).
// Vendors must be linked to a channel; they are added to that channel's memberIds.
export async function createMemberRecord({ name, phone, email, role, code, specialty, channelId = null }) {
  const ref = await addDoc(collection(db, 'users'), {
    name,
    phone: normalizePhone(phone),
    email: email ? email.toLowerCase() : loginIdToEmail(phone),
    role,
    code,
    specialty: specialty || '',
    channelId: role === 'vendor' ? channelId : null,
    assignedChannels: channelId ? [channelId] : [],
    isActive: true,
    passwordSet: false,
    authUid: null,
    createdAt: serverTimestamp(),
  });
  if (role === 'vendor' && channelId) {
    await updateDoc(doc(db, 'channels', channelId), { memberIds: arrayUnion(ref.id) });
  }
  return ref;
}

// One-time bootstrap for the very first admin (used when the users collection is empty).
export async function bootstrapFirstAdmin({ name, email, password }) {
  const users = collection(db, 'users');
  const existing = await getDocs(users);
  if (!existing.empty) throw new Error('Setup already done — an admin already exists.');
  const cred = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password);
  await addDoc(users, {
    name,
    email: email.toLowerCase(),
    phone: '',
    role: 'admin',
    code: 'ADMIN',
    specialty: 'Owner',
    assignedChannels: [],
    isActive: true,
    passwordSet: true,
    authUid: cred.user.uid,
    createdAt: serverTimestamp(),
  });
}

function nextSeqCode(prefix, existingCodes = []) {
  let max = 0;
  existingCodes.forEach((c) => {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(c || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

// Vendor codes derive from their channel code, e.g. THG-01, THG-02.
export function nextVendorCode(channelCode, existingCodes = []) {
  return nextSeqCode(channelCode, existingCodes);
}

// Team codes are store-wide, e.g. TM-01.
export function nextTeamCode(existingCodes = []) {
  return nextSeqCode('TM', existingCodes);
}
