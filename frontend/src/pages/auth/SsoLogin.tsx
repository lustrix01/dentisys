import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, GraduationCap, Video, ArrowLeft, KeyRound } from 'lucide-react';

export function SsoLogin() {
  const navigate = useNavigate();

  const handleRoleSelect = (email: string) => {
    // In production, this will initiate BU ICTO OAuth2/OIDC Single Sign-On.
    // During development, redirect to the dev password login interface pre-filled with email.
    navigate(`/login/dev?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 relative select-none">
      
      {/* Formal Technical Grid Overlay matching App Design System */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* Decorative Blur Blobs */}
      <div className="absolute top-[-10%] right-[-5%] w-[450px] h-[450px] bg-accent-150/20 dark:bg-accent-950/10 rounded-full blur-[120px] pointer-events-none -z-20" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[450px] h-[450px] bg-clinical-150/15 dark:bg-clinical-950/5 rounded-full blur-[120px] pointer-events-none -z-20" />

      {/* 1. Header Navigation Bar */}
      <header className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/80 shadow-xs px-4 sm:px-8 py-2.5 flex-shrink-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo & Brand Info */}
          <div className="flex items-center space-x-3">
            <img 
              src="/bu-cdm-logo.png" 
              alt="BU CDM Seal" 
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shadow-sm flex-shrink-0" 
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-heading font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 tracking-tight">
                  BUCDM
                </span>
                <span className="font-heading font-extrabold text-base sm:text-lg text-accent-600 dark:text-accent-400 tracking-tight">
                  DENTISYS
                </span>
                <span className="px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-accent-700 dark:text-accent-300 bg-[#EAE5F8] dark:bg-accent-950/60 border border-accent-200/70 dark:border-accent-800/50 rounded-md">
                  v2.0
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-heading tracking-wide">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          {/* Top Right Action Button */}
          <button
            onClick={() => navigate('/')}
            className="rounded-full bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2 flex items-center gap-1.5 shadow-md shadow-accent-600/20 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>

        </div>
      </header>

      {/* 2. Main Login Card Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 min-h-0 overflow-y-auto lg:overflow-hidden">
        
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/60 dark:border-slate-800/80 shadow-xl shadow-slate-100 dark:shadow-none text-center relative z-10 my-auto">
          
          {/* Status Badge */}
          <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-[#EAE5F8] dark:bg-accent-950/60 border border-accent-200/70 dark:border-accent-800/50 text-accent-700 dark:text-accent-300 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider mb-4">
            BU SINGLE SIGN-ON
          </div>

          {/* Main Card Title */}
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
            Select User Role
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed font-normal">
            Choose your authorized role to sign in with your official BU account
          </p>

          {/* 3 Selectable Role Cards */}
          <div className="mt-6 space-y-3 text-left">
            
            {/* Role 1: Dean & Administration */}
            <div 
              onClick={() => handleRoleSelect('admin@bicol-u.edu.ph')}
              className="w-full bg-[#F8F9FA] dark:bg-slate-800/50 hover:bg-[#F4F1FA] dark:hover:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl bg-accent-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-accent-600/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                  Dean & Administration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  System rules, faculty approvals & audit trails
                </p>
              </div>
            </div>

            {/* Role 2: Faculty Members */}
            <div 
              onClick={() => handleRoleSelect('faculty@bicol-u.edu.ph')}
              className="w-full bg-[#F8F9FA] dark:bg-slate-800/50 hover:bg-[#F4F1FA] dark:hover:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl bg-accent-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-accent-600/20 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                  Faculty Members
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Grade computation & student retention tracking
                </p>
              </div>
            </div>

            {/* Role 3: Class Secretary */}
            <div 
              onClick={() => handleRoleSelect('secretary@bicol-u.edu.ph')}
              className="w-full bg-[#F8F9FA] dark:bg-slate-800/50 hover:bg-[#F4F1FA] dark:hover:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all group cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl bg-accent-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-accent-600/20 group-hover:scale-105 transition-transform">
                <Video className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                  Class Secretary
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Attendance sheets & CCTV feed monitoring
                </p>
              </div>
            </div>

          </div>

          {/* Bottom Subtext */}
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-5">
            Official BU Single Sign-On Portal (@bicol-u.edu.ph)
          </p>

          {/* Discreet Developer Entry Point */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <button
              onClick={() => navigate('/login/dev')}
              className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 hover:text-accent-600 dark:hover:text-accent-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <KeyRound className="w-3 h-3" />
              <span>Dev Mode: Direct Password Login</span>
            </button>
          </div>

        </div>
      </main>

      {/* 3. Dark Footer Bar */}
      <footer className="bg-slate-900 text-slate-400 py-2.5 px-4 sm:px-8 border-t border-slate-800 flex-shrink-0 text-center text-xs">
        <div className="max-w-7xl mx-auto text-slate-300 font-medium">
          © 2026 Bicol University College of Dental Medicine. All rights reserved.
        </div>
      </footer>

    </div>
  );
}
