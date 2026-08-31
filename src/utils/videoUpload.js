// Background video upload to Cloudflare Stream WITH progress. The key detail:
// createStreamUpload returns the video `uid` immediately (before the bytes are
// uploaded), so the order can be saved with the uid right away while the bytes
// keep streaming in the background. No phone-side transcoding anywhere.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Prefer mp4, fall back to webm — both are accepted by Cloudflare Stream, which
// re-encodes on its side. Used by the in-app 720p recorder.
export function supportedVideoMime() {
  const prefs = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

// Starts an upload and returns { uid, done }:
//  - uid   : available immediately (attach to the order right away)
//  - done  : Promise that resolves when the bytes finish uploading
// onProgress(pct) is called during the byte upload (0–100). The underlying XHR
// is intentionally NOT aborted on component unmount, so a save mid-upload lets
// the upload finish in the background.
export async function beginStreamUpload(file, onProgress) {
  const create = httpsCallable(functions, 'createStreamUpload');
  const { data } = await create();
  const { uploadURL, uid } = data || {};
  if (!uploadURL || !uid) throw new Error('stream-upload-init-failed');

  const done = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ uid });
      else reject(new Error(`stream-upload-failed-${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('stream-upload-network-error'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });

  return { uid, done };
}
