import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  CalendarDays, 
  AlertOctagon,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { getStudentAcademicClassesApi } from '../../services/apiClient';
import type { StudentAcademicClass } from '../../types';

export const Classes: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, attendanceRecords, settings } = useApp();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);

  const [dbClasses, setDbClasses] = useState<StudentAcademicClass[]>([]);
  const [loading, setLoading] = useState<boolean>(isAuthoritative);
  const [error, setError] = useState<string | null>(null);

  const retentionThreshold = settings?.retentionThreshold || 2.5;

  useEffect(() => {
    if (!isAuthoritative) return;
    setLoading(true);
    setError(null);
    getStudentAcademicClassesApi()
      .then((res) => {
        setDbClasses(res.classes);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load course enrollments.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isAuthoritative]);

  // Fallback for development mock students only
  const currentMockStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentNumber = isAuthoritative
    ? (user?.student?.student_number || '—')
    : (currentMockStudent?.studentId || '2024-DENT-0004');

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading enrolled classes and grades…
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

  const failingAuthClasses = dbClasses.filter(
    cls => cls.isClinical && cls.grade !== null && cls.grade > retentionThreshold
  );

  const mockFailing = (currentMockStudent?.enrolledSubjects || []).filter(
    subj => subj.isClinical && subj.grade > retentionThreshold
  );

  const failingCount = isAuthoritative ? failingAuthClasses.length : mockFailing.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Enrolled Classes & Retention Standing
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Review enrolled dentistry subjects, midterm grades, attendance rates, and retention limit compliance.
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

      {/* RETENTION WARNING BANNER IF AT RISK */}
      {failingCount > 0 && (
        <div className="rounded-2xl border-2 border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md">
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
                Retention Standing Warning
              </span>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                You have {failingCount} clinical course(s) exceeding the {retentionThreshold.toFixed(2)} GWA retention threshold limit.
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-13">
            According to Bicol University College of Dentistry retention guidelines, students with clinical grades higher than 2.50 must complete remedial evaluations or faculty counseling to maintain active standing.
          </p>
        </div>
      )}

      {/* Enrolled Subjects Detailed Cards */}
      <div className="space-y-4">
        {isAuthoritative ? (
          dbClasses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              No active course enrollments registered.
            </div>
          ) : (
            dbClasses.map(cls => {
              const isFailing = cls.isClinical && cls.grade !== null && cls.grade > retentionThreshold;
              const isPending = cls.grade === null;
              const isAtRisk = ['warning', 'critical', 'remedial'].includes(cls.retentionState?.toLowerCase());

              return (
                <Card key={cls.enrollmentId} className="p-5 sm:p-6 overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs bg-clinical-50 text-clinical-700 dark:bg-clinical-950/40 dark:text-clinical-300">
                          {cls.courseCode}
                        </span>
                        <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                          {cls.courseName}
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isFailing || isAtRisk
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}>
                          {isFailing ? '⚠️ Retention Risk (> 2.50 Limit)' : (isAtRisk ? `⚠️ ${cls.retentionState}` : '✓ Retention Compliant')}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {cls.units} Academic Units • Section {cls.className} • {cls.semester} {cls.schoolYear}
                        {cls.isClinical ? ' • Clinical Dentistry Practical' : ''}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Clinical Hours Completed: <strong className="text-slate-800 dark:text-slate-100">{cls.clinicHoursCompleted} hrs</strong>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Overall Percentage: <strong className="text-slate-800 dark:text-slate-100">{cls.percentage !== null ? `${cls.percentage}%` : '—'}</strong>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                          Status: <strong className="text-slate-800 dark:text-slate-100">{cls.retentionState || 'Good Standing'}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-6">
                      <div className="text-center min-w-[90px]">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score %</p>
                        <p className="text-xl font-extrabold font-mono mt-0.5 text-slate-800 dark:text-slate-100">
                          {cls.percentage !== null ? `${cls.percentage}%` : '—'}
                        </p>
                      </div>

                      <div className="text-center min-w-[90px]">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Computed GWA</p>
                        <p className={`text-2xl font-extrabold font-mono mt-0.5 ${
                          isPending ? 'text-slate-400' : isFailing ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'
                        }`}>
                          {isPending ? 'Pending' : cls.grade?.toFixed(2)}
                        </p>
                        <p className="text-[9px] text-slate-400">Limit: ≤2.50</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )
        ) : (
          (currentMockStudent?.enrolledSubjects || []).map(subject => {
            const isFailingRetention = subject.isClinical && subject.grade > retentionThreshold;
            const subjectRecords = attendanceRecords.filter(
              r => r.studentId === currentMockStudent?.id && r.subjectCode === subject.code
            );
            const totalAtt = subjectRecords.length;
            const presentAtt = subjectRecords.filter(r => r.status === 'present' || r.status === 'late').length;
            const attRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;

            return (
              <Card key={subject.code} className="p-5 sm:p-6 overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs bg-clinical-50 text-clinical-700 dark:bg-clinical-950/40 dark:text-clinical-300">
                        {subject.code}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                        {subject.name}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        isFailingRetention ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}>
                        {isFailingRetention ? '⚠️ Retention Risk (> 2.50 Limit)' : '✓ Retention Compliant'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {subject.units} Academic Units • Required Clinical Dentistry Practical Course
                    </p>

                    <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Quizzes ({subject.components.quizzes}%): <strong className="text-slate-800 dark:text-slate-100">85%</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Exams ({subject.components.exams}%): <strong className="text-slate-800 dark:text-slate-100">82%</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Attendance: <strong className="text-slate-800 dark:text-slate-100">{attRate !== null ? `${attRate}%` : '—'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-6">
                    <div className="text-center min-w-[90px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance</p>
                      <p className="text-xl font-extrabold font-mono mt-0.5 text-slate-800 dark:text-slate-100">
                        {attRate !== null ? `${attRate}%` : '—'}
                      </p>
                    </div>

                    <div className="text-center min-w-[90px]">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Computed GWA</p>
                      <p className={`text-2xl font-extrabold font-mono mt-0.5 ${isFailingRetention ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                        {subject.grade.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-slate-400">Limit: ≤2.50</p>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Program Retention Policy Reference Card */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="w-4.5 h-4.5 text-clinical-600" />
          Bicol University Dental Medicine Retention Policy Guidelines
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[11px] uppercase">1. Grade Threshold (2.50)</span>
            <p>Students must maintain a GWA of 2.50 or better in all clinical dentistry major subjects.</p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[11px] uppercase">2. Attendance Standard (85%)</span>
            <p>Classroom and clinical practicum attendance must not fall below 85% per semester.</p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[11px] uppercase">3. Remedial Evaluation</span>
            <p>Students flagged with retention warnings may qualify for approved remedial coursework or re-examinations.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
