import React from 'react';

const faqs = [
  ['Who can create a DentiSys account?', 'Student and Faculty accounts are established through authorized invitations. Contact your college administrator or the person responsible for your invitation if you need access.'],
  ['How do I sign in?', 'Use your DentiSys institutional email and password, or Google Sign-In if it is available for your account.'],
  ['What if I cannot access my account?', 'Use the Forgot Password option on the sign-in page. For other access issues, contact your college’s designated DentiSys support contact.'],
  ['Where can I find support contact details?', 'Support contact information has not yet been confirmed for this page. Add the approved office contact details here.'],
];

export function FaqPage() {
  return (
    <main className="flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200/80 pb-5">
          <p className="text-sm font-semibold text-purple-700">DentiSYS help</p>
          <h1 className="mt-2 text-2xl font-extrabold font-heading text-slate-800 sm:text-3xl">Frequently asked questions</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">Basic information about DentiSys access and the portal.</p>
        </header>

        <section className="mt-6 grid gap-3 lg:grid-cols-2" aria-label="Frequently asked questions">
          {faqs.map(([question, answer], index) => (
            <article key={question} className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
              <span className="pt-0.5 text-xs font-bold tabular-nums text-purple-700">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="text-sm font-bold font-heading text-slate-800">{question}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
