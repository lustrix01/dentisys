import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  CheckCircle2,
  Pencil,
  Trash2,
  Lock,
  X,
  GitBranch,
  ArrowRight,
  AlertTriangle,
  Info,
  Clock,
  ChevronDown,
  ChevronUp,
  GraduationCap
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, RemedialExam } from '../../types';
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

export interface DiagramTarget {
  studentName: string;
  studentIdNum: string;
  yearLevel: number;
  subjectCode: string;
  subjectName: string;
  grade: number;
  track: 'board' | 'retake';
  attempt: 1 | 2;
  examDate?: string;
  examStatus?: 'pending' | 'passed' | 'failed';
  score?: number | null;
  stageKey:
    | 'initial_pass'
    | 'needs_attempt_1'
    | 'pending_attempt_1'
    | 'passed_attempt_1'
    | 'needs_attempt_2'
    | 'pending_attempt_2'
    | 'passed_attempt_2'
    | 'failed_attempt_2_board'
    | 'failed_attempt_2_retake';
  notes?: string;
}

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const {
    students = [],
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

  // Simple 2-Tab Navigation: 'watchlist' | 'remedials'
  const [activeTab, setActiveTab] = useState<'watchlist' | 'remedials'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive Retention Diagram Flow Modal State
  const [diagramTarget, setDiagramTarget] = useState<DiagramTarget | null>(null);
  const [diagramSelectedTrack, setDiagramSelectedTrack] = useState<'board' | 'retake'>('board');
  const [showFullPolicy, setShowFullPolicy] = useState(false);

  // Schedule Remedial modal states
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('CLIN401');
  const [scheduleAttempt, setScheduleAttempt] = useState<1 | 2>(1);
  const [scheduleSubjectType, setScheduleSubjectType] = useState<'board' | 'retake'>('board');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Grade Remedial modal states
  const [gradingExam, setGradingExam] = useState<RemedialExam | null>(null);
  const [remedialScore, setRemedialScore] = useState('75');
  const [remedialNotes, setRemedialNotes] = useState('');

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
    } catch {}
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

  // Derived distinct Course Options for filtering
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

  // Subject-level retention watchlist derivation (Evaluates Midterm Grade > 2.50)
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
        const hasPassedRem = subRemedials.some(r => r.status === 'passed');
        const hasFailedRem = subRemedials.some(r => r.status === 'failed');

        // If student passed remedial, they are cleared and removed from watchlist
        if (hasPassedRem) {
          return;
        }

        const isAtRisk = subGrade > 2.50 || student.status === 'warning' || student.status === 'critical' || student.status === 'remedial' || subRemedials.length > 0;

        if (isAtRisk) {
          let cause = `Midterm grade (${subGrade.toFixed(2)}) > 2.50 threshold`;
          if (hasPendingRem) {
            cause = `Remedial Exam Scheduled (Pending)`;
          } else if (hasFailedRem) {
            cause = `Remedial Exam Failed`;
          } else if (student.status === 'critical') {
            cause = `Critical Retention (${subGrade.toFixed(2)})`;
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
      (rem.studentIdNum || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allRemedialExams, searchQuery]);

  // Open Interactive Diagram Modal for Watchlist Item
  const handleOpenDiagramForWatchlist = (item: SubjectWatchlistItem) => {
    const student = item.student;
    const subRemedials = (student.remedialExams || []).filter(
      r => r.subjectCode?.toUpperCase() === item.subjectCode.toUpperCase()
    );
    const latestRemedial = subRemedials[subRemedials.length - 1];
    const attempt = (latestRemedial?.attempt || 1) as 1 | 2;
    const track = (latestRemedial?.subjectType || 'board') as 'board' | 'retake';

    let stageKey: DiagramTarget['stageKey'] = 'needs_attempt_1';
    if (item.midtermGrade <= 2.40) {
      stageKey = 'initial_pass';
    } else if (!latestRemedial) {
      stageKey = 'needs_attempt_1';
    } else if (latestRemedial.status === 'pending') {
      stageKey = attempt === 1 ? 'pending_attempt_1' : 'pending_attempt_2';
    } else if (latestRemedial.status === 'passed') {
      stageKey = attempt === 1 ? 'passed_attempt_1' : 'passed_attempt_2';
    } else if (latestRemedial.status === 'failed') {
      if (attempt === 1) {
        stageKey = 'needs_attempt_2';
      } else {
        stageKey = track === 'retake' ? 'failed_attempt_2_retake' : 'failed_attempt_2_board';
      }
    }

    setDiagramTarget({
      studentName: item.studentName,
      studentIdNum: item.studentIdNum,
      yearLevel: item.yearLevel,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      grade: item.midtermGrade,
      track,
      attempt,
      examDate: latestRemedial?.examDate,
      examStatus: latestRemedial?.status,
      score: latestRemedial?.remedialScore,
      stageKey,
      notes: latestRemedial?.notes,
    });
    setDiagramSelectedTrack(track);
  };

  // Open Interactive Diagram Modal for Remedial Exam Row
  const handleOpenDiagramForRemedial = (rem: RemedialExam & { studentName?: string; studentIdNum?: string; yearLevel?: number }) => {
    const attempt = (rem.attempt || 1) as 1 | 2;
    const track = (rem.subjectType || 'board') as 'board' | 'retake';

    let stageKey: DiagramTarget['stageKey'] = 'pending_attempt_1';
    if (rem.status === 'pending') {
      stageKey = attempt === 1 ? 'pending_attempt_1' : 'pending_attempt_2';
    } else if (rem.status === 'passed') {
      stageKey = attempt === 1 ? 'passed_attempt_1' : 'passed_attempt_2';
    } else if (rem.status === 'failed') {
      if (attempt === 1) {
        stageKey = 'needs_attempt_2';
      } else {
        stageKey = track === 'retake' ? 'failed_attempt_2_retake' : 'failed_attempt_2_board';
      }
    }

    setDiagramTarget({
      studentName: rem.studentName || 'Student',
      studentIdNum: rem.studentIdNum || '2024-000',
      yearLevel: rem.yearLevel || 4,
      subjectCode: rem.subjectCode,
      subjectName: rem.subjectName,
      grade: rem.originalGrade || 2.75,
      track,
      attempt,
      examDate: rem.examDate,
      examStatus: rem.status,
      score: rem.remedialScore,
      stageKey,
      notes: rem.notes,
    });
    setDiagramSelectedTrack(track);
  };

  // Status badge resolver for Midterm Watchlist item (Early Warning Only)
  const getWatchlistStatusBadge = (item: SubjectWatchlistItem) => {
    const isCritical = item.midtermGrade > 2.75 || item.status === 'critical';
    return {
      label: isCritical ? 'Critical Warning (At Risk)' : 'Early Warning (At Risk)',
      hint: 'Midterm Warning • Remedials evaluated on Final Grade',
      style: isCritical
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      dot: isCritical ? 'bg-rose-500' : 'bg-amber-500',
    };
  };

  // Status badge resolver for Remedial Exam row
  const getRemedialBadge = (rem: RemedialExam) => {
    const attempt = rem.attempt || 1;
    const isRetake = rem.subjectType === 'retake';

    if (rem.status === 'passed') {
      return {
        label: `PASSED (${rem.remedialScore}%) • Retained in DMD`,
        subtext: `Attempt ${attempt} Cleared`,
        style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400',
        dot: 'bg-emerald-500',
      };
    }
    if (rem.status === 'failed') {
      if (attempt === 1) {
        return {
          label: `FAILED (${rem.remedialScore}%) • Needs Attempt 2`,
          subtext: 'Eligible for 2nd Remedial',
          style: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:border-amber-400',
          dot: 'bg-amber-500',
        };
      }
      return {
        label: `FAILED (${rem.remedialScore}%) • ${isRetake ? 'Shift / Transfer' : 'Retake Subject'}`,
        subtext: isRetake ? 'Action: Shift or Transfer' : 'Action: Subject Retake',
        style: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:border-rose-400',
        dot: 'bg-rose-500',
      };
    }
    return {
      label: `Scheduled (Attempt ${attempt})`,
      subtext: 'Pending Grading',
      style: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:border-blue-400',
      dot: 'bg-blue-500 animate-pulse',
    };
  };

  // Handler: Open Schedule Modal
  const handleOpenScheduleModal = (item?: SubjectWatchlistItem) => {
    if (item) {
      setSelectedStudentId(item.studentId);
      setSelectedSubjectCode(item.subjectCode);
      const student = item.student;
      const subRemedials = (student.remedialExams || []).filter(
        r => r.subjectCode?.toUpperCase() === item.subjectCode.toUpperCase()
      );
      const hasFailedAttempt1 = subRemedials.some(r => (r.attempt || 1) === 1 && r.status === 'failed');
      setScheduleAttempt(hasFailedAttempt1 ? 2 : 1);
      setScheduleSubjectType('board');
    } else {
      setSelectedStudentId('');
      setSelectedSubjectCode(selectedCourseCode !== 'all' ? selectedCourseCode : 'CLIN401');
      setScheduleAttempt(1);
      setScheduleSubjectType('board');
    }
    setScheduleDate(new Date().toISOString().split('T')[0]);
    setScheduleNotes('');
    setIsScheduleOpen(true);
  };

  // Handler: Submit Schedule Remedial Exam
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

      const remedial: Omit<RemedialExam, 'id' | 'status' | 'remedialScore' | 'remedialGrade'> & {
        attempt: 1 | 2;
        subjectType: 'board' | 'retake';
      } = {
        studentId: selectedStudentId,
        studentName: student.name,
        subjectCode: selectedSubjectCode,
        subjectName: subjectName,
        originalGrade: origGrade,
        examDate: scheduleDate,
        notes: scheduleNotes || `Remedial Exam (${scheduleAttempt === 1 ? 'Attempt 1' : 'Attempt 2'})`,
        attempt: scheduleAttempt,
        subjectType: scheduleSubjectType,
      };

      try {
        await saveFacultyRemedialApi({
          enrollmentId: `enr-${Date.now()}`,
          studentId: student.id,
          classId: 'cls-1',
          remedial: { ...remedial, status: 'pending' },
        });
        if (addRemedialExam) addRemedialExam(remedial as any);
        setNotification({
          type: 'success',
          message: `Remedial Exam (Attempt ${scheduleAttempt}) scheduled for ${student.name} on ${scheduleDate}!`
        });
      } catch {
        if (addRemedialExam) addRemedialExam(remedial as any);
        showFeedback(`Remedial exam scheduled locally.`, 'info');
      }

      setIsScheduleOpen(false);
      setSelectedStudentId('');
      setScheduleDate('');
      setScheduleNotes('');
    }
  };

  // Handler: Record & Grade Remedial Exam Result
  const handleResolveRemedial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingExam) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      showFeedback('Please enter a valid percentage score (0-100).', 'error');
      return;
    }

    const isPassed = scoreVal >= 75;
    const attempt = gradingExam.attempt || 1;
    const isRetake = gradingExam.subjectType === 'retake';

    let outcome: RemedialExam['retentionOutcome'] = 'retained';
    let outcomeText = 'Retained in DMD (Passed)';

    if (isPassed) {
      outcome = 'retained';
      outcomeText = 'Retained in DMD (Passed)';
    } else {
      if (attempt === 1) {
        outcome = 'remedial_2';
        outcomeText = 'Failed Attempt 1 ➔ Qualifies for Attempt 2';
      } else {
        if (isRetake) {
          outcome = 'shift_transfer';
          outcomeText = 'Failed Final Remedial ➔ Shift / Transfer';
        } else {
          outcome = 'retake_subject';
          outcomeText = 'Failed Final Remedial ➔ Retake Subject';
        }
      }
    }

    const owner = safeStudents.find(s => (s.remedialExams || []).some(exam => exam.id === gradingExam.id));
    if (!owner) return;

    try {
      await saveFacultyRemedialApi({
        studentId: owner.id,
        classId: owner.classId,
        remedial: {
          ...gradingExam,
          remedialScore: scoreVal,
          notes: remedialNotes,
          status: isPassed ? 'passed' : 'failed',
          retentionOutcome: outcome,
        },
      });

      if (updateRemedialExam) {
        updateRemedialExam(gradingExam.id, scoreVal, remedialNotes, outcome);
      }

      setGradingExam(null);
      setRemedialScore('75');
      setRemedialNotes('');
      setNotification({
        type: 'success',
        message: `Remedial grade recorded: ${scoreVal}% (${isPassed ? 'PASSED ➔ Retained in DMD' : outcomeText})`
      });
    } catch (requestError) {
      showFeedback(requestError instanceof Error ? requestError.message : 'Unable to save remedial result.', 'error');
    }
  };

  // Handler: Status Override
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStudentId || !overrideRemarks) return;

    const student = safeStudents.find(item => item.id === overrideStudentId);
    if (!student) return;

    try {
      await updateFacultyRetentionStatusApi({
        studentId: student.id,
        classId: 'cls-1',
        status: overrideStatus,
        reason: overrideRemarks,
      });
      if (overrideRetentionStatus) {
        overrideRetentionStatus(overrideStudentId, overrideStatus, overrideRemarks, user?.login_email || 'faculty');
      }
      setIsOverrideOpen(false);
      setOverrideStudentId('');
      setOverrideRemarks('');
      setNotification({
        type: 'success',
        message: `Retention status for ${student.name} updated to ${overrideStatus.toUpperCase()}!`
      });
    } catch {
      if (overrideRetentionStatus) {
        overrideRetentionStatus(overrideStudentId, overrideStatus, overrideRemarks, user?.login_email || 'faculty');
      }
      setIsOverrideOpen(false);
      setNotification({
        type: 'success',
        message: `Retention status for ${student.name} updated!`
      });
    }
  };

  const handleDeleteRemedial = async (id: string) => {
    if (await requestConfirmation('Remove this remedial exam record?', 'Remove Remedial Record')) {
      if (deleteRemedialExam) deleteRemedialExam(id);
      setNotification({
        type: 'info',
        message: 'Remedial record removed.'
      });
    }
  };

  return (
    <div className="space-y-6">

      {/* Clean Top Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Retention & Remedial Monitoring
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Monitor students at risk based on Midterm grades (&gt; 2.50 early warning). Remedial examinations are based on Final Subject Grades (2.50–3.00).
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Control Bar: Tabs & Filter Dropdowns */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'watchlist'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Retention Watchlist ({isMidtermComplete ? filteredWatchlist.length : 0})
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

        {/* Filters & Search Bar */}
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
          TAB 1: RETENTION WATCHLIST (MIDTERM GRADE > 2.50)
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
                Identifies students at risk of retention based on Midterm grades exceeding 2.50. Midterm warning serves for student monitoring and advising; remedial exams are conducted based on final grades.
              </p>
            </div>
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
                The retention watchlist will not display students until midterm grades are complete for {selectedCourseCode === 'all' ? 'assigned courses' : selectedCourseCode}.
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
                    <th className="py-3 px-4">Early Warning Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredWatchlist.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 font-medium">
                        No students currently at risk of retention for the selected course filter.
                      </td>
                    </tr>
                  ) : (
                    filteredWatchlist.map(item => {
                      const badgeInfo = getWatchlistStatusBadge(item);
                      return (
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

                          {/* Non-Clickable Early Warning Status Badge */}
                          <td className="py-3.5 px-4">
                            <div
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left font-bold text-[11px] ${badgeInfo.style}`}
                            >
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${badgeInfo.dot}`} />
                              <div className="flex flex-col">
                                <span className="leading-tight">{badgeInfo.label}</span>
                                <span className="text-[9px] opacity-75 font-normal">{badgeInfo.hint}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setOverrideStudentId(item.studentId);
                                  setOverrideStatus(item.status);
                                  setOverrideRemarks('');
                                  setIsOverrideOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-[11px] font-bold cursor-pointer"
                                title="Override Retention Status / Add Advising Note"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
                Track scheduled remedial exams, input scores, and resolve student retention status. Remedials are based on Final Subject Grades (2.50–3.00), not midterm.
              </p>
            </div>

            <button
              onClick={() => handleOpenScheduleModal()}
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
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Course Section</th>
                  <th className="py-3 px-4 text-center">Final Grade</th>
                  <th className="py-3 px-4">Exam Date</th>
                  <th className="py-3 px-4">Score & Policy Status (Clickable)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRemedials.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No pending or completed remedial exams logged.
                    </td>
                  </tr>
                ) : (
                  filteredRemedials.map(rem => {
                    const badgeInfo = getRemedialBadge(rem);
                    return (
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

                        <td className="py-3.5 px-4 text-center font-extrabold font-mono text-sm">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60" title="Final Subject Grade">
                            {(rem.originalGrade || 2.75).toFixed(2)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {rem.examDate}
                        </td>

                        {/* Clickable Score & Policy Status Badge */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleOpenDiagramForRemedial(rem)}
                            className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left font-bold text-[11px] transition-all cursor-pointer shadow-xs hover:scale-[1.02] ${badgeInfo.style}`}
                            title="Click to view interactive retention diagram flow"
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${badgeInfo.dot}`} />
                            <div className="flex flex-col">
                              <span className="leading-tight">{badgeInfo.label}</span>
                              <span className="text-[9px] opacity-75 font-normal">{badgeInfo.subtext} • Click for diagram</span>
                            </div>
                            <GitBranch className="w-3.5 h-3.5 ml-1 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {rem.status === 'pending' && (
                              <button
                                onClick={() => {
                                  setGradingExam(rem);
                                  setRemedialScore('75');
                                  setRemedialNotes('');
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ======================================================================
          INTERACTIVE RETENTION & REMEDIAL PROGRESSION POLICY MODAL
      ====================================================================== */}
      {/* ======================================================================
          PERSONALIZED SINGLE-PATH RETENTION ROADMAP MODAL
      ====================================================================== */}
      {diagramTarget && (() => {
        const isGradePass = diagramTarget.grade <= 2.40;
        const attempt = diagramTarget.attempt || 1;
        const examStatus = diagramTarget.examStatus;
        const score = diagramTarget.score;
        const isRetakeTrack = diagramTarget.track === 'retake';

        // Step 1: Final Grade Check
        const step1 = {
          title: '1. Final Grade Assessment',
          value: diagramTarget.grade.toFixed(2),
          statusText: isGradePass ? 'Passed (≤ 2.40)' : 'Remedial Range (2.50–3.00)',
          badge: isGradePass ? 'Cleared' : 'Remedial Triggered',
          badgeColor: isGradePass
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
        };

        // Step 2: Attempt 1
        let step2State: 'completed_pass' | 'completed_fail' | 'current' | 'skipped' = 'current';
        let step2Value = 'Awaiting Scheduling';
        let step2Badge = 'Action Required';
        let step2BadgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300';

        if (isGradePass) {
          step2State = 'skipped';
          step2Value = 'Not Required';
          step2Badge = 'Cleared';
          step2BadgeColor = 'bg-slate-100 text-slate-500';
        } else if (attempt === 1) {
          if (examStatus === 'pending') {
            step2State = 'current';
            step2Value = diagramTarget.examDate ? `Scheduled: ${diagramTarget.examDate}` : 'Pending Exam';
            step2Badge = 'In Progress';
            step2BadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300';
          } else if (examStatus === 'passed') {
            step2State = 'completed_pass';
            step2Value = `PASSED (${score}%)`;
            step2Badge = 'Retained in DMD';
            step2BadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
          } else if (examStatus === 'failed') {
            step2State = 'completed_fail';
            step2Value = `FAILED (${score}%)`;
            step2Badge = 'Advances to Attempt 2';
            step2BadgeColor = 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300';
          }
        } else if (attempt === 2) {
          step2State = 'completed_fail';
          step2Value = 'Attempt 1: FAILED (< 75%)';
          step2Badge = 'Advances to Final Attempt';
          step2BadgeColor = 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
        }

        // Step 3: Attempt 2 (Final)
        let step3State: 'completed_pass' | 'completed_fail' | 'current' | 'upcoming' | 'skipped' = 'upcoming';
        let step3Value = 'Standby (Only If Attempt 1 Fails)';
        let step3Badge = 'Standby';
        let step3BadgeColor = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

        if (isGradePass || (attempt === 1 && examStatus === 'passed')) {
          step3State = 'skipped';
          step3Value = 'Not Required';
          step3Badge = 'Cleared in Attempt 1';
          step3BadgeColor = 'bg-slate-100 text-slate-500';
        } else if (attempt === 1 && (examStatus === 'pending' || !examStatus)) {
          step3State = 'upcoming';
          step3Value = 'Triggered only if Attempt 1 < 75%';
          step3Badge = 'Standby';
          step3BadgeColor = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
        } else if (attempt === 2) {
          if (examStatus === 'pending') {
            step3State = 'current';
            step3Value = diagramTarget.examDate ? `Scheduled: ${diagramTarget.examDate}` : 'Pending Final Exam';
            step3Badge = 'Final Attempt Pending';
            step3BadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300';
          } else if (examStatus === 'passed') {
            step3State = 'completed_pass';
            step3Value = `PASSED (${score}%)`;
            step3Badge = 'Retained in DMD';
            step3BadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
          } else if (examStatus === 'failed') {
            step3State = 'completed_fail';
            step3Value = `FAILED (${score}%)`;
            step3Badge = isRetakeTrack ? 'Action: Shift / Transfer' : 'Action: Retake Subject';
            step3BadgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300';
          } else {
            step3State = 'current';
            step3Value = 'Awaiting Scheduling';
            step3Badge = 'Action Required';
            step3BadgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300';
          }
        }

        // Step 4: Final Retention Standing
        let step4State: 'cleared' | 'failed' | 'in_progress' = 'in_progress';
        let step4Value = 'Under Remediation';
        let step4Desc = 'Passing threshold: ≥ 75% on remedial exam';
        let step4BadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300';

        if (isGradePass || examStatus === 'passed') {
          step4State = 'cleared';
          step4Value = 'Retained in DMD';
          step4Desc = 'Student cleared retention policy criteria';
          step4BadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
        } else if (attempt === 2 && examStatus === 'failed') {
          step4State = 'failed';
          step4Value = isRetakeTrack ? 'Shift / Transfer Program' : 'Retake Subject';
          step4Desc = isRetakeTrack ? 'Policy rule for repeated enrollment failure' : 'Policy rule for dental board subject failure';
          step4BadgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300';
        }

        // Find matching pending exam if any
        const matchingRemedial = allRemedialExams.find(
          r => r.studentName === diagramTarget.studentName && r.subjectCode === diagramTarget.subjectCode && r.status === 'pending'
        );

        return (
          <Modal
            isOpen={!!diagramTarget}
            onClose={() => setDiagramTarget(null)}
            title="Retention Progression Roadmap"
            size="xl"
          >
            <div className="space-y-6 text-xs">

              {/* Student Context Header */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {diagramTarget.studentName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                      {diagramTarget.studentIdNum} • Year {diagramTarget.yearLevel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Course: <strong className="text-slate-800 dark:text-slate-200">{diagramTarget.subjectCode} - {diagramTarget.subjectName}</strong>
                    {' '}• Final Subject Grade: <strong className="text-slate-800 dark:text-slate-200">{diagramTarget.grade.toFixed(2)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    isRetakeTrack
                      ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                  }`}>
                    {isRetakeTrack ? 'Track 2: Subject Retake' : 'Track 1: Dental Board Subject (Regular)'}
                  </span>
                  <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                    Passing Mark: 75%
                  </span>
                </div>
              </div>

              {/* Visual 4-Step Single-Path Roadmap */}
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Student Progression Path
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">

                  {/* STEP 1 */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 flex flex-col justify-between space-y-3 relative shadow-xs">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Step 1</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs mb-1">
                        Final Grade Assessment
                      </h4>
                      <p className="text-lg font-black font-mono text-slate-800 dark:text-slate-200">
                        {step1.value}
                      </p>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${step1.badgeColor} block w-fit`}>
                        {step1.badge}
                      </span>
                    </div>
                  </div>

                  {/* STEP 2 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 relative transition-all shadow-xs ${
                    step2State === 'current'
                      ? 'border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/40 ring-4 ring-emerald-500/20 shadow-md'
                      : step2State === 'completed_pass'
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : step2State === 'skipped'
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-50'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Step 2</span>
                        {step2State === 'current' ? (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        ) : step2State === 'completed_pass' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : step2State === 'completed_fail' ? (
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                        ) : null}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs mb-1">
                        Remedial (Attempt 1)
                      </h4>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                        {step2Value}
                      </p>
                    </div>
                    <div>
                      {step2State === 'current' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider animate-pulse">
                          ● Current Stage
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${step2BadgeColor} block w-fit`}>
                          {step2Badge}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* STEP 3 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 relative transition-all shadow-xs ${
                    step3State === 'current'
                      ? 'border-2 border-amber-500 bg-amber-50/40 dark:bg-amber-950/40 ring-4 ring-amber-500/20 shadow-md'
                      : step3State === 'completed_pass'
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : step3State === 'completed_fail'
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20 dark:bg-rose-950/20'
                      : step3State === 'skipped'
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-40'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 opacity-70'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Step 3</span>
                        {step3State === 'current' ? (
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                        ) : step3State === 'completed_pass' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : step3State === 'completed_fail' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : null}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs mb-1">
                        Final Attempt 2
                      </h4>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                        {step3Value}
                      </p>
                    </div>
                    <div>
                      {step3State === 'current' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-600 text-white text-[9px] font-black uppercase tracking-wider animate-pulse">
                          ● Current Stage
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${step3BadgeColor} block w-fit`}>
                          {step3Badge}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* STEP 4 */}
                  <div className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 relative transition-all shadow-xs ${
                    step4State === 'cleared'
                      ? 'border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-4 ring-emerald-500/20'
                      : step4State === 'failed'
                      ? 'border-2 border-rose-500 bg-rose-50/50 dark:bg-rose-950/40 ring-4 ring-rose-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Step 4</span>
                        {step4State === 'cleared' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : step4State === 'failed' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs mb-1">
                        Retention Outcome
                      </h4>
                      <p className={`text-xs font-black mt-1 ${
                        step4State === 'cleared'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : step4State === 'failed'
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {step4Value}
                      </p>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${step4BadgeColor} block w-fit`}>
                        {step4Desc}
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Immediate Next Action / Policy Guidance Card */}
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200 text-xs">
                    <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>Immediate Action for {diagramTarget.studentName}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                    {step4State === 'cleared' ? (
                      `Student has successfully cleared retention requirements with passing scores. No further action needed.`
                    ) : step2State === 'current' && diagramTarget.examDate ? (
                      `The student is scheduled for Remedial Exam (Attempt 1) on ${diagramTarget.examDate}. Once the exam is conducted, enter their percentage score. Scoring ≥ 75% will retain them in DMD.`
                    ) : step2State === 'current' && !diagramTarget.examDate ? (
                      `Student's midterm grade is ${diagramTarget.grade.toFixed(2)} (> 2.50 threshold). Schedule their first remedial exam to start remediation.`
                    ) : step3State === 'current' && diagramTarget.examDate ? (
                      `The student failed Attempt 1 and is scheduled for Final Remedial (Attempt 2) on ${diagramTarget.examDate}. Scoring ≥ 75% will retain them in DMD. A failing score will require ${isRetakeTrack ? 'Shift/Transfer' : 'Subject Retake'}.`
                    ) : step3State === 'current' && !diagramTarget.examDate ? (
                      `The student failed Attempt 1 and is eligible for a final 2nd Remedial Exam. Please schedule their Attempt 2 exam.`
                    ) : step4State === 'failed' ? (
                      `The student has completed all remedial attempts without reaching 75%. Policy mandate: ${isRetakeTrack ? 'Student must Shift or Transfer out of the DMD program' : 'Student must Retake this subject in the next offering'}.`
                    ) : (
                      `Review student progress and record exam grades as needed.`
                    )}
                  </p>
                </div>

                {/* Direct Action Button */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {matchingRemedial && (
                    <button
                      type="button"
                      onClick={() => {
                        setDiagramTarget(null);
                        setGradingExam(matchingRemedial);
                        setRemedialScore('75');
                        setRemedialNotes('');
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Grade Exam Now
                    </button>
                  )}
                  {step2State === 'current' && !diagramTarget.examDate && (
                    <button
                      type="button"
                      onClick={() => {
                        const student = safeStudents.find(s => s.name === diagramTarget.studentName);
                        setDiagramTarget(null);
                        if (student) {
                          setSelectedStudentId(student.id);
                          setSelectedSubjectCode(diagramTarget.subjectCode);
                          setScheduleAttempt(1);
                          setScheduleDate(new Date().toISOString().split('T')[0]);
                          setIsScheduleOpen(true);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Schedule Remedial
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDiagramTarget(null)}
                    className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Collapsible Full Policy Reference (Hidden by default for simplicity) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowFullPolicy(!showFullPolicy)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    <span>View Official DMD Retention Policy Reference Rules</span>
                  </span>
                  {showFullPolicy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showFullPolicy && (
                  <div className="p-4 bg-white dark:bg-slate-900 space-y-3 text-[11px] border-t border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 leading-relaxed animate-fade-in">
                    <p>
                      <strong>1. Initial Grade Threshold:</strong> A Midterm or Final grade ≤ 2.40 retains the student in DMD without remedial exam needed. Grades between 2.50 and 3.00 require a Remedial Exam.
                    </p>
                    <p>
                      <strong>2. Remedial Exam (Attempt 1):</strong> Passing with ≥ 75% clears the student (Retained in DMD). A score &lt; 75% qualifies the student for Attempt 2.
                    </p>
                    <p>
                      <strong>3. Outcome after Attempt 2:</strong> Passing with ≥ 75% clears the student (Retained in DMD). Failing Attempt 2 leads to:
                      <br />• <em>Track 1 (Dental Board Regular):</em> <strong>Retake Subject</strong> in next semester.
                      <br />• <em>Track 2 (Subject Retake):</em> <strong>Shift or Transfer</strong> out of the DMD program.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </Modal>
        );
      })()}

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

            <div className="grid grid-cols-2 gap-3">
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
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Remedial Attempt</label>
                <select
                  value={scheduleAttempt}
                  onChange={(e) => setScheduleAttempt(Number(e.target.value) as 1 | 2)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value={1}>Attempt 1 (First Remedial)</option>
                  <option value={2}>Attempt 2 (Second / Final)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Enrollment Track</label>
                <select
                  value={scheduleSubjectType}
                  onChange={(e) => setScheduleSubjectType(e.target.value as 'board' | 'retake')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
                >
                  <option value="board">Dental Board Subject (Regular)</option>
                  <option value="retake">Subject Retake (Repeated Course)</option>
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
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Notes / Instructions (Optional)</label>
              <textarea
                rows={2}
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="e.g. Focus on restorative dentistry topics or room details..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Confirm & Schedule Exam
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Grade / Record Remedial Exam Result */}
      {gradingExam && (
        <Modal isOpen={!!gradingExam} onClose={() => setGradingExam(null)} title="Grade Remedial Exam Result">
          <form onSubmit={handleResolveRemedial} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100 block">{gradingExam.studentName}</span>
                <span className="text-[10px] text-slate-400 font-mono">{gradingExam.subjectCode} - {gradingExam.subjectName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-extrabold text-[10px]">
                  Attempt {gradingExam.attempt || 1}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-bold text-[10px]">
                  {gradingExam.subjectType === 'retake' ? 'Retake Track' : 'Board Track'}
                </span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Percentage Score (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                placeholder="e.g. 75"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold text-sm"
              />
              <div className="mt-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                {parseInt(remedialScore) >= 75 ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Result: PASSED (≥ 75%) ➔ Cleared & Retained in DMD
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Result: FAILED (&lt; 75%) ➔ {
                      (gradingExam.attempt || 1) === 1
                        ? 'Eligible for Attempt 2'
                        : gradingExam.subjectType === 'retake'
                        ? 'Action: Shift / Transfer'
                        : 'Action: Retake Subject'
                    }
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty Remarks (Optional)</label>
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
                onClick={() => setGradingExam(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
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
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Retention Status</label>
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value as Student['status'])}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value="active">Active (Good Standing)</option>
                <option value="warning">Warning (Retention Risk)</option>
                <option value="critical">Critical (Severe Risk)</option>
                <option value="remedial">Remedial (Under Remedial)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Faculty Remarks / Justification</label>
              <textarea
                required
                rows={3}
                value={overrideRemarks}
                onChange={(e) => setOverrideRemarks(e.target.value)}
                placeholder="Reason for changing student retention status..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOverrideOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Update Status
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};

export default RetentionMonitoring;
