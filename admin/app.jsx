/**
 * Keke Admin - Main app (sidebar + routing)
 * Load after components and pages.
 */
const { useState, useEffect, useCallback } = React;
const Auth = window.AdminAuth;
const Api = window.AdminApi;
const C = window.AdminComponents;

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = (email || '').trim().replace(/\s+/g, '');
    const trimmedPassword = (password || '').trim();
    if (trimmedEmail !== email) setEmail(trimmedEmail);
    if (trimmedPassword !== password) setPassword(trimmedPassword);
    setLoading(true);
    const res = await Api.request('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }) });
    setLoading(false);
    if (res.error) {
      setError(typeof res.error === 'string' ? res.error : (res.error && (res.error.message || res.error.error)) ? String(res.error.message || res.error.error) : 'Something went wrong');
      return;
    }
    const token = res.data?.authorisation?.token || res.data?.token;
    if (token) {
      Auth.setToken(token);
      const role = res.data?.data?.admin?.role || res.data?.admin?.role;
      if (role) Auth.setRole(role);
      onLogin();
    } else {
      setError('Invalid response from server');
    }
  };

  const clearError = () => setError('');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ isolation: 'isolate', background: 'linear-gradient(135deg, var(--keke-primary-hex) 0%, #2f7263 100%)' }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md relative z-10" style={{ pointerEvents: 'auto' }}>
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl text-white text-2xl font-bold" style={{ backgroundColor: 'var(--keke-primary-hex)' }}>K</span>
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Keke</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Admin</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">Ride-hailing management</p>
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10" style={{ pointerEvents: 'auto' }}>
          <div>
            <label htmlFor="admin-login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-text">Email</label>
            <input
              id="admin-login-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              onFocus={() => clearError()}
              required
              autoComplete="email"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:border-transparent dark:bg-gray-700 dark:text-white outline-none cursor-text keke-focus-ring"
              placeholder="Enter your email"
              style={{ pointerEvents: 'auto' }}
            />
          </div>
          <div>
            <label htmlFor="admin-login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-text">Password</label>
            <div className="relative">
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                onFocus={() => clearError()}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:border-transparent dark:bg-gray-700 dark:text-white outline-none cursor-text keke-focus-ring"
                placeholder="Enter your password"
                style={{ pointerEvents: 'auto' }}
              />
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowPassword(!showPassword); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                style={{ pointerEvents: 'auto' }}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              {error.toLowerCase().includes('invalid credentials') && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">Create an admin user: from project root run <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">cd backend && node scripts/createAdmin.js</code></p>
              )}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 px-4 rounded-lg disabled:opacity-50 font-medium transition-colors keke-btn-primary">Log in</button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [detailId, setDetailId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    setAuthenticated(Auth.isAuthenticated());
  }, []);

  useEffect(() => {
    window.onAdminUnauthorized = () => setAuthenticated(false);
    return () => { window.onAdminUnauthorized = null; };
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToasts((prev) => [...prev, { id: Date.now(), message, type }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const onNavigate = useCallback((p, id) => {
    setPage(p);
    setDetailId(id ?? null);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [headerRange, setHeaderRange] = useState('30d');
  const dashboardExportRef = React.useRef(null);

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'drivers', label: 'Drivers', icon: '🚗' },
    { id: 'rides', label: 'Rides', icon: '🗺️' },
    { id: 'finance', label: 'Finance', icon: '💰' },
    { id: 'offers', label: 'Offers', icon: '🏷️' },
    { id: 'support', label: 'Support', icon: '🎫' },
    { id: 'config', label: 'Configuration', icon: '⚙️' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'audit', label: 'Audit logs', icon: '📋' },
  ];

  const pageTitles = {
    dashboard: 'Dashboard',
    users: 'Users',
    drivers: 'Drivers',
    rides: 'Rides',
    finance: 'Finance',
    offers: 'Offers',
    support: 'Support',
    config: 'Configuration',
    analytics: 'Analytics',
    notifications: 'Notifications',
    audit: 'Audit logs',
  };
  const pageTitle = pageTitles[page] || 'Dashboard';

  const handleDashboardExport = useCallback(() => {
    if (dashboardExportRef.current) dashboardExportRef.current();
  }, []);

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  const Pages = window.AdminPages || {};
  let Content = null;
  if (page === 'dashboard') Content = Pages.Dashboard;
  else if (page === 'users') Content = Pages.Users;
  else if (page === 'user-detail') Content = Pages.UserDetail;
  else if (page === 'drivers') Content = Pages.Drivers;
  else if (page === 'driver-detail') Content = Pages.DriverDetail;
  else if (page === 'rides') Content = Pages.Rides;
  else if (page === 'ride-detail') Content = Pages.RideDetail;
  else if (page === 'finance') Content = Pages.Finance;
  else if (page === 'support') Content = Pages.Support;
  else if (page === 'ticket-detail') Content = Pages.TicketDetail;
  else if (page === 'config') Content = (props) => React.createElement(Pages.Config, { ...props, defaultTab: 'vehicle-types' });
  else if (page === 'offers') Content = (props) => React.createElement(Pages.Config, { ...props, defaultTab: 'promocodes' });
  else if (page === 'analytics') Content = Pages.Analytics;
  else if (page === 'notifications') Content = Pages.Notifications;
  else if (page === 'audit') Content = Pages.Audit;
  else Content = Pages.Dashboard;

  const currentId = detailId;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
      <aside
        className={`admin-sidebar flex flex-col border-r dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-200 flex-shrink-0 ${sidebarCollapsed ? 'admin-sidebar--collapsed' : 'w-56'}`}
        style={sidebarCollapsed ? { width: 72 } : {}}
      >
        <div className="p-3 border-b dark:border-gray-700 flex items-center gap-2 min-h-[60px]">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg text-white text-lg font-bold shrink-0" style={{ backgroundColor: 'var(--keke-primary-hex)' }}>K</span>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-800 dark:text-white leading-tight truncate">Keke</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-auto">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              title={sidebarCollapsed ? item.label : undefined}
              onClick={() => { setPage(item.id); setDetailId(null); }}
              className={`admin-nav-item w-full text-left rounded-lg flex items-center gap-2 text-sm transition-colors ${page === item.id ? 'keke-bg-active font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              style={{
                ...(page === item.id ? { color: 'var(--keke-primary-hex)' } : {}),
                ...(sidebarCollapsed ? { justifyContent: 'center', padding: '0.5rem' } : { paddingLeft: '0.75rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }),
              }}
            >
              <span className="text-xl shrink-0" aria-hidden="true">{item.icon}</span>
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-2 border-t dark:border-gray-700">
          {!sidebarCollapsed && (
            <p className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">Click ← by logo to collapse</p>
          )}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="admin-header sticky top-0 z-40 flex items-center justify-between gap-4 px-6 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{pageTitle}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            {page === 'dashboard' && (
              <>
                <select
                  value={headerRange}
                  onChange={(e) => setHeaderRange(e.target.value)}
                  className="admin-filter-select text-sm rounded-lg border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-3 py-2 focus:ring-2 focus:ring-offset-1 min-w-[100px]"
                  style={{ outlineColor: 'var(--keke-primary-hex)' }}
                  title="Time period"
                >
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="90d">90 days</option>
                </select>
                <button type="button" onClick={handleDashboardExport} className="admin-export-btn flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm font-medium transition-colors" title="Export CSV">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Export
                </button>
              </>
            )}
            <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="Notifications" aria-label="Notifications">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </button>
            <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" title="Settings" aria-label="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen((o) => !o)} className="admin-profile-btn flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" aria-expanded={profileOpen} aria-haspopup="true">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0" style={{ backgroundColor: 'var(--keke-primary-hex)' }}>A</span>
                <span className="text-sm font-medium hidden sm:inline">Admin</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: profileOpen ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setProfileOpen(false)} />
                  <div className="admin-profile-dropdown absolute right-0 top-full mt-1 py-1 w-48 rounded-xl shadow-lg border dark:border-gray-600 bg-white dark:bg-gray-800 z-50">
                    <div className="px-4 py-2 border-b dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Admin</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Dashboard</p>
                    </div>
                    <button type="button" onClick={() => { setDark(!dark); setProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Theme</button>
                    <button type="button" onClick={() => { Auth.logout().finally(() => { setAuthenticated(false); setProfileOpen(false); }); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">Logout</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 text-white px-4 py-2 rounded-lg shadow" style={{ backgroundColor: 'var(--keke-primary-hex)' }}>Loading...</div>
          )}
          {Content ? (
            <Content
              onNavigate={onNavigate}
              onBack={() => {
                setDetailId(null);
                if (page === 'user-detail') setPage('users');
                else if (page === 'driver-detail') setPage('drivers');
                else if (page === 'ride-detail') setPage('rides');
                else if (page === 'ticket-detail') setPage('support');
                else setPage('dashboard');
              }}
              id={currentId}
              showToast={showToast}
              headerRange={page === 'dashboard' ? headerRange : undefined}
              setHeaderRange={page === 'dashboard' ? setHeaderRange : undefined}
              dashboardExportRef={page === 'dashboard' ? dashboardExportRef : undefined}
            />
          ) : (
            <div className="text-gray-500">Page not found</div>
          )}
        </main>
      </div>
      <C.ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

function init() {
  if (window.darkMode !== undefined) {
    document.documentElement.classList.toggle('dark', window.darkMode);
  }
  const root = document.getElementById('root');
  if (root && ReactDOM.createRoot) {
    ReactDOM.createRoot(root).render(React.createElement(App));
  } else {
    ReactDOM.render(React.createElement(App), document.getElementById('root'));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
