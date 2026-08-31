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

// Get a short-lived signed playback token + host (used for both the in-app
// player AND the card thumbnail). Returns { token, host, ready }.
// Cached per-uid once the video is ready, so a list of video cards doesn't
// re-mint tokens on every render (tokens are valid ~4h).
const pbCache = new Map(); // uid -> { data, at }
const PB_TTL = 3.5 * 60 * 60 * 1000;

export async function getStreamPlayback(uid) {
  const hit = pbCache.get(uid);
  if (hit && (Date.now() - hit.at) < PB_TTL) return hit.data;
  const get = httpsCallable(functions, 'getStreamToken');
  const { data } = await get({ uid });
  if (data && data.ready) pbCache.set(uid, { data, at: Date.now() }); // only cache ready
  return data;
}

// Signed thumbnail URL for a video (private videos require the signed token).
export function streamThumbUrl(pb) {
  if (!pb || !pb.ready || !pb.host || !pb.token) return null;
  return `https://${pb.host}/${pb.token}/thumbnails/thumbnail.jpg`;
}
