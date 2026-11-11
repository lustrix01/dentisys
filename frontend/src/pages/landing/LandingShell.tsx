import React from 'react';
import { Mail, MapPin, Phone, LogIn, Menu, X } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [
  { to: '/#home', label: 'Home', id: 'home' },
  { to: '/#about', label: 'About', id: 'about' },
  { to: '/#features', label: 'Features', id: 'features' },
  { to: '/#faqs', label: 'FAQs', id: 'faqs' },
  { to: '/#contact', label: 'Contact', id: 'contact' },
];

export function LandingShell({ children }: { children?: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>('home');
  const location = useLocation();

  React.useEffect(() => setMenuOpen(false), [location.pathname]);

  // Track active section as user scrolls through landing page
  React.useEffect(() => {
    if (location.pathname !== '/') return;

    const sectionIds = ['home', 'about', 'features', 'faqs', 'contact'];
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 200;
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSection(sectionIds[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  // Scroll to hash on page load or navigation
  React.useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    }
  }, [location.pathname]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (location.pathname === '/') {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', `/#${id}`);
      }
    }
    setMenuOpen(false);
  };

  const isLinkActive = (id: string, to: string) => {
    if (location.pathname === '/') {
      return activeSection === id;
    }
    return location.pathname === to.replace('/#', '/');
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(139,92,246,0.15)_0%,rgba(139,92,246,0.06)_36%,transparent_72%)]" />
      </div>
      <header className="sticky top-0 z-50 w-full flex-shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 py-3 shadow-2xs sm:px-6 sm:py-3.5 md:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-start gap-3 sm:gap-6">
          <Link
            to="/#home"
            onClick={(e) => handleNavClick(e, 'home')}
            className="flex min-w-0 flex-col"
            aria-label="DentiSys home"
          >
              <span className="flex items-center gap-1.5 text-sm font-extrabold tracking-tight sm:text-lg md:text-xl">
              <span className="text-slate-900">BUCDM</span><span className="text-purple-600">DentiSYS</span>
            </span>
            <span className="hidden truncate text-[10px] font-medium text-slate-500 sm:block sm:text-[11px]">Bicol University College of Dental Medicine</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-7 lg:flex xl:gap-9" aria-label="Main navigation">
            {links.map(({ to, label, id }) => (
              <Link
                key={to}
                to={to}
                onClick={(e) => handleNavClick(e, id)}
                className={`whitespace-nowrap text-xs font-semibold transition-colors hover:text-slate-900 xl:text-sm ${
                  isLinkActive(id, to) ? 'text-purple-600 font-bold' : 'text-slate-600'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-3 md:gap-7 lg:ml-6">
            <span className="hidden h-5 w-px bg-slate-300 lg:block" aria-hidden="true" />
            <Link to="/login" className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-purple-600 px-2 py-2 text-[10px] font-semibold text-white shadow-md shadow-purple-600/20 transition-colors hover:bg-purple-700 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
              <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span>Portal login</span>
            </Link>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl p-1.5 text-slate-600 transition-colors hover:bg-slate-100 sm:p-2 lg:hidden" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="mt-3 space-y-1 border-t border-slate-200 px-1 pb-2 pt-3 lg:hidden" aria-label="Mobile navigation">
            {links.map(({ to, label, id }) => (
              <Link
                key={to}
                to={to}
                onClick={(e) => handleNavClick(e, id)}
                className={`block rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isLinkActive(id, to) ? 'bg-purple-50 text-purple-800 font-bold' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {children ?? <Outlet />}
      </div>

      <footer className="relative z-20 w-full flex-shrink-0 border-t border-slate-800 bg-slate-900 px-6 py-3.5 text-slate-400 sm:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center text-xs sm:flex-row sm:text-left">
          <span className="font-medium text-slate-300">© {new Date().getFullYear()} Bicol University College of Dental Medicine. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400 sm:justify-end sm:gap-6">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />Legazpi City</span>
            <a href="mailto:bu-cdm@bicol-u.edu.ph" className="inline-flex items-center gap-1.5 transition-colors hover:text-white"><Mail className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />bu-cdm@bicol-u.edu.ph</a>
            <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />(052) 480-0100</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
