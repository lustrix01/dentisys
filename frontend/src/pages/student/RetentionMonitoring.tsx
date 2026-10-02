import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, AlertTriangle, Calendar, Clock, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, BookOpen, History } from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { getStudentAcademicRetentionApi } from '../../services/apiClient';
import type { Student, StudentAcademicClass } from '../../types';

type RemedialStage =
  | 'none'
  | 'attempt_1_pending'
  | 'attempt_2_available'
  | 'attempt_2_pending'
  | 'passed'
  | 'cost_recovery_required'
  | 'cost_recovery_passed'
  | 'cost_recovery_failed'
  | 'legacy_unclassified';

type RemedialAttemptStatus = 'pending' | 'passed' | 'failed';

interface RemedialAttemptView {
  attemptNumber: 1 | 2;
  scheduledDate: string | null;
  percentage: number | null;
  status: RemedialAttemptStatus | null;
}

interface RemedialProgressionView {
  stage: RemedialStage;
  attempts: RemedialAttemptView[];
  passedAttempt: 1 | 2 | null;
  legacyUnclassified: boolean;
}

const isRecordValue = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readAttemptNumber = (value: unknown): 1 | 2 | null => (
  value === 1 || value === 2 || value === '1' || value === '2'
    ? Number(value) as 1 | 2
    : null
);

const readProgressionStage = (value: unknown): RemedialStage | null => (
  value === 'none'
    || value === 'attempt_1_pending'
    || value === 'attempt_2_available'
    || value === 'attempt_2_pending'
    || value === 'passed'
    || value === 'cost_recovery_required'
    || value === 'cost_recovery_passed'
    || value === 'cost_recovery_failed'
    || value === 'legacy_unclassified'
    ? value
    : null
);

const readRemedialProgression = (record: StudentAcademicClass): RemedialProgressionView => {
  const source = record as unknown as { remedialProgression?: unknown; remedial?: unknown };
  const rawProgression = source.remedialProgression
    ?? (isRecordValue(source.remedial) && 'stage' in source.remedial ? source.remedial : null);

  if (isRecordValue(rawProgression)) {
    const declaredStage = readProgressionStage(rawProgression.stage);
    const rawLegacyUnclassified = rawProgression.legacyUnclassified === true
      || rawProgression.legacy_unclassified === true;
    const stage = rawLegacyUnclassified ? 'legacy_unclassified' : (declaredStage ?? 'legacy_unclassified');
    const attempts = Array.isArray(rawProgression.attempts)
      ? rawProgression.attempts.flatMap(value => {
        if (!isRecordValue(value)) return [];
        const attemptNumber = readAttemptNumber(value.attemptNumber ?? value.attempt_number);
        if (!attemptNumber) return [];
        const rawDate = value.scheduledDate ?? value.scheduled_date;
        const rawStatus = value.outcome ?? value.status;
        return [{
          attemptNumber,
          scheduledDate: typeof rawDate === 'string' && rawDate.trim().length > 0 ? rawDate : null,
          percentage: typeof value.percentage === 'number' && Number.isFinite(value.percentage) ? value.percentage : null,
          status: rawStatus === 'pending' || rawStatus === 'passed' || rawStatus === 'failed' ? rawStatus : null,
        } as RemedialAttemptView];
      })
      : [];
    const passedAttempt = readAttemptNumber(rawProgression.passedAttempt ?? rawProgression.passed_attempt);
    const legacyUnclassified = rawLegacyUnclassified || stage === 'legacy_unclassified';
    return { stage, attempts, passedAttempt, legacyUnclassified };
  }

  if (isRecordValue(source.remedial) && Object.keys(source.remedial).length > 0) {
    return { stage: 'legacy_unclassified', attempts: [], passedAttempt: null, legacyUnclassified: true };
  }
  return { stage: 'none', attempts: [], passedAttempt: null, legacyUnclassified: false };
};

const attemptStatus = (progression: RemedialProgressionView, attemptNumber: 1 | 2): RemedialAttemptStatus | 'available' | 'not_started' => {
  const attempt = progression.attempts.find(item => item.attemptNumber === attemptNumber);
  if (attempt?.status) return attempt.status;
  if (progression.stage === 'attempt_1_pending' && attemptNumber === 1) return 'pending';
  if (progression.stage === 'attempt_2_available' && attemptNumber === 1) return 'failed';
  if (progression.stage === 'attempt_2_available' && attemptNumber === 2) return 'available';
  if (progression.stage === 'attempt_2_pending') return attemptNumber === 1 ? 'failed' : 'pending';
  if (progression.stage === 'passed') return progression.passedAttempt === attemptNumber ? 'passed' : attemptNumber < (progression.passedAttempt ?? 2) ? 'failed' : 'not_started';
  if (progression.stage === 'cost_recovery_required' || progression.stage === 'cost_recovery_passed' || progression.stage === 'cost_recovery_failed') return 'failed';
  return 'not_started';
};

const attemptStatusLabel = (status: RemedialAttemptStatus | 'available' | 'not_started'): string => {
  switch (status) {
    case 'pending': return 'Pending';
    case 'passed': return 'Passed';
    case 'failed': return 'Failed';
    case 'available': return 'Available';
    case 'not_started': return 'Not started';
    default: return '—';
  }
};

const GradePill: React.FC<{ grade: number | null }> = ({ grade }) => {
  if (grade === null) {
    return <span className="text-slate-400 italic text-xs">Pending</span>;
  }
  const isSafe = grade < 2.5;
  const isLimit = grade === 2.5;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`font-mono font-bold text-sm ${
        isSafe ? 'text-emerald-600 dark:text-emerald-400' : isLimit ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
      }`}>
        {grade.toFixed(2)}
      </span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        isSafe
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : isLimit
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
      }`}>
        {isSafe ? 'Passing' : isLimit ? 'Cutoff' : 'Deficient'}
      </span>
    </div>
  );
};

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const { students = [] } = useApp();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);

  const [authRecords, setAuthRecords] = useState<StudentAcademicClass[]>([]);
  const [atRiskCount, setAtRiskCount] = useState<number>(0);
  const [midtermAtRiskCount, setMidtermAtRiskCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'current' | 'remedials' | 'midterm' | 'past'>('current');
  const [loading, setLoading] = useState<boolean>(isAuthoritative);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthoritative) return;
    setLoading(true);
    setError(null);
    getStudentAcademicRetentionApi()
      .then((res) => {
        setAuthRecords(res.retention.records);
        setAtRiskCount(res.retention.atRiskCount);
        setMidtermAtRiskCount(res.retention.midtermAtRiskCount ?? 0);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load retention monitoring data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthoritative]);

  const currentMockStudent = students.find(s =>
    s.email.toLowerCase() === (user?.login_email || '').toLowerCase() ||
    s.studentId.toLowerCase() === (user?.login_email || '').toLowerCase()
  ) || students[0];

  const studentName = isAuthoritative
    ? (user?.display_name || 'Student')
    : (currentMockStudent?.name || user?.display_name || 'Student');

  const studentId = isAuthoritative
    ? (user?.student?.student_number || '—')
    : (currentMockStudent?.studentId || '2024-DENT-0004');

  // Active School Year vs Past
  const { currentRecords, pastRecords } = useMemo(() => {
    const current: StudentAcademicClass[] = [];
    const past: StudentAcademicClass[] = [];
    authRecords.forEach(r => {
      if (r.isPast === true) {
        past.push(r);
      } else {
        current.push(r);
      }
    });
    return {
      currentRecords: current.length > 0 ? current : authRecords,
      pastRecords: past,
    };
  }, [authRecords]);

  // Deficient Records with Remedials
  const deficientRecords = useMemo(() => {
    return authRecords.filter(r => {
      const prog = readRemedialProgression(r);
      const state = (r.retentionState || '').toLowerCase();
      const isDeficient = ['warning', 'critical', 'remedial'].includes(state);
      return prog.stage !== 'none' || isDeficient;
    });
  }, [authRecords]);

  // Midterm Risk Records
  const midtermRiskRecords = useMemo(() => {
    return currentRecords.filter(r =>
      Boolean(r.midtermEvaluation?.complete && r.midtermEvaluation?.isAtRisk)
    );
  }, [currentRecords]);

  // Group past records by school year & semester
  const pastSemesters = useMemo(() => {
    const groups: Record<string, { schoolYear: string; semester: string; records: StudentAcademicClass[] }> = {};
    pastRecords.forEach(r => {
      const sy = r.schoolYear || 'Historical';
      const sem = r.semester || 'Semester';
      const key = `${sy}__${sem}`;
      if (!groups[key]) {
        groups[key] = { schoolYear: sy, semester: sem, records: [] };
      }
      groups[key].records.push(r);
    });
    return Object.entries(groups).map(([key, data]) => ({
      key,
      schoolYear: data.schoolYear,
      semester: data.semester,
      records: data.records,
    }));
  }, [pastRecords]);

  const [expandedSemesters, setExpandedSemesters] = useState<Record<string, boolean>>({});

  const toggleSemester = (key: string) => {
    setExpandedSemesters(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading retention data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto pt-6" role="alert">
        <Card className="p-5 border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
          <p className="text-sm font-bold text-rose-900 dark:text-rose-100">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const isStandingAtRisk = atRiskCount > 0;

  return (
    <div className="space-y-5">
      {/* 1. Header Bar: Simple & Direct */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            Retention Risk Monitoring
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Student: <strong className="text-slate-700 dark:text-slate-200">{studentName}</strong> ({studentId})
          </p>
        </div>

        {/* Status Pill & Limit */}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
            isStandingAtRisk
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60'
              : midtermAtRiskCount > 0
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60'
          }`}>
            {isStandingAtRisk ? 'Retention Warning' : midtermAtRiskCount > 0 ? 'Midterm Advisory' : 'Active Standing · Cleared'}
          </span>
          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl font-bold text-slate-600 dark:text-slate-300">
            Limit: 2.50
          </span>
        </div>
      </div>

      {/* 2. Simple Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('current')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'current'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Active Courses</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeTab === 'current' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700'
          }`}>
            {currentRecords.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('remedials')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'remedials'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Remedial Exams</span>
          {deficientRecords.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'remedials' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
            }`}>
              {deficientRecords.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('midterm')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'midterm'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Midterm Risk</span>
          {midtermAtRiskCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'midterm' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
            }`}>
              {midtermAtRiskCount}
            </span>
          )}
        </button>

        {pastRecords.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('past')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'past'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Past Courses</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'past' ? 'bg-slate-600 text-white' : 'bg-slate-200 dark:bg-slate-700'
            }`}>
              {pastRecords.length}
            </span>
          </button>
        )}
      </div>

      {/* 3. Content Views */}

      {/* --- TAB 1: ACTIVE COURSES --- */}
      {activeTab === 'current' && (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50/50 dark:bg-slate-800/40">
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4 text-center">Midterm</th>
                  <th className="py-3 px-4 text-center">Final Grade</th>
                  <th className="py-3 px-4">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400">
                      No courses enrolled for the active term.
                    </td>
                  </tr>
                ) : (
                  currentRecords.map(cls => {
                    const isPending = cls.grade === null;
                    const retentionState = (cls.retentionState || '').toLowerCase();
                    const isAtRisk = ['warning', 'critical', 'remedial'].includes(retentionState);
                    const prog = readRemedialProgression(cls);
                    const hasRemedial = prog.stage !== 'none';

                    return (
                      <tr key={cls.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm mr-2">
                              {cls.courseCode}
                            </span>
                            <span className="text-slate-800 dark:text-slate-100 font-semibold">
                              {cls.courseName}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {cls.isClinical ? 'Clinical Lab' : 'Lecture'} · {cls.units} Units · {cls.instructorName || 'Faculty'}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {cls.midtermEvaluation?.complete ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                {cls.midtermEvaluation.percentage !== null ? `${cls.midtermEvaluation.percentage.toFixed(1)}%` : '—'}
                              </span>
                              {cls.midtermEvaluation.isAtRisk && (
                                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                  At Risk
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Pending</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <GradePill grade={cls.grade} />
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              !isPending && isAtRisk
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                : !isPending
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {isPending ? 'In Progress' : isAtRisk ? 'Deficient' : 'Cleared'}
                            </span>
                            {hasRemedial && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('remedials')}
                                className="text-[10px] font-bold text-rose-600 underline cursor-pointer"
                              >
                                View Exam
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* --- TAB 2: REMEDIAL EXAMS (CARDS) --- */}
      {activeTab === 'remedials' && (
        deficientRecords.length === 0 ? (
          <Card className="p-8 text-center space-y-2 border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">No Remedial Exams Required</h3>
            <p className="text-xs text-slate-400">All your enrolled subjects meet the 2.50 retention standard.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {deficientRecords.map(cls => {
              const progression = readRemedialProgression(cls);
              const attempt1 = progression.attempts.find(a => a.attemptNumber === 1);
              const attempt2 = progression.attempts.find(a => a.attemptNumber === 2);
              const activeAttemptNumber = progression.stage === 'attempt_2_available' || progression.stage === 'attempt_2_pending' ? 2 : 1;
              const activeAttempt = activeAttemptNumber === 2 ? attempt2 : attempt1;
              const isCostRecovery = progression.stage === 'cost_recovery_required' || progression.stage === 'cost_recovery_failed' || progression.stage === 'cost_recovery_passed';

              return (
                <Card key={cls.enrollmentId} className="p-4 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                        {cls.courseCode}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {cls.courseName}
                      </h4>
                      <p className="text-[10px] text-slate-400">Instructor: {cls.instructorName || 'Faculty'}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      Grade: {cls.grade !== null ? cls.grade.toFixed(2) : '—'}
                    </span>
                  </div>

                  {/* Scheduled Exam Date */}
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block">
                        Scheduled Exam Date
                      </span>
                      <span className="text-sm font-mono font-extrabold text-blue-950 dark:text-blue-100">
                        {activeAttempt?.scheduledDate || 'Schedule to be announced by faculty'}
                      </span>
                    </div>
                  </div>

                  {/* Attempts Progression */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {([1, 2] as const).map(attemptNum => {
                      const att = progression.attempts.find(item => item.attemptNumber === attemptNum);
                      const attStatus = attemptStatus(progression, attemptNum);
                      const attLabel = attemptStatusLabel(attStatus);

                      return (
                        <div
                          key={attemptNum}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                            <span className="text-slate-600 dark:text-slate-300">
                              {attemptNum === 1 ? 'Attempt 1' : 'Attempt 2'}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              attStatus === 'passed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : attStatus === 'failed'
                                  ? 'bg-rose-100 text-rose-800'
                                  : attStatus === 'pending'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-600'
                            }`}>
                              {attLabel}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 block">
                            {typeof att?.percentage === 'number' ? `Score: ${att.percentage.toFixed(1)}%` : 'No score yet'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost Recovery Warning */}
                  {isCostRecovery && (
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs font-semibold">
                      ⚠️ Cost recovery required (Both remedial attempts completed without passing).
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* --- TAB 3: MIDTERM RISK (NO REMEDIAL EXAM, JUST REMINDER) --- */}
      {activeTab === 'midterm' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs">
            <strong>Advisory Reminder:</strong> Remedial exams are not held at midterm. This is an early notification to consult your instructors before final exams.
          </div>

          <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50/50 dark:bg-slate-800/40">
                    <th className="py-3 px-4">Course</th>
                    <th className="py-3 px-4 text-center">Midterm Score</th>
                    <th className="py-3 px-4 text-center">Midterm Grade</th>
                    <th className="py-3 px-4">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {midtermRiskRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        No courses flagged at risk for midterm.
                      </td>
                    </tr>
                  ) : (
                    midtermRiskRecords.map(cls => (
                      <tr key={cls.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm mr-2">
                            {cls.courseCode}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {cls.courseName}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            Instructor: {cls.instructorName || 'Faculty'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-100">
                          {cls.midtermEvaluation?.percentage !== null ? `${cls.midtermEvaluation?.percentage?.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-extrabold text-amber-600 dark:text-amber-400">
                          {cls.midtermEvaluation?.grade !== null ? cls.midtermEvaluation?.grade?.toFixed(2) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          Review lessons and consult instructor before finals.
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* --- TAB 4: PAST COURSES --- */}
      {activeTab === 'past' && (
        pastSemesters.length === 0 ? (
          <Card className="p-8 text-center text-xs text-slate-400">
            No past course history available.
          </Card>
        ) : (
          <div className="space-y-3">
            {pastSemesters.map(sem => {
              const isExpanded = expandedSemesters[sem.key] ?? true;

              return (
                <div
                  key={sem.key}
                  className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
                >
                  <button
                    type="button"
                    onClick={() => toggleSemester(sem.key)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-800/40 text-left cursor-pointer"
                  >
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                        S.Y. {sem.schoolYear} · {sem.semester}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {sem.records.length} Courses
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isExpanded && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-2 px-3">Course</th>
                            <th className="py-2 px-3 text-center">Grade</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                          {sem.records.map(cls => (
                            <tr key={cls.enrollmentId}>
                              <td className="py-2.5 px-3">
                                <span className="font-mono font-bold text-blue-600 mr-2">{cls.courseCode}</span>
                                <span>{cls.courseName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <GradePill grade={cls.grade} />
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                  {cls.retentionState || 'Completed'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
