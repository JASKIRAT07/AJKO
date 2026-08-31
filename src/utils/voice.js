// Order voice notes: upload the raw recording, then convert it server-side to a
// WhatsApp-safe m4a (see the convertVoiceNote Cloud Function). Returns the
// converted note { url, name }. Chat voice notes are unchanged (upload.js).
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../firebase';

function rawExt(type = '') {
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('aac')) return 'aac';
  if (type.includes('mpeg')) return 'mp3';
  return 'dat';
}

// Upload the raw blob to voice/raw/… then convert → m4a. Returns { url, name }.
export async function uploadAndConvertVoice(blob) {
  const rawPath = `voice/raw/${Date.now()}_${Math.round(Math.random() * 1e6)}.${rawExt(blob.type)}`;
  await uploadBytes(ref(storage, rawPath), blob);
  const { data } = await httpsCallable(functions, 'convertVoiceNote')({ path: rawPath });
  if (!data || !data.url) throw new Error('voice-convert-failed');
  return { url: data.url, name: data.name || 'Voice note' };
}
