import React from 'react';
import {
  Users,
  GraduationCap,
  MapPin,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  HelpCircle,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16 overflow-hidden">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-12 lg:gap-14">

        {/* LEFT COLUMN: STORY & ACTIONS */}
        <section className="flex flex-col justify-center lg:col-span-6 xl:col-span-7">
          <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-heading leading-tight">
            One academic portal for <span className="text-purple-600">BUCDM</span>
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base sm:leading-7">
            Built specifically for the faculty, secretary, and students of the Bicol University College of Dental Medicine.
            DentiSYS brings class enrollment, session attendance, academic requirements, and student retention into one unified academic workspace.
          </p>

          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm sm:leading-6">
            The portal replaces fragmented spreadsheets with reliable records for coursework, session attendance, and term-by-term progress.
          </p>

          {/* METADATA TAGS */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-purple-600" /> Legazpi City, Albay
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-purple-600" /> Established 2023
            </span>
          </div>

          {/* ACTION BUTTONS (NATURAL SENTENCE CASE) */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/features"
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700 sm:text-sm"
            >
              <span>Explore features</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/faqs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 sm:text-sm"
            >
              <HelpCircle className="h-4 w-4 text-purple-600" />
              <span>Frequently asked questions</span>
            </Link>
          </div>
        </section>

        {/* RIGHT COLUMN: PORTAL ROLES & ACCESS */}
        <section
          className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 lg:col-span-6 xl:col-span-5"
          aria-label="Portal roles and access"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 font-heading">
              Roles and Access
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              How each group works in DentiSYS
            </p>
          </div>

          {/* 4 ROLES (2x2 GRID) */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-purple-50/30 hover:border-purple-200">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                  <GraduationCap className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold text-slate-900">Students</h3>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Track enrolled sections, check session attendance, and review academic evaluations.
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-purple-50/30 hover:border-purple-200">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold text-slate-900">Faculty</h3>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Conduct roll calls, configure assessment criteria, and submit course evaluations.
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-purple-50/30 hover:border-purple-200">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                  <UserCheck className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold text-slate-900">Secretary</h3>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Organize section rosters, assist student enrollment imports, and coordinate records.
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-purple-50/30 hover:border-purple-200">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold text-slate-900">Administration</h3>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Configure academic terms, invite Faculty, review the audit trail, and generate official reports.
              </p>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
