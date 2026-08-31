import React, { useMemo } from 'react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student } from '../../types';

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const { students = [], settings = { retentionThreshold: 2.5 } } = useApp();

  // Find the logged-in student or secretary record
  const currentStudent = useMemo(() => {
    if (!students || students.length === 0) return null;
    return students.find(s => 
      s.email.toLowerCase() === (user?.login_email || '').toLowerCase() ||
      s.studentId.toLowerCase() === (user?.login_email || '').toLowerCase()
    ) || students[0]; // fallback to first mock student
  }, [students, user]);

  const studentName = currentStudent?.name || user?.display_name || 'Student';
  const studentId = currentStudent?.studentId || '2024-DENT-0004';
  const status = currentStudent?.status || 'active';
  const enrolledSubjects = currentStudent?.enrolledSubjects || [];
  const remedialExams = currentStudent?.remedialExams || [];

  const threshold = settings?.retentionThreshold || 2.5;
  const deficientSubjects = enrolledSubjects.filter(s => s.grade > threshold);
  const isAtRisk = status === 'warning' || status === 'critical' || deficientSubjects.length > 0;

  const getStatusBadge = (st: Student['status']) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60',
      warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60',
      critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60',
      remedial: 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-200/60',
    };
    const labels = {
      active: 'ACTIVE STANDING • CLEARED',
      warning: 'RETENTION WARNING • AT RISK',
      critical: 'CRITICAL WATCHLIST',
      remedial: 'REMEDIAL EXAM ASSIGNED',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${styles[st] || styles.active}`}>
        {labels[st] || 'ACTIVE STANDING'}
      </span>
    );
  };

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
              <span className="text-xs text-slate-400 font-medium">Midterm Evaluation Period</span>
            </div>
            
            <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100">
              {studentName}
            </h2>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
              {isAtRisk 
                ? `You have ${deficientSubjects.length} subject(s) with midterm grades exceeding the ${threshold.toFixed(2)} retention limit or requiring faculty monitoring. Please review your subject performance below.`
                : `Your academic performance is currently in good standing! All enrolled subject midterm grades meet College of Dental Medicine retention criteria (${threshold.toFixed(2)} or better per subject).`
              }
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shrink-0">
            <div className="text-center px-3 border-r border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Deficient Subjects
              </span>
              <span className={`text-2xl font-extrabold font-mono ${deficientSubjects.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {deficientSubjects.length}
              </span>
            </div>

            <div className="text-center px-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                Subject Grade Limit
              </span>
              <span className="text-2xl font-extrabold font-mono text-slate-700 dark:text-slate-200">
                {threshold.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Enrolled Subjects Performance Breakdown */}
      <Card className="p-6">
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
            Midterm Course Performance Breakdown ({enrolledSubjects.length} Enrolled)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Per-subject midterm grades and clinical attendance rates.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Subject Code & Title</th>
                <th className="py-3 px-4 text-center">Midterm Grade</th>
                <th className="py-3 px-4 text-center">Attendance Rate</th>
                <th className="py-3 px-4">Clinical Status</th>
                <th className="py-3 px-4 text-right">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {enrolledSubjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    No enrolled subject grades recorded for current semester.
                  </td>
                </tr>
              ) : (
                enrolledSubjects.map(subj => {
                  const isPassing = subj.grade <= (settings?.retentionThreshold || 2.5);
                  const attRate = subj.components?.attendance || 95;
                  return (
                    <tr key={subj.code} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                        {subj.code}
                        <span className="block text-[10px] text-slate-400 font-normal">{subj.name}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-extrabold font-mono text-sm">
                        <span className={isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {subj.grade.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold font-mono">
                        <span className={attRate >= 85 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                          {attRate}%
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

      {/* 4. Assigned Remedial Exams */}
      <Card className="p-6">
        <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
            Assigned Remedial Exams ({remedialExams.length})
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Scheduled remedial exams for academic clearance per subject. Score 75% or higher to pass.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Exam Date</th>
                <th className="py-3 px-4">Instructions / Notes</th>
                <th className="py-3 px-4 text-right">Outcome & Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {remedialExams.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400">
                    No remedial exams currently assigned to your account.
                  </td>
                </tr>
              ) : (
                remedialExams.map(rem => (
                  <tr key={rem.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                      {rem.subjectCode}
                      <span className="block text-[10px] text-slate-400 font-normal">{rem.subjectName}</span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-semibold">
                      {rem.examDate}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {rem.notes || 'Midterm Remedial Exam'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {rem.status === 'passed' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200/60">
                          PASSED ({rem.remedialScore}%) • Cleared
                        </span>
                      ) : rem.status === 'failed' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200/60">
                          FAILED ({rem.remedialScore}%) • Retained
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200/60">
                          Scheduled / Pending Exam
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Policy & Retention Rules Guide */}
      <Card className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100 mb-3">
          Bicol University CDM Academic Retention Guidelines
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">1. Per-Subject Passing Limit</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Students must maintain a grade of 2.50 or better in each enrolled dental subject to avoid retention warning.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">2. Remedial Exam Policy</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Assigned remedial exams require a score of 75% or higher to resolve retention warnings and clear subject deficiency.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 block">3. Clinical Attendance</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              A minimum attendance rate of 85% is required in clinical laboratories for eligibility to take final examinations.
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
};
