import React from 'react';

export function LandingPage() {
  return <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16 sm:px-12">
    <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center space-y-5 text-center sm:space-y-6">
      <h1 className="font-poppins text-2xl font-bold leading-[1.15] tracking-tight text-slate-900 sm:text-4xl md:text-5xl lg:text-6xl xl:text-[4rem]">
        Bicol University
        <span className="mt-1.5 block font-poppins font-bold text-purple-600 sm:mt-2.5">College of Dental Medicine</span>
      </h1>
      <p className="mx-auto max-w-2xl text-sm font-normal leading-relaxed text-slate-600 sm:text-base md:text-lg">
        DentiSys brings class rosters, attendance, grade computation, reports, and retention monitoring together in one portal.
      </p>
    </div>
  </main>;
}
