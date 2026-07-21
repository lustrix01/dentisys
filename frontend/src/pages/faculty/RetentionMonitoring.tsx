import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  Search, 
  Calendar, 
  UserCheck, 
  Plus, 
  ClipboardCheck, 
  CheckCircle, 
  XCircle,
  Clock,
  BookOpen,
  History,
  Sparkles,
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, RemedialExam, RetentionLog } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';

export const RetentionMonitoring: React.FC = () => {
  const { user } = useAuth();
  const { 
    students, 
    settings, 
    addRemedialExam, 
    updateRemedialExam, 
    deleteRemedialExam,
    overrideRetentionStatus 
  } = useApp();
  
  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['CLINIC-A', 'CLINIC-B'];

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState<string>(assignedClasses[0] || 'CLINIC-A');

  // Tab Management
  const [activeTab, setActiveTab] = useState<'watchlist' | 'ai-risk' | 'remedials' | 'all'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  // Record Score modal states
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState('');
  const [remedialNotes, setRemedialNotes] = useState('');

  // Schedule Remedial modal states
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Manual status override states
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideStudentId, setOverrideStudentId] = useState('');
  const [overrideStatus, setOverrideStatus] = useState<Student['status']>('warning');
  const [overrideRemarks, setOverrideRemarks] = useState('');

  // History audit states
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);

  // Filter students based on selected class and subjects (RBAC constraint)
  const facultyStudents = useMemo(() => {
    return students.filter(s =>
      s.classId === selectedClassId &&
      s.enrolledSubjects.some(sub => assignedSubjects.includes(sub.code))
    );
  }, [students, selectedClassId, assignedSubjects]);

  // Watchlist Calculations
  const watchlistStudents = useMemo(() => {
    return facultyStudents.filter(s => s.status === 'warning' || s.status === 'critical');
  }, [facultyStudents]);
  
  // List of all active remedial exams across all faculty students
  const allRemedialExams = useMemo(() => {
    return facultyStudents.flatMap(s => 
      s.remedialExams.map(rem => ({
        ...rem,
        studentName: s.name,
        studentIdNum: s.studentId,
      }))
    );
  }, [facultyStudents]);

  const filteredRemedials = useMemo(() => {
    return allRemedialExams.filter(rem => 
      rem.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rem.subjectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rem.subjectName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allRemedialExams, searchQuery]);

  const filteredWatchlist = useMemo(() => {
    return watchlistStudents.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [watchlistStudents, searchQuery]);

  const filteredAllStudents = useMemo(() => {
    return facultyStudents.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [facultyStudents, searchQuery]);

  // ----------------------------------------------------
  // RANDOM FOREST RISK PREDICTION SIMULATOR
  // ----------------------------------------------------
  const aiRiskPredictions = useMemo(() => {
    return facultyStudents.map(student => {
      // Calculate clinical grade violations
      const clinicalFails = student.enrolledSubjects.filter(
        subj => subj.isClinical && subj.grade > settings.retentionThreshold
      );

      // Check attendance rates
      const studentRecords = student.enrolledSubjects;
      const avgAttendance = studentRecords.length > 0
        ? studentRecords.reduce((acc, curr) => acc + curr.components.attendance, 0) / studentRecords.length
        : 90;

      // Predict risk level using student features
      let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
      let confidence = 50;
      const factors: string[] = [];

      if (clinicalFails.length > 0 || student.status === 'critical' || student.overallGWA > 2.5) {
        riskLevel = 'High';
        confidence = Math.round(85 + Math.random() * 14);
        
        if (clinicalFails.length > 0) {
          factors.push(`Fails clinical retention threshold: GWA > 2.5 in ${clinicalFails.map(c=>c.code).join(', ')}`);
        }
        if (avgAttendance < 85) {
          factors.push(`Unsatisfactory attendance: ${avgAttendance.toFixed(1)}% rate is below threshold`);
        }
        if (student.yearLevel >= 3 && student.clinicHoursCompleted < 200) {
          factors.push(`Low clinical rotation hours completion: ${student.clinicHoursCompleted} hours completed`);
        }
        if (student.status === 'remedial') {
          factors.push('Currently assigned to active remedial program');
        }
      } else if (student.status === 'warning' || student.overallGWA > 2.2) {
        riskLevel = 'Medium';
        confidence = Math.round(60 + Math.random() * 20);
        factors.push('Borderline GWA: overall score sits close to warning limits');
        if (avgAttendance < 90) {
          factors.push('Attendance rate requires clinical monitoring');
        }
      } else {
        riskLevel = 'Low';
        confidence = Math.round(10 + Math.random() * 30);
        factors.push('Satisfactory academic grades across all courses');
        factors.push('Consistent attendance rate above dental threshold');
      }

      return {
        student,
        riskLevel,
        confidence,
        factors
      };
    }).sort((a, b) => {
      const levelOrder = { High: 0, Medium: 1, Low: 2 };
      return levelOrder[a.riskLevel] - levelOrder[b.riskLevel];
    });
  }, [facultyStudents, settings]);

  const filteredAiPredictions = useMemo(() => {
    return aiRiskPredictions.filter(p =>
      p.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.student.studentId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [aiRiskPredictions, searchQuery]);

  const handleResolveRemedial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      alert('Please enter a valid percentage score (0-100).');
      return;
    }
    updateRemedialExam(selectedRemedialId, scoreVal, remedialNotes);
    setSelectedRemedialId(null);
    setRemedialScore('');
    setRemedialNotes('');
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedSubjectCode || !scheduleDate) {
      alert('Please complete all fields.');
      return;
    }
    const student = students.find(s => s.id === selectedStudentId);
    const subject = student?.enrolledSubjects.find(s => s.code === selectedSubjectCode);
    
    if (student && subject) {
      addRemedialExam({
        studentId: selectedStudentId,
        studentName: student.name,
        subjectCode: selectedSubjectCode,
        subjectName: subject.name,
        originalGrade: subject.grade,
        examDate: scheduleDate,
        notes: scheduleNotes,
      });
      setIsScheduleOpen(false);
      setSelectedStudentId('');
      setSelectedSubjectCode('');
      setScheduleDate('');
      setScheduleNotes('');
    }
  };

  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideStudentId || !overrideRemarks) return;

    overrideRetentionStatus(overrideStudentId, overrideStatus, overrideRemarks, user?.login_email || 'system');
    setIsOverrideOpen(false);
    setOverrideStudentId('');
    setOverrideRemarks('');
    alert('Student retention status overridden and audit logs recorded.');
  };

  const handleDeleteRemedial = (id: string) => {
    if (confirm('Are you sure you want to remove this remedial exam log?')) {
      deleteRemedialExam(id);
    }
  };

  const getStatusBadge = (status: Student['status']) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/30',
      critical: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/30',
      remedial: 'bg-accent-50 text-accent-600 dark:bg-accent-950/40 dark:text-accent-400 border border-accent-200/30',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const selectedStudentForSchedule = students.find(s => s.id === selectedStudentId);
  const activeRemedialToRecord = allRemedialExams.find(r => r.id === selectedRemedialId);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Retention & Remedial Management
          </h1>
          <p className="text-xs text-slate-400">Enforce dental academic standards (Strict clinical threshold: 2.5 passing limits)</p>
        </div>
        <div className="flex space-x-2">
          {/* Class / Block Switcher */}
          {assignedClasses.length > 1 && (
            <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl gap-1">
              {assignedClasses.map((clsId: string) => {
                const cls = students.find(s => s.classId === clsId);
                const label = cls?.className || clsId;
                const isActive = selectedClassId === clsId;
                return (
                  <button
                    key={clsId}
                    onClick={() => setSelectedClassId(clsId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-clinical-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => {
              setIsScheduleOpen(true);
              setSelectedStudentId('');
              setSelectedSubjectCode('');
              setScheduleDate(new Date().toISOString().split('T')[0]);
              setScheduleNotes('');
            }}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Remedial</span>
          </button>
        </div>
      </div>

      {/* Dynamic Tabs Navigation */}
      <div className="flex border-b border-slate-205 dark:border-slate-800 space-x-6">
        <button
          onClick={() => { setActiveTab('watchlist'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'watchlist' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          Retention Watchlist ({watchlistStudents.length})
        </button>
        <button
          onClick={() => { setActiveTab('ai-risk'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative flex items-center gap-1.5 ${
            activeTab === 'ai-risk' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500 font-extrabold' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 font-medium'
          }`}
        >
          <Sparkles className="w-4 h-4 text-violet-500 animate-pulse" />
          AI Risk Prediction
        </button>
        <button
          onClick={() => { setActiveTab('remedials'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'remedials' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          Remedial Program ({allRemedialExams.filter(e => e.status === 'pending').length} Pending)
        </button>
        <button
          onClick={() => { setActiveTab('all'); setSearchQuery(''); }}
          className={`pb-3 font-semibold text-sm transition-all relative ${
            activeTab === 'all' 
              ? 'text-clinical-600 dark:text-clinical-400 border-b-2 border-clinical-500' 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
          }`}
        >
          All Enrolled ({facultyStudents.length})
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={
            activeTab === 'watchlist' ? 'Search at risk watchlist...' : 
            activeTab === 'ai-risk' ? 'Search AI forecast watchlist...' :
            activeTab === 'remedials' ? 'Search remedial logs...' : 'Search all standings...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
        />
      </div>

      {/* ----------------------------------------------------
          TAB 1: WATCHLIST
      ---------------------------------------------------- */}
      {activeTab === 'watchlist' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3 text-center">GWA</th>
                  <th className="px-5 py-3">Retention Violations</th>
                  <th className="px-5 py-3">Standing</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400 font-medium">
                      🎉 No students currently in retention watchlist under your assigned courses.
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map(student => {
                    const clinicalViolations = student.enrolledSubjects.filter(
                      s => (s.isClinical && s.grade > settings.retentionThreshold) || s.grade === 5.0
                    );

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3">
                          <h4 className="font-bold text-slate-800 dark:text-slate-200">{student.name}</h4>
                          <span className="text-[10px] text-slate-400">{student.studentId} • Year {student.yearLevel}</span>
                        </td>
                        <td className="px-5 py-3 text-center font-extrabold text-slate-800 dark:text-slate-100">{student.overallGWA.toFixed(2)}</td>
                        <td className="px-5 py-3">
                          <div className="space-y-1">
                            {clinicalViolations.map(subj => (
                              <div key={subj.code} className="text-[10px] flex items-center space-x-1.5 text-rose-500 font-semibold">
                                <span className="px-1 bg-rose-500/10 rounded font-bold uppercase">{subj.code}</span>
                                <span>{subj.name} (Grade: {subj.grade})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3">{getStatusBadge(student.status)}</td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => {
                                setOverrideStudentId(student.id);
                                setOverrideStatus(student.status);
                                setOverrideRemarks('');
                                setIsOverrideOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-350 shadow-sm"
                            >
                              Override Status
                            </button>
                            <button
                              onClick={() => {
                                setHistoryStudent(student);
                                setIsHistoryOpen(true);
                              }}
                              className="p-1.5 text-slate-455 hover:text-clinical-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Audit History"
                            >
                              <History className="w-4.5 h-4.5" />
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

      {/* ----------------------------------------------------
          TAB 2: AI RISK PREDICTION (RANDOM FOREST)
      ---------------------------------------------------- */}
      {activeTab === 'ai-risk' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-205 flex items-center gap-1.5">
              <Sparkles className="w-5 h-5 text-violet-500" />
              Random Forest Academic Warning Predictor
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Simulated predictive confidence generated by evaluated student performance metrics</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3 text-center">Prediction Risk</th>
                  <th className="px-5 py-3 text-center">RF Confidence</th>
                  <th className="px-5 py-3">Contributing Warning Indicators</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredAiPredictions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                      No predictions available for matching search.
                    </td>
                  </tr>
                ) : (
                  filteredAiPredictions.map(({ student, riskLevel, confidence, factors }) => (
                    <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-4">
                        <h4 className="font-bold text-slate-850 dark:text-slate-205">{student.name}</h4>
                        <span className="text-[10px] text-slate-400">{student.studentId} • Year {student.yearLevel}</span>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          riskLevel === 'High' 
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-250/20' 
                            : riskLevel === 'Medium' 
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-250/20' 
                            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-250/20'
                        }`}>
                          {riskLevel} Risk
                        </span>
                      </td>

                      <td className="px-5 py-4 text-center font-extrabold font-mono text-slate-800 dark:text-slate-100">
                        {confidence}%
                      </td>

                      <td className="px-5 py-4 text-[10px] text-slate-550 dark:text-slate-400 max-w-sm">
                        <div className="space-y-1">
                          {factors.map((f, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-slate-400" />
                              <span>{f}</span>
                            </div>
                          ))}
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
          TAB 3: REMEDIAL program
      ---------------------------------------------------- */}
      {activeTab === 'remedials' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3">Subject info</th>
                  <th className="px-5 py-3">Remedial Date</th>
                  <th className="px-5 py-3">Status / Score</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredRemedials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      No active scheduled remedials.
                    </td>
                  </tr>
                ) : (
                  filteredRemedials.map(rem => (
                    <tr key={rem.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <h4 className="font-bold text-slate-800 dark:text-slate-202">{rem.studentName}</h4>
                        <span className="text-[10px] text-slate-400">{rem.studentIdNum}</span>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="px-1.5 py-0.5 rounded bg-clinical-50 text-clinical-650 dark:bg-clinical-950/40 dark:text-clinical-450 font-bold font-mono text-[9px] uppercase tracking-wide">
                          {rem.subjectCode}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[180px]">{rem.subjectName}</div>
                        <div className="text-[9px] text-slate-405 mt-0.5 font-bold">Orig. Grade: {rem.originalGrade.toFixed(2)}</div>
                      </td>

                      <td className="px-5 py-3.5 text-slate-700 dark:text-slate-350 font-semibold">{rem.examDate}</td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                            rem.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                            rem.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {rem.status}
                          </span>
                          {rem.remedialScore !== null && (
                            <span className="font-extrabold text-slate-700 dark:text-slate-350">{rem.remedialScore}%</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {rem.status === 'pending' ? (
                            <button
                              onClick={() => {
                                setSelectedRemedialId(rem.id);
                                setRemedialScore('');
                                setRemedialNotes('');
                              }}
                              className="px-2.5 py-1.5 bg-clinical-500 hover:bg-clinical-600 text-white rounded-lg text-[10px] font-bold shadow-sm"
                            >
                              Grade Score
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold">Resolved</span>
                          )}
                          <button
                            onClick={() => handleDeleteRemedial(rem.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                            title="Remove Log"
                          >
                            <XCircle className="w-4 h-4" />
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
          TAB 4: ALL STANDINGS
      ---------------------------------------------------- */}
      {activeTab === 'all' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3">Year Level</th>
                  <th className="px-5 py-3">Overall GWA</th>
                  <th className="px-5 py-3">Standing Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredAllStudents.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                    <td className="px-5 py-3.5">
                      <h4 className="font-bold text-slate-800 dark:text-slate-205">{student.name}</h4>
                      <span className="text-[10px] text-slate-400">{student.studentId} • {student.email}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-350">Year {student.yearLevel}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-850 dark:text-slate-150">{student.overallGWA.toFixed(2)}</td>
                    <td className="px-5 py-3.5">{getStatusBadge(student.status)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => {
                            setOverrideStudentId(student.id);
                            setOverrideStatus(student.status);
                            setOverrideRemarks('');
                            setIsOverrideOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-slate-150 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] rounded-lg font-bold"
                        >
                          Override
                        </button>
                        <button
                          onClick={() => {
                            setHistoryStudent(student);
                            setIsHistoryOpen(true);
                          }}
                          className="p-1.5 text-slate-455 hover:text-clinical-600 rounded-lg"
                        >
                          <History className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* RESOLVE REMEDIAL MODAL */}
      <Modal
        isOpen={selectedRemedialId !== null}
        onClose={() => setSelectedRemedialId(null)}
        title="Grade Remedial Examination"
      >
        {activeRemedialToRecord && (
          <form onSubmit={handleResolveRemedial} className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs text-slate-500">
              <div><span className="font-bold text-slate-400">Student:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{activeRemedialToRecord.studentName}</span></div>
              <div><span className="font-bold text-slate-400">Course:</span> <span className="font-semibold text-clinical-600 dark:text-clinical-400">{activeRemedialToRecord.subjectCode} - {activeRemedialToRecord.subjectName}</span></div>
              <div><span className="font-bold text-slate-400">Original Grade:</span> <span className="font-semibold text-rose-500">{activeRemedialToRecord.originalGrade.toFixed(2)}</span></div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Remedial Score Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="Enter score (e.g. 78)"
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Note: &gt;= 75% passes the student, capping their grade at 2.5 (Clinical) or 3.0 (Lecture).</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Resolution Comments / Notes
              </label>
              <textarea
                rows={3}
                placeholder="Describe practical clinical skills reassessment..."
                value={remedialNotes}
                onChange={(e) => setRemedialNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-4 justify-end">
              <button
                type="button"
                onClick={() => setSelectedRemedialId(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md"
              >
                Resolve & Publish
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* SCHEDULE REMEDIAL MODAL */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Schedule Remedial Examination"
      >
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Student</label>
            <select
              required
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              <option value="">Select student...</option>
              {facultyStudents.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.studentId})</option>
              ))}
            </select>
          </div>

          {selectedStudentForSchedule && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Course</label>
              <select
                required
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
              >
                <option value="">Select course...</option>
                {selectedStudentForSchedule.enrolledSubjects
                  .filter(subj => assignedSubjects.includes(subj.code))
                  .map(subj => (
                    <option key={subj.code} value={subj.code}>{subj.code} - {subj.name} (Grade: {subj.grade})</option>
                  ))
                }
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Remedial Exam Date</label>
            <input
              type="date"
              required
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Scheduling Notes</label>
            <textarea
              rows={3}
              placeholder="e.g. Schedule for practical clinic instrumentation retry..."
              value={scheduleNotes}
              onChange={(e) => setScheduleNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
            />
          </div>

          <div className="flex space-x-3 pt-4 justify-end">
            <button
              type="button"
              onClick={() => setIsScheduleOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm shadow-md"
            >
              Create Schedule
            </button>
          </div>
        </form>
      </Modal>

      {/* OVERRIDE RETENTION STATUS MODAL */}
      <Modal
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        title="Override Academic Retention Standing"
      >
        <form onSubmit={handleOverrideSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              New Override Status
            </label>
            <select
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value as any)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              <option value="active">Active (Satisfies Retention Guidelines)</option>
              <option value="warning">Warning Standing</option>
              <option value="critical">Critical Standing</option>
              <option value="remedial">Scheduled Remedial Program</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Remarks / Justification
            </label>
            <textarea
              required
              rows={3}
              placeholder="Provide a justification details for audit trail trail logs..."
              value={overrideRemarks}
              onChange={(e) => setOverrideRemarks(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
            />
          </div>

          <div className="flex space-x-3 pt-2 justify-end">
            <button
              type="button"
              onClick={() => setIsOverrideOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md"
            >
              Apply Status Override
            </button>
          </div>
        </form>
      </Modal>

      {/* VIEW RETENTION LOG HISTORY AUDIT TRAIL MODAL */}
      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title={`Status History Logs: ${historyStudent?.name || ''}`}
      >
        <div className="space-y-4">
          <div className="border border-slate-150 dark:border-slate-850 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold uppercase text-[9px] text-slate-400 tracking-wider">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Previous Status</th>
                  <th className="px-4 py-2">New Status</th>
                  <th className="px-4 py-2">Remarks / Justification</th>
                  <th className="px-4 py-2">Authorized By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-[11px]">
                {!historyStudent?.retentionHistory || historyStudent.retentionHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-450 italic">
                      No status override history logs found for this student.
                    </td>
                  </tr>
                ) : (
                  historyStudent.retentionHistory.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono whitespace-nowrap">{log.date}</td>
                      <td className="px-4 py-2 capitalize font-semibold text-slate-500">{log.previousStatus}</td>
                      <td className="px-4 py-2 capitalize font-bold text-slate-800 dark:text-slate-205">{log.newStatus}</td>
                      <td className="px-4 py-2 text-slate-550 dark:text-slate-400">{log.remarks}</td>
                      <td className="px-4 py-2 font-medium text-clinical-600">{log.changedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsHistoryOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
            >
              Close Ledger
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
