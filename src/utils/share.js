import { whatsappMessage, whatsappUrl } from './format';

async function urlToFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'application/octet-stream' });
}

// Shares an order. On phones/PWAs over HTTPS it opens the native share sheet
// with the actual images + voice note attached (pick WhatsApp there). Where the
// platform can't share files (most desktop browsers), it falls back to a wa.me
// text link — which still carries the media URLs.
export async function shareOrder(order) {
  const text = whatsappMessage(order);
  const sources = [
    ...(order.images || []).slice(0, 4).map((m, i) => ({ url: typeof m === 'string' ? m : m.url, name: `${order.appOrderNo || 'order'}-${i + 1}` })),
    ...(order.voiceNote ? [{ url: order.voiceNote, name: `${order.appOrderNo || 'order'}-voice` }] : []),
  ];

  // Build File objects from the stored media (best effort).
  let files = [];
  if (navigator.share && sources.length) {
    const built = await Promise.all(sources.map((s) => urlToFile(s.url, s.name).catch(() => null)));
    files = built.filter(Boolean);
  }

  try {
    if (files.length && navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
      await navigator.share({ text, files });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user dismissed the share sheet
  }

  // Last resort: WhatsApp text link (media URLs are embedded in the message).
  window.open(whatsappUrl(order), '_blank');
}
