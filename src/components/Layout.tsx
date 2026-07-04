import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Calculator, 
  AlertTriangle, 
  CalendarDays, 
  FileSpreadsheet, 
  UserCircle, 
  Settings as SettingsIcon,
  Menu,
  X,
  Bell,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  User
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const userStr = localStorage.getItem('dentisys_user');
  const currentUser = userStr 
    ? JSON.parse(userStr) 
    : { name: 'Dr. Eleanor Vance', title: 'Academic Dean / Clinician', role: 'faculty', email: 'eleanor.vance@dentisys.edu' };

  const getInitials = (fullName: string) => {
    if (!fullName) return 'U';
    const parts = fullName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '').split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0] ? parts[0][0].toUpperCase() : 'U';
  };

  const initials = getInitials(currentUser.name);

  const { settings, updateSettings, students } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const toggleTheme = () => {
    updateSettings({
      ...settings,
      theme: settings.theme === 'light' ? 'dark' : 'light',
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('dentisys_user');
    setIsProfileOpen(false);
    navigate('/login');
  };

  const getNavItems = () => {
    const common = [
      { name: 'My Profile', path: '/profile', icon: UserCircle },
      { name: 'Settings', path: '/settings', icon: SettingsIcon },
    ];
    
    if (currentUser.role === 'admin') {
      return [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'User Management', path: '/admin/users', icon: Users },
        { name: 'System Audit Logs', path: '/admin/audit', icon: FileSpreadsheet },
        ...common
      ];
    }
    
    if (currentUser.role === 'student') {
      return [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Attendance Sheets', path: '/student/attendance', icon: CalendarDays },
        { name: 'Facial Enrollment', path: '/student/facial-enrollment', icon: UserCircle },
        { name: 'CCTV Scanner Feed', path: '/student/cctv', icon: FileSpreadsheet },
        ...common
      ];
    }
    
    // Faculty (default)
    return [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Student Management', path: '/students', icon: Users },
      { name: 'Grade Computation', path: '/grades', icon: Calculator },
      { name: 'Retention Monitoring', path: '/retention', icon: AlertTriangle, badge: 'retention' },
      { name: 'Attendance Monitoring', path: '/attendance', icon: CalendarDays },
      { name: 'Reports & Export', path: '/reports', icon: FileSpreadsheet },
      ...common
    ];
  };

  const navItems = getNavItems();

  // Calculate notifications
  const criticalAlerts = students.flatMap(s => 
    s.remedialExams
      .filter(rem => rem.status === 'pending')
      .map(rem => ({
        id: rem.id,
        text: `${s.name} has a pending Remedial Exam for ${rem.subjectCode}`,
        path: '/retention'
      }))
  );

  const getBadgeValue = (type: string) => {
    if (type === 'retention') {
      const warningCount = students.filter(s => s.status === 'warning' || s.status === 'critical').length;
      return warningCount > 0 ? warningCount : undefined;
    }
    return undefined;
  };

  // Breadcrumbs Generator
  const getBreadcrumbs = () => {
    const crumbs = [{ name: 'Home', path: '/' }];
    const path = location.pathname;

    if (path === '/students') {
      crumbs.push({ name: 'Student Management', path: '/students' });
    } else if (path === '/grades') {
      crumbs.push({ name: 'Grade Computation', path: '/grades' });
    } else if (path === '/retention') {
      crumbs.push({ name: 'Retention Monitoring', path: '/retention' });
    } else if (path === '/attendance') {
      crumbs.push({ name: 'Attendance Monitoring', path: '/attendance' });
    } else if (path === '/reports') {
      crumbs.push({ name: 'Reports & Export', path: '/reports' });
    } else if (path === '/profile') {
      crumbs.push({ name: 'My Profile', path: '/profile' });
    } else if (path === '/settings') {
      crumbs.push({ name: 'Settings', path: '/settings' });
    } else if (path === '/admin/users') {
      crumbs.push({ name: 'User Management', path: '/admin/users' });
    } else if (path === '/admin/audit') {
      crumbs.push({ name: 'System Audit Logs', path: '/admin/audit' });
    } else if (path === '/student/attendance') {
      crumbs.push({ name: 'Attendance Sheets', path: '/student/attendance' });
    } else if (path === '/student/facial-enrollment') {
      crumbs.push({ name: 'Facial Enrollment', path: '/student/facial-enrollment' });
    } else if (path === '/student/cctv') {
      crumbs.push({ name: 'CCTV Scanner Feed', path: '/student/cctv' });
    } else if (path !== '/') {
      crumbs.push({ name: 'Dashboard', path: '/' });
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-accent-50/80 via-white to-clinical-50/60 dark:from-slate-950 dark:via-accent-955/20 dark:to-clinical-950/20 transition-colors duration-200 relative overflow-hidden">
      
      {/* Ambient background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-accent-200/25 dark:bg-accent-950/30 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] aspect-square rounded-full bg-clinical-200/25 dark:bg-clinical-950/20 blur-[120px] pointer-events-none z-0" />

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-accent-50/80 dark:bg-accent-955/80 backdrop-blur-md border-b border-accent-200/30 dark:border-accent-900/20 sticky top-0 z-40 relative z-10">
        <div className="flex items-center space-x-2">
          <img src="/bu-cdm-logo.png" alt="BU CDM Logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="font-heading font-bold text-xl tracking-tight bg-gradient-to-r from-clinical-600 to-accent-600 dark:from-clinical-400 dark:to-accent-400 bg-clip-text text-transparent">
            DentiSys
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
          >
            {settings.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-accent-50/90 to-clinical-50/70 dark:from-accent-955/80 dark:to-clinical-950/70 backdrop-blur-md border-r border-accent-200/30 dark:border-accent-900/20 p-5 flex flex-col transition-all duration-300 ease-out md:translate-x-0 md:static relative z-10 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isSidebarCollapsed ? 'md:w-20' : 'md:w-72'}`}
      >
        
        {/* Brand Logo & Desktop Collapse Toggle */}
        <div className="flex items-center justify-between mb-8 px-1.5 relative">
          <div className="flex items-center space-x-3 min-w-0">
            <img src="/bu-cdm-logo.png" alt="BU CDM Logo" className="w-10 h-10 rounded-full object-cover shadow-lg shadow-clinical-500/20 flex-shrink-0" />
            {!isSidebarCollapsed && (
              <div className="transition-opacity duration-300">
                <h1 className="font-heading font-extrabold text-xl tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  DentiSys
                </h1>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                  BU College of Dental Medicine
                </p>
              </div>
            )}
          </div>

          {/* Desktop collapse button */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex absolute -right-8 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full glass border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 z-50 shadow-md"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const badgeValue = item.badge ? getBadgeValue(item.badge) : undefined;

            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center justify-between px-3 py-3 rounded-2xl transition-all duration-300 group ${
                  isActive
                    ? 'bg-gradient-to-r from-clinical-500/10 to-accent-500/10 text-clinical-600 dark:text-clinical-400 font-semibold border-l-4 border-clinical-500'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={isSidebarCollapsed ? item.name : undefined}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                    isActive ? 'text-clinical-500' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  }`} />
                  {!isSidebarCollapsed && (
                    <span className="text-sm font-medium truncate transition-opacity duration-300">{item.name}</span>
                  )}
                </div>
                {badgeValue !== undefined && !isSidebarCollapsed && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    {badgeValue}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer / User Profile Summary */}
        <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center space-x-3 px-1.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-clinical-200 to-accent-200 dark:from-clinical-800 dark:to-accent-900 flex items-center justify-center text-clinical-700 dark:text-clinical-300 font-bold font-heading flex-shrink-0">
            {initials}
          </div>
          {!isSidebarCollapsed && (
            <div className="flex-1 min-w-0 transition-opacity duration-300">
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {currentUser.name}
              </h2>
              <p className="text-[10px] text-slate-400 truncate">{currentUser.title}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        
        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-slate-200/40 dark:border-slate-900/40 bg-white/30 dark:bg-slate-950/20 backdrop-blur-md sticky top-0 z-30">
          
          {/* Dynamic Breadcrumbs Area */}
          <div className="flex flex-col space-y-1">
            <nav className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path + idx}>
                  {idx > 0 && <span className="text-slate-300 dark:text-slate-700">/</span>}
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">{crumb.name}</span>
                  ) : (
                    <Link to={crumb.path} className="hover:text-clinical-500 transition-colors">
                      {crumb.name}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
            <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100">
              {navItems.find(x => x.path === location.pathname)?.name || 'DentiSys Portal'}
            </h2>
          </div>

          {/* Right Header Navigation Panel */}
          <div className="flex items-center space-x-4">
            
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 transition-colors"
              title="Toggle theme"
            >
              {settings.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* Notification bell dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsProfileOpen(false);
                }}
                className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {criticalAlerts.length > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping border-2 border-white dark:border-slate-950" />
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                  <div className="absolute right-0 mt-3 w-80 glass rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl p-4 z-50 max-h-96 overflow-y-auto">
                    <h3 className="font-heading font-semibold text-sm mb-3 border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
                      <span>Alerts & Notifications</span>
                      <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-md font-bold">
                        {criticalAlerts.length} Warnings
                      </span>
                    </h3>
                    {criticalAlerts.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">No warning triggers active</p>
                    ) : (
                      <div className="space-y-2">
                        {criticalAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            onClick={() => {
                              navigate(alert.path);
                              setIsNotificationsOpen(false);
                            }}
                            className="p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-100/30 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs border border-amber-200/40 dark:border-amber-900/20 cursor-pointer transition-all"
                          >
                            {alert.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Interactive User profile dropdown menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotificationsOpen(false);
                }}
                className="flex items-center space-x-3 pl-3 py-1.5 pr-2 rounded-xl hover:bg-slate-100/60 dark:hover:bg-slate-900/60 transition-colors border-l border-slate-200 dark:border-slate-850"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-clinical-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  {initials}
                </div>
                <div className="text-left hidden lg:block">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">{currentUser.name}</div>
                  <span className="text-[9px] font-semibold text-emerald-500">{currentUser.title}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {isProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                  <div className="absolute right-0 mt-3 w-56 glass rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl p-2.5 z-50 space-y-1">
                    
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-850 pb-2 mb-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed in as</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">{currentUser.email}</p>
                    </div>

                    <Link
                      to="/profile"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>My Faculty Profile</span>
                    </Link>

                    <Link
                      to="/settings"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                    >
                      <SettingsIcon className="w-4 h-4 text-slate-400" />
                      <span>System Settings</span>
                    </Link>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-xs font-bold transition-all border-t border-slate-100 dark:border-slate-850/50 pt-2"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Sign Out</span>
                    </button>

                  </div>
                </>
              )}
            </div>

          </div>
        </header>

        {/* Scrollable Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>

      {/* Backdrop overlay for mobile drawer */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-40 md:hidden"
        />
      )}
    </div>
  );
};
