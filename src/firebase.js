// Firebase initialization for AJKO
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyATpiZkyORCyC-aX2_1tGzWT5Wt2UM4P4g',
  authDomain: 'ajko-48799.firebaseapp.com',
  projectId: 'ajko-48799',
  storageBucket: 'ajko-48799.firebasestorage.app',
  messagingSenderId: '896852600820',
  appId: '1:896852600820:web:4fe14ce61ba1ca00113ba1',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// FCM web push needs a VAPID key from Firebase Console → Project settings →
// Cloud Messaging → Web Push certificates. Paste it here to enable push.
export const VAPID_KEY = 'BOzBG4J7rarSE7VG0ZGRduXQK4Vf7NzqO0ob-OLhbVRQzOe6uPQWv1DEQCG5Vz2pvAKN7VWx_accIf-KEvabPqA';

// Helper to (re)build an invisible reCAPTCHA verifier for Phone Auth.
export function createRecaptcha(containerId = 'recaptcha-container') {
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
}

export { RecaptchaVerifier };
