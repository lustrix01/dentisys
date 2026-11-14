import React, { useState } from 'react';
import {
  Users,
  Camera,
  GraduationCap,
  LineChart,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ScanFace,
  ShieldCheck,
  AlertTriangle,
  BarChart3
} from 'lucide-react';

export function FeaturesPage() {
  const [activeIndex, setActiveIndex] = useState(0);

  const modules = [
    {
      id: '01',
      icon: Users,
      title: 'Classes & Official Rosters',
      description: 'Import official PDF or CSV class lists, maintain student directories, and appoint class secretaries.'
    },
    {
      id: '02',
      icon: Camera,
      title: 'Attendance & Facial Recognition',
      description: 'Face verification with liveness detection, geofenced clinic boundaries, and faculty approval.'
    },
    {
      id: '03',
      icon: GraduationCap,
      title: 'Grade Computation & Weight Matrix',
      description: 'Validated 100% weight matrices with 50/50 Midterm and Finals transmutation scales.'
    },
    {
      id: '04',
      icon: LineChart,
      title: 'Retention Monitoring & Analytics',
      description: 'College-wide standing distribution, remedial progress metrics, and early student warning advisories.'
    }
  ];

  const prevSlide = () => {
    setActiveIndex((prev) => (prev === 0 ? modules.length - 1 : prev - 1));
  };

  const nextSlide = () => {
    setActiveIndex((prev) => (prev === modules.length - 1 ? 0 : prev + 1));
  };

  return (
    <main className="flex w-full min-w-0 flex-1 items-center justify-center px-4 sm:px-6 lg:px-12">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 sm:gap-8">

        {/* HEADER */}
        <header className="flex flex-col gap-1 text-left">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl md:text-4xl font-heading leading-tight">
            Inside the <span className="text-purple-600">DentiSYS</span> academic portal
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            Explore the specialized workflows engineered for BUCDM dental education.
          </p>
        </header>

        {/* SHOWCASE SECTION */}
        <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">

          {/* LEFT: VERTICAL STACK SELECTORS (1-COLUMN) */}
          <div className="flex min-w-0 flex-col justify-between gap-2.5 lg:col-span-4">
            {modules.map((item, idx) => {
              const isSelected = activeIndex === idx;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`flex min-w-0 w-full flex-1 items-start gap-3.5 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/70 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-slate-50/70'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
                      isSelected
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {item.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-purple-600' : 'text-slate-400'}`} />
                      <h2 className={`min-w-0 break-words text-sm font-bold font-heading ${isSelected ? 'text-purple-900' : 'text-slate-900'}`}>
                        {item.title}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* RIGHT: REAL DENTISYS WORKSPACE VIEW (ONE CONSISTENT FIXED SIZE FOR ALL 4 SHOWCASES) */}
          <div className="flex min-h-[520px] h-auto min-w-0 w-full flex-col justify-between gap-3 overflow-visible rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 lg:h-[500px] lg:gap-0 lg:overflow-hidden lg:col-span-8">

            {/* TOP BAR WITH TITLE & CONTROLS (UNIFIED ACROSS ALL SHOWCASES) */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold tracking-wide text-purple-600">
                    Module {activeIndex + 1}
                  </span>
                  <h3 className="break-words text-base font-bold text-slate-900 lg:truncate sm:text-lg font-heading">
                    {activeIndex === 0 && 'DENT 211 - Oral Histology & Embryology (Lecture)'}
                    {activeIndex === 1 && 'Session #12 • Clinic Roll Call (Biometric Scanner)'}
                    {activeIndex === 2 && 'Course Gradebook • 50% Midterm / 50% Finals Split'}
                    {activeIndex === 3 && 'Academic Retention & Clinical Milestone Analytics'}
                  </h3>
                  <p className="mt-0.5 break-words text-xs text-slate-500 lg:truncate">
                    {activeIndex === 0 && 'S.Y. 2026-2027 • 1st Semester • Block A • 38 Enrolled Students'}
                    {activeIndex === 1 && 'Room 204 Clinic Hall • Geofence Radius: 150m • Start: 8:00 AM'}
                    {activeIndex === 2 && '100% Validated Matrix: Term Exam (50%), Quiz (20%), Outputs (20%), Participation (10%)'}
                    {activeIndex === 3 && 'Evaluated Status: 92% Good Standing • 5% Academic Warning • 3% Remedial Priority'}
                  </p>
                </div>

                {/* SLIDE NAVIGATION CONTROLS */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevSlide}
                    aria-label="Previous module preview"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {modules.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveIndex(i)}
                        aria-label={`Go to slide ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${
                          activeIndex === i ? 'w-5 bg-purple-600' : 'w-1.5 bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={nextSlide}
                    aria-label="Next module preview"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* DYNAMIC CONTENT AREA BASED ON ACTIVE SHOWCASE */}
            <div className="min-w-0 py-3 lg:flex-1 lg:overflow-hidden">

              {/* ─────────────────────────────────────────────────────────────
                  SHOWCASE 1: OFFICIAL CLASS ROSTER TABLE
              ───────────────────────────────────────────────────────────── */}
              {activeIndex === 0 && (
                <div className="flex flex-col gap-4 animate-fade-in lg:h-full lg:justify-between lg:gap-0">
                  <div>
                    {/* Action badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                        <span>PDF / CSV Roster · Excel Grades</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                        <span>Secretary Appointed</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
                        <span>Directory Synchronized</span>
                      </span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[520px] text-left text-xs lg:min-w-0">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3.5 py-2.5">Student No.</th>
                            <th className="px-3.5 py-2.5">Student Name</th>
                            <th className="px-3.5 py-2.5">Sex</th>
                            <th className="px-3.5 py-2.5">Enrollment Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3.5 py-2.5 font-medium text-slate-800">2023-10042</td>
                            <td className="px-3.5 py-2.5 text-slate-700 font-semibold">Lumbang, Owhie M.</td>
                            <td className="px-3.5 py-2.5 text-slate-600">Male</td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Enrolled
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3.5 py-2.5 font-medium text-slate-800">2023-10089</td>
                            <td className="px-3.5 py-2.5 text-slate-700 font-semibold">Alvarez, Sofia L.</td>
                            <td className="px-3.5 py-2.5 text-slate-600">Female</td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Enrolled
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3.5 py-2.5 font-medium text-slate-800">2023-10115</td>
                            <td className="px-3.5 py-2.5 text-slate-700 font-semibold">Santos, Juan Carlos</td>
                            <td className="px-3.5 py-2.5 text-slate-600">Male</td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                Class Secretary
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3.5 py-2.5 font-medium text-slate-800">2023-10144</td>
                            <td className="px-3.5 py-2.5 text-slate-700 font-semibold">De Vera, Alyssa Mae</td>
                            <td className="px-3.5 py-2.5 text-slate-600">Female</td>
                            <td className="px-3.5 py-2.5">
                              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Enrolled
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                    Automated roster parsing from Bicol University official registrar PDF exports.
                  </p>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  SHOWCASE 2: LIVE FACE SCANNING & BIOMETRIC VERIFICATION
              ───────────────────────────────────────────────────────────── */}
              {activeIndex === 1 && (
                <div className="flex flex-col gap-4 animate-fade-in lg:h-full lg:justify-between lg:gap-0">
                  <div className="grid min-h-[320px] items-stretch gap-4 lg:h-full lg:grid-cols-12">

                    {/* CAMERA VIEWFINDER WITH RETICLE & FACE SCAN TARGET */}
                    <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-4 text-white lg:h-full lg:col-span-7">

                      {/* SCANNER OVERLAY HEADER */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 font-mono text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Live biometric scan
                        </span>
                        <span className="font-mono text-slate-400">YuNet + SFace Engine</span>
                      </div>

                      {/* VIEWFINDER RETICLE & FACE TARGET */}
                      <div className="relative my-auto flex items-center justify-center py-4">

                        {/* TARGET CORNERS */}
                        <div className="relative flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-emerald-500/60 bg-emerald-950/20">
                          <ScanFace className="h-16 w-16 text-emerald-400 opacity-90 animate-pulse" />

                          {/* Corner markers */}
                          <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-emerald-400" />
                          <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-emerald-400" />
                          <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-emerald-400" />
                          <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-emerald-400" />

                          {/* Scan line effect */}
                          <div className="absolute inset-x-2 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80" />
                        </div>

                      </div>

                      {/* SCANNER TELEMETRY FOOTER */}
                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 border-t border-slate-800 pt-2">
                        <span>Liveness: <strong className="text-emerald-400">Verified</strong></span>
                        <span>Confidence: <strong className="text-emerald-400">98.4%</strong></span>
                        <span>Geofence: <strong className="text-emerald-400">In bounds</strong></span>
                      </div>
                    </div>

                    {/* RIGHT: ATTENDANCE VERIFICATION CARD */}
                    <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 lg:h-full lg:gap-0 lg:col-span-5">
                      <div>
                        <span className="text-[10px] font-bold tracking-wider text-purple-700">
                          Attendance Record
                        </span>

                        <div className="mt-2.5 flex items-center gap-2.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-700 font-heading text-sm">
                            OL
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 font-heading">
                              Lumbang, Owhie M.
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono">2023-10042 • DMD 3</p>
                          </div>
                        </div>

                        <div className="mt-3.5 space-y-2 text-xs">
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                            <span className="text-slate-500">Status</span>
                            <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 border border-emerald-200 text-[10px]">
                              Present
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                            <span className="text-slate-500">Check-in Time</span>
                            <span className="font-mono font-semibold text-slate-800">8:02 AM</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                            <span className="text-slate-500">Method</span>
                            <span className="font-medium text-slate-800">Facial Recognition</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Geofence Pin</span>
                            <span className="font-mono text-emerald-700">120m / 150m (Valid)</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center text-[11px] font-semibold text-emerald-800">
                        Attendance confirmed without raw photos stored.
                      </div>
                    </div>

                  </div>

                  <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                    On-device vector embeddings verify attendance while strictly protecting student privacy.
                  </p>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  SHOWCASE 3: AUTHENTIC 100% GRADING WEIGHT MATRIX
              ───────────────────────────────────────────────────────────── */}
              {activeIndex === 2 && (
                <div className="flex flex-col gap-4 animate-fade-in lg:h-full lg:justify-between lg:gap-0">
                  <div>
                    {/* MATRIX WEIGHT FORMULA BAR */}
                    <div className="mb-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-purple-900 font-heading">
                          Approved 100% Period Weight Matrix:
                        </span>
                        <span className="rounded bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Formula validated
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4">
                        <div className="rounded-lg bg-white border border-purple-200 p-1.5">
                          <span className="text-slate-500 block">Term Exam</span>
                          <strong className="text-purple-700 font-bold">50%</strong>
                        </div>
                        <div className="rounded-lg bg-white border border-purple-200 p-1.5">
                          <span className="text-slate-500 block">Quiz</span>
                          <strong className="text-purple-700 font-bold">20%</strong>
                        </div>
                        <div className="rounded-lg bg-white border border-purple-200 p-1.5">
                          <span className="text-slate-500 block">Outputs</span>
                          <strong className="text-purple-700 font-bold">20%</strong>
                        </div>
                        <div className="rounded-lg bg-white border border-purple-200 p-1.5">
                          <span className="text-slate-500 block">Participation</span>
                          <strong className="text-purple-700 font-bold">10%</strong>
                        </div>
                      </div>
                    </div>

                    {/* MATRIX COMPUTATION TABLE */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[760px] text-left text-xs lg:min-w-0">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Student Name</th>
                            <th className="px-3 py-2 text-center">Term Exam (50%)</th>
                            <th className="px-3 py-2 text-center">Quiz (20%)</th>
                            <th className="px-3 py-2 text-center">Outputs (20%)</th>
                            <th className="px-3 py-2 text-center">Participation (10%)</th>
                            <th className="px-3 py-2 text-center">Midterm</th>
                            <th className="px-3 py-2 text-center">Finals</th>
                            <th className="px-3 py-2 text-right">Transmuted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-900">Lumbang, Owhie M.</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">95.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">92.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">96.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">96.0%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">94.7%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">91.0%</td>
                            <td className="px-3 py-2 text-right">
                              <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">
                                1.25 (Passed)
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-900">Alvarez, Sofia L.</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">86.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">89.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">90.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">97.0%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">88.5%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">87.0%</td>
                            <td className="px-3 py-2 text-right">
                              <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">
                                1.50 (Passed)
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-medium text-slate-900">Santos, Juan Carlos</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">80.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">84.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">82.0%</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">88.0%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">82.0%</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">84.5%</td>
                            <td className="px-3 py-2 text-right">
                              <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200">
                                1.75 (Passed)
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                    50% Midterm and 50% Finals automatic transmutation follows official Bicol University rating tables.
                  </p>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  SHOWCASE 4: RETENTION MONITORING & ANALYTICS DASHBOARD
              ───────────────────────────────────────────────────────────── */}
              {activeIndex === 3 && (
                <div className="flex flex-col gap-4 animate-fade-in lg:h-full lg:justify-between lg:gap-0">
                  <div>
                    {/* KEY KPI METRIC CARDS */}
                    <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider text-slate-500">Enrolled</span>
                        <p className="mt-0.5 text-lg font-black text-slate-900 font-heading">38</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider text-emerald-700">Good standing</span>
                        <p className="mt-0.5 text-lg font-black text-emerald-700 font-heading">35 (92%)</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider text-amber-700">Monitored</span>
                        <p className="mt-0.5 text-lg font-black text-amber-700 font-heading">2 (5%)</p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider text-rose-700">Remedial</span>
                        <p className="mt-0.5 text-lg font-black text-rose-700 font-heading">1 (3%)</p>
                      </div>
                    </div>

                    {/* VISUAL DISTRIBUTION BAR */}
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 mb-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                        <span>College Standing Breakdown</span>
                        <span className="text-[11px] text-slate-500">38 Total Students Evaluated</span>
                      </div>

                      {/* Multi-segment progress bar */}
                      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                        <div style={{ width: '92%' }} className="bg-emerald-500" title="Good Standing: 92%" />
                        <div style={{ width: '5%' }} className="bg-amber-400" title="Academic Warning: 5%" />
                        <div style={{ width: '3%' }} className="bg-rose-500" title="Remedial Priority: 3%" />
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Good Standing (35)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-400" /> Monitored Risk (2)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-rose-500" /> Remedial Required (1)
                        </span>
                      </div>
                    </div>

                    {/* CLINICAL MILESTONES COMPLETION BARS */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                          <span>Operative Case 1 Milestone</span>
                          <span className="font-mono text-purple-700">94%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div style={{ width: '94%' }} className="h-full bg-purple-600 rounded-full" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                          <span>Clinical Remedial Stage 1</span>
                          <span className="font-mono text-amber-700">1 Pending</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div style={{ width: '75%' }} className="h-full bg-amber-500 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                    Real-time advising analytics allow faculty to intervene before semester closeout.
                  </p>
                </div>
              )}

            </div>

          </div>

        </div>

      </div>
    </main>
  );
}
