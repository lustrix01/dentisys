import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { SchoolYearFilter } from '../../components/SchoolYearFilter';
import { Modal } from '../../components/Modal';
import { PendingRequestsBadge } from '../../components/FacultyExcusedRequestsPanel';
import { showFeedback } from '../../components/FeedbackCenter';
import {
  getFacultyActivityApi,
  getFacultyExcusedRequestsApi,
  getFacultyClassesApi,
  getFacultyDashboardKpisApi,
  getFacultyRetentionApi,
  saveFacultyRemedialApi,
  type FacultyClassItem,
  type FacultyRetentionRecord,
} from '../../services/apiClient';
import type { AuditEntry } from '../../services/auditService';
import { AuditCompactList } from '../../components/AuditTrailPage';
import { isViewOnlyClass } from '../../utils/classArchiving';

export const Dashboard: React.FC = () => {
  const { students } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardKpis, setDashboardKpis] = useState<Awaited<ReturnType<typeof getFacultyDashboardKpisApi>> | null>(null);
  const [retentionRecords, setRetentionRecords] = useState<FacultyRetentionRecord[]>([]);
  const [retentionError, setRetentionError] = useState('');
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);
  const [activityError, setActivityError] = useState('');
  const [facultyClasses, setFacultyClasses] = useState<FacultyClassItem[]>([]);
  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState('');

  // Search input state
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolYear, setSchoolYear] = useState('current');
  const [pendingRequests, setPendingRequests] = useState(0);
  useEffect(() => {
    getFacultyExcusedRequestsApi()
      .then(res => setPendingRequests((res.requests ?? []).filter(r => r.status === 'pending').length))
      .catch(() => setPendingRequests(0));
  }, []);

  const loadDashboard = useCallback(() => {
    setSelectedClassId('');
    setLoading(true);
    setDashboardError('');
    Promise.allSettled([getFacultyDashboardKpisApi(schoolYear), getFacultyRetentionApi(), getFacultyActivityApi(), getFacultyClassesApi()])
      .then(([kpiResult, retentionResult, activityResult, classesResult]) => {
        if (activityResult.status === 'fulfilled') {
          setRecentActivity(Array.isArray(activityResult.value.entries) ? activityResult.value.entries.slice(0, 5) : []);
          setActivityError('');
        } else {
          setRecentActivity([]);
          setActivityError(activityResult.reason instanceof Error ? activityResult.reason.message : 'Recent activity is unavailable.');
        }
        if (classesResult.status === 'fulfilled') {
          setFacultyClasses(Array.isArray(classesResult.value.classes) ? classesResult.value.classes : []);
        } else {
          setFacultyClasses([]);
        }
        if (kpiResult.status === 'fulfilled') {
          setDashboardKpis(kpiResult.value);
        } else {
          setDashboardKpis(null);
          setDashboardError(kpiResult.reason instanceof Error ? kpiResult.reason.message : 'Unable to connect to backend server.');
        }
        if (retentionResult.status === 'fulfilled') {
          setRetentionRecords(Array.isArray(retentionResult.value.retention) ? retentionResult.value.retention : []);
          setRetentionError('');
        } else {
          setRetentionRecords([]);
          setRetentionError(retentionResult.reason instanceof Error
            ? retentionResult.reason.message
            : 'Authoritative retention data is unavailable.');
        }
        setLoading(false);
      });
  }, [schoolYear]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const assignedSubjects = useMemo(
    () => dashboardKpis?.classes.map(classItem => classItem.courseCode) ?? [],
    [dashboardKpis],
  );
  const assignedClasses = useMemo(
    () => dashboardKpis?.classes.map(classItem => classItem.id) ?? [],
    [dashboardKpis],
  );

  // States for Recording Remedial Score
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState<string>('');
  const [remedialNotes, setRemedialNotes] = useState<string>('');
  const [remedialOutcome, setRemedialOutcome] = useState<'passed' | 'failed'>('passed');
  const [reattemptDate, setReattemptDate] = useState<string>('');

  // Extract unique subjects
  const allSubjects = Array.from(
    new Set(
      students.flatMap(s => s.enrolledSubjects.map(sub => JSON.stringify({ code: sub.code, name: sub.name })))
    )
  ).map(str => JSON.parse(str) as { code: string; name: string });

  // RBAC filter on subjects
  const subjects = allSubjects.filter(subj => assignedSubjects.includes(subj.code));
  const activeSubjects = dashboardKpis?.classes.map(classItem => ({
    code: classItem.courseCode,
    name: classItem.courseName,
  })).filter((subject, index, values) => values.findIndex(item => item.code === subject.code) === index) ?? subjects;

  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');

  useEffect(() => {
    if (!selectedClassId && assignedClasses[0]) {
      setSelectedClassId(assignedClasses[0]);
    }
  }, [assignedClasses, selectedClassId]);

  useEffect(() => {
    if (!selectedSubjectCode && activeSubjects[0]) {
      setSelectedSubjectCode(activeSubjects[0].code);
    }
  }, [activeSubjects, selectedSubjectCode]);

  // Filter students based on selected class and subjects (RBAC)
  const facultyStudents = students.filter(s =>
    s.enrolledSubjects.some(sub => sub.classId === selectedClassId && assignedSubjects.includes(sub.code))
  );

  // Filtered search results across subjects and students
  const filteredSearchSubjects = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return activeSubjects.filter(s => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [activeSubjects, searchQuery]);

  const filteredSearchStudents = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return facultyStudents.filter(s => s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q));
  }, [facultyStudents, searchQuery]);

  // Statistics
  const facultyTotalStudents = dashboardKpis?.kpis.assignedStudents ?? 0;
  const atRiskCount = dashboardKpis?.kpis.retentionAlerts ?? 0;

  // Pending remedials
  const pendingRemedials = useMemo(() => {
    return retentionRecords.flatMap(record => {
      // Only sections inside the selected school year (assignedClasses comes from the scoped KPI response).
      if (assignedClasses.length > 0 && !assignedClasses.includes(String(record.classId))) {
        return [];
      }

      const progression = record.remedialProgression;
      const legacyRemedial = record.remedial as Record<string, unknown> | null;

      let isPending = false;
      let attemptNumber: 1 | 2 = 1;
      let scheduledDate: string | null = null;
      let notes = '';

      // 1. Canonical remedial progression
      if (progression) {
        if (progression.stage === 'attempt_1_pending') {
          isPending = true;
          attemptNumber = 1;
        } else if (progression.stage === 'attempt_2_pending') {
          isPending = true;
          attemptNumber = 2;
        }

        const pendingAttempt = Array.isArray(progression.attempts)
          ? progression.attempts.find(a => a.outcome === 'pending' || (a as unknown as { status?: string }).status === 'pending')
          : undefined;

        if (pendingAttempt) {
          isPending = true;
          attemptNumber = pendingAttempt.attemptNumber === 2 ? 2 : 1;
          scheduledDate = pendingAttempt.scheduledDate ?? null;
          notes = pendingAttempt.notes ?? '';
        }
      }

      // 2. Fallback to legacy remedial format
      if (!isPending && legacyRemedial) {
        const legacyStatus = legacyRemedial.status ?? (legacyRemedial as { outcome?: string }).outcome;
        if (legacyStatus === 'pending' || record.state === 'remedial') {
          isPending = true;
          attemptNumber = 1;
          notes = typeof legacyRemedial.notes === 'string' ? legacyRemedial.notes : '';
        }
      }

      // 3. Fallback to record.state === 'remedial' if stage is not cleared/cost_recovery
      if (!isPending && record.state === 'remedial' && progression?.stage !== 'passed' && progression?.stage !== 'cost_recovery_passed') {
        isPending = true;
        attemptNumber = progression?.stage === 'attempt_2_available' || progression?.stage === 'attempt_2_pending' ? 2 : 1;
      }

      if (!isPending) return [];

      return [{
        id: record.enrollmentId,
        studentName: record.studentName || 'Student name unavailable',
        subjectCode: record.subjectCode || 'Subject unavailable',
        originalGrade: record.gwa,
        attemptNumber,
        scheduledDate,
        record,
        remedial: legacyRemedial ?? {},
        notes,
      }];
    });
  }, [retentionRecords, assignedClasses]);

  // Calculate class-specific attendance rate
  const selectedClassSummary = dashboardKpis?.classes.find(classItem => classItem.id === selectedClassId);
  const classAttendanceRate = selectedClassSummary?.attendance ?? null;

  const handleResolveRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = Number(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      showFeedback('Please enter a valid score (0-100).', 'error');
      return;
    }
    const outcomeContradictsScore = remedialOutcome === 'passed' ? scoreVal < 50 : scoreVal >= 50;
    if (outcomeContradictsScore) {
      showFeedback('The selected outcome does not match the score. 50% or higher passes.', 'error');
      return;
    }
    const selected = pendingRemedials.find(row => row.id === selectedRemedialId);
    if (!selected) return;
    try {
      const saved = await saveFacultyRemedialApi({
        enrollmentId: selected.record.enrollmentId,
        studentId: selected.record.studentId,
        classId: selected.record.classId,
        attemptNumber: selected.attemptNumber,
        percentage: scoreVal,
        notes: remedialNotes.trim() || undefined,
        remedial: {
          ...(selected.remedial || {}),
          status: remedialOutcome,
          remedialScore: scoreVal,
          notes: remedialNotes.trim() || undefined,
        },
      });

      let attempt2Failed = false;
      if (selected.attemptNumber === 1 && scoreVal < 50 && reattemptDate.trim().length > 0) {
        try {
          await saveFacultyRemedialApi({
            enrollmentId: selected.record.enrollmentId,
            studentId: selected.record.studentId,
            classId: selected.record.classId,
            attemptNumber: 2,
            scheduledDate: reattemptDate.trim(),
            notes: 'Scheduled for Attempt 2 re-attempt',
          });
        } catch {
          attempt2Failed = true; // Attempt 1 is already saved
        }
      }

      setSelectedRemedialId(null);
      setRemedialScore('');
      setRemedialNotes('');
      setReattemptDate('');
      setRemedialOutcome('passed');
      const notifiedText = saved.notification?.created === true ? ' Student notified.' : '';
      if (attempt2Failed) showFeedback(`Attempt 1 was saved but Attempt 2 could not be scheduled. Schedule it again from Retention Monitoring.${notifiedText}`, 'error');
      else showFeedback(`Remedial exam result recorded successfully.${notifiedText}`, 'success');
      loadDashboard();
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Unable to persist the remedial result.', 'error');
    }
  };

  const activeRemedialToRecord = pendingRemedials.find(r => r.id === selectedRemedialId);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        Loading faculty workspace data…
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="p-8 text-center space-y-3 max-w-md mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{dashboardError}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="px-5 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-bold transition-all shadow-md"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {user?.display_name || 'Faculty Member'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Access your assigned dental courses, grade computations, student attendance records, and retention evaluations in one place.
          </p>
          <PendingRequestsBadge count={pendingRequests} className="mt-2" />
        </div>
        <SchoolYearFilter
          value={schoolYear}
          currentSchoolYear={dashboardKpis?.currentSchoolYear}
          availableSchoolYears={dashboardKpis?.availableSchoolYears}
          onChange={setSchoolYear}
        />
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Main Workspace Column (Spans 8) */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* 2. Faculty Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Faculty Operations & Class Management
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Manage your assigned subject sections, encode student grades, evaluate retention alerts, and monitor daily attendance logs.
                </p>
              </div>

              <button
                onClick={() => navigate('/classes')}
                className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-clinical-600/20 transition-all cursor-pointer flex-shrink-0"
              >
                <span>Manage Classes</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Consolidated Faculty Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-[92px] min-w-0">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight min-h-[28px] break-words xl:break-normal">
                  {schoolYear === 'current' ? 'Currently Assigned Classes' : schoolYear === 'all' ? 'Assigned Classes (All Years)' : `Assigned Classes (${schoolYear})`}
                </span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-2 break-words xl:break-normal">
                  {dashboardKpis?.kpis.activeClasses ?? 0}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-[92px] min-w-0">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight min-h-[28px] break-words xl:break-normal">Active Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-2 break-words xl:break-normal">
                  {facultyTotalStudents}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-[92px] min-w-0">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight min-h-[28px] break-words xl:break-normal">Attendance Rate</span>
                <span className="text-lg font-extrabold text-clinical-600 dark:text-clinical-400 block mt-2 break-words xl:break-normal">
                  {(() => {
                    const rate = classAttendanceRate ?? dashboardKpis?.kpis.averageAttendance ?? null;
                    return rate === null ? 'N/A' : `${rate}%`;
                  })()}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-[92px] min-w-0">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight min-h-[28px] break-words xl:break-normal">At-Risk Watchlist</span>
                <span className={`text-lg font-extrabold block mt-2 break-words xl:break-normal ${atRiskCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
                  {atRiskCount}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1 flex flex-col justify-between min-h-[92px] min-w-0">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block leading-tight min-h-[28px] break-words xl:break-normal">Pending Remedials</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-2 break-words xl:break-normal">
                  {dashboardKpis?.kpis.remedialCount ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Search Bar Section */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Search Classes & Students
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search courses or students…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-clinical-500 dark:text-slate-100 placeholder-slate-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Filtered Search Results */}
            {searchQuery.trim() !== '' && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700 text-xs space-y-2 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Search Results</div>
                {filteredSearchSubjects.length === 0 && filteredSearchStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-1">No matching classes or students found.</p>
                ) : (
                  <>
                    {filteredSearchSubjects.map(sub => (
                      <div 
                        key={sub.code} 
                        onClick={() => { setSelectedSubjectCode(sub.code); setSearchQuery(''); }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-clinical-50 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                      >
                        <span className="font-bold text-clinical-600 dark:text-clinical-400">{sub.code} — {sub.name}</span>
                        <span className="text-[10px] bg-clinical-100 text-clinical-700 px-2 py-0.5 rounded-md font-semibold">Course</span>
                      </div>
                    ))}
                    {filteredSearchStudents.map(st => (
                      <div 
                        key={st.id} 
                        onClick={() => { navigate('/students'); setSearchQuery(''); }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-clinical-50 dark:hover:bg-slate-800 flex justify-between items-center cursor-pointer"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{st.name} ({st.studentId})</span>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md font-semibold">Student</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Sidebar Panel (Spans 4) */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Widget: Pending Remedials */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">Pending Remedials</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Authoritative</span>
                <button
                  type="button"
                  onClick={() => navigate('/retention')}
                  className="whitespace-nowrap text-[10px] font-semibold text-clinical-600 hover:text-clinical-700 dark:text-clinical-400 hover:underline"
                >
                  View All &rarr;
                </button>
              </div>
            </div>
            {retentionError ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">{retentionError}</p>
            ) : pendingRemedials.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No pending remedial records.</p>
            ) : (
              <div className="space-y-2">
                {pendingRemedials.slice(0, 5).map(remedial => (
                  <button
                    key={remedial.id}
                    type="button"
                    onClick={() => {
                      setSelectedRemedialId(remedial.id);
                      setRemedialScore('');
                      setRemedialNotes(remedial.notes || '');
                      setRemedialOutcome('passed');
                      setReattemptDate('');
                    }}
                    className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 hover:border-clinical-400 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{remedial.studentName}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        Attempt {remedial.attemptNumber}
                      </span>
                    </div>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {remedial.subjectCode} · {remedial.scheduledDate ? `Scheduled: ${remedial.scheduledDate}` : 'Record result'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Widget 3: Today's Schedule */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Class Details
              </h3>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Current classes</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {activeSubjects.slice(0, 2).map((subj, idx) => (
                <div key={subj.code} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between max-xl:flex-col max-xl:items-stretch max-xl:gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-clinical-50 dark:bg-clinical-950/60 text-clinical-600 dark:text-clinical-400 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-100">{subj.code}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{subj.name}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-clinical-100 text-clinical-700 dark:bg-clinical-950 dark:text-clinical-300 rounded-md max-xl:self-start max-xl:ml-10">
                    {(() => {
                      const match = facultyClasses.find(c => c.courseCode === subj.code && !isViewOnlyClass(c))
                        ?? facultyClasses.find(c => c.courseCode === subj.code);
                      return match?.lecRoom || match?.labRoom || 'Room not set';
                    })()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 4: Recent Activity */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Recent Activity
              </h3>
              <button 
                onClick={() => navigate('/faculty/audit-trail')}
                className="text-[10px] font-bold text-clinical-600 dark:text-clinical-400 hover:underline"
              >
                View Log
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {activityError ? (
                <p className="p-2.5 text-slate-500 dark:text-slate-400">{activityError}</p>
              ) : recentActivity.length === 0 ? (
                <p className="p-2.5 text-slate-500 dark:text-slate-400">No recent activity recorded.</p>
              ) : (
                <AuditCompactList entries={recentActivity} variant="cards" />
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Record Remedial Score Modal */}
      <Modal
        isOpen={selectedRemedialId !== null}
        onClose={() => setSelectedRemedialId(null)}
        title={`Record Remedial Score (Attempt ${activeRemedialToRecord?.attemptNumber ?? 1})`}
      >
        {activeRemedialToRecord && (
          <form onSubmit={handleResolveRemedial} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <div><span className="text-slate-500 dark:text-slate-400 font-semibold">Student:</span> <strong className="text-slate-800 dark:text-slate-200">{activeRemedialToRecord.studentName}</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 font-semibold">Subject:</span> <strong className="text-clinical-600 dark:text-clinical-400">{activeRemedialToRecord.subjectCode}</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 font-semibold">Original Grade:</span> <strong className="text-rose-500">{activeRemedialToRecord.originalGrade ?? 'N/A'}</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 font-semibold">Current Attempt:</span> <span className="font-bold text-amber-600">Attempt {activeRemedialToRecord.attemptNumber}</span></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Remedial Exam Percentage Score (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="Enter score (e.g. 75)"
                value={remedialScore}
                onChange={(e) => {
                  const val = e.target.value;
                  setRemedialScore(val);
                  const num = Number(val);
                  if (!isNaN(num) && val !== '') {
                    setRemedialOutcome(num >= 50 ? 'passed' : 'failed');
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-clinical-500 text-xs outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Authoritative Outcome
              </label>
              <select
                value={remedialOutcome}
                onChange={event => setRemedialOutcome(event.target.value as 'passed' | 'failed')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-clinical-500 text-xs outline-none"
              >
                <option value="passed">Pass (Grade Cleared)</option>
                {activeRemedialToRecord.attemptNumber === 1 ? (
                  <option value="failed">Re-attempt (Allow Attempt 2)</option>
                ) : (
                  <option value="failed">Cost Recovery (Transfer to Cost Recovery)</option>
                )}
              </select>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {remedialOutcome === 'passed'
                  ? 'Student will be marked as cleared and notified.'
                  : activeRemedialToRecord.attemptNumber === 1
                    ? 'Student will be marked for Attempt 2 re-attempt.'
                    : 'Student will be moved to Cost Recovery program.'}
              </p>
            </div>

            {activeRemedialToRecord.attemptNumber === 1 && remedialOutcome === 'failed' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  Optional Attempt 2 Scheduled Date
                </label>
                <input
                  type="date"
                  min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())}
                  value={reattemptDate}
                  onChange={(e) => setReattemptDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-clinical-500 text-xs outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                Faculty Remarks / Notes
              </label>
              <textarea
                rows={2}
                placeholder="Optional comments regarding student remedial performance..."
                value={remedialNotes}
                onChange={(e) => setRemedialNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-clinical-500 text-xs outline-none"
              />
            </div>

            <div className="pt-3 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setSelectedRemedialId(null);
                  navigate('/retention');
                }}
                className="text-xs font-semibold text-clinical-600 hover:text-clinical-700 hover:underline"
              >
                Open in Retention Monitoring &rarr;
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRemedialId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-clinical-600 hover:bg-clinical-700 shadow-md shadow-clinical-600/20 transition-all"
                >
                  Save Result
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
};
