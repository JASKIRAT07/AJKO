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
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  collection, doc, updateDoc, addDoc, serverTimestamp, arrayUnion, getDocs, query, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, createRecaptcha } from '../firebase';

// Plausible stored formats for a typed phone (for the direct-read fallback).
export function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const set = new Set();
  if (raw) set.add(String(raw).trim());
  if (digits) { set.add(digits); set.add(`+${digits}`); }
  if (last10) { set.add(last10); set.add(`+91${last10}`); set.add(`91${last10}`); set.add(`0${last10}`); }
  return [...set].filter(Boolean).slice(0, 10);
}

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  // India: always store as E.164 +91 + the last 10 digits, so it matches the
  // Firebase Auth token's phone_number exactly (handles +91 / 0 / 91 / bare).
  return `+91${digits.slice(-10)}`;
}

export function loginIdToEmail(id) {
  const v = String(id || '').trim();
  if (v.includes('@')) return v.toLowerCase();
  const digits = normalizePhone(v).replace(/\D/g, '');
  return `p${digits}@ajko.app`;
}

// Pre-login lookup. Prefers the Cloud Function (keeps the users collection
// private), but falls back to a direct read if the function isn't deployed yet.
export async function findUserByLoginId(id) {
  try {
    const res = await httpsCallable(functions, 'lookupLogin')({ loginId: id });
    if (res && res.data) return res.data.found ? res.data : null;
  } catch (e) {
    // function not deployed / unavailable → fall back below
  }
  const v = String(id || '').trim();
  const users = collection(db, 'users');
  const snap = v.includes('@')
    ? await getDocs(query(users, where('email', '==', v.toLowerCase())))
    : await getDocs(query(users, where('phone', 'in', phoneVariants(v))));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { found: true, isActive: d.data().isActive !== false, phone: d.data().phone || '', id: d.id };
}

// True if at least one admin exists. Tries the function, then a direct read.
export async function adminExists() {
  try {
    const res = await httpsCallable(functions, 'checkAdminExists')();
    if (res && res.data) return !!res.data.exists;
  } catch (e) {
    // fall through to direct read
  }
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    return !snap.empty;
  } catch {
    return true;
  }
}

export async function passwordLogin(loginId, password) {
  const email = loginIdToEmail(loginId);
  return signInWithEmailAndPassword(auth, email, password);
}

// Email-based password reset (for email accounts like the admin).
export async function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, String(email).trim().toLowerCase());
}

// Returns a confirmationResult to be used with confirmOtp().
export async function startPhoneOtp(loginId) {
  // Send the OTP to the typed number directly — no pre-login Firestore read.
  // Whether the number is a real member is checked after sign-in (AuthContext),
  // which is where deactivation is enforced too.
  const verifier = createRecaptcha('recaptcha-container');
  const confirmation = await signInWithPhoneNumber(auth, normalizePhone(loginId), verifier);
  return { confirmation };
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
// Vendors → exactly one channel. Team → any number of channels. Admins → none.
export async function createMemberRecord({ name, phone, email, role, code, specialty, channelId = null, channelIds = [] }) {
  const channels = role === 'vendor'
    ? (channelId ? [channelId] : [])
    : (role === 'team' ? (channelIds || []) : []);
  const ref = await addDoc(collection(db, 'users'), {
    name,
    phone: normalizePhone(phone),
    // Phone-only members don't get a stored email. Password login still works
    // because it derives the login email from the phone on the fly.
    email: email ? email.toLowerCase() : null,
    role,
    code,
    specialty: specialty || '',
    channelId: role === 'vendor' ? channelId : null,
    assignedChannels: channels,
    isActive: true,
    passwordSet: false,
    authUid: null,
    createdAt: serverTimestamp(),
  });
  for (const cid of channels) {
    await updateDoc(doc(db, 'channels', cid), { memberIds: arrayUnion(ref.id) });
  }
  return ref;
}

// One-time bootstrap for the very first admin (used when the users collection is empty).
export async function bootstrapFirstAdmin({ name, email, password }) {
  if (await adminExists()) throw new Error('Setup already done — an admin already exists.');
  const cred = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password);
  await addDoc(collection(db, 'users'), {
    name,
    email: email.toLowerCase(),
    phone: '',
    role: 'admin',
    code: 'ADMIN',
    specialty: 'Owner',
    channelId: null,
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

// Admin codes are store-wide. The first (bootstrap) admin is "ADMIN", so the
// next created admins start at ADM-02. Pass the current admin count.
export function nextAdminCode(existingAdminCount = 0) {
  return `ADM-${String((existingAdminCount || 0) + 1).padStart(2, '0')}`;
}
