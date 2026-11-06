import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Sidebar.css';
import dashboardIcon from '../../assets/images/dashboardIcon.png';
import inventoryIcon from '../../assets/images/inventoryIcon.png';
import craftingIcon from '../../assets/images/craftingIcon.png';
import analyticsIcon from '../../assets/images/analyticsIcon.png';
import usersIcon from '../../assets/images/usersIcon.png';
import { useCurrentUser, clearCurrentUser } from '../../utils/currentUser';
import { clearAuthToken } from '../../utils/authToken';
import { getCurrentUserFromSession, CurrentUserResponse } from '../../services/authApi';
import { useApi } from '../../hooks';

const MENU_DATA = {
  logo: {
    shortSrc: `${process.env.PUBLIC_URL}/artifax-logo.png`,
    shortAlt: 'Artifax mark',
    fullText: 'Artifax',
  },
  mainMenu: [
    { id: 'dashboard', label: 'Dashboard', icon: dashboardIcon, path: '/dashboard' },
    { id: 'inventory', label: 'Inventory', icon: inventoryIcon, path: '/inventory' },
    { id: 'crafting', label: 'Crafting', icon: craftingIcon, path: '/crafting' },
  ],
  adminMenu: [
    { id: 'analytics', label: 'Analytics', icon: analyticsIcon, path: '/analytics', badge: 'Admin' },
    { id: 'users', label: 'Users', icon: usersIcon, path: '/users', badge: 'Admin' },
  ],
  user: {
    name: 'J. Martinez',
    role: 'Admin',
  },
};

function SidebarNavGroup({ title, items }) {
  return (
    <>
      <p className="section-title nav-text">{title}</p>
      <ul className="nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              data-label={item.label}
              aria-label={item.label}
              title={item.label}
            >
              <div className="nav-icon">
                <img className="nav-icon-image" src={item.icon} alt="" aria-hidden="true" />
              </div>
              <span className="nav-text">{item.label}</span>
              {item.badge ? <span className="admin-badge nav-text">{item.badge}</span> : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function Sidebar() {
  const navigate = useNavigate();
  const api = useApi();
  const currentUser = useCurrentUser();
  const [sessionUser, setSessionUser] = useState<CurrentUserResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const me = await getCurrentUserFromSession();
        if (mounted) {
          setSessionUser(me);
        }
      } catch (error) {
        console.log('Sidebar /User/me failed:', error);
        // Ignore errors and fall back to stored user data if available.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const userName =
    sessionUser?.Username ?? sessionUser?.username ?? currentUser?.name ?? MENU_DATA.user.name;
  const userRole =
    sessionUser?.UserLevel ?? sessionUser?.userLevel ?? currentUser?.role ?? MENU_DATA.user.role;
  const isAdmin = userRole?.toString().toLowerCase() === 'admin';

  const handleLogout = async () => {
    try {
      await api.post('/User/logout');
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      sessionStorage.clear();
      clearAuthToken();
      clearCurrentUser();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside className="sidebar-container">
      <div className="sidebar-header">
        <div className="logo-placeholder">
          <img className="logo-mark-image" src={MENU_DATA.logo.shortSrc} alt={MENU_DATA.logo.shortAlt} />
        </div>
        <span className="nav-text logo-text">{MENU_DATA.logo.fullText}</span>
      </div>

      <div className="sidebar-content">
        <SidebarNavGroup title="MAIN MENU" items={MENU_DATA.mainMenu} />
        {isAdmin && <SidebarNavGroup title="ADMIN" items={MENU_DATA.adminMenu} />}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-profile-button" aria-label={`${userName} profile`}>
          <span className="user-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="3.4" />
              <path d="M4.5 20c1.8-3.2 4.5-5 7.5-5s5.7 1.8 7.5 5" />
            </svg>
          </span>
          <span className="user-info nav-text">
            <span className="user-name">{userName}</span>
            <span className="user-role">{userRole}</span>
          </span>
        </button>

        <button type="button" className="sidebar-logout-button" onClick={handleLogout} aria-label="Logout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M21 4v16" />
          </svg>
          <span className="nav-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
