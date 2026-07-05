import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Search, Users, Settings, BarChart3, LogOut, Layers } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
const navItems = [
  { path: '/queues', label: 'Queues', icon: LayoutGrid },
  { path: '/jobs', label: 'Job Explorer', icon: Search },
  { path: '/workers', label: 'Workers', icon: Users },
  { path: '/configuration', label: 'Configuration', icon: Settings },
  { path: '/metrics', label: 'Metrics', icon: BarChart3 },
];
export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
          <h1>Scheduler Pro</h1>
        </div>
        <span>Distributed System</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user?.name || 'Admin'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {user?.role || 'user'}
            </div>
          </div>
          <button className="btn-ghost" onClick={logout} title="Logout" style={{ padding: '6px' }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}