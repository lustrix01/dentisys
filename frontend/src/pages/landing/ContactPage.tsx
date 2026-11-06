import React from 'react';
import {
  Mail,
  Building2,
  Phone,
  Clock
} from 'lucide-react';

export function ContactPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16">
      <div className="mx-auto grid w-full max-w-7xl items-start gap-10 lg:grid-cols-12 lg:gap-14">

        {/* LEFT COLUMN: UNIQUE BUCDM CONTACT INTRO */}
        <div className="flex flex-col items-start text-left lg:col-span-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl font-heading leading-tight">
            Connect with the{' '}
            <span className="text-purple-600">College of Dental Medicine</span>
          </h1>

          <p className="mt-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
            For questions about portal credentials, class roster verification, or official college records,
            reach out directly to our administrative team in Legazpi City.
          </p>

          <div className="mt-6">
            <a
              href="mailto:bu-cdm@bicol-u.edu.ph"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700 sm:text-sm"
            >
              <Mail className="h-4 w-4" />
              <span>Send official inquiry</span>
            </a>
          </div>
        </div>

        {/* RIGHT COLUMN: DIRECTORY CHANNELS */}
        <div className="flex flex-col gap-6 lg:col-span-7">

          {/* SECTION 1: ACADEMIC OFFICES */}
          <div>
            <div className="flex flex-col gap-3">
              {/* College Secretary */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-purple-200">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 font-heading">
                    Office of the College Secretary
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Student rosters, section appointments, and official registrar coordination
                  </p>
                </div>
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              </div>

              {/* DentiSYS Support */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-purple-200">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 font-heading">
                    DentiSYS Academic Helpdesk
                  </h2>
                  <a
                    href="mailto:bu-cdm@bicol-u.edu.ph"
                    className="mt-0.5 inline-block text-xs font-medium text-purple-600 hover:underline"
                  >
                    bu-cdm@bicol-u.edu.ph
                  </a>
                </div>
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>
          </div>

          {/* SECTION 2: TELEPHONE & SCHEDULE */}
          <div>
            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Trunkline */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <Phone className="h-3 w-3 text-purple-600" />
                  <span>College Trunkline</span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900 sm:text-base">
                  (052) 480-0100
                </p>
              </div>

              {/* Operating Hours */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <Clock className="h-3 w-3 text-purple-600" />
                  <span>Campus Office Hours</span>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900 sm:text-base">
                  Mon – Fri • 8:00 AM – 5:00 PM
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </main>
  );
}
