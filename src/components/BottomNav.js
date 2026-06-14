import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNavItems, isActivePath } from './navConfig';

export default function BottomNav() {
  const { role } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const items = getNavItems(role);

  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const Icon = it.icon;
        const active = isActivePath(loc.pathname, it.to);
        return (
          <button key={it.to} className={`nav-item ${active ? 'active' : ''}`} onClick={() => nav(it.to)}>
            <span className="ico"><Icon size={22} /></span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
