import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  ClipboardCheck,
  CheckCircle,
  Plus,
  BookOpen,
  CalendarCheck
} from 'lucide-react';
import { 
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';

import { getFacultyDashboard, FacultyDashboardData } from '../../services/facultyService';

export const Dashboard: React.FC = () => {
  const { students, attendanceRecords, updateRemedialExam, addAttendanceRecord } = useApp();
  const navigate = useNavigate();
  
  const userStr = localStorage.getItem('dentisys_user');
  const currentUser = userStr ? JSON.parse(userStr) : { name: 'Dr. Eleanor Vance', role: 'faculty', title: 'Dental Faculty Member' };
  
  const [apiData, setApiData] = useState<FacultyDashboardData | null>(null);
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingApi(true);
    getFacultyDashboard()
      .then(res => {
        if (res && res.success) {
          setApiData(res);
        }
      })
      .catch(err => {
        console.warn('Backend API connection warning, using active context fallback', err);
        setApiError(err.message || 'Could not fetch live dashboard metrics.');
      })
      .finally(() => setIsLoadingApi(false));
  }, []);

  // States for Recording Remedial Score
  const [selectedRemedialId, setSelectedRemedialId] = useState<string | null>(null);
  const [remedialScore, setRemedialScore] = useState<string>('');
  const [remedialNotes, setRemedialNotes] = useState<string>('');

  // States for Create Class Session Modal
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [sessionSubject, setSessionSubject] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionTopic, setSessionTopic] = useState('');

  // Extract unique subjects
  const allSubjects = Array.from(
    new Set(
      students.flatMap(s => s.enrolledSubjects.map(sub => JSON.stringify({ code: sub.code, name: sub.name })))
    )
  ).map(str => JSON.parse(str) as { code: string; name: string });

  const subjects = allSubjects.length > 0 ? allSubjects : [
    { code: 'CLIN401', name: 'Clinical Dentistry I' },
    { code: 'CLIN402', name: 'Restorative Dentistry Clinic' },
    { code: 'ODON401', name: 'Dental Jurisprudence & Ethics' },
  ];

  // Faculty's selected class
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(subjects[0]?.code || 'CLIN401');

  // Filter students in the selected class
  const studentsInSelectedSubject = students.filter(s =>
    s.enrolledSubjects.some(sub => sub.code === selectedSubjectCode)
  );

  // Stats calculations
  const facultyTotalStudents = apiData?.stats?.total_students ?? students.length;
  
  // At-risk students
  const atRiskStudents = students.filter(s => s.status === 'warning' || s.status === 'critical');
  const atRiskCount = apiData?.stats?.at_risk_count ?? atRiskStudents.length;

  // Pending remedials to grade
  const pendingRemedials = students.flatMap(s => 
    s.remedialExams.filter(rem => rem.status === 'pending').map(rem => ({
      ...rem,
      studentName: s.name,
    }))
  );
  const pendingRemedialsCount = apiData?.stats?.pending_remedials ?? pendingRemedials.length;

  // Calculate class-specific attendance rate
  const classAttendanceRate = (() => {
    if (apiData?.stats?.attendance_rate !== undefined) return apiData.stats.attendance_rate;
    const classRecords = attendanceRecords.filter(r => r.subjectCode === selectedSubjectCode);
    if (classRecords.length === 0) return 94;
    const presents = classRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    return Math.round((presents / classRecords.length) * 100);
  })();

  // Mock attendance trend data
  const attendanceHistoryData = [
    { name: 'W1', rate: 92 },
    { name: 'W2', rate: 95 },
    { name: 'W3', rate: 89 },
    { name: 'W4', rate: classAttendanceRate },
  ];

  const handleResolveRemedial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRemedialId) return;
    const scoreVal = parseInt(remedialScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
      alert('Please enter a valid score (0-100).');
      return;
    }
    updateRemedialExam(selectedRemedialId, scoreVal, remedialNotes);
    setSelectedRemedialId(null);
    setRemedialScore('');
    setRemedialNotes('');
  };

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    const targetSub = sessionSubject || subjects[0]?.code;
    const enrolledStudents = students.filter(s => 
      s.enrolledSubjects.some(sub => sub.code === targetSub)
    );
    
    if (enrolledStudents.length === 0) {
      alert('No students enrolled in this class.');
      return;
    }

    enrolledStudents.forEach(student => {
      addAttendanceRecord({
        studentId: student.id,
        date: sessionDate,
        subjectCode: targetSub,
        status: 'present',
      });
    });

    alert(`Class session created. Attendance initialized for ${enrolledStudents.length} students.`);
    setIsCreateSessionOpen(false);
    setSessionTopic('');
  };

  const activeRemedialToRecord = pendingRemedials.find(r => r.id === selectedRemedialId);

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      
      {/* Dynamic Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            {currentUser.role === 'admin' 
              ? 'System Administrator Dashboard' 
              : 'Faculty Dashboard'}
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Logged in: <span className="font-bold text-slate-650 dark:text-slate-300">{currentUser.name}</span> • {currentUser.title}
          </p>
        </div>
        
        {/* Compact Actions */}
        <div className="flex space-x-2 mt-2 sm:mt-0">
          <button
            onClick={() => {
              setSessionSubject(selectedSubjectCode);
              setIsCreateSessionOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Session
          </button>
          <button
            onClick={() => navigate('/grades')}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-800 dark:text-slate-350 dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-slate-900/50 font-bold text-xs transition-all cursor-pointer"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Enter Grades
          </button>
        </div>
      </div>

      {/* Role-Specific Announcement Banner */}
      {currentUser.role === 'admin' && (
        <div className="bg-gradient-to-r from-violet-600 to-indigo-650 text-white p-5 rounded-2xl shadow-md border border-violet-500/20 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-violet-200">System Admin Access</h3>
            <p className="text-xs text-white/90 font-medium">You are in the control panel. All administrative logs, security keys, database edits, and system metrics are active.</p>
          </div>
          <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">Root Admin</span>
        </div>
      )}
      {currentUser.role === 'faculty' && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-650 text-white p-5 rounded-2xl shadow-md border border-emerald-500/20 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-250 font-semibold text-emerald-200">Faculty Clinic Access</h3>
            <p className="text-xs text-white/90 font-medium">Welcome back to the dental clinic floor. You can record grades, supervise clinical requirements, and review retention warnings.</p>
          </div>
          <span className="text-[10px] bg-white/20 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">Faculty Room</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-3.5 flex items-center justify-between bg-gradient-to-tr from-clinical-50 to-clinical-100/30 dark:from-clinical-950/40 dark:to-clinical-900/10 border-clinical-200/50 dark:border-clinical-800/30">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Assigned Students</span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{facultyTotalStudents}</span>
          </div>
          <div className="p-2 bg-clinical-500/10 dark:bg-clinical-950/40 text-clinical-600 dark:text-clinical-400 rounded-lg">
            <Users className="w-4.5 h-4.5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between bg-gradient-to-tr from-amber-50 to-amber-100/30 dark:from-amber-950/40 dark:to-amber-900/10 border-amber-200/50 dark:border-amber-800/30">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">At-Risk Count</span>
            <span className={`text-xl font-extrabold block mt-0.5 ${atRiskCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
              {atRiskCount}
            </span>
          </div>
          <div className={`p-2 rounded-lg ${atRiskCount > 0 ? 'bg-amber-500/15 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'}`}>
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between bg-gradient-to-tr from-accent-50 to-accent-100/30 dark:from-accent-950/40 dark:to-accent-900/10 border-accent-200/50 dark:border-accent-800/30">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Pending Remedials</span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{pendingRemedials.length}</span>
          </div>
          <div className="p-2 bg-accent-500/10 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 rounded-lg">
            <Clock className="w-4.5 h-4.5" />
          </div>
        </Card>

        <Card className="p-3.5 flex items-center justify-between bg-gradient-to-tr from-clinical-50 to-clinical-100/30 dark:from-clinical-950/40 dark:to-clinical-900/10 border-clinical-200/50 dark:border-clinical-800/30">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Attendance Rate</span>
            <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{classAttendanceRate}%</span>
          </div>
          <div className="p-2 bg-clinical-500/10 dark:bg-clinical-950/40 text-clinical-600 dark:text-clinical-400 rounded-lg">
            <CalendarCheck className="w-4.5 h-4.5" />
          </div>
        </Card>
      </div>

      {/* Core Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: My Assigned Course Scope (spans 7) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-clinical-500" />
                    My Assigned Course Scope
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Toggle course tabs below to inspect class standings</p>
                </div>
              </div>

              {/* Course Selection Tabs (Replaces Dropdown for better UX) */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {subjects.map(subj => (
                  <button
                    key={subj.code}
                    onClick={() => setSelectedSubjectCode(subj.code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedSubjectCode === subj.code
                        ? 'bg-clinical-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {subj.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Course Core Summary Table */}
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 text-center">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Class Size</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{studentsInSelectedSubject.length}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Class Attendance</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{classAttendanceRate}%</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Assessment Types</span>
                  <span className="text-base font-bold text-slate-850 dark:text-slate-100 mt-0.5 block">3 Components</span>
                </div>
              </div>

              {/* Class Roster Table */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Roster</h4>
                <div className="border border-slate-150 dark:border-slate-800/80 rounded-lg overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID</th>
                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grade</th>
                        <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {studentsInSelectedSubject.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">No students enrolled.</td>
                        </tr>
                      ) : (
                        studentsInSelectedSubject.map(s => {
                          const subj = s.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
                          const subjectGrade = subj?.grade;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                              <td className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200">{s.name}</td>
                              <td className="px-3 py-2 text-xs text-slate-400">{s.studentId}</td>
                              <td className="px-3 py-2 text-xs font-bold">
                                <span className={subjectGrade && subjectGrade > 2.5 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                  {subjectGrade !== undefined ? subjectGrade.toFixed(2) : 'N/A'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  s.status === 'critical' 
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400'
                                    : s.status === 'warning'
                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400'
                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-955/20 dark:text-emerald-400'
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>

          {/* Compact Attendance Rate Chart */}
          <Card className="p-4">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Weekly Attendance Trend</h4>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceHistoryData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#43A047" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#43A047" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-900" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} domain={[80, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px' }} />
                  <Area 
                    type="monotone" 
                    dataKey="rate" 
                    stroke="#43A047" 
                    strokeWidth={2} 
                    fillOpacity={1}
                    fill="url(#chartGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Right Column: Tables (spans 5) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Retention At Risk Table */}
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-3 font-heading">
              <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
              Retention At Risk
            </h3>
            <div className="border border-slate-150 dark:border-slate-800/80 rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grade</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {atRiskStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">All students in good standing.</td>
                    </tr>
                  ) : (
                    atRiskStudents.flatMap(student => 
                      student.enrolledSubjects
                        .filter(sub => sub.grade > 2.5)
                        .map(sub => (
                          <tr key={`${student.id}-${sub.code}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                            <td className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200">{student.name}</td>
                            <td className="px-3 py-2 text-xs text-slate-400">{sub.code}</td>
                            <td className="px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-405">{sub.grade.toFixed(2)}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                student.status === 'critical' 
                                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/20' 
                                  : 'bg-amber-50 text-amber-600 dark:bg-amber-955/20'
                              }`}>
                                {student.status}
                              </span>
                            </td>
                          </tr>
                        ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Remedials to Grade Table */}
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-3 font-heading">
              <Clock className="w-4 h-4 text-clinical-500" />
              Remedials to Grade
            </h3>
            <div className="border border-slate-150 dark:border-slate-800/80 rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Orig.</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {pendingRemedials.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">No pending remedials.</td>
                    </tr>
                  ) : (
                    pendingRemedials.map(rem => (
                      <tr key={rem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200">{rem.studentName}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{rem.subjectCode}</td>
                        <td className="px-3 py-2 text-xs font-bold text-rose-500">{rem.originalGrade.toFixed(2)}</td>
                        <td className="px-3 py-2 text-xs">
                          <button
                            onClick={() => {
                              setSelectedRemedialId(rem.id);
                              setRemedialScore('');
                              setRemedialNotes('');
                            }}
                            className="px-2 py-1 bg-clinical-500 hover:bg-clinical-600 text-white font-bold text-[9px] rounded-lg transition-colors shadow-xs"
                          >
                            Grade
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

        </div>

      </div>

      {/* Record Score Modal */}
      <Modal
        isOpen={selectedRemedialId !== null}
        onClose={() => setSelectedRemedialId(null)}
        title="Record Remedial Exam Score"
      >
        {activeRemedialToRecord && (
          <form onSubmit={handleResolveRemedial} className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <div><span className="text-slate-400">Student:</span> <strong className="text-slate-800 dark:text-slate-200">{activeRemedialToRecord.studentName}</strong></div>
              <div><span className="text-slate-400">Subject:</span> <strong className="text-clinical-600 dark:text-clinical-400">{activeRemedialToRecord.subjectCode}</strong></div>
              <div><span className="text-slate-400">Original Grade:</span> <strong className="text-rose-500">{activeRemedialToRecord.originalGrade}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Remedial Score (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                placeholder="Enter score (e.g. 82)"
                value={remedialScore}
                onChange={(e) => setRemedialScore(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Comments
              </label>
              <textarea
                rows={2}
                placeholder="Practical re-evaluation notes..."
                value={remedialNotes}
                onChange={(e) => setRemedialNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-1 justify-end">
              <button
                type="button"
                onClick={() => setSelectedRemedialId(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                Save Score
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Create Class Session Modal */}
      <Modal
        isOpen={isCreateSessionOpen}
        onClose={() => setIsCreateSessionOpen(false)}
        title="Create a Class Session"
      >
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Class / Subject
            </label>
            <select
              value={sessionSubject}
              onChange={(e) => setSessionSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
            >
              {subjects.map(subj => (
                <option key={subj.code} value={subj.code}>
                  {subj.code} - {subj.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Date
            </label>
            <input
              type="date"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-105 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Topic
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Endodontic Access Prep"
              value={sessionTopic}
              onChange={(e) => setSessionTopic(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
            />
          </div>

          <div className="flex space-x-3 pt-1 justify-end">
            <button
              type="button"
              onClick={() => setIsCreateSessionOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-xs transition-colors"
            >
              Initialize Session
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
