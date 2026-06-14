import { whatsappMessage, whatsappUrl } from './format';

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
  const sources = [
    ...(order.images || []).slice(0, 4).map((m, i) => ({ url: typeof m === 'string' ? m : m.url, name: `${order.appOrderNo || 'order'}-${i + 1}` })),
    ...(order.voiceNote ? [{ url: order.voiceNote, name: `${order.appOrderNo || 'order'}-voice` }] : []),
  ];
  const built = await Promise.all(sources.map((s) => urlToFile(s.url, s.name).catch(() => null)));
  return built.filter(Boolean);
}

// Shares an order. Pass pre-fetched files (from prepareShareFiles) for reliable
// attachment on iOS; otherwise it fetches on the fly (fine on Android).
export async function shareOrder(order, prefetchedFiles) {
  const text = whatsappMessage(order);
  let files = prefetchedFiles;
  if (!files && navigator.share) files = await prepareShareFiles(order);

  // Decide the shareable set SYNCHRONOUSLY (no await before navigator.share, so
  // iOS keeps the tap's activation). If the full set is rejected — often because
  // the .webm voice note isn't a shareable type — retry with images only.
  let toShare = null;
  if (navigator.share && files && files.length) {
    const canShare = (f) => !navigator.canShare || navigator.canShare({ files: f });
    if (canShare(files)) {
      toShare = files;
    } else {
      const imgs = files.filter((f) => f.type.startsWith('image'));
      if (imgs.length && canShare(imgs)) toShare = imgs;
    }
  }

  try {
    if (toShare) { await navigator.share({ text, files: toShare }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user dismissed the sheet
  }
  window.open(whatsappUrl(order), '_blank');
}
