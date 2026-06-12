// Minimal inline SVG icon set for AJKO
import React from 'react';

const S = ({ children, size = 22, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

export const IcDiamond = (p) => (<S {...p}><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M12 3v18M8 9l4 12 4-12" /></S>);
export const IcHome = (p) => (<S {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></S>);
export const IcOrders = (p) => (<S {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></S>);
export const IcMembers = (p) => (<S {...p}><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2.5-5 5-5s5 2 5 5" /><circle cx="17" cy="9" r="2.2" /><path d="M16 20c0-2.5 1.3-4 3.5-4" /></S>);
export const IcSettings = (p) => (<S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2 2M17.8 17.8l2 2M2 12h3M19 12h3M4.2 19.8l2-2M17.8 6.2l2-2" /></S>);
export const IcChannels = (p) => (<S {...p}><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z" /></S>);
export const IcProfile = (p) => (<S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" /></S>);
export const IcBell = (p) => (<S {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></S>);
export const IcSearch = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></S>);
export const IcBack = (p) => (<S {...p}><path d="M15 18l-6-6 6-6" /></S>);
export const IcPlus = (p) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>);
export const IcMic = (p) => (<S {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></S>);
export const IcSend = (p) => (<S {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></S>);
export const IcDots = (p) => (<S {...p}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></S>);
export const IcWhatsApp = ({ size = 20, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M.06 24l1.69-6.16a11.87 11.87 0 0 1-1.6-5.95C.16 5.34 5.5 0 12.07 0a11.82 11.82 0 0 1 8.41 3.49 11.82 11.82 0 0 1 3.48 8.41c0 6.57-5.34 11.91-11.9 11.91a11.9 11.9 0 0 1-5.7-1.45zm6.6-3.8c1.68.99 3 1.16 3.4 1.18 5.46 0 9.9-4.43 9.9-9.89a9.86 9.86 0 0 0-16.83-7A9.86 9.86 0 0 0 3.5 12.2a9.82 9.82 0 0 0 1.51 5.26l-.99 3.6 3.64-.86zM17.4 14.3c-.07-.12-.27-.2-.57-.35s-1.76-.87-2.03-.97-.47-.15-.67.15-.77.96-.94 1.16-.35.22-.64.07a8.1 8.1 0 0 1-2.39-1.47 8.96 8.96 0 0 1-1.65-2.06c-.17-.3 0-.45.13-.6s.3-.34.45-.52a2 2 0 0 0 .3-.5.55.55 0 0 0-.03-.52c-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01a1.1 1.1 0 0 0-.79.37 3.33 3.33 0 0 0-1.04 2.48c0 1.46 1.07 2.88 1.22 3.08s2.1 3.2 5.08 4.49c.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42s.25-1.28.18-1.4z" />
  </svg>
);
export const IcChevron = (p) => (<S {...p}><path d="M9 18l6-6-6-6" /></S>);
export const IcCheck = (p) => (<S {...p}><path d="M20 6L9 17l-5-5" /></S>);
export const IcImage = (p) => (<S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></S>);
