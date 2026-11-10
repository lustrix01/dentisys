import React, { useState } from 'react';
import {
  ChevronDown,
  ShieldCheck
} from 'lucide-react';

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
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-center gap-6 sm:gap-7">

        {/* HEADER */}
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
                className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-purple-200"
              >
                <button
                  type="button"
                  onClick={() => toggleQuestion(index)}
                  className="flex w-full items-center justify-between p-4 sm:p-5 text-left transition-colors hover:bg-slate-50/60"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2.5 pr-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-50 text-purple-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xs font-semibold text-slate-900 sm:text-sm">
                      {item.question}
                    </h2>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-purple-600' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5 sm:py-3.5">
                    <p className="text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                      {item.answer}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </section>

      </div>
    </main>
  );
}
