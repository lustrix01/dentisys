import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  Pencil, 
  Trash2,
  Lock,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import {
  saveFacultyRemedialApi,
  updateFacultyRetentionStatusApi,
  getFacultyClassesApi,
  getFacultyCoursesApi,
  FacultyClassItem,
  CourseCatalogItem
} from '../../services/apiClient';

export interface SubjectWatchlistItem {
  id: string;
  studentId: string;
  studentName: string;
  studentIdNum: string;
  yearLevel: number;
  subjectCode: string;
  subjectName: string;
  midtermGrade: number;
  cause: string;
  status: Student['status'];
  hasPendingRemedial: boolean;
  student: Student;
}

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const { 
    students = [], 
    settings = { retentionThreshold: 2.5 }, 
    addRemedialExam, 
    updateRemedialExam, 
    deleteRemedialExam,
    overrideRetentionStatus 
  } = useApp();

  // Dynamic Faculty Classes & Courses State for Course Filtering
  const [facultyClasses, setFacultyClasses] = useState<FacultyClassItem[]>([]);
  const [facultyCourses, setFacultyCourses] = useState<CourseCatalogItem[]>([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('all');

  useEffect(() => {
    getFacultyClassesApi()
      .then(res => { if (res?.classes) setFacultyClasses(res.classes); })
      .catch(() => {});
    getFacultyCoursesApi()
      .then(res => { if (res?.courses) setFacultyCourses(res.courses); })
      .catch(() => {});
  }, []);

  // Tab Management: 'watchlist' | 'remedials'
  const [activeTab, setActiveTab] = useState<'watchlist' | 'remedials'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  // Record Score modal states
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState('');
  const [remedialNotes, setRemedialNotes] = useState('');

  // Schedule Remedial modal states
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('CLIN401');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Manual status override states
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideStudentId, setOverrideStudentId] = useState('');
  const [overrideStatus, setOverrideStatus] = useState<Student['status']>('warning');
  const [overrideRemarks, setOverrideRemarks] = useState('');

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Track Midterm completion per course code
  const [completedMidtermCourses, setCompletedMidtermCourses] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('dentisys_midterm_completion_map');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { CLIN401: true, CLIN402: true };
  });

  const toggleMidtermCompletion = (courseCode: string) => {
    setCompletedMidtermCourses(prev => {
      const target = courseCode === 'all' ? 'CLIN401' : courseCode;
      const nextState = !prev[target];
      const updated = { ...prev, [target]: nextState };
      if (courseCode === 'all') {
        courseOptions.forEach(({ code }) => {
          updated[code] = nextState;
        });
      }
      localStorage.setItem('dentisys_midterm_completion_map', JSON.stringify(updated));
      return updated;
    });
  };

  // Safe students array
  const safeStudents = useMemo(() => students || [], [students]);

  // Derived distinct Course Options for filtering (restricted to faculty's assigned classes)
  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    facultyClasses.forEach(c => {
      if (c.courseCode) {
        map.set(c.courseCode.toUpperCase(), c.courseName || c.courseCode);
      }
    });
    if (map.size === 0) {
      safeStudents.forEach(s => {
        (s.enrolledSubjects || []).forEach(sub => {
          if (sub.code && !map.has(sub.code.toUpperCase())) {
            map.set(sub.code.toUpperCase(), sub.name || sub.code);
          }
        });
      });
    }
    if (map.size === 0) {
      map.set('CLIN401', 'Clinical Dentistry I');
      map.set('CLIN402', 'Clinical Dentistry II');
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [facultyClasses, safeStudents]);

  // Check if midterm grading is completed for the currently selected course
  const isMidtermComplete = useMemo(() => {
    if (selectedCourseCode === 'all') {
      return courseOptions.length > 0 && courseOptions.every(({ code }) => completedMidtermCourses[code] !== false);
    }
    return completedMidtermCourses[selectedCourseCode] !== false;
  }, [selectedCourseCode, courseOptions, completedMidtermCourses]);

  // Subject-level retention watchlist derivation (Evaluates Midterm Course Grade > 2.50)
  const subjectWatchlistItems = useMemo<SubjectWatchlistItem[]>(() => {
    const items: SubjectWatchlistItem[] = [];
    const assignedCourseCodes = new Set(
      facultyClasses
        .map(c => c.courseCode?.toUpperCase())
        .filter((code): code is string => Boolean(code))
    );

    safeStudents.forEach(student => {
      let subs = student.enrolledSubjects || [];
      if (subs.length === 0) {
        subs = [
          { code: 'CLIN401', name: 'Clinical Dentistry I', units: 4, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: student.overallGWA || 2.75, hasRemedial: false },
          { code: 'CLIN402', name: 'Clinical Dentistry II', units: 4, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 2.5, hasRemedial: false }
        ];
      }

      subs.forEach(sub => {
        const codeUpper = sub.code.toUpperCase();
        if (assignedCourseCodes.size > 0 && !assignedCourseCodes.has(codeUpper)) {
          return;
        }

        const subGrade = sub.grade || student.overallGWA || 2.75;
        const subRemedials = (student.remedialExams || []).filter(r => r.subjectCode?.toUpperCase() === codeUpper);
        const hasPendingRem = subRemedials.some(r => r.status === 'pending');
        const hasFailedRem = subRemedials.some(r => r.status === 'failed');

        const isAtRisk = subGrade > 2.50 || student.status === 'warning' || student.status === 'critical' || student.status === 'remedial' || subRemedials.length > 0;

        if (isAtRisk) {
          let cause = `Midterm subject grade (${subGrade.toFixed(2)}) exceeds 2.50 limit`;
          if (hasFailedRem) {
            cause = `Failed Remedial Exam for ${sub.code} - Subject Retained`;
          } else if (hasPendingRem) {
            cause = `Pending Remedial Exam Scheduled for Final Grade`;
          } else if (student.status === 'critical') {
            cause = `Critical Retention Watchlist - Grade (${subGrade.toFixed(2)}) > 2.50`;
          }

          items.push({
            id: `${student.id}-${sub.code}`,
            studentId: student.id,
            studentName: student.name || 'Unknown Student',
            studentIdNum: student.studentId || '2024-000',
            yearLevel: student.yearLevel || 4,
            subjectCode: sub.code,
            subjectName: sub.name,
            midtermGrade: subGrade,
            cause,
            status: student.status || 'warning',
            hasPendingRemedial: hasPendingRem,
            student
          });
        }
      });
    });

    return items;
  }, [safeStudents, facultyClasses]);

  // Filter Watchlist items based on selected Course & Search Query
  const filteredWatchlist = useMemo(() => {
    return subjectWatchlistItems.filter(item => {
      const matchesCourse = selectedCourseCode === 'all' || item.subjectCode.toUpperCase() === selectedCourseCode.toUpperCase();
      const matchesSearch =
        item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.studentIdNum.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subjectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subjectName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCourse && matchesSearch;
    });
  }, [subjectWatchlistItems, selectedCourseCode, searchQuery]);

  // List of all active remedial exams filtered by course
  const allRemedialExams = useMemo(() => {
    const assignedCourseCodes = new Set(
      facultyClasses
        .map(c => c.courseCode?.toUpperCase())
        .filter((code): code is string => Boolean(code))
    );

    return safeStudents.flatMap(s =>
      (s.remedialExams || []).map(rem => ({
        ...rem,
        studentName: s.name || 'Unknown Student',
        studentIdNum: s.studentId || '2024-000',
        yearLevel: s.yearLevel || 4
      }))
    ).filter(rem => {
      const codeUpper = rem.subjectCode?.toUpperCase();
      if (assignedCourseCodes.size > 0 && codeUpper && !assignedCourseCodes.has(codeUpper)) {
        return false;
      }
      if (selectedCourseCode === 'all') return true;
      return codeUpper === selectedCourseCode.toUpperCase() || rem.subjectName?.toUpperCase().includes(selectedCourseCode.toUpperCase());
    });
  }, [safeStudents, facultyClasses, selectedCourseCode]);

  const filteredRemedials = useMemo(() => {
    return allRemedialExams.filter(rem => 
      (rem.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allRemedialExams, searchQuery]);

  // Handler: Record & Grade Remedial Exam Result
  const handleResolveRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      showFeedback('Please enter a valid percentage score (0-100).', 'error');
      return;
    }
    const owner = safeStudents.find((student) => (student.remedialExams || []).some((exam) => exam.id === selectedRemedialId));
    const exam = owner?.remedialExams?.find((item) => item.id === selectedRemedialId);
    if (!owner || !exam) return;
    try {
      await saveFacultyRemedialApi({
        studentId: owner.id,
        classId: owner.classId,
        remedial: {
          ...exam,
          remedialScore: scoreVal,
          notes: remedialNotes,
          status: scoreVal >= 75 ? 'passed' : 'failed',
        },
      });
      if (updateRemedialExam) updateRemedialExam(selectedRemedialId, scoreVal, remedialNotes);
      setSelectedRemedialId(null);
      setRemedialScore('');
      setRemedialNotes('');
      setNotification({
        type: 'success',
        message: `Remedial Exam grade recorded: ${scoreVal}% (${scoreVal >= 75 ? 'PASSED - Subject Cleared' : 'FAILED - Subject Retained'})`
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save remedial result.', 'error');
    }
  };

  // Handler: Schedule Remedial Exam
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !scheduleDate) {
      showFeedback('Please complete all required fields.', 'error');
      return;
    }
    const student = safeStudents.find(s => s.id === selectedStudentId);
    
    if (student) {
      const subInfo = courseOptions.find(c => c.code.toUpperCase() === selectedSubjectCode.toUpperCase());
      const subjectName = subInfo ? subInfo.name : (selectedSubjectCode === 'CLIN401' ? 'Clinical Dentistry I' : selectedSubjectCode);
      const targetSub = student.enrolledSubjects?.find(sub => sub.code.toUpperCase() === selectedSubjectCode.toUpperCase());
      const origGrade = targetSub?.grade || student.overallGWA || 2.75;

      const remedial = {
        studentId: selectedStudentId,
        studentName: student.name,
        subjectCode: selectedSubjectCode,
        subjectName: subjectName,
        originalGrade: origGrade,
        examDate: scheduleDate,
        notes: scheduleNotes || 'Final Subject Grade Remedial Exam',
        status: 'pending' as const,
      };
      try {
        await saveFacultyRemedialApi({
          enrollmentId: `enr-${Date.now()}`,
          studentId: student.id,
          classId: 'cls-1',
          remedial,
        });
        if (addRemedialExam) addRemedialExam(remedial);
        setNotification({
          type: 'success',
          message: `Remedial Exam scheduled for ${student.name} in ${selectedSubjectCode} on ${scheduleDate}!`
        });
      } catch (requestError) {
        if (addRemedialExam) addRemedialExam(remedial);
        showFeedback('Remedial exam scheduled locally.', 'info');
      }
      setIsScheduleOpen(false);
      setSelectedStudentId('');
      setScheduleDate('');
      setScheduleNotes('');
    }
  };

  // Handler: Status Override
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStudentId || !overrideRemarks) return;

    const student = safeStudents.find((item) => item.id === overrideStudentId);
    if (!student) return;

    try {
      await updateFacultyRetentionStatusApi({
        studentId: student.id,
        classId: 'cls-1',
        status: overrideStatus,
        reason: overrideRemarks,
      });
      if (overrideRetentionStatus) overrideRetentionStatus(overrideStudentId, overrideStatus, overrideRemarks, user?.login_email || 'faculty');
      setIsOverrideOpen(false);
      setOverrideStudentId('');
      setOverrideRemarks('');
      setNotification({
        type: 'success',
        message: `Retention status for ${student.name} updated to ${overrideStatus.toUpperCase()}!`
      });
    } catch (requestError) {
      if (overrideRetentionStatus) overrideRetentionStatus(overrideStudentId, overrideStatus, overrideRemarks, user?.login_email || 'faculty');
      setIsOverrideOpen(false);
      setNotification({
        type: 'success',
        message: `Retention status for ${student.name} updated!`
      });
    }
  };

  const handleDeleteRemedial = async (id: string) => {
    if (await requestConfirmation('Remove this remedial exam log?', 'Remove remedial log')) {
      if (deleteRemedialExam) deleteRemedialExam(id);
      setNotification({
        type: 'info',
        message: 'Remedial record removed.'
      });
    }
  };

  const getStatusBadge = (status: Student['status']) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60',
      warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60',
      critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60',
      remedial: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${styles[status] || styles.active}`}>
        {status || 'active'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Retention & Remedial Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Monitor subject-level student retention based on Midterm grades (&gt; 2.50 risk threshold) and manage course remedial exams for final grade outcomes.
          </p>
        </div>

        {/* Top Right Action Button */}
        <div>
          <button
            onClick={() => {
              setIsScheduleOpen(true);
              setSelectedStudentId('');
              setSelectedSubjectCode(selectedCourseCode !== 'all' ? selectedCourseCode : 'CLIN401');
              setScheduleDate(new Date().toISOString().split('T')[0]);
              setScheduleNotes('');
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Remedial</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Control Bar: Tabs & Filter Dropdowns Below */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        {/* Tab Navigation (Text Only - No Icons) */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'watchlist' 
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Retention Watchlist ({isMidtermComplete ? subjectWatchlistItems.length : 0})
          </button>

          <button
            onClick={() => { setActiveTab('remedials'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'remedials' 
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Remedial Exams ({allRemedialExams.filter(e => e.status === 'pending').length} Pending)
          </button>
        </div>

        {/* Filters & Search Bar Positioned Below */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Midterm Completion Status Toggle */}
          <button
            onClick={() => toggleMidtermCompletion(selectedCourseCode)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
              isMidtermComplete
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-100'
            }`}
            title="Toggle Midterm Completion Status for Course"
          >
            {isMidtermComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Midterm Complete</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Midterm Incomplete</span>
              </>
            )}
          </button>

          {/* Course Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Courses</option>
              {courseOptions.map(({ code, name }) => (
                <option key={code} value={code}>{code} - {name}</option>
              ))}
            </select>
          </div>

          {/* School Year Selector Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="2025-2026">S.Y. 2025-2026 (Current)</option>
              <option value="2024-2025">S.Y. 2024-2025</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student or course..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          TAB 1: RETENTION WATCHLIST (MIDTERM COURSE GRADE > 2.5)
      ---------------------------------------------------- */}
      {activeTab === 'watchlist' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                  Retention Watchlist ({isMidtermComplete ? filteredWatchlist.length : 0})
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  isMidtermComplete
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60'
                }`}>
                  {isMidtermComplete ? 'Midterm Complete' : 'Midterm Incomplete'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Evaluated per subject course. Midterm grades exceeding 2.50 put students at retention risk for that course once midterm grading is finalized.
              </p>
            </div>

            {isMidtermComplete && (
              <button
                onClick={() => {
                  setIsScheduleOpen(true);
                  setSelectedStudentId('');
                  setSelectedSubjectCode(selectedCourseCode !== 'all' ? selectedCourseCode : 'CLIN401');
                  setScheduleDate(new Date().toISOString().split('T')[0]);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Remedial Exam</span>
              </button>
            )}
          </div>

          {!isMidtermComplete ? (
            <div className="py-12 px-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-200">
                Retention Watchlist Locked – Midterm Grading Incomplete
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                The retention watchlist will not display students until all midterm scores and subject grades are complete for {selectedCourseCode === 'all' ? 'assigned courses' : selectedCourseCode}.
              </p>
              <button
                onClick={() => toggleMidtermCompletion(selectedCourseCode)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Midterm Grading Complete to Unlock Watchlist</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Course / Subject</th>
                  <th className="py-3 px-4 text-center">Midterm Grade</th>
                  <th className="py-3 px-4">Retention Violation Cause</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                      No students currently at risk of retention for the selected course filter.
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">{item.studentName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.studentIdNum} • Year {item.yearLevel}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold font-mono text-[11px] block w-fit">
                          {item.subjectCode}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 max-w-[180px] truncate">{item.subjectName}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-extrabold font-mono text-sm">
                        <span className={`px-2.5 py-1 rounded-lg ${
                          item.midtermGrade > 2.75
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60'
                        }`}>
                          {item.midtermGrade.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold text-[11px] border border-rose-200/60 block w-fit">
                          {item.cause}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {getStatusBadge(item.status)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentId(item.studentId);
                              setSelectedSubjectCode(item.subjectCode);
                              setScheduleDate(new Date().toISOString().split('T')[0]);
                              setIsScheduleOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Remedial</span>
                          </button>

                          <button
                            onClick={() => {
                              setOverrideStudentId(item.studentId);
                              setOverrideStatus(item.status);
                              setOverrideRemarks('');
                              setIsOverrideOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-[11px] font-bold cursor-pointer"
                            title="Override Retention Status"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 2: REMEDIAL EXAMS MANAGEMENT
      ---------------------------------------------------- */}
      {activeTab === 'remedials' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Remedial Exam Management ({filteredRemedials.length})
              </h2>
              <p className="text-xs text-slate-400">
                Track scheduled remedial exams, input percentage scores, and resolve student retention status.
              </p>
            </div>

            <button
              onClick={() => {
                setIsScheduleOpen(true);
                setSelectedStudentId('');
                setScheduleDate(new Date().toISOString().split('T')[0]);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Remedial Exam</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Course Section</th>
                  <th className="py-3 px-4">Exam Date</th>
                  <th className="py-3 px-4">Score & Outcome</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRemedials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      No pending or completed remedial exams logged.
                    </td>
                  </tr>
                ) : (
                  filteredRemedials.map(rem => (
                    <tr key={rem.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                        {rem.studentName}
                        <span className="block text-[10px] text-slate-400 font-mono">{rem.studentIdNum}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold text-[10px]">
                          {rem.subjectCode} - {rem.subjectName}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {rem.examDate}
                      </td>

                      <td className="py-3.5 px-4">
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

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {rem.status === 'pending' && (
                            <button
                              onClick={() => {
                                setSelectedRemedialId(rem.id);
                                setRemedialScore('75');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                            >
                              Grade Exam
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteRemedial(rem.id)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                            title="Remove Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}



      {/* Modal: Schedule Remedial Exam */}
      {isScheduleOpen && (
        <Modal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} title="Schedule Remedial Exam">
          <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select Student</label>
              <select
                required
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value="">-- Choose Student --</option>
                {safeStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course Section</label>
              <select
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                {courseOptions.map(({ code, name }) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Exam Date</label>
              <input
                type="date"
                required
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Notes / Instructions</label>
              <textarea
                rows={3}
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="Specify clinical topics or exam room instructions..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20"
              >
                Confirm & Schedule Exam
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Grade / Record Remedial Exam Result */}
      {selectedRemedialId && (
        <Modal isOpen={!!selectedRemedialId} onClose={() => setSelectedRemedialId(null)} title="Grade Remedial Exam Result">
          <form onSubmit={handleResolveRemedial} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Percentage Score (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                placeholder="e.g. 85"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold text-sm"
              />
              <span className="text-[11px] text-slate-400 block mt-1">Passing score threshold is 75%. Scores ≥ 75% will automatically clear the student.</span>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty Remarks</label>
              <textarea
                rows={3}
                value={remedialNotes}
                onChange={(e) => setRemedialNotes(e.target.value)}
                placeholder="Faculty notes on clinical performance..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedRemedialId(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20"
              >
                Save Exam Grade
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Override Status */}
      {isOverrideOpen && (
        <Modal isOpen={isOverrideOpen} onClose={() => setIsOverrideOpen(false)} title="Override Retention Status">
          <form onSubmit={handleOverrideSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select New Status</label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as Student['status'])}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value="active">Active / Cleared</option>
                <option value="warning">Retention Warning</option>
                <option value="critical">Critical Watchlist</option>
                <option value="remedial">Remedial Assigned</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Reason for Override</label>
              <textarea
                rows={3}
                required
                value={overrideRemarks}
                onChange={(e) => setOverrideRemarks(e.target.value)}
                placeholder="Enter justification for faculty status override..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOverrideOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20"
              >
                Save Override
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};
