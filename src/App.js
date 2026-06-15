import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './screens/Login';
import Home from './screens/Home';
import Orders from './screens/Orders';
import OrderDetail from './screens/OrderDetail';
import CreateOrder from './screens/CreateOrder';
import Conversations from './screens/Conversations';
import Notifications from './screens/Notifications';
import NotificationSettings from './screens/NotificationSettings';
import Search from './screens/Search';
import Profile from './screens/Profile';
import Settings from './screens/Settings';
import Members from './screens/Members';
import SetPassword from './screens/SetPassword';
import Sidebar from './components/Sidebar';
import Splash from './components/Splash';

function Shell() {
  const { fbUser, profile, loading } = useAuth();

  if (loading) return <div className="full-center"><div className="spinner" /></div>;
  if (!fbUser) return <Login />;

  if (!profile) {
    return (
      <div className="full-center" style={{ flexDirection: 'column', padding: 24, textAlign: 'center' }}>
        <div className="logo-mark" style={{ marginBottom: 16 }}>💎</div>
        <h2>Account not found</h2>
        <p className="muted">No member record matches this login. Ask your admin to add your number, then try again.</p>
        <SignOutLink />
      </div>
    );
  }

  // Forgot-password reset (flag set after OTP) forces the set-password screen.
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ajko_set_pw') === '1') {
    return <SetPassword />;
  }
  if (profile.role !== 'admin' && profile.passwordSet !== true && profile.setupComplete !== true) {
    return <SetPassword />;
  }

  return (
    <>
      <Sidebar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/order/:id" element={<OrderDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/notification-settings" element={<NotificationSettings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/conversations" element={<Conversations />} />

        {/* Admin + team only */}
        <Route path="/create" element={<RequireRole roles={['admin', 'team']}><CreateOrder /></RequireRole>} />
        <Route path="/edit/:id" element={<RequireRole roles={['admin', 'team']}><CreateOrder /></RequireRole>} />

        {/* Admin only */}
        <Route path="/members" element={<RequireRole roles={['admin']}><Members /></RequireRole>} />
        <Route path="/settings" element={<RequireRole roles={['admin']}><Settings /></RequireRole>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function RequireRole({ roles, children }) {
  const { role } = useAuth();
  if (!roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function SignOutLink() {
  const { logout } = useAuth();
  return <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={logout}>Sign out</button>;
}

export default function App() {
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        {splash ? <Splash /> : <Shell />}
      </BrowserRouter>
    </AuthProvider>
  );
}
