import { CheckCircle2 } from 'lucide-react';
import { AboutPage } from './AboutPage';
import { FeaturesPage } from './FeaturesPage';
import { FaqPage } from './FaqPage';
import { ContactPage } from './ContactPage';

export function LandingPage() {
  return (
    <div className="relative flex flex-col">
      {/* HERO SECTION — 2-COLUMN SPLIT WITH CLEAN PROMINENT BU TORCH */}
      <section
        id="home"
        className="relative flex min-h-[calc(100vh-4.5rem)] scroll-mt-16 items-center justify-center px-6 py-12 sm:px-10 lg:px-16"
      >
        <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-12 lg:gap-14">
          
          {/* LEFT COLUMN: TITLE, VALUE PROPOSITION & ACADEMIC HIGHLIGHTS */}
          <div className="flex flex-col items-start text-left lg:col-span-7">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-5xl md:text-6xl font-heading leading-[1.12]">
              Bicol University
              <br />
              <span className="text-purple-600 lg:whitespace-nowrap">College of Dental Medicine</span>
            </h1>

            <p className="mt-4 max-w-xl text-sm font-normal leading-relaxed text-slate-600 sm:text-base md:text-lg">
              DentiSYS brings official class rosters, biometric session attendance, validated grade computation,
              and academic retention monitoring together under one unified college portal.
            </p>

            {/* INSTITUTIONAL METRICS STRIP */}
            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-slate-200/80 pt-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                Doctor of Dental Medicine (DMD)
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                Biometric Session Check-In
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                Official Registrar Grade Sheets
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: BU TORCH (CLEAN, BARE, BIGGER, NO CARD OR BORDER) */}
          <div className="flex items-center justify-center lg:col-span-5">
            <img
              src="/bu-torch.png"
              alt="Bicol University Torch - Flame of Wisdom and Excellence"
              className="h-72 w-auto object-contain sm:h-84 md:h-96 lg:h-[27rem] drop-shadow-sm select-none transition-transform duration-500 hover:scale-105"
            />
          </div>

        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="relative border-t border-slate-200/80 bg-slate-50/70 py-12 sm:py-16 scroll-mt-16">
        <AboutPage />
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="relative border-t border-slate-200/80 bg-white py-12 sm:py-16 scroll-mt-16">
        <FeaturesPage />
      </section>

      {/* FAQS SECTION */}
      <section id="faqs" className="relative border-t border-slate-200/80 bg-slate-50/70 py-12 sm:py-16 scroll-mt-16">
        <FaqPage />
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="relative border-t border-slate-200/80 bg-white py-12 sm:py-16 scroll-mt-16">
        <ContactPage />
      </section>
    </div>
  );
}
