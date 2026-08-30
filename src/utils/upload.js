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

// Hard ceiling for a video upload after compression (matches the Storage rule).
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// Best-effort, browser-native video downscale to ~720p before upload. Key rule:
// we ONLY transcode when the browser can OUTPUT mp4/H.264 (Safari 17+, iOS 17+).
// We never emit webm, because iOS can't play it — so a stored order video always
// stays playable on every device. Anywhere mp4 recording isn't supported (e.g.
// Chrome), the ORIGINAL file is returned untouched and the raised Storage limit
// carries it. Any failure falls back to the original too.
async function compressVideo(file, { targetHeight = 720, bitrate = 2500000 } = {}) {
  const canRecordMp4 = typeof MediaRecorder !== 'undefined'
    && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/mp4');
  const canCapture = typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream;
  if (!canRecordMp4 || !canCapture) return file;

  let url;
  try {
    url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('metadata'));
    });
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh || vh <= targetHeight) return file; // already small enough

    const scale = targetHeight / vh;
    const w = Math.max(2, Math.round((vw * scale) / 2) * 2); // even dimensions
    const h = Math.max(2, Math.round(targetHeight / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const out = canvas.captureStream();

    // Carry the source audio track across if the browser exposes it.
    try {
      const src = video.captureStream ? video.captureStream() : null;
      const a = src && src.getAudioTracks && src.getAudioTracks()[0];
      if (a) out.addTrack(a);
    } catch { /* no audio track available — video-only is fine */ }

    const rec = new MediaRecorder(out, { mimeType: 'video/mp4', videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((res) => { rec.onstop = res; });

    rec.start();
    await video.play();
    await new Promise((res) => {
      video.onended = res;
      const draw = () => {
        if (video.ended || video.paused) { res(); return; }
        ctx.drawImage(video, 0, 0, w, h);
        requestAnimationFrame(draw);
      };
      draw();
    });
    rec.stop();
    await stopped;

    const blob = new Blob(chunks, { type: 'video/mp4' });
    if (!blob.size || blob.size >= file.size) return file; // no real gain
    return new File([blob], (file.name || 'video').replace(/\.\w+$/, '') + '.mp4', { type: 'video/mp4' });
  } catch {
    return file; // any failure → upload the original untouched
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export async function uploadFile(file, folder = 'orders', opts = {}) {
  let toSend;
  if (file.type?.startsWith('image')) {
    toSend = await compressImage(file, opts.maxDim || 1280, opts.quality || 0.7);
  } else if (file.type?.startsWith('video')) {
    toSend = await compressVideo(file, { targetHeight: opts.targetHeight || 720 });
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

