import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  GraduationCap, 
  Video, 
  LogIn, 
  ArrowRight, 
  UserCheck, 
  MapPin, 
  Mail, 
  Phone 
} from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 relative select-none">
      
      {/* Formal Technical Grid Overlay matching Login Page */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* Background Decorative Blur Blobs matching Login Page */}
      <div className="absolute top-[-10%] right-[-5%] w-[480px] h-[480px] bg-accent-150/20 dark:bg-accent-950/10 rounded-full blur-[130px] pointer-events-none -z-20" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[480px] h-[480px] bg-clinical-150/15 dark:bg-clinical-950/5 rounded-full blur-[130px] pointer-events-none -z-20" />

      {/* 1. Header Navigation Bar */}
      <header className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/80 shadow-xs px-6 sm:px-10 py-3 flex-shrink-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          {/* Logo & Brand Info */}
          <div className="flex items-center space-x-3">
            <img 
              src="/bu-cdm-logo.png" 
              alt="BU CDM Seal" 
              className="w-10 h-10 rounded-full object-cover shadow-sm flex-shrink-0" 
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-heading font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 tracking-tight">
                  BUCDM
                </span>
                <span className="font-heading font-extrabold text-base sm:text-lg text-accent-600 dark:text-accent-400 tracking-tight">
                  DENTISYS
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold text-accent-700 dark:text-accent-300 bg-[#EAE5F8] dark:bg-accent-950/60 border border-accent-200/70 dark:border-accent-800/50 rounded-md ml-0.5">
                  v2.0
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-heading tracking-wide">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          {/* Top Right Action Button */}
          <button
            onClick={() => navigate('/login')}
            className="rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2 flex items-center gap-2 shadow-md shadow-accent-600/20 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Portal Login</span>
          </button>

        </div>
      </header>

      {/* 2. Main Hero Section (Balanced Proportionate Layout) */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-3 text-center relative overflow-hidden min-h-0">
        
        <div className="max-w-5xl mx-auto flex flex-col items-center justify-center w-full my-auto">
          
          {/* Access Level Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EAE5F8] dark:bg-accent-950/40 border border-accent-200/80 dark:border-accent-800/50 text-accent-800 dark:text-accent-300 text-xs font-bold mb-3 sm:mb-4 shadow-xs">
            <ShieldCheck className="w-4 h-4 text-accent-600 dark:text-accent-400 flex-shrink-0" />
            <span>Restricted Access — Admin, Faculty & Class Secretaries Only</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-heading tracking-tight leading-tight text-slate-800 dark:text-slate-100 max-w-3xl">
            Bicol University
            <span className="block text-accent-600 dark:text-accent-400 mt-1">
              College of Dental Medicine
            </span>
          </h1>

          {/* Subtitle Description */}
          <p className="mt-2.5 sm:mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed font-normal">
            Official internal portal for grade computation, retention monitoring, class attendance, and faculty administrative operations.
          </p>

          {/* 3. Role & Feature Cards Grid (Balanced 5xl width) */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5 mt-6 sm:mt-7 text-left max-w-5xl">
            
            {/* Card 1: Dean & Administration */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md shadow-slate-100 dark:shadow-none hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#EAE5F8] dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center mb-3.5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold font-heading text-accent-800 dark:text-accent-300 mb-1">
                  Dean & Administration
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Retention criteria rules, faculty approvals, and institutional audit trail reports.
                </p>
              </div>
            </div>

            {/* Card 2: Faculty Members */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md shadow-slate-100 dark:shadow-none hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#EAE5F8] dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center mb-3.5">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold font-heading text-accent-800 dark:text-accent-300 mb-1">
                  Faculty Members
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Grade encoding, automated retention evaluation, and student attendance logs.
                </p>
              </div>
            </div>

            {/* Card 3: Class Secretary */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200/60 dark:border-slate-800/80 shadow-md shadow-slate-100 dark:shadow-none hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#EAE5F8] dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center mb-3.5">
                  <Video className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold font-heading text-accent-800 dark:text-accent-300 mb-1">
                  Class Secretary
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Daily class attendance sheets, CCTV feed monitoring, and manual log overrides.
                </p>
              </div>
            </div>

          </div>

          {/* 4. Primary CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mt-6 sm:mt-7 w-full sm:w-auto">
            
            {/* Primary Access Button */}
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm px-6 py-3 flex items-center justify-center gap-2 shadow-lg shadow-accent-600/20 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Access Portal Login</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>

            {/* Secondary Activation Button */}
            <button
              onClick={() => navigate('/activate-secretary')}
              className="w-full sm:w-auto rounded-xl bg-white dark:bg-slate-900 hover:bg-accent-50/50 dark:hover:bg-slate-800 text-accent-600 dark:text-accent-400 border border-accent-300 dark:border-accent-700 font-bold text-xs sm:text-sm px-6 py-3 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Class Secretary Activation</span>
            </button>

          </div>

          {/* Policy Note */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 sm:mt-4 text-center max-w-lg font-medium leading-normal">
            Note: Dental students do not have direct portal logins. Records are managed through authorized faculty.
          </p>

        </div>
      </main>

      {/* 5. Dark Footer Bar */}
      <footer className="bg-slate-900 text-slate-400 py-2.5 px-6 sm:px-10 border-t border-slate-800 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-center sm:text-left">
          
          {/* Left Copyright */}
          <div className="text-slate-300 font-medium">
            © 2026 Bicol University College of Dental Medicine. All rights reserved.
          </div>

          {/* Right Contact Info */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-5 text-slate-400">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>Legazpi City</span>
            </div>
            <a 
              href="mailto:bu-cdm@bicol-u.edu.ph" 
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>bu-cdm@bicol-u.edu.ph</span>
            </a>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
              <span>(052) 480-0100</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
