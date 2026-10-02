import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Clock,
  MapPin,
  User,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  GraduationCap,
  Building,
  Archive
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { getStudentAcademicClassesApi } from '../../services/apiClient';
import type { StudentAcademicClass } from '../../types';

interface ParsedSchedule {
  room: string;
  schedule: string;
  days: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')[];
  time: string;
}

function parseRoomAndSchedule(rawRoom: string | null | undefined): ParsedSchedule {
  if (!rawRoom || !rawRoom.trim()) {
    return { room: 'To be announced', schedule: 'Schedule TBA', days: [], time: '' };
  }
  const match = rawRoom.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    const room = match[1].trim() || 'To be announced';
    const schedule = match[2].trim();
    const timeMatch = schedule.match(/^([A-Za-z/,\s]+?)\s+(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
    if (timeMatch) {
      const daysPart = timeMatch[1];
      const timePart = timeMatch[2];
      const dayTokens = daysPart.split(/[/,\s]+/).map(d => d.trim().toLowerCase());
      const days: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')[] = [];
      if (dayTokens.some(d => d.startsWith('mo'))) days.push('Mon');
      if (dayTokens.some(d => d.startsWith('tu'))) days.push('Tue');
      if (dayTokens.some(d => d.startsWith('we'))) days.push('Wed');
      if (dayTokens.some(d => d.startsWith('th'))) days.push('Thu');
      if (dayTokens.some(d => d.startsWith('fr'))) days.push('Fri');
      if (dayTokens.some(d => d.startsWith('sa'))) days.push('Sat');
      return { room, schedule, days, time: timePart };
    }
    return { room, schedule, days: [], time: schedule };
  }
  return { room: rawRoom.trim(), schedule: 'Schedule TBA', days: [], time: '' };
}

// ATT-001: calculate attendance rate counting present, late, and excused as attended
export const calculateClassAttendanceRate = (records: Array<{ status: string }>): number | null => {
  if (records.length === 0) return null;
  const attendedCount = records.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
  return Math.round((attendedCount / records.length) * 100);
};

export const Classes: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);

  const [dbClasses, setDbClasses] = useState<StudentAcademicClass[]>([]);
  const [currentSchoolYear, setCurrentSchoolYear] = useState<string>('2026-2027');
  const [loading, setLoading] = useState<boolean>(isAuthoritative);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'archived'>('current');

  useEffect(() => {
    if (!isAuthoritative) return;
    setLoading(true);
    setError(null);
    getStudentAcademicClassesApi()
      .then((res) => {
        setDbClasses(res.classes);
        if (res.currentSchoolYear) {
          setCurrentSchoolYear(res.currentSchoolYear);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load course enrollments.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthoritative]);

  const studentNumber = user?.student?.student_number || '2023-2689-70869';

  // Partition classes into current school year vs past/archived
  const { currentClasses, archivedClasses } = useMemo(() => {
    const current: StudentAcademicClass[] = [];
    const archived: StudentAcademicClass[] = [];

    dbClasses.forEach((cls) => {
      const isPast = cls.isPast ?? (cls.schoolYear && currentSchoolYear ? cls.schoolYear < currentSchoolYear : false);
      const isCurrent = cls.isCurrent ?? (cls.schoolYear ? cls.schoolYear === currentSchoolYear : true);

      if (isCurrent && !isPast) {
        current.push(cls);
      } else {
        archived.push(cls);
      }
    });

    return { currentClasses: current, archivedClasses: archived };
  }, [dbClasses, currentSchoolYear]);

  // Compute total units for current classes
  const currentUnits = useMemo(() => {
    return currentClasses.reduce((acc, c) => acc + (c.units || 0), 0);
  }, [currentClasses]);

  // Compute total units for archived classes
  const archivedUnits = useMemo(() => {
    return archivedClasses.reduce((acc, c) => acc + (c.units || 0), 0);
  }, [archivedClasses]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading enrolled classes and schedule…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto pt-6 animate-fade-in" role="alert">
        <Card className="p-6 border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="font-bold text-base text-rose-950 dark:text-rose-100">Unable to load Course Enrollments</h2>
              <p className="text-xs text-rose-800 dark:text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  getStudentAcademicClassesApi()
                    .then(res => setDbClasses(res.classes))
                    .catch(e => setError(e instanceof Error ? e.message : 'Failed to reload.'))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Enrolled Classes & Schedule
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Official study load, assigned classroom rooms, and weekly schedule timetable for Dental Medicine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentNumber}</span>
          </div>

          <button
            onClick={() => navigate('/student/attendance')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
          >
            <CalendarDays className="w-4 h-4" />
            <span>Daily Check-In</span>
          </button>
        </div>
      </div>

      {/* 2. Top Stats & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Current Enrolled</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{currentClasses.length} Subjects</p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Academic Load</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{currentUnits} Units</p>
            </div>
          </div>

          {archivedClasses.length > 0 && (
            <>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Archived History</p>
                  <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">{archivedClasses.length} Subjects</p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Subtle link to Retention Standing */}
          <Link
            to="/student/retention"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-650 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>View Retention Standing →</span>
          </Link>
        </div>
      </div>

      {/* 3. Tab Filter: Current vs Archived Classes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Current Classes ({currentSchoolYear})</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'current'
                  ? 'bg-white/25 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {currentClasses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'archived'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-md'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archived Classes</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'archived'
                  ? 'bg-white/25 dark:bg-slate-900/30 text-white dark:text-slate-900'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {archivedClasses.length}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400 font-medium">
          {activeTab === 'current'
            ? `Showing active classes enrolled for School Year ${currentSchoolYear}`
            : 'Historical classes from previous academic school years'}
        </p>
      </div>

      {/* 4. Course Cards Section */}
      <div className="space-y-4">
        {activeTab === 'current' ? (
          currentClasses.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No Active Classes for S.Y. {currentSchoolYear}</p>
              <p className="text-[11px] text-slate-400">
                You do not have any registered enrollments for the current academic year. Check the Archived Classes tab for past coursework.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentClasses.map((cls) => {
                const lecSched = parseRoomAndSchedule(cls.lecRoom);
                const labSched = cls.labRoom ? parseRoomAndSchedule(cls.labRoom) : null;

                return (
                  <Card key={cls.enrollmentId} className="p-5 sm:p-6 hover:border-blue-300 dark:hover:border-blue-800/80 transition-all flex flex-col justify-between">
                    <div className="space-y-3.5">
                      {/* Course Code & Units */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/80 dark:border-blue-900">
                            {cls.courseCode}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {cls.units} Academic Units
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Section {cls.className}
                        </span>
                      </div>

                      {/* Course Title */}
                      <div>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-800 dark:text-slate-100 leading-snug">
                          {cls.courseName}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {cls.semester} Semester • School Year {cls.schoolYear}
                        </p>
                      </div>

                      {/* Details Box: Instructor & Schedule */}
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                        {/* Instructor */}
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-semibold text-slate-400 text-[11px]">Instructor:</span>
                          <span className="font-bold">{cls.instructorName || 'Faculty Member'}</span>
                        </div>

                        {/* Lecture Schedule & Room */}
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-400 text-[11px]">Lecture:</span>
                          <span className="font-bold font-mono text-[11px]">{lecSched.schedule}</span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="font-semibold text-slate-400 text-[11px]">Room:</span>
                          <span className="font-bold">{lecSched.room}</span>
                        </div>

                        {/* Laboratory if present */}
                        {labSched && (
                          <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                              <Building className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="font-semibold text-slate-400 text-[11px]">Lab:</span>
                              <span className="font-bold font-mono text-[11px]">{labSched.schedule}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                              <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="font-semibold text-slate-400 text-[11px]">Lab Room:</span>
                              <span className="font-bold">{labSched.room}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          archivedClasses.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
              <Archive className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No Archived Classes Found</p>
              <p className="text-[11px] text-slate-400">
                All your enrolled courses are part of the current active academic year ({currentSchoolYear}). Past completed school years will automatically archive here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {archivedClasses.map((cls) => {
                const lecSched = parseRoomAndSchedule(cls.lecRoom);
                const labSched = cls.labRoom ? parseRoomAndSchedule(cls.labRoom) : null;

                return (
                  <Card key={cls.enrollmentId} className="p-5 sm:p-6 opacity-90 hover:opacity-100 border-slate-200 dark:border-slate-800 transition-all flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="space-y-3.5">
                      {/* Course Code & Archived Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700">
                            {cls.courseCode}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                            Archived
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {cls.units} Units
                          </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                          S.Y. {cls.schoolYear}
                        </span>
                      </div>

                      {/* Course Title */}
                      <div>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-700 dark:text-slate-200 leading-snug">
                          {cls.courseName}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {cls.semester} Semester • Section {cls.className}
                        </p>
                      </div>

                      {/* Details Box */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span className="font-semibold text-slate-400 text-[11px]">Instructor:</span>
                          <span className="font-bold">{cls.instructorName || 'Faculty Member'}</span>
                        </div>

                        {cls.grade !== null && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
                            <span className="font-semibold text-slate-400 text-[11px]">Final Grade:</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                              {cls.grade.toFixed(2)} {cls.percentage !== null ? `(${cls.percentage.toFixed(1)}%)` : ''}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-400">
                          <span>Lecture Room:</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">{lecSched.room}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Historical record</span>
                      <span className="font-medium">Read only</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
};
