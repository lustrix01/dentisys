import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogIn, GraduationCap, Scale, MapPin } from 'lucide-react';

export function AboutPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slideDuration = 6000;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const totalSlides = 3;

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, slideDuration);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, currentSlide]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        
        {/* UNIFIED CONTAINER — EXACT SAME FIXED SIZE ACROSS ALL SLIDES */}
        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="flex h-[480px] sm:h-[460px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-10 transition-all"
        >
          {/* SLIDE CONTENT AREA (FILLS VERTICAL SPACE EQUALLY) */}
          <div className="flex flex-1 flex-col justify-center">

            {/* SLIDE 1: TEXT ON LEFT, BUCDM SEAL ON RIGHT (NO BACKGROUND CARD, NO GAP) */}
            {currentSlide === 0 && (
              <div className="mx-auto flex w-full max-w-5xl flex-col-reverse items-center justify-center gap-8 md:flex-row md:gap-24 lg:gap-32 animate-fade-in">
                
                {/* LEFT: TEXT & INFORMATION */}
                <div className="flex-1 flex flex-col items-start text-left max-w-xl">
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl md:text-4xl lg:text-[2.6rem] font-heading leading-tight">
                    <span className="text-purple-600">DentiSYS</span> Academic Portal
                    <span className="mt-1.5 block text-base font-semibold text-slate-700 sm:text-xl md:text-2xl font-heading">
                      College of Dental Medicine
                    </span>
                  </h2>

                  <p className="mt-3.5 text-xs leading-relaxed text-slate-600 sm:text-sm sm:leading-6">
                    The central records system for BUCDM dental education. Designed for students,
                    faculty, and administration to manage official section rosters, record daily session
                    attendance, and compute midterm and final grades according to university conversion tables.
                  </p>

                  <div className="mt-5 flex items-center gap-2 overflow-x-auto text-[11px] sm:text-xs text-slate-600">
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium whitespace-nowrap">
                      <GraduationCap className="h-3.5 w-3.5 text-purple-600" />
                      <span>Doctor of Dental Medicine (DMD)</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium whitespace-nowrap">
                      <Scale className="h-3.5 w-3.5 text-purple-600" />
                      <span>Official Transmuted Rating Scale</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium whitespace-nowrap">
                      <MapPin className="h-3.5 w-3.5 text-purple-600" />
                      <span>Legazpi City Campus</span>
                    </span>
                  </div>
                </div>

                {/* RIGHT: BARE BUCDM SEAL (NO BACKGROUND CARD, BALANCED DIRECT PROXIMITY) */}
                <div className="flex shrink-0 items-center justify-center">
                  <img
                    src="/bu-cdm-logo.png"
                    alt="Bicol University College of Dental Medicine Seal"
                    className="h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 object-contain shrink-0 select-none drop-shadow-sm transition-transform hover:scale-105"
                  />
                </div>

              </div>
            )}

            {/* SLIDE 2: USER ROLES */}
            {currentSlide === 1 && (
              <div className="flex flex-col justify-center animate-fade-in">
                <div className="mb-5 text-center sm:text-left">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl font-heading">
                    Who Uses DentiSYS
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                    Access is organized into four academic roles, each with designated tools and permissions.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Dean / Admin */}
                  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-slate-300 hover:bg-white">
                    <div>
                      <span className="text-[11px] font-bold tracking-wider text-purple-600 uppercase">
                        Administration
                      </span>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 font-heading">
                        Dean & Admin Staff
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        Reviews college-wide grade reports, monitors student retention and remedial cases, and oversees academic terms.
                      </p>
                    </div>
                  </div>

                  {/* Faculty */}
                  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-slate-300 hover:bg-white">
                    <div>
                      <span className="text-[11px] font-bold tracking-wider text-purple-600 uppercase">
                        Teaching Faculty
                      </span>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 font-heading">
                        Course Instructors
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        Imports official section lists, verifies lecture and laboratory attendance, computes scores, and exports grade sheets.
                      </p>
                    </div>
                  </div>

                  {/* Class Secretary */}
                  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-slate-300 hover:bg-white">
                    <div>
                      <span className="text-[11px] font-bold tracking-wider text-purple-600 uppercase">
                        Class Officer
                      </span>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 font-heading">
                        Class Secretaries
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        Helps instructors by recording roll call entries during class hours and submitting them for instructor approval.
                      </p>
                    </div>
                  </div>

                  {/* Students */}
                  <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-slate-300 hover:bg-white">
                    <div>
                      <span className="text-[11px] font-bold tracking-wider text-purple-600 uppercase">
                        Enrolled Scholars
                      </span>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 font-heading">
                        Dental Students
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                        Checks in to daily classes, monitors individual attendance percentages, and views official midterm and final marks.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SLIDE 3: SIGN IN */}
            {currentSlide === 2 && (
              <div className="flex flex-col justify-center animate-fade-in">
                <div className="grid items-center gap-6 lg:grid-cols-12 lg:gap-8">
                  
                  {/* Left: How to sign in */}
                  <div className="flex flex-col text-left lg:col-span-7">
                    <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl font-heading">
                      Signing In to the System
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                      Accounts are registered through the college office. You can access your account using either method:
                    </p>

                    <div className="mt-4 space-y-2.5">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <h3 className="text-xs font-bold text-slate-900 sm:text-sm font-heading">
                          1. University Google Account
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          Sign in directly with your official <code className="rounded bg-slate-200/70 px-1 py-0.5 text-[11px] text-slate-800">@bicol-u.edu.ph</code> student or faculty email address.
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <h3 className="text-xs font-bold text-slate-900 sm:text-sm font-heading">
                          2. Email & Password
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          Use the password given during account creation. Optional two-factor authenticator app codes can be enabled.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Direct Sign-In Card */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center lg:col-span-5">
                    <h3 className="text-base font-bold text-slate-900 sm:text-lg font-heading">
                      Access Your Portal
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                      Sign in to open your enrolled courses, record attendance, or view grades.
                    </p>

                    <Link
                      to="/login"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700 sm:text-sm"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>Proceed to Portal Login</span>
                    </Link>

                    <span className="mt-3 text-[11px] text-slate-500">
                      Need help signing in? Contact the Office of the College Secretary.
                    </span>
                  </div>

                </div>
              </div>
            )}

          </div>

          {/* BOTTOM CONTROLS: CLEAN MINIMAL SLIDE DOTS & CHEVRONS */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            
            {/* MINIMAL SLIDE DOTS */}
            <div className="flex items-center gap-2">
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    currentSlide === idx
                      ? 'w-7 bg-purple-600'
                      : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>

            {/* PREV / NEXT BUTTONS */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous slide"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next slide"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

          </div>

        </div>

      </div>
    </main>
  );
}
