import React, { useState, useEffect, useCallback } from 'react';
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
  User,
  ClipboardPenLine,
  Video,
  ListChecks,
  Mail,
  UserCheck,
  UserPlus,
  BookOpen,
  Camera,
  History,
  Play,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { isDevelopmentMockStudent, isStudentPrototypeAllowed, canAccessAuthoritativeStudentBiometrics } from '../pages/student/studentGates';
import { getNotificationsApi, markNotificationReadApi, markAllNotificationsReadApi } from '../services/apiClient';
import type { NotificationItem } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  name: string;
  path: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  sectionHeader?: string;
};

const ROLE_TITLES: Record<string, string> = {
  admin: 'Office of the Dean',
  faculty: 'Dental Faculty Member',
  secretary: 'Class Secretary',
  student: 'Dental Student',
};

const AppBackedLayout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const currentUser = {
    name: user?.display_name ?? '',
    email: user?.login_email ?? '',
    role: user?.role ?? 'faculty',
    authentication_source: user?.authentication_source ?? 'password',
  };

  const getInitials = (fullName: string) => {
    if (!fullName) return 'U';
    const parts = fullName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '').split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0] ? parts[0][0].toUpperCase() : 'U';
  };

  const initials = getInitials(currentUser.name);

  const getRoleColors = (role: string) => {
    switch (role) {
      case 'admin':
        return {
          bgGradient: 'from-accent-500/20 to-accent-600/20 dark:from-accent-500/25 dark:to-accent-600/25',
          textActive: 'text-accent-600 dark:text-accent-300 font-bold border-l-4 border-accent-500 bg-accent-500/10 dark:bg-accent-500/20',
          iconActive: 'text-accent-600 dark:text-accent-400',
          iconHover: 'group-hover:text-accent-600 dark:group-hover:text-accent-300',
          logoRing: 'shadow-accent-500/20',
          avatarBg: 'from-accent-500 to-accent-600 dark:from-accent-600 dark:to-accent-700',
          avatarText: 'text-white font-bold font-heading',
          crumbHover: 'hover:text-accent-500',
          roleLabelText: 'text-accent-500',
          hoverBg: 'hover:bg-accent-50/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white',
          sidebarGradient: 'from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
        };
      case 'secretary':
        return {
          bgGradient: 'from-blue-500/20 to-blue-600/20 dark:from-blue-500/25 dark:to-blue-600/25',
          textActive: 'text-blue-600 dark:text-blue-300 font-bold border-l-4 border-blue-500 bg-blue-500/10 dark:bg-blue-500/20',
          iconActive: 'text-blue-600 dark:text-blue-400',
          iconHover: 'group-hover:text-blue-600 dark:group-hover:text-blue-300',
          logoRing: 'shadow-blue-500/20',
          avatarBg: 'from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700',
          avatarText: 'text-white font-bold font-heading',
          crumbHover: 'hover:text-blue-500',
          roleLabelText: 'text-blue-500',
          hoverBg: 'hover:bg-blue-50/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white',
          sidebarGradient: 'from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
        };
      case 'student':
        return {
          bgGradient: 'from-blue-500/20 to-blue-600/20 dark:from-blue-500/25 dark:to-blue-600/25',
          textActive: 'text-blue-600 dark:text-blue-300 font-bold border-l-4 border-blue-500 bg-blue-500/10 dark:bg-blue-500/20',
          iconActive: 'text-blue-600 dark:text-blue-400',
          iconHover: 'group-hover:text-blue-600 dark:group-hover:text-blue-300',
          logoRing: 'shadow-blue-500/20',
          avatarBg: 'from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700',
          avatarText: 'text-white font-bold font-heading',
          crumbHover: 'hover:text-blue-500',
          roleLabelText: 'text-blue-500',
          hoverBg: 'hover:bg-blue-50/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white',
          sidebarGradient: 'from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
        };
      case 'faculty':
      default:
        return {
          bgGradient: 'from-clinical-500/20 to-accent-500/20 dark:from-clinical-500/25 dark:to-accent-500/25',
          textActive: 'text-clinical-600 dark:text-clinical-300 font-bold border-l-4 border-clinical-500 bg-clinical-500/10 dark:bg-clinical-500/20',
          iconActive: 'text-clinical-600 dark:text-clinical-400',
          iconHover: 'group-hover:text-clinical-600 dark:group-hover:text-clinical-300',
          logoRing: 'shadow-clinical-500/20',
          avatarBg: 'from-clinical-500 to-accent-600 dark:from-clinical-600 dark:to-accent-700',
          avatarText: 'text-white font-bold font-heading',
          crumbHover: 'hover:text-clinical-500',
          roleLabelText: 'text-emerald-500',
          hoverBg: 'hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white',
          sidebarGradient: 'from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
        };
    }
  };
  const colors = getRoleColors(currentUser.role);

  const { settings, updateSettings, students } = useApp();
  const config = useRuntimeConfig();
  const studentPrototypeEnabled = isStudentPrototypeAllowed(user, config, 'dashboard');
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

  const handleLogout = async () => {
    await logout();
    setIsProfileOpen(false);
    navigate('/login', { replace: true });
  };

  const getNavItems = (): NavItem[] => {
    if (currentUser.role === 'admin') {
      return [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Faculty Invitations', path: '/admin/faculty-invite', icon: UserPlus },
        { name: 'Reports & Analytics', path: '/admin/reports', icon: FileSpreadsheet },
        { name: 'Audit Trail', path: '/admin/audit-trail', icon: ListChecks },
        { name: 'Dean Profile', path: '/admin/profile', icon: UserCircle },
        { name: 'Dean Settings', path: '/admin/settings', icon: SettingsIcon },
      ];
    }
    
    if (currentUser.role === 'secretary') {
      return [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Start New Session', path: '/secretary/start-session', icon: Play },
        { name: 'Attendance List', path: '/secretary/attendance', icon: CalendarDays },
        { name: 'Manual Override', path: '/secretary/override', icon: ClipboardPenLine },
        { name: 'My Activity Log', path: '/secretary/audit-trail', icon: ListChecks },
        { name: 'Secretary Profile', path: '/secretary/profile', icon: UserCircle },
        { name: 'Settings', path: '/secretary/settings', icon: SettingsIcon },
      ];
    }

    if (currentUser.role === 'student') {
      const items: NavItem[] = [
        { name: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
      ];
      if (canAccessAuthoritativeStudentBiometrics(user) || isStudentPrototypeAllowed(user, config, 'attendance')) {
        items.push({ name: 'Daily Attendance', path: '/student/attendance', icon: Camera });
      }
      if (canAccessAuthoritativeStudentBiometrics(user) || isStudentPrototypeAllowed(user, config, 'attendance_logs')) {
        items.push({ name: 'Attendance Logs', path: '/student/attendance-logs', icon: History });
      }
      if (canAccessAuthoritativeStudentBiometrics(user) || isStudentPrototypeAllowed(user, config, 'face')) {
        items.push({ name: 'Face Registration', path: '/student/face-registration', icon: UserCheck });
      }
      // Academic self-service is backed by the Student-role endpoints. Keep
      // it visible for canonical Student accounts in every real auth mode;
      // development mock Students remain gated by the prototype predicate.
      if (user?.role === 'student' && (canAccessAuthoritativeStudentBiometrics(user) || isStudentPrototypeAllowed(user, config, 'academic'))) {
        items.push(
          { name: 'My Classes', path: '/student/classes', icon: BookOpen },
          { name: 'Retention Monitoring', path: '/student/retention', icon: AlertTriangle },
        );
      }
      items.push({ name: 'My Profile', path: '/student/profile', icon: UserCircle });
      return items;
    }
    
    // Faculty (default)
    return [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'My Classes & Rosters', path: '/classes', icon: BookOpen },
      { name: 'Grade Computation', path: '/grades', icon: Calculator },
      { name: 'Retention Monitoring', path: '/retention', icon: AlertTriangle, badge: 'retention' },
      { name: 'Attendance Monitoring', path: '/attendance', icon: CalendarDays },
      { name: 'Reports & Export', path: '/reports', icon: FileSpreadsheet },
      { name: 'Email Management', path: '/email-management', icon: Mail },
      { name: 'My Activity Log', path: '/faculty/audit-trail', icon: ListChecks },
      { name: 'My Profile', path: '/faculty/profile', icon: UserCircle },
      { name: 'Faculty Settings', path: '/faculty/settings', icon: SettingsIcon },
    ];
  };

  const navItems = getNavItems();

  // Persistent notifications state and actions
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setNotificationsLoading(true);
      const res = await getNotificationsApi({ limit: 50 });
      setNotifications(res.notifications || []);
      setUnreadCount(typeof res.unreadCount === 'number' ? res.unreadCount : 0);
    } catch {
      // Gracefully preserve notifications state if endpoint temporarily unreachable
    } finally {
      setNotificationsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (rawId: number | string) => {
    const id = String(rawId);
    try {
      await markNotificationReadApi(id);
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => String(n.id) === id ? { ...n, readAt: now } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsReadApi();
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || now })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const filteredNotifications = notificationFilter === 'unread'
    ? notifications.filter(n => !n.readAt)
    : notifications;

  const renderNotificationsDropdown = () => (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
      <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 max-h-[28rem] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-sm text-slate-800 dark:text-slate-100">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setNotificationFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
              notificationFilter === 'all'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setNotificationFilter('unread')}
            className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
              notificationFilter === 'unread'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {notificationsLoading ? (
            <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Loading notifications…</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <p className="text-xs font-semibold">
                {notificationFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const isUnread = !item.readAt;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isUnread) void handleMarkAsRead(item.id);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isUnread
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-900/40 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      : 'bg-slate-50/50 dark:bg-slate-850/40 border-slate-100 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-bold ${isUnread ? 'text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-200'}`}>
                      {item.title}
                    </p>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {item.body}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
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

    if (path === '/classes' || path === '/students' || path === '/faculty/classes-rosters') {
      crumbs.push({ name: 'My Classes & Rosters', path: '/classes' });
    } else if (path === '/grades') {
      crumbs.push({ name: 'Grade Computation', path: '/grades' });
    } else if (path === '/retention' || path === '/student/retention') {
      crumbs.push({ name: 'Retention Monitoring', path: path });
    } else if (path === '/attendance') {
      crumbs.push({ name: 'Attendance Monitoring', path: '/attendance' });
    } else if (path === '/reports') {
      crumbs.push({ name: 'Reports & Export', path: '/reports' });
    } else if (path === '/email-management') {
      crumbs.push({ name: 'Email Management', path: '/email-management' });
    } else if (path === '/faculty/profile') {
      crumbs.push({ name: 'My Profile', path: '/faculty/profile' });
    } else if (path === '/faculty/settings') {
      crumbs.push({ name: 'Faculty Settings', path: '/faculty/settings' });
    } else if (path === '/admin/profile') {
      crumbs.push({ name: 'Dean Profile', path: '/admin/profile' });
    } else if (path === '/admin/settings') {
      crumbs.push({ name: 'Dean Settings', path: '/admin/settings' });
    } else if (path === '/secretary/profile') {
      crumbs.push({ name: 'My Profile', path: '/secretary/profile' });
    } else if (path === '/secretary/settings') {
      crumbs.push({ name: 'Settings', path: '/secretary/settings' });
    } else if (path === '/admin/faculty-invite') {
      crumbs.push({ name: 'Faculty Invitations', path: '/admin/faculty-invite' });
    } else if (path === '/admin/retention-criteria') {
      crumbs.push({ name: 'Retention Criteria', path: '/admin/retention-criteria' });
    } else if (path === '/admin/reports') {
      crumbs.push({ name: 'Reports & Analytics', path: '/admin/reports' });
    } else if (path === '/admin/audit-trail') {
      crumbs.push({ name: 'Audit Trail', path: '/admin/audit-trail' });
    } else if (path === '/secretary/start-session') {
      crumbs.push({ name: 'Start Class Session', path: '/secretary/start-session' });
    } else if (path === '/secretary/attendance') {
      crumbs.push({ name: 'Attendance List', path: '/secretary/attendance' });
    } else if (path === '/secretary/override') {
      crumbs.push({ name: 'Manual Override', path: '/secretary/override' });
    } else if (path === '/secretary/audit-trail') {
      crumbs.push({ name: 'My Activity Log', path: '/secretary/audit-trail' });
    } else if (path === '/faculty/audit-trail') {
      crumbs.push({ name: 'My Activity Log', path: '/faculty/audit-trail' });
    } else if (path === '/student/dashboard') {
      crumbs.push({ name: 'Student Dashboard', path: '/student/dashboard' });
    } else if (path === '/student/attendance') {
      crumbs.push({ name: 'Daily Attendance', path: '/student/attendance' });
    } else if (path === '/student/attendance-logs') {
      crumbs.push({ name: 'Attendance Logs', path: '/student/attendance-logs' });
    } else if (path === '/student/face-registration') {
      crumbs.push({ name: 'Face Registration', path: '/student/face-registration' });
    } else if (path === '/student/classes') {
      crumbs.push({ name: 'My Classes & Retention', path: '/student/classes' });
    } else if (path === '/student/profile') {
      crumbs.push({ name: 'My Profile', path: '/student/profile' });
    } else if (path !== '/') {
      crumbs.push({ name: 'Dashboard', path: '/' });
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col relative overflow-hidden font-sans">
      
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-accent-200/25 dark:bg-accent-950/30 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] aspect-square rounded-full bg-clinical-200/25 dark:bg-clinical-950/20 blur-[120px] pointer-events-none z-0" />

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800 sticky top-0 z-40 relative z-10">
        <div className="flex items-center space-x-2">
          <img src="/bu-cdm-logo.png" alt="BU CDM Logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="font-heading font-bold text-xl tracking-tight bg-gradient-to-r from-clinical-600 to-accent-600 dark:from-clinical-400 dark:to-accent-400 bg-clip-text text-transparent">
            DentiSYS
          </span>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Mobile Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const willOpen = !isNotificationsOpen;
                setIsNotificationsOpen(willOpen);
                setIsProfileOpen(false);
                if (willOpen) void fetchNotifications();
              }}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 relative cursor-pointer"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[1rem] h-[1rem] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 border-white dark:border-slate-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {isNotificationsOpen && renderNotificationsDropdown()}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
          >
            {settings.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          {/* Mobile User Profile Avatar Trigger */}
          <div className="relative">
            <button
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationsOpen(false);
              }}
              className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${colors.avatarBg} ${colors.avatarText} text-xs font-extrabold flex items-center justify-center shadow-xs cursor-pointer`}
              title="Profile menu"
            >
              {initials}
            </button>

            {isProfileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2.5 z-50 space-y-1">
                  
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 pb-2 mb-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed in as</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">{currentUser.email}</p>
                  </div>

                  <Link
                    to={currentUser.role === 'admin' ? '/admin/profile' : currentUser.role === 'secretary' ? '/secretary/profile' : currentUser.role === 'student' ? '/student/profile' : '/faculty/profile'}
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>{currentUser.role === 'admin' ? 'My Dean Profile' : currentUser.role === 'secretary' ? 'My Secretary Profile' : currentUser.role === 'student' ? 'My Profile' : 'My Faculty Profile'}</span>
                  </Link>

                  {currentUser.role !== 'student' && (
                    <Link
                      to={currentUser.role === 'admin' ? '/admin/settings' : currentUser.role === 'secretary' ? '/secretary/settings' : '/faculty/settings'}
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                    >
                      <SettingsIcon className="w-4 h-4 text-slate-400" />
                      <span>{currentUser.role === 'admin' ? 'System Settings' : 'My Settings'}</span>
                    </Link>
                  )}

                  {currentUser.role === 'secretary' && user?.student && (
                    <Link
                      to="/student/attendance"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs font-semibold transition-all"
                    >
                      <UserCheck className="w-4 h-4 text-blue-500" />
                      <span>Switch to Student View</span>
                    </Link>
                  )}

                  {currentUser.role === 'student' && user?.role === 'secretary' && (
                    <Link
                      to="/"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-xs font-semibold transition-all"
                    >
                      <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                      <span>Return to Secretary View</span>
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-xs font-bold transition-all border-t border-slate-100 dark:border-slate-800 pt-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>

                </div>
              </>
            )}
          </div>

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Navigation — fixed on desktop, drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b ${colors.sidebarGradient} border-r border-slate-200/80 dark:border-slate-800 p-5 flex flex-col transition-all duration-300 ease-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isSidebarCollapsed ? 'md:w-20' : 'md:w-72'}`}
      >
        
        {/* Brand Logo & Desktop Collapse Toggle */}
        <div className="flex items-center justify-between mb-8 px-1.5 relative">
          <div className="flex items-center space-x-3 min-w-0">
            <img src="/bu-cdm-logo.png" alt="BU CDM Logo" className={`w-10 h-10 rounded-full object-cover shadow-lg ${colors.logoRing} flex-shrink-0`} />
            {!isSidebarCollapsed && (
              <div className="transition-opacity duration-300">
                <h1 className="font-heading font-extrabold text-xl tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  DentiSYS
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
          {navItems.map((item, idx) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            const badgeValue = item.badge ? getBadgeValue(item.badge) : undefined;

            return (
              <React.Fragment key={item.name + idx}>
                {item.sectionHeader && (
                  <div className={`px-3 ${idx === 0 ? 'pt-1' : 'pt-4'} pb-1.5`}>
                    {!isSidebarCollapsed ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400 opacity-90 block">
                        {item.sectionHeader}
                      </span>
                    ) : (
                      idx > 0 && <div className="border-t border-slate-200/60 dark:border-slate-800/60 my-2" />
                    )}
                  </div>
                )}
                <Link
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center justify-between px-3 py-3 rounded-2xl transition-all duration-300 group ${
                    isActive
                      ? `bg-gradient-to-r ${colors.bgGradient} ${colors.textActive}`
                      : `text-slate-600 dark:text-slate-300 ${colors.hoverBg}`
                  }`}
                  title={isSidebarCollapsed ? item.name : undefined}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                      isActive ? colors.iconActive : `text-slate-400 dark:text-slate-400 ${colors.iconHover}`
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
              </React.Fragment>
            );
          })}
        </nav>

        {/* Sidebar Footer / User Profile Summary */}
        <div className="pt-4 mt-auto border-t border-slate-200/80 dark:border-slate-800/80 flex items-center space-x-3 px-1.5 min-w-0">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${colors.avatarBg} flex items-center justify-center ${colors.avatarText} flex-shrink-0 shadow-sm`}>
            {initials}
          </div>
          {!isSidebarCollapsed && (
            <div className="flex-1 min-w-0 transition-opacity duration-300">
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {currentUser.name}
              </h2>
              <p className="text-[10px] text-slate-400 truncate">{ROLE_TITLES[currentUser.role] || ''}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container — offset by sidebar width, fills remaining height, scrolls independently */}
      <div className={`flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10 transition-all duration-300 ${
        isSidebarCollapsed ? 'md:ml-20' : 'md:ml-72'
      }`}>
        
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
                    <Link to={crumb.path} className={`${colors.crumbHover} transition-colors`}>
                      {crumb.name}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
            <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100">
              {navItems.find(x => x.path === location.pathname)?.name || 'DentiSYS Portal'}
            </h2>
          </div>

          {/* Right Header Navigation Panel */}
          <div className="flex items-center space-x-3">

            {/* Secretary / Student Linked Account Context Switch */}
            {currentUser.role === 'secretary' && user?.student && (
              <button
                type="button"
                onClick={() => navigate('/student/attendance')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-500/20 transition-all cursor-pointer"
                title="Switch to Linked Student Self-Service"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Student View</span>
              </button>
            )}
            {currentUser.role === 'student' && user?.role === 'secretary' && (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-500/20 transition-all cursor-pointer"
                title="Return to Secretary Dashboard"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Secretary View</span>
              </button>
            )}
            
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
                type="button"
                onClick={() => {
                  const willOpen = !isNotificationsOpen;
                  setIsNotificationsOpen(willOpen);
                  setIsProfileOpen(false);
                  if (willOpen) void fetchNotifications();
                }}
                className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 transition-colors relative cursor-pointer"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-white dark:border-slate-950">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && renderNotificationsDropdown()}
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
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${colors.avatarBg} flex items-center justify-center ${colors.avatarText} text-sm shadow-md`}>
                  {initials}
                </div>
                  <div className="text-left hidden lg:block">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">{currentUser.name}</div>
                  <span className={`text-[9px] font-semibold ${colors.roleLabelText}`}>{ROLE_TITLES[currentUser.role] || ''}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {isProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                  <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2.5 z-50 space-y-1">
                    
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 pb-2 mb-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed in as</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">{currentUser.email}</p>
                    </div>

                    <Link
                      to={currentUser.role === 'admin' ? '/admin/profile' : currentUser.role === 'secretary' ? '/secretary/profile' : currentUser.role === 'student' ? '/student/profile' : '/faculty/profile'}
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>{currentUser.role === 'admin' ? 'My Dean Profile' : currentUser.role === 'secretary' ? 'My Secretary Profile' : currentUser.role === 'student' ? 'My Profile' : 'My Faculty Profile'}</span>
                    </Link>

                    {currentUser.role !== 'student' && (
                      <Link
                        to={currentUser.role === 'admin' ? '/admin/settings' : currentUser.role === 'secretary' ? '/secretary/settings' : '/faculty/settings'}
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-slate-650 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 hover:text-slate-850 dark:hover:text-slate-100 text-xs font-semibold transition-all"
                      >
                        <SettingsIcon className="w-4 h-4 text-slate-400" />
                        <span>{currentUser.role === 'admin' ? 'System Settings' : 'My Settings'}</span>
                      </Link>
                    )}

                    {currentUser.role === 'secretary' && user?.student && (
                      <Link
                        to="/student/dashboard"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-xs font-semibold transition-all"
                      >
                        <UserCheck className="w-4 h-4 text-blue-500" />
                        <span>Switch to Student View</span>
                      </Link>
                    )}

                    {currentUser.role === 'student' && user?.role === 'secretary' && (
                      <Link
                        to="/"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-xs font-semibold transition-all"
                      >
                        <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                        <span>Return to Secretary View</span>
                      </Link>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-xs font-bold transition-all border-t border-slate-100 dark:border-slate-800 pt-2 cursor-pointer"
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
          {currentUser.role === 'student' && isDevelopmentMockStudent(user, config) && !studentPrototypeEnabled && (
            <div className="mb-6 p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Student attendance and biometric workflows are development-only browser prototypes. No authoritative attendance record or facial template is written while the explicit P02 providers are disabled.
            </div>
          )}
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

const RealStudentLayout: React.FC<LayoutProps> = ({ children }) => {
  return <AppBackedLayout>{children}</AppBackedLayout>;
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const config = useRuntimeConfig();
  return user?.role === 'student' && !isDevelopmentMockStudent(user, config)
    ? <RealStudentLayout>{children}</RealStudentLayout>
    : <AppBackedLayout>{children}</AppBackedLayout>;
};
