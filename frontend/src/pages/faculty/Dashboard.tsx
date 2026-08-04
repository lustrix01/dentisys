import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { getFacultyDashboardKpisApi } from '../../services/apiClient';

export const Dashboard: React.FC = () => {
  const { students, updateRemedialExam } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardKpis, setDashboardKpis] = useState<Awaited<ReturnType<typeof getFacultyDashboardKpisApi>> | null>(null);

  // Search input state
  const [searchQuery, setSearchQuery] = useState('');

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setDashboardError('');
    getFacultyDashboardKpisApi()
      .then((res) => {
        setDashboardKpis(res);
        setLoading(false);
      })
      .catch((error) => {
        setDashboardError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
        setLoading(false);
      });
  }, []);

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

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState('');
  
  // States for Recording Remedial Score
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState<string>('');
  const [remedialNotes, setRemedialNotes] = useState<string>('');

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
  const pendingRemedials = facultyStudents.flatMap(s => 
    s.remedialExams.filter(rem => rem.status === 'pending' && assignedSubjects.includes(rem.subjectCode)).map(rem => ({
      ...rem,
      studentName: s.name,
    }))
  );

  // Calculate class-specific attendance rate
  const selectedClassSummary = dashboardKpis?.classes.find(classItem => classItem.id === selectedClassId);
  const classAttendanceRate = selectedClassSummary?.attendance ?? null;

  const handleResolveRemedial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      showFeedback('Please enter a valid score (0-100).', 'error');
      return;
    }
    updateRemedialExam(selectedRemedialId, scoreVal, remedialNotes);
    setSelectedRemedialId(null);
    setRemedialScore('');
    setRemedialNotes('');
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
      
      {/* 1. Clean Welcome Banner Header (Faculty GREEN Theme) */}
      <div className="rounded-3xl bg-gradient-to-r from-clinical-700 via-clinical-800 to-emerald-950 p-6 sm:p-8 text-white shadow-lg shadow-clinical-900/10">
        <span className="text-xs font-bold text-clinical-200 tracking-wider uppercase block mb-1">
          Faculty Portal • 2nd Semester Academic Term 2024-2025
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">
          Welcome back, {user?.display_name || 'Faculty Member'}
        </h1>
        <p className="text-xs sm:text-sm text-clinical-100/90 mt-1.5 max-w-2xl leading-relaxed">
          Access your assigned dental courses, grade computations, student attendance records, and retention evaluations in one place.
        </p>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace Column (Spans 8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* 2. Faculty Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <span className="text-[10px] font-extrabold text-clinical-600 dark:text-clinical-400 uppercase tracking-widest block">
                  Faculty Workspace
                </span>
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

            {/* Concise Workspace Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Classes</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {dashboardKpis?.kpis.activeClasses ?? 0}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {facultyTotalStudents}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-lg font-extrabold text-clinical-600 dark:text-clinical-400 block mt-0.5">
                  {classAttendanceRate === null ? 'N/A' : `${classAttendanceRate}%`}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Dashboard Overview (4 Metrics Row) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Classes</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{dashboardKpis?.kpis.activeClasses ?? 0}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Students Handled</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{facultyTotalStudents}</span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">At-Risk Watchlist</span>
              <span className={`text-2xl font-extrabold block mt-1 ${atRiskCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
                {atRiskCount}
              </span>
            </Card>

            <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Pending Remedials</span>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">{dashboardKpis?.kpis.remedialCount ?? 0}</span>
            </Card>
          </div>

          {/* 4. Quick Actions Panel (Clean Typography Cards) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => navigate('/grades?tab=assessments')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-clinical-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-clinical-600 dark:text-clinical-400 uppercase tracking-wider block">Assessment</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-clinical-600 transition-colors">
                  New Assessment
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Create exam or quiz
                </p>
              </button>

              <button
                onClick={() => navigate('/grades?tab=scores')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-emerald-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Grading</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-emerald-600 transition-colors">
                  Encode Scores
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Input student grades
                </p>
              </button>

              <button
                onClick={() => navigate('/attendance?tab=history')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-teal-500/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">Attendance</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-teal-600 transition-colors">
                  Attendance Sheet
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Verify daily check-ins
                </p>
              </button>

              <button
                onClick={() => navigate('/reports')}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-emerald-600/50 hover:shadow-xs transition-all text-left group cursor-pointer"
              >
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Analytics</span>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-emerald-600 transition-colors">
                  Export Reports
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Generate grade reports
                </p>
              </button>
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
                placeholder="Search assigned courses (e.g. CLIN401), students, or student IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-clinical-500 dark:text-slate-100 placeholder-slate-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Filtered Search Results */}
            {searchQuery.trim() !== '' && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700 text-xs space-y-2 max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Search Results</div>
                {filteredSearchSubjects.length === 0 && filteredSearchStudents.length === 0 ? (
                  <p className="text-xs text-slate-400 py-1">No matching classes or students found.</p>
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
        <div className="lg:col-span-4 space-y-5">
          
          {/* Widget 1: Announcements */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Announcements
              </h3>
              <span className="text-[10px] font-bold text-clinical-600 bg-clinical-50 dark:bg-clinical-950/60 px-2 py-0.5 rounded-full">
                BU CDM
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-clinical-600 dark:text-clinical-400 uppercase tracking-wider">
                  Academic Notice
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  Midterm Grade Encoding Deadline
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Faculty members must submit midterm evaluation grades before Friday, 5:00 PM.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Clinical Operations
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  CCTV & Attendance Override Guidelines
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Class Secretaries may submit daily attendance logs for faculty audit verification.
                </p>
              </div>
            </div>
          </div>

          {/* Widget 2: Today's Schedule */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Today's Schedule
              </h3>
              <span className="text-[10px] text-slate-400 font-semibold">Active Term</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {activeSubjects.slice(0, 2).map((subj, idx) => (
                <div key={subj.code} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-xl bg-clinical-50 dark:bg-clinical-950/60 text-clinical-600 dark:text-clinical-400 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-100">{subj.code}</h4>
                      <p className="text-[10px] text-slate-400">{subj.name}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-clinical-100 text-clinical-700 dark:bg-clinical-950 dark:text-clinical-300 rounded-md">
                    Lecture Hall
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 3: Recent Activity */}
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
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                  Updated class section rosters & grade calculations.
                </p>
                <span className="text-[10px] text-slate-400 block mt-1">System Sync • Active</span>
              </div>
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <p className="text-slate-700 dark:text-slate-300 text-xs font-medium">
                  Evaluated retention watch thresholds for assigned students.
                </p>
                <span className="text-[10px] text-slate-400 block mt-1">Retention Module • Today</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Record Remedial Score Modal */}
      <Modal
        isOpen={selectedRemedialId !== null}
        onClose={() => setSelectedRemedialId(null)}
        title="Record Remedial Exam Score"
      >
        {activeRemedialToRecord && (
          <form onSubmit={handleResolveRemedial} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <div><span className="text-slate-400 font-semibold">Student:</span> <strong className="text-slate-800 dark:text-slate-200">{activeRemedialToRecord.studentName}</strong></div>
              <div><span className="text-slate-400 font-semibold">Subject:</span> <strong className="text-clinical-600 dark:text-clinical-400">{activeRemedialToRecord.subjectCode}</strong></div>
              <div><span className="text-slate-400 font-semibold">Original Grade:</span> <strong className="text-rose-500">{activeRemedialToRecord.originalGrade}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Remedial Exam Percentage Score (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="Enter score (e.g. 82)"
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-clinical-500 text-xs outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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

            <div className="pt-3 flex justify-end gap-2">
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
                Save Score
              </button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
};
