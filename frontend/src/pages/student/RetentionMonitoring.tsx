import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { getStudentAcademicRetentionApi } from '../../services/apiClient';
import type { Student, StudentAcademicClass } from '../../types';

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const { students = [], settings } = useApp();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);

  const [authRecords, setAuthRecords] = useState<StudentAcademicClass[]>([]);
  const [atRiskCount, setAtRiskCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(isAuthoritative);
  const [error, setError] = useState<string | null>(null);

  const threshold = typeof settings?.retentionThreshold === 'number'
    ? settings.retentionThreshold
    : null;

  useEffect(() => {
    if (!isAuthoritative) return;
    setLoading(true);
    setError(null);
    getStudentAcademicRetentionApi()
      .then((res) => {
        setAuthRecords(res.retention.records);
        setAtRiskCount(res.retention.atRiskCount);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load retention monitoring data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthoritative]);

  // Fallback for development mock students
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

  const status = isAuthoritative
    ? (user?.student?.status || 'active')
    : (currentMockStudent?.status || 'active');

  const getStatusBadge = (st: Student['status'] | string) => {
    const norm = (st || 'active').toLowerCase();
    const isWarn = norm === 'warning';
    const isCrit = norm === 'critical';
    const isRem = norm === 'remedial';

    if (isCrit) {
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60">
          CRITICAL WATCHLIST
        </span>
      );
    }
    if (isWarn) {
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60">
          RETENTION WARNING • AT RISK
        </span>
      );
    }
    if (isRem) {
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-200/60">
          REMEDIAL EXAM ASSIGNED
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60">
        ACTIVE STANDING • CLEARED
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading retention monitoring data…
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
              <h2 className="font-bold text-base text-rose-950 dark:text-rose-100">Unable to load Retention Records</h2>
              <p className="text-xs text-rose-800 dark:text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  getStudentAcademicRetentionApi()
                    .then(res => {
                      setAuthRecords(res.retention.records);
                      setAtRiskCount(res.retention.atRiskCount);
                    })
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

  const deficientCount = isAuthoritative
    ? atRiskCount
    : threshold === null
      ? 0
      : (currentMockStudent?.enrolledSubjects || []).filter(s => s.grade >= threshold).length;

  const isAtRisk = isAuthoritative
    ? (atRiskCount > 0 || deficientCount > 0)
    : (status === 'warning' || status === 'critical' || deficientCount > 0);

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Retention Risk Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Track your per-subject midterm grades, retention warning standing, and scheduled remedial exams.
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
          <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentId}</span>
        </div>
      </div>

      {/* 2. Primary Standing Summary Card */}
      <Card className="p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {getStatusBadge(status)}
              <span className="text-xs text-slate-400 font-medium">Evaluation Period</span>
            </div>
            
            <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100">
              {studentName}
            </h2>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
              {isAtRisk 
                ? `You have ${deficientCount} subject(s) requiring Faculty retention review. Please review your authoritative subject records below.`
                : 'Your authoritative retention records currently show good standing.'
              }
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shrink-0">
            <div className="text-center px-3 border-r border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Deficient Subjects
              </span>
              <span className={`text-2xl font-extrabold font-mono ${deficientCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {deficientCount}
              </span>
            </div>

            <div className="text-center px-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Subject Grade Limit
              </span>
              <span className="text-2xl font-extrabold font-mono text-slate-700 dark:text-slate-200">
                {isAuthoritative ? 'Server state' : threshold !== null ? threshold.toFixed(2) : 'Unavailable'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Enrolled Subjects Performance Breakdown */}
      <Card className="p-6">
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
            Course Performance Breakdown ({isAuthoritative ? authRecords.length : (currentMockStudent?.enrolledSubjects || []).length} Enrolled)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Per-subject grades, clinical status, and retention standing.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Subject Code & Title</th>
                <th className="py-3 px-4 text-center">Score %</th>
                <th className="py-3 px-4 text-center">Grade</th>
                <th className="py-3 px-4">Course Type</th>
                <th className="py-3 px-4 text-right">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {isAuthoritative ? (
                authRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No course records registered.
                    </td>
                  </tr>
                ) : (
                  authRecords.map(cls => {
                    const isPending = cls.grade === null;
                    const retentionState = cls.retentionState?.toLowerCase();
                    const isAtRiskRow = ['warning', 'critical', 'remedial'].includes(retentionState);
                    const hasRetentionState = Boolean(retentionState);
                    const isPassing = !isPending && (isAuthoritative
                      ? hasRetentionState && !isAtRiskRow
                      : threshold !== null && cls.grade !== null && cls.grade <= threshold);

                    return (
                      <tr key={cls.enrollmentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                          {cls.courseCode}
                          <span className="block text-[10px] text-slate-400 font-normal">{cls.courseName}</span>
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold">
                          {cls.percentage !== null ? `${cls.percentage}%` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-center font-extrabold font-mono text-sm">
                          {isPending ? (
                            <span className="text-slate-400 font-normal">Pending</span>
                          ) : (
                            <span className={isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {cls.grade?.toFixed(2)}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                            {cls.isClinical ? 'Clinical Lab Course' : 'Lecture Course'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            !isPending && isAtRiskRow
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60'
                              : hasRetentionState && !isPending
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60'
                          }`}>
                            {isPending ? 'Pending' : cls.retentionState || 'State unavailable'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : (
                (currentMockStudent?.enrolledSubjects || []).map(subj => {
                  const isPassing = threshold !== null && subj.grade <= threshold;
                  return (
                    <tr key={subj.code} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                        {subj.code}
                        <span className="block text-[10px] text-slate-400 font-normal">{subj.name}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        {subj.components?.exams ? `${subj.components.exams}%` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-center font-extrabold font-mono text-sm">
                        <span className={isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {subj.grade.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                          {subj.isClinical ? 'Clinical Lab Course' : 'Lecture Course'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          isPassing 
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60'
                        }`}>
                          {isPassing ? 'Passing' : 'Midterm Deficient'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Policy & Retention Rules Guide */}
      <Card className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100 mb-3">
          Bicol University CDM Academic Retention Guidelines
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">1. Server retention state</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              The authoritative retention state determines whether a course requires review.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">2. Remedial review</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Faculty records remedial assignments and outcomes through the authoritative retention workflow.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">3. Clinical Attendance</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Attendance values are shown when authoritative attendance data is available.
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
};
