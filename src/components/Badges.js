import { stageInfo } from '../utils/format';

export function StageBadge({ stage }) {
  const s = stageInfo(stage);
  return (
    <span className="badge" style={{ background: `${s.color}1a`, color: s.color }}>
      <span className="dot" style={{ background: s.color }} /> {s.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }) {
  if (!urgency) return null;
  return (
    <span className="badge" style={{ background: `${urgency.color}1a`, color: urgency.color }}>
      <span className="dot" style={{ background: urgency.color }} /> {urgency.label}
    </span>
  );
}

export function RoleBadge({ role }) {
  if (role === 'admin') return <span className="badge badge-admin">Admin</span>;
  if (role === 'team') return <span className="badge badge-team">Team member</span>;
  if (role === 'vendor') return <span className="badge badge-vendor">Vendor</span>;
  return null;
}
