import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  IcHome, IcOrders, IcMembers, IcSettings, IcChannels, IcProfile, IcBell,
} from './Icons';

const NAVS = {
  admin: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/members', label: 'Members', icon: IcMembers },
    { to: '/settings', label: 'Settings', icon: IcSettings },
  ],
  team: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/channels', label: 'Channels', icon: IcChannels },
    { to: '/profile', label: 'Profile', icon: IcProfile },
  ],
  vendor: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/notifications', label: 'Alerts', icon: IcBell },
    { to: '/profile', label: 'Profile', icon: IcProfile },
  ],
};

export default function BottomNav() {
  const { role } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const items = NAVS[role] || NAVS.team;

  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const Icon = it.icon;
        const active = it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to);
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
