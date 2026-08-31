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

// Public playback info for a video (host + ready + duration). Videos are public
// (unsigned), so playback/thumbnail use the uid directly — no token. Cached
// per-uid once ready so a list of video cards doesn't re-hit the function.
const pbCache = new Map(); // uid -> { data, at }
const PB_TTL = 60 * 60 * 1000;

export async function getStreamPlayback(uid) {
  const hit = pbCache.get(uid);
  if (hit && (Date.now() - hit.at) < PB_TTL) return hit.data;
  const get = httpsCallable(functions, 'getStreamInfo');
  const { data } = await get({ uid });
  const info = { ...data, uid };
  if (info && info.ready) pbCache.set(uid, { data: info, at: Date.now() }); // only cache ready
  return info;
}

// Public thumbnail URL (unsigned video → uid in the path, no token).
export function streamThumbUrl(pb) {
  if (!pb || !pb.ready || !pb.host || !pb.uid) return null;
  return `https://${pb.host}/${pb.uid}/thumbnails/thumbnail.jpg`;
}

// Public iframe player URL for an unsigned video.
export function streamIframeUrl(host, uid) {
  if (!host || !uid) return null;
  return `https://${host}/${uid}/iframe`;
}

// PUBLIC watch-page data (no login): order number/name + all its videos.
export async function getWatchData(orderId) {
  const get = httpsCallable(functions, 'getWatchData');
  const { data } = await get({ orderId });
  return data;
}
