import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Clock,
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
import { canAccessAuthoritativeStudentBiometrics, isStudentPrototypeAllowed } from './studentGates';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { useApp } from '../../context/AppContext';
import { StudentUnavailable } from './RealStudentSurfaces';
import { getStudentAcademicClassesApi } from '../../services/apiClient';
import type { StudentAcademicClass } from '../../types';
import GradeValue from '../../components/GradeValue';
import { formatGrade } from '../../utils/gradeHelper';

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

const getFormattedSchedule = (cls: StudentAcademicClass, component: 'Lecture' | 'Laboratory'): { times: string; room: string } => {
  const meetings = cls.meetings?.filter(meeting => meeting.component === component) ?? [];
  if (meetings.length > 0) {
    const rooms = Array.from(new Set(meetings.map(m => m.room).filter(Boolean)));
    // Several rooms: keep each room beside its own meeting so the day-room pairing is not lost.
    if (rooms.length > 1) return { times: meetings.map(m => `${m.day} ${m.startTime} - ${m.endTime} · ${m.room || 'TBA'}`).join('; '), room: '' };
    return { times: meetings.map(m => `${m.day} ${m.startTime} - ${m.endTime}`).join('; '), room: rooms[0] ?? 'TBA' };
  }
  // Legacy room text supplies the room only; once meetings are recorded, no meeting means no time.
  const legacy = parseRoomAndSchedule(component === 'Lecture' ? cls.lecRoom : cls.labRoom);
  return {
    times: cls.meetingsRecorded ? 'Schedule TBA' : legacy.schedule,
    room: legacy.room === 'To be announced' ? 'TBA' : legacy.room,
  };
};

const retentionChip = (cls: StudentAcademicClass): { label: string; className: string } => {
  const grey = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  const green = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  const state = (cls.retentionState ?? '').trim();
  const key = state.toLowerCase();
  if (key === 'remedial') return { label: 'Remedial', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' };
  if (typeof cls.grade !== 'number') return { label: 'Pending Evaluation', className: grey };
  if (key === 'active') return { label: 'Good Standing', className: green };
  if (key === 'cleared') return { label: 'Cleared', className: green };
  return { label: state || 'Unavailable', className: grey };
};

// ATT-001: calculate attendance rate counting present, late, and excused as attended
export const calculateClassAttendanceRate = (records: Array<{ status: string }>): number | null => {
  if (records.length === 0) return null;
  const attendedCount = records.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
  return Math.round((attendedCount / records.length) * 100);
};

const getComponentGradeText = (
  cls: StudentAcademicClass,
  period: 'midterm' | 'final',
  component: 'lecture' | 'laboratory',
): string => {
  const components = (cls.gradeComponents?.periods as Record<string, unknown> | undefined)?.[period] as Record<string, unknown> | undefined;
  const breakdown = (components?.components as Record<string, unknown> | undefined)?.[component] as Record<string, unknown> | undefined;
  if (typeof breakdown?.percentage === 'number') return `${breakdown.percentage.toFixed(2)}%`;
  if (breakdown?.status === 'pending') return 'Pending';
  if (Array.isArray(breakdown?.incomplete) && breakdown.incomplete.length > 0) {
    const firstIncomplete = breakdown.incomplete[0] as { reason?: unknown };
    const reason = typeof firstIncomplete?.reason === 'string'
      ? firstIncomplete.reason.replace(/_/g, ' ')
      : '';
    return reason ? `Incomplete (${reason})` : 'Incomplete';
  }
  if (cls.gradeComponents || typeof cls.grade === 'number') return 'Unavailable (recompute required)';
  return 'Pending';
};

const hasSavedComponentBreakdown = (cls: StudentAcademicClass): boolean => {
  const periods = cls.gradeComponents?.periods as Record<string, unknown> | undefined;
  return (['midterm', 'final'] as const).some(period => {
    const evaluation = periods?.[period] as Record<string, unknown> | undefined;
    const components = evaluation?.components as Record<string, unknown> | undefined;
    return Boolean(components && (components.lecture || components.laboratory));
  });
};

const StudentComponentGradeSummary: React.FC<{ cls: StudentAcademicClass }> = ({ cls }) => {
  if (cls.gradingComponentMode !== 'lecture_laboratory' && !hasSavedComponentBreakdown(cls)) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3" aria-label="Lecture and Laboratory grade components">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Lecture / Laboratory breakdown</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <span>Midterm Lecture: <strong>{getComponentGradeText(cls, 'midterm', 'lecture')}</strong></span>
        <span>Midterm Laboratory: <strong>{getComponentGradeText(cls, 'midterm', 'laboratory')}</strong></span>
        <span>Finals Lecture: <strong>{getComponentGradeText(cls, 'final', 'lecture')}</strong></span>
        <span>Finals Laboratory: <strong>{getComponentGradeText(cls, 'final', 'laboratory')}</strong></span>
      </div>
    </div>
  );
};

export const Classes: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const config = useRuntimeConfig();
  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);

  const [dbClasses, setDbClasses] = useState<StudentAcademicClass[]>([]);
  const [currentSchoolYear, setCurrentSchoolYear] = useState<string | null>(null);
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
        setCurrentSchoolYear(res.currentSchoolYear ?? null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load course enrollments.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthoritative]);

  const studentNumber = user?.student?.student_number || 'Unavailable';

  // Partition classes into current school year vs past/archived
  const { currentClasses, archivedClasses, otherClasses } = useMemo(() => {
    const current: StudentAcademicClass[] = [];
    const archived: StudentAcademicClass[] = [];
    const other: StudentAcademicClass[] = [];

    dbClasses.forEach((cls) => {
      const isPast = cls.isPast ?? (cls.schoolYear && currentSchoolYear ? cls.schoolYear < currentSchoolYear : false);
      const isCurrent = cls.isCurrent ?? (currentSchoolYear !== null && cls.schoolYear === currentSchoolYear);

      if (isCurrent && !isPast && cls.archiveReason !== 'finished') {
        current.push(cls);
      } else if (isPast || cls.archiveReason === 'finished') {
        archived.push(cls);
      } else {
        other.push(cls);
      }
    });

    return { currentClasses: current, archivedClasses: archived, otherClasses: other };
  }, [dbClasses, currentSchoolYear]);

  // Compute total units for current classes
  const currentUnits = useMemo(() => {
    return currentClasses.reduce((acc, c) => acc + (c.units || 0), 0);
  }, [currentClasses]);

  // Compute total units for archived classes
  const archivedUnits = useMemo(() => {
    return archivedClasses.reduce((acc, c) => acc + (c.units || 0), 0);
  }, [archivedClasses]);

  if (!isAuthoritative) {
    return isStudentPrototypeAllowed(user, config, 'academic')
      ? <DevelopmentClasses /> : <StudentUnavailable title="Student Classes unavailable" />;
  }

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
                    .then(res => { setDbClasses(res.classes); setCurrentSchoolYear(res.currentSchoolYear ?? null); })
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
      <div className="flex items-center justify-end gap-3 pb-2">
        <div className="text-right hidden sm:block">
          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 block leading-none">STUDENT ID</span>
          <span className="whitespace-nowrap text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentNumber}</span>
        </div>

        <button
          onClick={() => navigate('/student/attendance')}
          className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
        >
          <CalendarDays className="w-4 h-4" />
          <span>Daily Check-In</span>
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">Course grades and retention status come from official academic records. Missing grades remain pending.</p>
      {currentClasses.some(cls => cls.retentionState?.toLowerCase() === 'remedial') && (
        <div role="status" className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold">Retention Standing Warning: review your flagged courses with Faculty.</div>
      )}

      {/* 2. Top Stats & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Current Enrolled</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{currentClasses.length} Subjects</p>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Academic Load</p>
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
                  <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Archived History</p>
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
            className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
            <span>Current Classes ({currentSchoolYear ?? 'School year unavailable'})</span>
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

        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {activeTab === 'current'
            ? `Showing active classes enrolled for School Year ${currentSchoolYear ?? 'unavailable'}`
            : 'Historical classes from previous academic school years'}
        </p>
      </div>

      {/* 4. Course Cards Section */}
      <div className="space-y-4">
        {activeTab === 'current' ? (
          currentClasses.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">{currentSchoolYear ? `No Active Classes for S.Y. ${currentSchoolYear}` : 'Current school year unavailable'}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You do not have any registered enrollments for the current academic year. Check the Archived Classes tab for past coursework.
              </p>
            </div>
          ) : (
            <div className={`grid ${currentClasses.length === 1 ? 'grid-cols-1 max-w-xl' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-4`}>
              {currentClasses.map((cls) => {
                const lecSched = getFormattedSchedule(cls, 'Lecture');
                const labSched = cls.labRoom || cls.meetings?.some(meeting => meeting.component === 'Laboratory') ? getFormattedSchedule(cls, 'Laboratory') : null;

                return (
                  <Card key={cls.enrollmentId} className="p-4 sm:p-5 hover:border-blue-300 dark:hover:border-blue-800/80 transition-all flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Course Code & Units */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60">
                            {cls.courseCode}
                          </span>
                          <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {cls.units} Units
                          </span>
                        </div>
                        <span className="whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Sec. {cls.className}
                        </span>
                      </div>

                      {/* Course Title */}
                      <div>
                        <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 leading-snug">
                          {cls.courseName}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {cls.semester} Semester • S.Y. {cls.schoolYear}
                        </p>
                      </div>

                      {/* Details Box: Instructor & Schedule */}
                      <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 space-y-1.5 text-xs">
                        {/* Instructor */}
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Instructor:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{cls.instructorName || 'Faculty Member'}</span>
                        </div>

                        {/* Lecture Schedule */}
                        {lecSched && (
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                            <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Lecture:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-200 text-xs min-w-0 break-words">
                              {lecSched.times}{lecSched.room && <> <span className="text-slate-300 dark:text-slate-600 font-normal">·</span> {lecSched.room}</>}
                            </span>
                          </div>
                        )}

                        {/* Laboratory if present */}
                        {labSched && (
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                            <Building className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Lab:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-200 text-xs min-w-0 break-words">
                              {labSched.times}{labSched.room && <> <span className="text-slate-300 dark:text-slate-600 font-normal">·</span> {labSched.room}</>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Academic Status Footer */}
                    <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Grade:</span>
                        {typeof cls.grade === 'number' ? (
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            <GradeValue percentage={cls.percentage} grade={cls.grade}>{formatGrade(cls.grade)}</GradeValue>
                            {typeof cls.percentage === 'number' && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-1">({cls.percentage.toFixed(1)}%)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-xs">Pending</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(cls.isClinical || (cls.clinicHoursCompleted ?? 0) > 0) && (
                          <span className="whitespace-nowrap text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                            {cls.clinicHoursCompleted ?? 0} hrs
                          </span>
                        )}
                        <span className={`whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-bold ${retentionChip(cls).className}`}>
                          {retentionChip(cls).label}
                        </span>
                      </div>
                    </div>
                    <StudentComponentGradeSummary cls={cls} />
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          archivedClasses.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
              <Archive className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">No Archived Classes Found</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No enrollments from previous academic school years are available.
              </p>
            </div>
          ) : (
            <div className={`grid ${archivedClasses.length === 1 ? 'grid-cols-1 max-w-xl' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-4`}>
              {archivedClasses.map((cls) => {
                const lecSched = getFormattedSchedule(cls, 'Lecture');
                const labSched = cls.labRoom || cls.meetings?.some(meeting => meeting.component === 'Laboratory') ? getFormattedSchedule(cls, 'Laboratory') : null;

                return (
                  <Card key={cls.enrollmentId} className="p-4 sm:p-5 opacity-90 hover:opacity-100 border-slate-200 dark:border-slate-800 transition-all flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="space-y-3">
                      {/* Course Code & Archived Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-700">
                            {cls.courseCode}
                          </span>
                          <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {cls.units} Units
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {cls.archiveReason === 'finished' && (
                            <span className="whitespace-nowrap px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                              Completed
                            </span>
                          )}
                          <span className="whitespace-nowrap px-2 py-0.5 rounded-md font-bold text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            S.Y. {cls.schoolYear}
                          </span>
                        </div>
                      </div>

                      {/* Course Title */}
                      <div>
                        <h3 className="text-base font-extrabold text-slate-700 dark:text-slate-200 leading-snug">
                          {cls.courseName}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {cls.semester} Semester • Sec. {cls.className}
                        </p>
                      </div>

                      {/* Details Box */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Instructor:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{cls.instructorName || 'Faculty Member'}</span>
                        </div>

                        {lecSched && (
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Lecture:</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300 text-xs min-w-0 break-words">
                              {lecSched.times}{lecSched.room && <> <span className="text-slate-300 dark:text-slate-600 font-normal">·</span> {lecSched.room}</>}
                            </span>
                          </div>
                        )}

                        {labSched && (
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Lab:</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300 text-xs min-w-0 break-words">
                              {labSched.times}{labSched.room && <> <span className="text-slate-300 dark:text-slate-600 font-normal">·</span> {labSched.room}</>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Academic Status Footer */}
                    <div className="mt-3.5 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Final Grade:</span>
                        {typeof cls.grade === 'number' ? (
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            <GradeValue percentage={cls.percentage} grade={cls.grade}>{formatGrade(cls.grade)}</GradeValue>
                            {typeof cls.percentage === 'number' && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-1">({cls.percentage.toFixed(1)}%)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-xs">Pending</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(cls.isClinical || (cls.clinicHoursCompleted ?? 0) > 0) && (
                          <span className="whitespace-nowrap text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                            {cls.clinicHoursCompleted ?? 0} hrs
                          </span>
                        )}
                        <span className={`whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-bold ${retentionChip(cls).className}`}>
                          {retentionChip(cls).label}
                        </span>
                      </div>
                    </div>
                    <StudentComponentGradeSummary cls={cls} />
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>
      {otherClasses.length > 0 && <Card className="p-5 space-y-3">
        <h2 className="font-bold text-sm">Other School-Year Enrollments</h2>
        <p className="text-xs text-slate-500">These records are outside the configured current year or their school-year classification is unavailable.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr><th className="p-2">Course</th><th className="p-2">School Year</th><th className="p-2">Grade</th><th className="p-2">Score %</th><th className="p-2">Clinical Hours</th><th className="p-2">Retention</th></tr></thead>
          <tbody>{otherClasses.map(cls => <tr key={cls.enrollmentId}>
            <td className="p-2">{cls.courseCode} · {cls.courseName} · {cls.className}</td>
            <td className="p-2">{cls.schoolYear || 'Unavailable'}</td>
            <td className="p-2">{cls.grade === null ? 'Pending' : <GradeValue percentage={cls.percentage} grade={cls.grade}>{formatGrade(cls.grade)}</GradeValue>}</td>
            <td className="p-2">{cls.percentage === null ? 'Pending' : `${cls.percentage}%`}</td>
            <td className="p-2">{cls.clinicHoursCompleted} hrs</td>
            <td className="p-2">{cls.retentionState || 'Unavailable'}</td>
          </tr>)}</tbody>
        </table></div>
      </Card>}
    </div>
  );
};

// The prototype is available only after the provenance/runtime gate above.
// Its browser fixture values never replace failed authoritative API reads.
const DevelopmentClasses: React.FC = () => {
  const { user } = useAuth();
  const { students, attendanceRecords } = useApp();
  const student = students.find(item => item.email.toLowerCase() === user?.login_email.toLowerCase()) || students[0];
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold">My Enrolled Classes & Schedule</h1>
      <div role="status" className="p-4 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">Development-only Classes prototype — sample data, not official academic records.</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(student?.enrolledSubjects ?? []).map(subject => {
          const rate = calculateClassAttendanceRate(attendanceRecords.filter(record => record.studentId === student?.id && record.subjectCode === subject.code));
          return <Card key={subject.code} className="p-5 space-y-2">
            <h2 className="font-bold">{subject.code} · {subject.name}</h2>
            <p>{subject.units} Academic Units · Sample grade: {formatGrade(subject.grade)}</p>
            <p>Sample attendance: {rate === null ? 'Unavailable' : `${rate}%`}</p>
          </Card>;
        })}
      </div>
    </div>
  );
};
