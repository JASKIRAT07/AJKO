import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNavItems, isActivePath } from './navConfig';
import { RoleBadge } from './Badges';
import { IcDiamond } from './Icons';
import { initials } from '../utils/format';

// Desktop-only left sidebar (hidden under 768px via CSS).
export default function Sidebar() {
  const { role, profile, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const items = getNavItems(role);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo-mark" style={{ width: 40, height: 40, borderRadius: 13, animation: 'none' }}><IcDiamond size={22} color="#fff" /></div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>AJKO</div>
      </div>

      <nav className="sidebar-nav">
        {items.map((it) => {
          const Icon = it.icon;
          const active = isActivePath(loc.pathname, it.to);
          return (
            <button key={it.to} className={`sidebar-item ${active ? 'active' : ''}`} onClick={() => nav(it.to)}>
              <Icon size={20} /> <span>{it.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className={`avatar ${role === 'vendor' ? '' : 'blue'}`} style={{ width: 38, height: 38, fontSize: 13 }}>
            {role === 'vendor' ? (profile?.code?.split('-').pop()) : initials(profile?.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{role === 'vendor' ? profile?.code : profile?.name}</div>
            <RoleBadge role={role} />
          </div>
        </div>
        <button className="btn btn-ghost btn-block" onClick={logout}>Sign out</button>
      </div>
    </aside>
  );
}
