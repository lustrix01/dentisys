import { AboutPage } from './AboutPage';
import { FeaturesPage } from './FeaturesPage';
import { FaqPage } from './FaqPage';
import { ContactPage } from './ContactPage';

export function LandingPage() {
  return (
    <div className="relative flex flex-col">
      {/* HERO SECTION — 2-COLUMN SPLIT WITH THE DENTISYS LOGO */}
      <section
        id="home"
        className="relative flex min-h-[calc(100vh-4.5rem)] scroll-mt-16 items-center justify-center px-4 py-8 sm:px-10 sm:py-12 lg:px-16"
      >
        <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-6 sm:gap-10 lg:grid-cols-12 lg:gap-14">
          
          {/* LEFT COLUMN: TITLE, VALUE PROPOSITION & ACADEMIC HIGHLIGHTS */}
          <div className="flex min-w-0 flex-col items-center text-center lg:col-span-7 lg:items-start lg:text-left">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-5xl md:text-6xl font-heading leading-[1.12]">
              Bicol University
              <br />
              <span className="text-purple-600 lg:whitespace-nowrap">College of Dental Medicine</span>
            </h1>

            <p className="mt-4 max-w-xl text-sm font-normal leading-relaxed text-slate-600 sm:text-base md:text-lg">
              DentiSYS brings official class rosters, biometric session attendance, validated grade computation,
              and academic retention monitoring together under one unified college portal.
            </p>

          </div>

          {/* RIGHT COLUMN: DENTISYS LOGO */}
          <div className="flex items-center justify-center lg:col-span-5">
            <img
              src="/dentisys-logo.png"
              alt="DentiSYS logo"
              className="h-36 w-auto max-w-full object-contain mix-blend-multiply sm:h-48 md:h-64 lg:h-[22.5rem] drop-shadow-sm select-none transition-transform duration-500 hover:scale-105"
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
