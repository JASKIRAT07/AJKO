import { whatsappMessage, whatsappUrl } from './format';

async function urlToFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'application/octet-stream' });
}

// Shares an order to WhatsApp/other apps. On supporting devices it attaches the
// images + voice note via the Web Share API; otherwise it opens a wa.me text
// link (which still includes the media URLs).
export async function shareOrder(order) {
  const text = whatsappMessage(order);
  const media = [
    ...(order.images || []).slice(0, 4).map((m, i) => ({ url: typeof m === 'string' ? m : m.url, name: `${order.appOrderNo || 'order'}-${i + 1}` })),
    ...(order.voiceNote ? [{ url: order.voiceNote, name: `${order.appOrderNo || 'order'}-voice` }] : []),
  ];

  try {
    if (navigator.canShare && media.length) {
      const files = [];
      for (const m of media) {
        try { files.push(await urlToFile(m.url, m.name)); } catch { /* skip */ }
      }
      if (files.length && navigator.canShare({ files })) {
        await navigator.share({ text, files });
        return;
      }
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user cancelled the share sheet
  }
  // Fallback: WhatsApp text (with media URLs embedded).
  window.open(whatsappUrl(order), '_blank');
}
