import React from 'react';
import { ClipboardCheck, GraduationCap, LineChart, Users } from 'lucide-react';

const features = [
  { icon: Users, title: 'Classes and rosters', body: 'Create and manage class sections, student lists, and enrollment.' },
  { icon: ClipboardCheck, title: 'Attendance', body: 'Manage attendance sessions and review attendance records.' },
  { icon: GraduationCap, title: 'Assessments and grades', body: 'Organize assessments, record scores, and compute course grades using saved grading configurations.' },
  { icon: LineChart, title: 'Reports and retention', body: 'Review grade reports, attendance information, and student retention status.' },
];

export function FeaturesPage() {
  return (
    <main className="flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-slate-200/80 pb-5">
          <p className="text-sm font-semibold text-purple-700">DentiSYS</p>
          <h1 className="mt-2 text-2xl font-extrabold font-heading text-slate-800 sm:text-3xl">Features</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">Tools available in DentiSys depend on your account role and assigned access.</p>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2" aria-label="DentiSys features">
          {features.map(({ icon: Icon, title, body }) => (
            <article key={title} className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-bold font-heading text-slate-800">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
