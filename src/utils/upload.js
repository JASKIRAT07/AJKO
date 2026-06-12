import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadFile(file, folder = 'orders') {
  const safe = (file.name || 'file').replace(/[^\w.-]/g, '_');
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, type: file.type?.startsWith('video') ? 'video' : 'image', name: file.name || safe };
}

export async function uploadBlob(blob, folder = 'voice', ext = 'webm') {
  const path = `${folder}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob);
  return getDownloadURL(r);
}
