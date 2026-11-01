import React from 'react';
import { 
  Mail, 
  MapPin, 
  Phone, 
  Clock, 
  ArrowRight,
  HelpCircle,
  Building2
} from 'lucide-react';
import { Link } from 'react-router-dom';

const contactChannels = [
  {
    icon: Building2,
    label: 'Office',
    primary: 'Office of the College Secretary',
    secondary: 'Bicol University College of Dental Medicine, Legazpi City'
  },
  {
    icon: Mail,
    label: 'Email address',
    primary: 'bu-cdm@bicol-u.edu.ph',
    secondary: 'Administrative and portal account inquiries'
  },
  {
    icon: Phone,
    label: 'Telephone line',
    primary: '(052) 480-0100',
    secondary: 'Direct college trunkline extension'
  },
  {
    icon: Clock,
    label: 'Office hours',
    primary: 'Monday – Friday, 8:00 AM – 5:00 PM',
    secondary: 'Excluding university and national holidays'
  }
];

export function ContactPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16 overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-center gap-6 sm:gap-7">
        
        {/* HEADER WITH PURPLE ACCENT PHRASE */}
        <header className="flex flex-col gap-1.5">
          <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-4xl font-heading leading-tight">
            Contact and support for <span className="text-purple-600">BUCDM</span>
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            Official administrative and technical contact channels for DentiSYS.
          </p>
        </header>

        {/* 4 CONTACT CARDS (2x2 GRID IN MAX-W-7XL) */}
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Contact channels">
          {contactChannels.map(({ icon: Icon, label, primary, secondary }) => (
            <article 
              key={label}
              className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition-colors hover:border-purple-200"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {label}
                </span>
                <h2 className="mt-0.5 text-sm font-bold font-heading text-slate-900">
                  {primary}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {secondary}
                </p>
              </div>
            </article>
          ))}
        </section>

        {/* FOOTER ACTIONS */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
          <p>
            Looking for quick answers about portal access or accounts?
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/faqs"
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Read FAQs</span>
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
            >
              <span>View about DentiSYS</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </footer>

      </div>
    </main>
  );
}

