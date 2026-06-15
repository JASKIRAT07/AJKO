// Shared formatting + business-logic helpers for AJKO

export const STAGES = {
  new: { key: 'new', label: 'New', color: '#9ca3af', glow: 'glow-new' },
  inprogress: { key: 'inprogress', label: 'In progress', color: '#3b82f6', glow: 'glow-blue' },
  ready: { key: 'ready', label: 'Ready', color: '#22c55e', glow: 'glow-green' },
  handedover: { key: 'handedover', label: 'Handed over', color: '#14b8a6', glow: 'glow-teal' },
  rework: { key: 'rework', label: 'Rework', color: '#f59e0b', glow: 'glow-amber' },
};

// Linear pipeline (rework is an off-path detour, handled separately).
export const STAGE_ORDER = ['new', 'inprogress', 'ready', 'handedover'];

// Allowed stage moves per current stage, scoped by role.
// Admin + the assigned vendor channel move orders forward/back. Team members can
// ONLY send a Ready / Handed-over order back for rework — no other stage action.
export const STAGE_TRANSITIONS = {
  new: [
    { to: 'inprogress', label: 'Start work', kind: 'primary', roles: ['vendor', 'admin'] },
  ],
  inprogress: [
    { to: 'ready', label: 'Mark ready', kind: 'primary', roles: ['vendor', 'admin'] },
    { to: 'new', label: 'Move back', kind: 'ghost', roles: ['vendor', 'admin'] },
  ],
  ready: [
    { to: 'handedover', label: 'Hand over', kind: 'primary', roles: ['vendor', 'admin'] },
    { to: 'rework', label: 'Send for rework', kind: 'danger', roles: ['team', 'admin'] },
    { to: 'inprogress', label: 'Move back', kind: 'ghost', roles: ['vendor', 'admin'] },
  ],
  rework: [
    { to: 'inprogress', label: 'Resume work', kind: 'primary', roles: ['vendor', 'admin'] },
  ],
  handedover: [
    { to: 'rework', label: 'Send for rework', kind: 'danger', roles: ['team', 'admin'] },
    { to: 'ready', label: 'Move back', kind: 'ghost', roles: ['vendor', 'admin'] },
  ],
};

export function allowedTransitions(stage, role) {
  return (STAGE_TRANSITIONS[stage] || []).filter((t) => t.roles.includes(role));
}

// Stages that count as "finished" (no urgency pressure).
export const DONE_STAGES = ['ready', 'handedover'];
export const isDone = (stage) => DONE_STAGES.includes(stage);

export const PURITY_OPTIONS = ['9kt', '10kt', '14kt', '18kt', '20kt', '22kt', '24kt'];
export const LOOK_OPTIONS = ['Antique', 'Golden', 'Patiala antique', 'Goldenish antique'];

export function stageInfo(stage) {
  return STAGES[stage] || STAGES.new;
}

// Returns urgency descriptor based on dueDate + stage.
export function getUrgency(dueDate, stage) {
  if (isDone(stage)) {
    return { key: 'done', label: stageInfo(stage).label, color: stageInfo(stage).color, glow: '', overdue: false };
  }
  if (!dueDate) {
    return { key: 'ontrack', label: 'On track', color: '#22c55e', glow: '', overdue: false };
  }
  const now = new Date();
  const due = toDate(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { key: 'overdue', label: 'Overdue', color: '#ef4444', glow: 'glow-red', overdue: true };
  if (diffDays === 0) return { key: 'today', label: 'Due today', color: '#f97316', glow: 'glow-orange', overdue: false };
  if (diffDays === 1) return { key: 'd1', label: 'Due in 1 day', color: '#f59e0b', glow: '', overdue: false };
  if (diffDays === 2) return { key: 'd2', label: 'Due in 2 days', color: '#eab308', glow: '', overdue: false };
  if (diffDays === 3) return { key: 'd3', label: 'Due in 3 days', color: '#84cc16', glow: '', overdue: false };
  return { key: 'ontrack', label: 'On track', color: '#22c55e', glow: '', overdue: false };
}

export function countdownLabel(dueDate) {
  if (!dueDate) return '';
  const now = new Date();
  const due = toDate(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} overdue`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return '1 day left';
  return `${diffDays} days left`;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (typeof value === 'number') return new Date(value);
  return new Date(value);
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function dayKey(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toDateString();
}

export function dayDivider(value) {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return formatDate(d);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayLong() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// Formats an app order number from a counter value, e.g. 1 -> AO-001
export function formatAppOrderNo(seq) {
  return `AO-${String(seq || 0).padStart(3, '0')}`;
}

// Builds the WhatsApp share message for an order. Images attach as real files
// via the share sheet, so no media URLs are included by default.
export function whatsappMessage(order, { withLinks = false } = {}) {
  const images = order.images || [];
  const lines = [
    `🔔 New Order — ${order.appOrderNo || ''}`,
    `📋 Store ref: ${order.storeOrderNo || '—'}`,
    `💍 Item: ${order.itemName || '—'}`,
    `⚖️ Weight: ${order.weight ? `${order.weight} gms` : '—'}`,
    `✨ Purity: ${order.purity || '—'}`,
    `🎨 Look: ${order.look || '—'}`,
  ];
  if (order.pieces) lines.push(`🔢 Pieces: ${order.pieces}`);
  if (order.size) lines.push(`📐 Size: ${order.size}`);
  if (order.width) lines.push(`📏 Width: ${order.width}`);
  lines.push(`📅 Due: ${order.dueDate ? formatDate(order.dueDate) : '—'}`);
  if (order.designDetails) lines.push(`📝 Design details: ${order.designDetails}`);
  if (order.extraDetails) lines.push(`🗒️ Extra details: ${order.extraDetails}`);
  lines.push(`🧪 Sample taken: ${order.sampleTaken ? 'Yes' : 'No'}`);
  if (images.length) lines.push(`📎 ${images.length} image${images.length === 1 ? '' : 's'} attached`);
  if (withLinks && images.length) {
    lines.push('', '🖼️ Media:');
    images.forEach((m) => lines.push(typeof m === 'string' ? m : m.url));
  }
  lines.push('', '— AJKO');
  return lines.join('\n');
}

export function whatsappUrl(order, phone) {
  const text = encodeURIComponent(whatsappMessage(order));
  const base = phone ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : 'https://wa.me/';
  return `${base}?text=${text}`;
}
