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
  ChevronRight,
  Info,
  Layers,
  Building2,
  Menu,
  CheckCircle2,
  Clock,
  ShieldCheck
} from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <div className="min-h-screen min-h-[100dvh] w-full md:h-screen md:max-h-screen md:overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 relative select-none">

      {/* Soft purple hero wash with the existing dot pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(139,92,246,0.15)_0%,rgba(139,92,246,0.06)_36%,transparent_72%)] dark:bg-[radial-gradient(ellipse_at_50%_48%,rgba(139,92,246,0.18)_0%,rgba(139,92,246,0.07)_38%,transparent_74%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1.2px,transparent_1.2px)] dark:bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] [background-size:24px_24px] opacity-40" />
      </div>

      {/* 1. Header Navigation Bar */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs px-4 sm:px-6 md:px-12 py-3 sm:py-3.5 flex-shrink-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-6">

          {/* Left: Logo & Brand Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer min-w-0" onClick={() => navigate('/')}>
            <img
              src="/bu-cdm-logo.png"
              alt="BU CDM Seal"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shadow-sm flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base md:text-lg text-slate-900 dark:text-slate-100 tracking-tight">
                  BUCDM
                </span>
                <span className="font-extrabold text-sm sm:text-base md:text-lg text-purple-600 dark:text-purple-400 tracking-tight">
                  DentiSYS
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                Bicol University College of Dental Medicine
              </span>
            </div>
          </div>

          {/* Right: Navigation Links, Separator, Portal Login & Mobile Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-4 md:gap-7 flex-shrink-0">
            <nav className="hidden md:flex items-center gap-7 lg:gap-9">
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(true)}
                className="whitespace-nowrap text-xs lg:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
              >
                About
              </button>
              <button
                type="button"
                onClick={() => setIsFeaturesModalOpen(true)}
                className="whitespace-nowrap text-xs lg:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
              >
                Features
              </button>
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(true)}
                className="whitespace-nowrap text-xs lg:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
              >
                FAQs
              </button>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(true)}
                className="whitespace-nowrap text-xs lg:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
              >
                Contact
              </button>
            </nav>

            {/* Vertical Separator | */}
            <div className="hidden md:block h-5 w-px bg-slate-300 dark:bg-slate-700 mx-1 sm:mx-2" aria-hidden="true" />

            {/* Portal Login */}
            <button
              onClick={() => navigate('/login')}
              className="whitespace-nowrap rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-semibold text-xs sm:text-sm px-3.5 sm:px-5 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Portal Login</span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 sm:p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden pt-3 pb-2 border-t border-slate-200 dark:border-slate-800 mt-3 space-y-1">
            <button
              type="button"
              onClick={() => {
                setIsAboutModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <Info className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>About</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFeaturesModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Features</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFaqModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>FAQs</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsContactModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <Phone className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Contact Directory</span>
            </button>
          </div>
        )}
      </header>

      {/* 2. Main Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6 sm:px-12 py-4 relative min-h-0">
        <div className="relative z-10 max-w-5xl mx-auto w-full text-center space-y-5 sm:space-y-6 my-auto flex flex-col items-center">
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-[4rem] font-poppins font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.15]">
            Bicol University
            <span className="block text-purple-600 dark:text-purple-400 mt-1.5 sm:mt-2.5 font-poppins font-bold whitespace-nowrap">
              College of Dental Medicine
            </span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal max-w-2xl mx-auto">
            Official internal portal for student facial recognition check-in, live clinic geofencing, clinical grade computation, and automated student retention monitoring.
          </p>
        </div>
      </main>

      {/* 3. Dark Footer Bar */}
      <footer className="w-full bg-slate-900 text-slate-400 py-3.5 px-6 sm:px-12 border-t border-slate-800 flex-shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-center sm:text-left">

          {/* Left Copyright */}
          <div className="text-slate-300 font-medium">
            © 2026 Bicol University College of Dental Medicine. All rights reserved.
          </div>

          {/* Right Contact Info */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6 text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span>Legazpi City</span>
            </div>
            <a
              href="mailto:bu-cdm@bicol-u.edu.ph"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span>bu-cdm@bicol-u.edu.ph</span>
            </a>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span>(052) 480-0100</span>
            </div>
          </div>

        </div>
      </footer>

      {/* 4. About BUCDM Modal */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 select-text">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left space-y-4 max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => setIsAboutModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Building2 className="w-4 h-4" />
              <span>Institutional Overview</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              About Bicol University College of Dental Medicine
            </h3>

            <div className="space-y-3 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                The <strong>Bicol University College of Dental Medicine (BUCDM)</strong> is dedicated to producing clinically proficient, compassionate, and community-responsive dental health professionals who serve the Bicol Region and the nation.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Academic Excellence & Clinical Discipline</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5">
                  Our rigorous Doctor of Dental Medicine (DDM) curriculum combines rigorous classroom fundamentals with extensive patient care training across restorative dentistry, prosthodontics, periodontics, pediatric dentistry, and oral surgery.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>DentiSys Information Infrastructure</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5">
                  DentiSys is the college's dedicated clinical management system, ensuring strict integrity for clinical attendance, precision procedure evaluation, and proactive student retention tracking.
                </p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setIsAboutModalOpen(false)}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Features Modal */}
      {isFeaturesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 select-text">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left space-y-4 max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => setIsFeaturesModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Layers className="w-4 h-4" />
              <span>Core System Capabilities</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Features
            </h3>

            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Biometric Facial Check-in</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5.5 leading-relaxed">
                  Real-time liveness detection and facial recognition ensure non-repudiable student attendance at dental clinics and lecture halls without manual paper logs.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Geofenced Clinic Sessions</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5.5 leading-relaxed">
                  Class secretaries initiate active attendance sessions that enforce physical location coordinates within BU CDM clinic floors and operatories.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Authoritative Clinical Grading</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5.5 leading-relaxed">
                  Calculates periodic lecture and laboratory competencies with weighted component scores, transmutation matrices, and batch-signed faculty records.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Student Retention Monitoring</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 pl-5.5 leading-relaxed">
                  Monitors cumulative clinical deficiencies and alerts faculty and administrators early to provide remedial support before end-of-term deadlines.
                </p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setIsFeaturesModalOpen(false)}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Contact Directory Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 select-text">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left space-y-4 max-h-[90dvh] overflow-y-auto">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider">
              <Phone className="w-4 h-4" />
              <span>College Directory</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Contact BUCDM & Support
            </h3>

            <div className="space-y-3 pt-1 text-xs sm:text-sm">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-slate-100">Office of the Dean</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div>Bicol University College of Dental Medicine</div>
                  <div>Legazpi City, Albay, Philippines 4500</div>
                  <div>Email: <a href="mailto:bu-cdm@bicol-u.edu.ph" className="text-purple-600 dark:text-purple-400 hover:underline">bu-cdm@bicol-u.edu.ph</a></div>
                  <div>Telephone: (052) 480-0100</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-slate-100">DentiSys Technical Helpdesk</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div>Assistance with student account invitations, 2FA reset, or facial check-in queries:</div>
                  <div>Support Hours: Monday – Friday, 8:00 AM – 5:00 PM PHT</div>
                  <div>Internal Support: Room 204, BU CDM Administrative Wing</div>
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => {
                  setIsContactModalOpen(false);
                  navigate('/login');
                }}
                className="whitespace-nowrap py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
              >
                <span>Proceed to Portal Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsContactModalOpen(false)}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Clean FAQ Modal (No Glassmorphism) */}
      {isFaqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 select-text">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left space-y-4 max-h-[90dvh] overflow-y-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setIsFaqModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider">
              <HelpCircle className="w-4 h-4" />
              <span>DentiSYS Portal Support & FAQ</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Frequently Asked Questions
            </h3>

            {/* FAQ List */}
            <div className="space-y-3 pt-1">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ChevronRight className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
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
                className="whitespace-nowrap py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-purple-600/20 transition-all cursor-pointer"
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


