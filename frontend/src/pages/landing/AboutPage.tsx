import React from 'react';

export function AboutPage() {
  return (
    <main className="grid flex-1 grid-cols-1 bg-transparent md:grid-cols-5">
      <section className="flex items-center px-7 py-12 sm:px-12 md:col-span-3 lg:px-20">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-purple-700">About DentiSYS</p>
          <h1 className="mt-6 text-3xl font-bold leading-snug tracking-tight text-slate-800 sm:text-4xl lg:text-5xl">
            One academic portal for BUCDM
          </h1>
          <p className="mt-7 max-w-4xl text-base leading-8 text-slate-600 sm:text-lg sm:leading-9">
            DentiSYS brings class rosters, attendance, grade records, reports, and student retention information together for the Bicol University College of Dental Medicine.
          </p>
        </div>
      </section>

      <figure className="relative min-h-[300px] overflow-hidden md:col-span-2 md:min-h-0">
        <div className="absolute inset-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-900/10 md:inset-4">
          <img
            src="/bicol-university-college-of-medicine.jpg"
            alt="Bicol University College of Medicine building"
            className="h-full w-full object-cover opacity-80"
          />
        </div>
      </figure>
    </main>
  );
}
