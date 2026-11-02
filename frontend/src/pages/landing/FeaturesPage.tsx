import React from 'react';
import {
  Users,
  ClipboardCheck,
  GraduationCap,
  LineChart,
  ArrowRight,
  HelpCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  {
    icon: Users,
    title: 'Classes and rosters',
    badge: 'Enrollment',
    description: 'Manage class sections, student enrollment lists, and course allocations without spreadsheet discrepancies.',
    tags: ['PDF / CSV import', 'Section tracking', 'Class secretary']
  },
  {
    icon: ClipboardCheck,
    title: 'Session attendance',
    badge: 'Verification',
    description: 'Accurate session logs for classroom lectures and laboratory periods with structured faculty review.',
    tags: ['Lecture & lab sessions', 'Faculty verification', 'Audit records']
  },
  {
    icon: GraduationCap,
    title: 'Grading and criteria',
    badge: 'BUCDM scale',
    description: 'Transparent grade computation adhering to approved BUCDM weighting and conversion standards.',
    tags: ['100% weight matrix', 'Official conversion table', 'Excel grade sheets']
  },
  {
    icon: LineChart,
    title: 'Retention monitoring',
    badge: 'Advising',
    description: 'Early visibility into student standing and remedial milestones to support academic progress proactively.',
    tags: ['Midterm watchlist', 'Remedial progression', 'Administrative reports']
  }
];

export function FeaturesPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-10 lg:px-16 overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-center gap-6 sm:gap-7">

        {/* HEADER */}
        <header className="flex flex-col gap-1.5">
          <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-4xl font-heading leading-tight">
            Core academic features in <span className="text-purple-600">DentiSYS</span>
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            Academic management tools built for the Bicol University College of Dental Medicine.
          </p>
        </header>

        {/* 4 FEATURE CARDS (TWO-TONE WITH CAPABILITY MICRO-PILLS) */}
        <section className="grid gap-4 sm:grid-cols-2" aria-label="DentiSYS features">
          {features.map(({ icon: Icon, title, badge, description, tags }) => (
            <article
              key={title}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition-colors hover:border-purple-200"
            >
              <div>
                {/* CARD TOP ROW */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-purple-700 shadow-2xs">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="text-sm font-bold font-heading text-slate-900">
                      {title}
                    </h2>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {badge}
                  </span>
                </div>

                {/* CARD SUMMARY */}
                <p className="mt-2.5 text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  {description}
                </p>
              </div>

              {/* CAPABILITY MICRO-PILLS */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-md border border-slate-200/80 bg-slate-50/70 px-2 py-0.5 text-[10px] text-slate-600 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        {/* FOOTER ACTIONS */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
          <p>
            Looking to learn more about portal roles and access?
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/about"
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-purple-700"
            >
              <span>View about DentiSYS</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/faqs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
            >
              <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
              <span>Frequently asked questions</span>
            </Link>
          </div>
        </footer>

      </div>
    </main>
  );
}
