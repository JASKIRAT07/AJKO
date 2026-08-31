// Cloudflare Stream helpers for ORDER videos. The API token lives only in the
// Cloud Functions (createStreamUpload / getStreamToken); the browser never sees
// it. Images are unaffected — they still go to Firebase Storage via upload.js.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Upload a raw video file to Cloudflare Stream via a one-time direct-upload URL.
// No transcoding happens on the phone — Stream encodes it. Returns { uid }.
export async function uploadVideoToStream(file) {
  const create = httpsCallable(functions, 'createStreamUpload');
  const { data } = await create();
  const { uploadURL, uid } = data || {};
  if (!uploadURL || !uid) throw new Error('stream-upload-init-failed');

  const form = new FormData();
  form.append('file', file);
  const res = await fetch(uploadURL, { method: 'POST', body: form });
  if (!res.ok) throw new Error('stream-upload-failed');
  return { uid };
}

// Get a short-lived signed playback token + host for in-app playback.
// Returns { token, host, ready }.
export async function getStreamPlayback(uid) {
  const get = httpsCallable(functions, 'getStreamToken');
  const { data } = await get({ uid });
  return data;
}
