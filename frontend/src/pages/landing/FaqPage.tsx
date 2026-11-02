import React, { useState } from 'react';
import {
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { Link } from 'react-router-dom';

const faqItems = [
  {
    question: 'Who can create a DentiSYS account?',
    answer: 'Student and faculty accounts are established through authorized institutional invitations issued by the college administration or assigned faculty.'
  },
  {
    question: 'How do I sign in to the portal?',
    answer: 'Use your institutional email and DentiSYS password. If enabled on your account, Google Sign-In with authenticator-app two-factor authentication can also be used.'
  },
  {
    question: 'What should I do if I cannot access my account?',
    answer: 'Use the forgot password option on the sign-in page to reset your credentials. For two-factor recovery or account lockouts, contact the college administrative office.'
  },
  {
    question: 'How are student grades and attendance recorded?',
    answer: 'Faculty record session attendance and assessment scores. Class Secretaries can request attendance changes, which the Faculty approve. Computed grades follow the official BUCDM conversion tables.'
  },
  {
    question: 'Who coordinates section enrollment and rosters?',
    answer: 'Faculty import the official class list for each of their classes and invite their students at the start of each term.'
  }
];

export function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleQuestion = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16 overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-center gap-6 sm:gap-7">

        {/* HEADER WITH PURPLE ACCENT PHRASE */}
        <header className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-4xl font-heading leading-tight">
            Frequently asked questions about <span className="text-purple-600">DentiSYS</span>
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            Common questions regarding accounts, authentication, and academic records at BUCDM.
          </p>
        </header>

        {/* ACCORDION DROPDOWN LIST */}
        <section className="flex flex-col gap-2.5" aria-label="Questions and answers">
          {faqItems.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <article
                key={item.question}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs transition-colors hover:border-purple-200"
              >
                <button
                  type="button"
                  onClick={() => toggleQuestion(index)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors sm:px-5 sm:py-3.5"
                  aria-expanded={isOpen}
                >
                  <span className="text-xs font-bold font-heading text-slate-900 sm:text-sm">
                    {item.question}
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50'}`}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
                    <p className="text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                      {item.answer}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {/* FOOTER ACTIONS */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
          <p>
            Have a question that is not addressed here?
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Contact support</span>
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
