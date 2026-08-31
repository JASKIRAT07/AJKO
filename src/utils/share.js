import { whatsappMessage, whatsappUrl } from './format';

// Audio formats the Web Share API / WhatsApp accept. webm/ogg are NOT included
// (iOS Safari + WhatsApp reject them → "this item cannot be shared").
const SHARE_SAFE_AUDIO = /^audio\/(mp4|m4a|x-m4a|aac|mpeg|mp3)/i;

async function urlToFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'application/octet-stream' });
}

// Pre-fetch an order's media into File objects. Call this BEFORE the user taps
// Share (e.g. when the screen opens) so the share can fire synchronously inside
// the tap — iOS Safari rejects file shares that come after an await.
export async function prepareShareFiles(order) {
  if (!navigator.share || !order) return [];
  // Images first — attach real image files to the share sheet.
  const sources = (order.images || []).slice(0, 4)
    .map((m, i) => ({ url: typeof m === 'string' ? m : m.url, name: `${order.appOrderNo || 'order'}-${i + 1}` }));
  const built = await Promise.all(sources.map((s) => urlToFile(s.url, s.name).catch(() => null)));
  // Keep only real image files so an odd content-type can't poison the share.
  const images = built.filter((f) => f && f.type.startsWith('image'));

  // Voice note (if any) attached AFTER the images. Best-effort — a failure here
  // must never drop the images or break the share.
  // Only attach SHARE-SAFE audio (mp4/m4a/aac/mp3). webm/ogg are rejected by
  // iOS Safari / WhatsApp and cause "this item cannot be shared", so we exclude
  // them and let images + text share cleanly instead (graceful).
  let voice = null;
  if (order.voiceNote && order.voiceNote.url) {
    const f = await urlToFile(order.voiceNote.url, `${order.appOrderNo || 'order'}-voice`).catch(() => null);
    if (f && SHARE_SAFE_AUDIO.test(f.type)) {
      // Prefer an .m4a filename for mp4 audio so WhatsApp recognises it.
      voice = f.type.includes('mp4')
        ? new File([f], f.name.replace(/\.\w+$/, '.m4a'), { type: f.type })
        : f;
    }
  }
  return voice ? [...images, voice] : images;
}

// Guard so a double-tap can't call navigator.share() twice (the second throws
// InvalidStateError and was dumping the share to a link).
let sharing = false;

// Shares an order. Returns a status object so the UI can explain what happened.
// Pass pre-fetched files (from prepareShareFiles) for reliable iOS attachment.
export async function shareOrder(order, prefetchedFiles) {
  if (sharing) return { mode: 'busy' };
  const text = whatsappMessage(order);

  if (!navigator.share) {
    window.open(whatsappUrl(order), '_blank');
    return { mode: 'link', reason: 'no Web Share API (desktop browser)', built: 0 };
  }

  let files = prefetchedFiles;
  if (!files) files = await prepareShareFiles(order);
  const built = files ? files.length : 0;
  const wanted = (order.images || []).length;

  // Decide the shareable set synchronously (no await before navigator.share).
  let toShare = null; let mode = 'text'; let reason = '';
  if (built) {
    const can = (f) => !navigator.canShare || navigator.canShare({ files: f });
    if (can(files)) { toShare = files; mode = 'files'; }
    else {
      const imgs = files.filter((f) => f.type.startsWith('image'));
      if (imgs.length && can(imgs)) { toShare = imgs; mode = 'images'; }
      else { reason = 'canShare({files}) = false'; }
    }
  } else {
    reason = `0 of ${wanted} files loaded (CORS or fetch blocked)`;
  }

  sharing = true;
  try {
    if (toShare) { await navigator.share({ text, files: toShare }); return { mode, built, wanted }; }
    await navigator.share({ text });
    return { mode: 'text', built, wanted, reason: reason || 'no files to attach' };
  } catch (e) {
    if (e && e.name === 'AbortError') return { mode: 'cancel' };
    if (e && e.name === 'InvalidStateError') return { mode: 'busy', reason: 'share already in progress' };
    window.open(whatsappUrl(order), '_blank');
    return { mode: 'link', reason: `${e?.name || ''} ${e?.message || ''}`.trim(), built, wanted };
  } finally {
    sharing = false;
  }
}
