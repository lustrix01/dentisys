import React from 'react';
import { Mail, MapPin, Phone, LogIn, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/features', label: 'Features' },
  { to: '/faqs', label: 'FAQs' },
  { to: '/contact', label: 'Contact' },
];

export function LandingShell({ children }: { children?: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  React.useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(139,92,246,0.15)_0%,rgba(139,92,246,0.06)_36%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1.2px,transparent_1.2px)] [background-size:24px_24px] opacity-40" />
      </div>
      <header className="relative z-50 w-full flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-3.5 md:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-start gap-3 sm:gap-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="DentiSys home">
            <img src="/bu-cdm-logo.png" alt="Bicol University College of Dental Medicine seal" className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm sm:h-10 sm:w-10" />
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 text-sm font-extrabold tracking-tight sm:text-base md:text-lg">
                <span className="text-slate-900">BUCDM</span><span className="text-purple-600">DentiSYS</span>
              </span>
              <span className="hidden truncate text-[10px] font-medium text-slate-500 sm:block sm:text-[11px]">Bicol University College of Dental Medicine</span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-7 lg:flex xl:gap-9" aria-label="Main navigation">
            {links.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `whitespace-nowrap text-xs font-semibold transition-colors hover:text-slate-900 xl:text-sm ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-6 flex flex-shrink-0 items-center gap-2.5 sm:gap-4 md:gap-7">
            <span className="hidden h-5 w-px bg-slate-300 lg:block" aria-hidden="true" />
            <Link to="/login" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-purple-600/20 transition-colors hover:bg-purple-700 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm">
              <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span>Portal Login</span>
            </Link>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl p-1.5 text-slate-600 transition-colors hover:bg-slate-100 sm:p-2 lg:hidden" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && <nav className="mt-3 space-y-1 border-t border-slate-200 px-1 pb-2 pt-3 lg:hidden" aria-label="Mobile navigation">
          {links.map(({ to, label, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-purple-50 text-purple-800' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</NavLink>)}
        </nav>}
      </header>

      <div className="relative z-10 flex flex-1 flex-col">
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
