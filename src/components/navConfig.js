import {
  IcHome, IcOrders, IcMembers, IcSettings, IcChannels, IcProfile, IcPhone,
} from './Icons';

const NAVS = {
  admin: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/conversations', label: 'Chat', icon: IcChannels },
    { to: '/members', label: 'Members', icon: IcMembers },
    { to: '/settings', label: 'Settings', icon: IcSettings },
    { to: '/ai-calls', label: 'AI Calls', icon: IcPhone },
  ],
  team: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/conversations', label: 'Chat', icon: IcChannels },
    { to: '/profile', label: 'Profile', icon: IcProfile },
  ],
  vendor: [
    { to: '/', label: 'Home', icon: IcHome },
    { to: '/orders', label: 'Orders', icon: IcOrders },
    { to: '/conversations', label: 'Chat', icon: IcChannels },
    { to: '/profile', label: 'Profile', icon: IcProfile },
  ],
};

export function getNavItems(role) {
  return NAVS[role] || NAVS.team;
}

export function isActivePath(pathname, to) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}
