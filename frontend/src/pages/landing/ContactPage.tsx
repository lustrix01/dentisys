import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';

const contactFields = [
  { icon: MapPin, label: 'Office or team', value: '[Add approved support contact]' },
  { icon: Mail, label: 'Email', value: '[Add approved email address]' },
  { icon: Phone, label: 'Telephone', value: '[Add approved telephone number]' },
  { icon: null, label: 'Office hours', value: '[Add confirmed office hours]' },
];

export function ContactPage() {
  return (
    <main className="flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200/80 pb-5">
          <p className="text-sm font-semibold text-purple-700">DentiSYS support</p>
          <h1 className="mt-2 text-2xl font-extrabold font-heading text-slate-800 sm:text-3xl">Get in touch</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">For account or portal questions, contact the designated DentiSys support office at Bicol University College of Dental Medicine.</p>
        </header>

        <section className="mt-6 max-w-4xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6" aria-labelledby="contact-details-heading">
          <h2 id="contact-details-heading" className="text-base font-bold font-heading text-slate-800">DentiSys support</h2>
          <dl className="mt-3 grid sm:grid-cols-2">
            {contactFields.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex gap-3 border-t border-slate-100 py-4 sm:even:pl-5">
                {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" aria-hidden="true" />}
                <div>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
          <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Replace bracketed fields with contact details approved for public display.</p>
        </section>
      </div>
    </main>
  );
}
