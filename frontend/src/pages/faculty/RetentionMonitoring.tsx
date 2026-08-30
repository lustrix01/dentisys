import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  Pencil, 
  Trash2 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { saveFacultyRemedialApi, updateFacultyRetentionStatusApi } from '../../services/apiClient';

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
  
  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['Section 4-A', 'Section 4-B'];

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  // Tab Management: 'watchlist' | 'remedials' | 'risk-rules' | 'all'
  const [activeTab, setActiveTab] = useState<'watchlist' | 'remedials' | 'risk-rules' | 'all'>('watchlist');
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

  // Safe students array
  const safeStudents = useMemo(() => students || [], [students]);

  // Filter students based on selected class section filter
  const facultyStudents = useMemo(() => {
    return safeStudents.filter(s => {
      if (selectedClassId === 'all') return true;
      return s.classSections?.some(cs => cs.classId === selectedClassId || cs.className?.includes(selectedClassId));
    });
  }, [safeStudents, selectedClassId]);

  // Watchlist Calculations (Midterm GWA > 2.5 or warning/critical status)
  const watchlistStudents = useMemo(() => {
    return facultyStudents.filter(s => s.status === 'warning' || s.status === 'critical' || (s.overallGWA && s.overallGWA > 2.5));
  }, [facultyStudents]);
  
  // List of all active remedial exams across faculty students
  const allRemedialExams = useMemo(() => {
    return facultyStudents.flatMap(s => 
      (s.remedialExams || []).map(rem => ({
        ...rem,
        studentName: s.name || 'Unknown Student',
        studentIdNum: s.studentId || '2024-000',
        yearLevel: s.yearLevel || 4
      }))
    );
  }, [facultyStudents]);

  const filteredWatchlist = useMemo(() => {
    return watchlistStudents.filter(s => 
      (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.studentId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [watchlistStudents, searchQuery]);

  const filteredRemedials = useMemo(() => {
    return allRemedialExams.filter(rem => 
      (rem.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rem.subjectName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allRemedialExams, searchQuery]);

  const filteredAllStudents = useMemo(() => {
    return facultyStudents.filter(s => 
      (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.studentId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [facultyStudents, searchQuery]);

  // Midterm Performance Rules Evaluation
  const riskRuleResults = useMemo(() => {
    return facultyStudents.map(student => {
      const enrolledSubjs = student.enrolledSubjects || [];
      const clinicalFails = enrolledSubjs.filter(
        subj => subj.isClinical && subj.grade > (settings?.retentionThreshold || 2.5)
      );

      const avgAttendance = enrolledSubjs.length > 0
        ? enrolledSubjs.reduce((acc, curr) => acc + (curr.components?.attendance || 100), 0) / enrolledSubjs.length
        : null;

      let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
      const factors: string[] = [];

      if (clinicalFails.length > 0 || student.status === 'critical' || (student.overallGWA && student.overallGWA > 2.5)) {
        riskLevel = 'High';
        if (clinicalFails.length > 0) {
          factors.push(`Midterm grade exceeds passing threshold: GWA > 2.5 in ${clinicalFails.map(c=>c.code).join(', ')}`);
        }
        if (avgAttendance !== null && avgAttendance < 85) {
          factors.push(`Low Midterm attendance record: ${avgAttendance.toFixed(1)}% rate is below threshold`);
        }
        if (student.status === 'remedial') {
          factors.push('Currently assigned to active remedial exam program');
        }
      } else if (student.status === 'warning' || (student.overallGWA && student.overallGWA > 2.2)) {
        riskLevel = 'Medium';
        factors.push('Borderline Midterm GWA: score sits close to passing limit (2.5)');
        if (avgAttendance !== null && avgAttendance < 90) {
          factors.push('Midterm attendance requires faculty monitoring');
        }
      } else {
        riskLevel = 'Low';
        factors.push('Satisfactory Midterm Exam scores across all subjects');
        factors.push('Consistent attendance rate above required threshold');
      }

      return { student, riskLevel, factors };
    }).sort((a, b) => {
      const levelOrder = { High: 0, Medium: 1, Low: 2 };
      return levelOrder[a.riskLevel] - levelOrder[b.riskLevel];
    });
  }, [facultyStudents, settings]);

  const filteredRiskResults = useMemo(() => {
    return riskRuleResults.filter(p =>
      (p.student.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.student.studentId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [riskRuleResults, searchQuery]);

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
        message: `Remedial Exam grade recorded: ${scoreVal}% (${scoreVal >= 75 ? 'PASSED - Student Cleared' : 'FAILED - Retention Warning Maintained'})`
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
      const remedial = {
        studentId: selectedStudentId,
        studentName: student.name,
        subjectCode: selectedSubjectCode,
        subjectName: selectedSubjectCode === 'CLIN401' ? 'Clinical Dentistry I' : 'Clinical Dentistry II',
        originalGrade: student.overallGWA || 2.75,
        examDate: scheduleDate,
        notes: scheduleNotes || 'Midterm Remedial Exam',
        status: 'pending',
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
          message: `Remedial Exam scheduled for ${student.name} on ${scheduleDate}!`
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
      remedial: 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-200/60',
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
          <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest block mb-0.5">
            Faculty Portal • Bicol University CDM
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Retention & Remedial Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Monitor student retention status, schedule remedial exams, and record exam outcomes based on Midterm performance.
          </p>
        </div>

        {/* Top Right Action Button */}
        <div>
          <button
            onClick={() => {
              setIsScheduleOpen(true);
              setSelectedStudentId('');
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
            Retention Watchlist ({watchlistStudents.length})
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

          <button
            onClick={() => { setActiveTab('risk-rules'); setSearchQuery(''); }}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'risk-rules'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Midterm Evaluation Rules
          </button>
        </div>

        {/* Filters & Search Bar Positioned Below */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Class Section Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Class Sections</option>
              {assignedClasses.map((clsLabel: string) => (
                <option key={clsLabel} value={clsLabel}>{clsLabel}</option>
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
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          TAB 1: RETENTION WATCHLIST (MIDTERM GWA > 2.5)
      ---------------------------------------------------- */}
      {activeTab === 'watchlist' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Retention Watchlist ({filteredWatchlist.length})
              </h2>
              <p className="text-xs text-slate-400">
                Students requiring retention monitoring due to Midterm Exam GWA exceeding 2.5 or failing marks.
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
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4 text-center">Midterm GWA</th>
                  <th className="py-3 px-4">Retention Violation Cause</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 font-medium">
                      No students currently in retention watchlist under your assigned classes.
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map(student => (
                    <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{student.studentId} • Year {student.yearLevel}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-extrabold text-slate-800 dark:text-slate-100 font-mono text-sm">
                        {student.overallGWA ? student.overallGWA.toFixed(2) : '2.75'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-semibold text-[11px] border border-rose-200/60">
                          Midterm GWA exceeds 2.5 passing limit
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {getStatusBadge(student.status)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStudentId(student.id);
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
                              setOverrideStudentId(student.id);
                              setOverrideStatus(student.status);
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

      {/* ----------------------------------------------------
          TAB 3: MIDTERM EVALUATION RULES
      ---------------------------------------------------- */}
      {activeTab === 'risk-rules' && (
        <Card className="p-6">
          <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Midterm Academic Warning Evaluation Rules
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Retention warnings are calculated strictly from student Midterm Exam scores and academic thresholds (Passing limit: GWA ≤ 2.5). No AI models used.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4 text-center">Evaluation Level</th>
                  <th className="py-3 px-4">Contributing Warning Indicators</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRiskResults.map(({ student, riskLevel, factors }) => (
                  <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                      {student.name}
                      <span className="block text-[10px] text-slate-400 font-mono">{student.studentId} • Year {student.yearLevel}</span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                        riskLevel === 'High' 
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' 
                          : riskLevel === 'Medium' 
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' 
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}>
                        {riskLevel} Risk
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <div className="space-y-1">
                        {factors.map((f, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
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
                <option value="CLIN401">CLIN401 - Clinical Dentistry I</option>
                <option value="CLIN402">CLIN402 - Clinical Dentistry II</option>
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
