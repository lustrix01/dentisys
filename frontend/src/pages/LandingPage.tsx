import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogIn,
  ArrowRight,
  HelpCircle,
  MapPin,
  Mail,
  Phone,
  X,
  ChevronRight
} from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  const faqs = [
    {
      q: 'Who can access the DentiSys Portal?',
      a: 'Authorized Bicol University College of Dental Medicine students, clinical faculty, class secretaries, and college administrators.'
    },
    {
      q: 'How does biometric attendance check-in work?',
      a: 'Students perform instant facial verification using their camera while physically located within designated clinic geofenced coordinates.'
    },
    {
      q: 'How are clinical grades and retention monitored?',
      a: 'The system automatically computes required clinical procedure metrics, completed patient cases, and alerts faculty of retention criteria boundaries in real time.'
    },
    {
      q: 'How do I request access or reset my credentials?',
      a: 'Click "Sign In to DentiSys Portal" and use the Forgot Password link, or contact the BU CDM IT Helpdesk.'
    }
  ];

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 relative select-none">

      {/* Technical Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-75 pointer-events-none -z-10" />

      {/* 1. Header Navigation Bar */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs px-6 sm:px-12 py-3.5 flex-shrink-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* Logo & Brand Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <img
              src="/bu-cdm-logo.png"
              alt="BU CDM Seal"
              className="w-10 h-10 rounded-full object-cover shadow-sm flex-shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100 tracking-tight">
                  BUCDM
                </span>
                <span className="font-heading font-extrabold text-base sm:text-lg text-accent-600 dark:text-accent-400 tracking-tight">
                  DENTISYS
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-heading tracking-wide">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          {/* Top Right Portal Login Button */}
          <button
            onClick={() => navigate('/login')}
            className="rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs sm:text-sm px-5 py-2.5 flex items-center gap-2 shadow-md shadow-accent-600/20 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Portal Login</span>
          </button>

        </div>
      </header>

      {/* 2. Main Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-6 relative overflow-hidden min-h-0">
        <div className="max-w-4xl mx-auto w-full text-center space-y-6 sm:space-y-7 my-auto flex flex-col items-center">

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold font-heading tracking-tight leading-[1.12] text-slate-900 dark:text-slate-100">
            Bicol University
            <span className="block text-accent-600 dark:text-accent-400 mt-1">
              College of Dental Medicine
            </span>
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal max-w-2xl mx-auto">
            Official internal portal for student facial recognition check-in, live clinic geofencing, clinical grade computation, and automated student retention monitoring.
          </p>

          {/* Dual Action CTA Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={() => navigate('/login')}
              className="rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base px-7 py-3.5 flex items-center gap-2.5 shadow-lg shadow-accent-600/20 transition-all cursor-pointer"
            >
              <LogIn className="w-5 h-5" />
              <span>Sign In to DentiSYS Portal</span>
            </button>

            <button
              onClick={() => setIsFaqModalOpen(true)}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 active:scale-[0.99] text-slate-700 dark:text-slate-200 font-bold text-sm sm:text-base px-6 py-3.5 flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            >
              <HelpCircle className="w-5 h-5 text-accent-600 dark:text-accent-400" />
              <span>Browse FAQ</span>
            </button>
          </div>

        </div>
      </main>

      {/* 3. Dark Footer Bar */}
      <footer className="bg-slate-900 text-slate-400 py-3 px-6 sm:px-12 border-t border-slate-800 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-center sm:text-left">

          {/* Left Copyright */}
          <div className="text-slate-300 font-medium">
            © 2026 Bicol University College of Dental Medicine. All rights reserved.
          </div>

          {/* Right Contact Info */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6 text-slate-400">
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

      {/* 4. Clean FAQ Modal (No Glassmorphism) */}
      {isFaqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 select-text">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left space-y-4">
            
            {/* Close Button */}
            <button
              onClick={() => setIsFaqModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-2 text-accent-600 dark:text-accent-400 text-xs font-bold uppercase tracking-wider font-heading">
              <HelpCircle className="w-4 h-4" />
              <span>DentiSYS Portal Support & FAQ</span>
            </div>
            <h3 className="text-xl font-bold font-heading text-slate-900 dark:text-white">
              Frequently Asked Questions
            </h3>

            {/* FAQ List */}
            <div className="space-y-3 pt-1">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ChevronRight className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400 flex-shrink-0" />
                    <span>{faq.q}</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 pl-5 leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>

            {/* Modal Action Footer */}
            <div className="pt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Need further assistance?</span>
              <button
                onClick={() => {
                  setIsFaqModalOpen(false);
                  navigate('/login');
                }}
                className="py-2.5 px-5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Proceed to Portal Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}


