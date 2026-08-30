import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

// Downscale + re-encode images before upload so Storage stays light and loads fast.
async function compressImage(file, maxDim = 1280, quality = 0.7) {
  if (!file.type?.startsWith('image') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // keep original if no gain
    return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // fall back to the original on any failure
  }
}

// Hard ceiling for a video upload (matches the Storage rule).
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function uploadFile(file, folder = 'orders', opts = {}) {
  let toSend;
  if (file.type?.startsWith('image')) {
    toSend = await compressImage(file, opts.maxDim || 1280, opts.quality || 0.7);
  } else if (file.type?.startsWith('video')) {
    // Upload the phone's original video as-is. In-browser re-encoding was slow
    // and janky on phones (it could hang the whole save), and the native mp4
    // already plays everywhere. We only guard the size.
    toSend = file;
    if (toSend.size > MAX_VIDEO_BYTES) {
      const err = new Error('VIDEO_TOO_LARGE');
      err.code = 'video-too-large';
      throw err; // caught by the caller → friendly message, no silent failure
    }
  } else {
    toSend = file;
  }
  const safe = (toSend.name || 'file').replace(/[^\w.-]/g, '_');
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`;
  const r = ref(storage, path);
  await uploadBytes(r, toSend);
  const url = await getDownloadURL(r);
  return { url, type: file.type?.startsWith('video') ? 'video' : 'image', name: file.name || safe };
}

// Pick a recording format the browser supports, preferring Apple/WhatsApp-
// friendly formats (mp4/m4a) over webm so chat voice notes play everywhere.
export function supportedAudioMime() {
  const prefs = ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm;codecs=opus', 'audio/webm'];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function audioExt(type = '') {
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('aac')) return 'aac';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

export async function uploadBlob(blob, folder = 'voice') {
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${audioExt(blob.type)}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob); // contentType inferred from blob.type
  return getDownloadURL(r);
}

