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

export async function uploadFile(file, folder = 'orders') {
  const toSend = file.type?.startsWith('image') ? await compressImage(file) : file;
  const safe = (toSend.name || 'file').replace(/[^\w.-]/g, '_');
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`;
  const r = ref(storage, path);
  await uploadBytes(r, toSend);
  const url = await getDownloadURL(r);
  return { url, type: file.type?.startsWith('video') ? 'video' : 'image', name: file.name || safe };
}

export async function uploadBlob(blob, folder = 'voice', ext = 'webm') {
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob);
  return getDownloadURL(r);
}
