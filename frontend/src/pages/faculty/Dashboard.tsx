import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  ClipboardCheck,
  Plus,
  BookOpen,
  CalendarCheck,
  Sparkles,
  Camera,
  FileSpreadsheet,
  Layers,
  CheckCircle,
  FileText
} from 'lucide-react';
import { 
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';

export const Dashboard: React.FC = () => {
  const { students, attendanceRecords, assessments, updateRemedialExam, addAttendanceRecord } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['CLINIC-A', 'CLINIC-B'];

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState<string>(assignedClasses[0] || 'CLINIC-A');
  
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

  // RBAC filter on subjects
  const subjects = allSubjects.filter(subj => assignedSubjects.includes(subj.code));
  const fallbackSubjects = [
    { code: 'CLIN401', name: 'Clinical Dentistry I (Endodontics focus)' },
    { code: 'CLIN402', name: 'Restorative Dentistry Clinic' },
  ];
  const activeSubjects = subjects.length > 0 ? subjects : fallbackSubjects;

  const [selectedSubjectCode, setSelectedSubjectCode] = useState(activeSubjects[0]?.code || 'CLIN401');

  // Filter students based on selected class and subjects (RBAC)
  const facultyStudents = students.filter(s =>
    s.classId === selectedClassId &&
    s.enrolledSubjects.some(sub => assignedSubjects.includes(sub.code))
  );

  // Filter students in the selected active tab subject
  const studentsInSelectedSubject = facultyStudents.filter(s =>
    s.enrolledSubjects.some(sub => sub.code === selectedSubjectCode)
  );

  // Statistics
  const facultyTotalStudents = facultyStudents.length;
  
  // At-risk students
  const atRiskStudents = facultyStudents.filter(s => s.status === 'warning' || s.status === 'critical');
  const atRiskCount = atRiskStudents.length;

  // Pending remedials to grade (only for assigned subjects)
  const pendingRemedials = facultyStudents.flatMap(s => 
    s.remedialExams.filter(rem => rem.status === 'pending' && assignedSubjects.includes(rem.subjectCode)).map(rem => ({
      ...rem,
      studentName: s.name,
    }))
  );

  // Calculate class-specific attendance rate
  const classAttendanceRate = (() => {
    const classRecords = attendanceRecords.filter(r => r.subjectCode === selectedSubjectCode);
    if (classRecords.length === 0) return 95;
    const presents = classRecords.filter(r => r.status === 'present' || r.status === 'late').length;
    return Math.round((presents / classRecords.length) * 100);
  })();

  // Mock attendance trend data
  const attendanceHistoryData = [
    { name: 'Week 1', rate: 91 },
    { name: 'Week 2', rate: 94 },
    { name: 'Week 3', rate: 90 },
    { name: 'Week 4', rate: classAttendanceRate },
  ];

  // Faculty Assessments (filter by assigned subjects)
  const facultyAssessments = assessments.filter(ass => 
    assignedSubjects.includes(ass.subjectCode) && ass.status !== 'Archived'
  );

  // GWA Grade Distribution Chart Data
  const gwaBuckets = [
    { name: '1.0 - 1.5', count: 0 },
    { name: '1.51 - 2.0', count: 0 },
    { name: '2.01 - 2.5', count: 0 },
    { name: '2.51 - 3.0', count: 0 },
    { name: '3.1 - 5.0 (Fail)', count: 0 },
  ];

  facultyStudents.forEach(s => {
    const gwa = s.overallGWA;
    if (gwa <= 1.5) gwaBuckets[0].count++;
    else if (gwa <= 2.0) gwaBuckets[1].count++;
    else if (gwa <= 2.5) gwaBuckets[2].count++;
    else if (gwa <= 3.0) gwaBuckets[3].count++;
    else gwaBuckets[4].count++;
  });

  // Retention Status Pie Chart Data
  const statusCounts: Record<string, number> = { active: 0, warning: 0, critical: 0, remedial: 0 };
  facultyStudents.forEach(s => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });

  const pieData = [
    { name: 'Active (Good Standing)', value: statusCounts.active, color: '#10B981' },
    { name: 'Warning (Below 2.5)', value: statusCounts.warning, color: '#F59E0B' },
    { name: 'Critical Standings', value: statusCounts.critical, color: '#EF4444' },
    { name: 'Under Remedial', value: statusCounts.remedial, color: '#8B5CF6' },
  ].filter(item => item.value > 0);

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
    const targetSub = sessionSubject || activeSubjects[0]?.code;
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
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Faculty Portal Dashboard
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Logged in: <span className="font-bold text-clinical-650 dark:text-slate-350">{user?.display_name}</span> • {'Dental Faculty Member'}
          </p>
        </div>
        
        {/* Quick Header Actions */}
        <div className="flex space-x-2 mt-3 sm:mt-0">
          <button
            onClick={() => {
              setSessionSubject(selectedSubjectCode);
              setIsCreateSessionOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs transition-all shadow-md shadow-clinical-500/10 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Class Session
          </button>
          <button
            onClick={() => navigate('/grades')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 font-semibold text-xs transition-all cursor-pointer bg-white dark:bg-slate-950"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-accent-500" />
            Grade Computations
          </button>
        </div>
      </div>

      {/* Class / Block Switcher */}
      {assignedClasses.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Block:</span>
          <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl gap-1">
            {assignedClasses.map((clsId: string) => {
              const cls = students.find(s => s.classId === clsId);
              const label = cls?.className || clsId;
              const isActive = selectedClassId === clsId;
              return (
                <button
                  key={clsId}
                  onClick={() => setSelectedClassId(clsId)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
        </div>
      )}

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-clinical-50 to-clinical-100/20 dark:from-clinical-950/20 dark:to-clinical-900/10 border-clinical-200/50 dark:border-clinical-800/20 hover:scale-101 transition-all">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Assigned Classes</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{assignedClasses.length} Class</span>
          </div>
          <div className="p-2.5 bg-clinical-550/10 text-clinical-600 dark:text-clinical-450 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-accent-50 to-accent-100/20 dark:from-accent-950/20 dark:to-accent-900/10 border-accent-200/50 dark:border-accent-800/20 hover:scale-101 transition-all">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Active Students</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{facultyTotalStudents}</span>
          </div>
          <div className="p-2.5 bg-accent-500/10 text-accent-600 dark:text-accent-400 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-amber-50 to-amber-100/20 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200/50 dark:border-amber-800/20 hover:scale-101 transition-all">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">At-Risk Watchlist</span>
            <span className={`text-2xl font-extrabold block mt-0.5 ${atRiskCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>
              {atRiskCount}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl ${atRiskCount > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-slate-150 text-slate-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between bg-gradient-to-tr from-violet-50 to-violet-100/20 dark:from-violet-950/20 dark:to-violet-900/10 border-violet-200/50 dark:border-violet-800/20 hover:scale-101 transition-all">
          <div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Pending Remedials</span>
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">{pendingRemedials.length}</span>
          </div>
          <div className="p-2.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Quick Access Task Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => navigate('/grades?tab=assessments')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-clinical-500/10 text-clinical-600 group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">New Assessment</span>
        </button>

        <button
          onClick={() => navigate('/grades?tab=scores')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-accent-500/10 text-accent-600 group-hover:scale-110 transition-transform">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">Record Scores</span>
        </button>

        <button
          onClick={() => navigate('/attendance?tab=history')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-sky-550/10 text-sky-600 group-hover:scale-110 transition-transform">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">Attendance Override</span>
        </button>

        <button
          onClick={() => navigate('/retention?tab=ai-risk')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 group-hover:scale-110 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">AI Risk Forecast</span>
        </button>

        <button
          onClick={() => navigate('/students?tab=facial')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:scale-110 transition-transform">
            <Camera className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">Face Enrollment</span>
        </button>

        <button
          onClick={() => navigate('/reports')}
          className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl hover:-translate-y-0.5 hover:shadow-md transition-all group"
        >
          <div className="p-2 rounded-xl bg-pink-500/10 text-pink-600 group-hover:scale-110 transition-transform">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-350">Export Reports</span>
        </button>
      </div>

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Assigned Course Scope (spans 7) */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
                    <BookOpen className="w-4.5 h-4.5 text-clinical-550" />
                    My Assigned Subjects
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Select a course to view enrolled rosters and stats</p>
                </div>
              </div>

              {/* Subject Tabs */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {activeSubjects.map(subj => (
                  <button
                    key={subj.code}
                    onClick={() => setSelectedSubjectCode(subj.code)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                      selectedSubjectCode === subj.code
                        ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10'
                        : 'bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {subj.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Class Standings */}
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 py-3 px-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-800 text-center">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Roster Size</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{studentsInSelectedSubject.length} Students</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Attendance Rate</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{classAttendanceRate}%</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Assessments</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">
                    {facultyAssessments.filter(a => a.subjectCode === selectedSubjectCode).length} Active
                  </span>
                </div>
              </div>

              {/* Class Roster Table */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Roster (Assigned)</h4>
                <div className="border border-slate-150 dark:border-slate-800/80 rounded-2xl overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Name</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student ID</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject Grade</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Retention Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {studentsInSelectedSubject.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-5 text-center text-xs text-slate-405">No students enrolled.</td>
                        </tr>
                      ) : (
                        studentsInSelectedSubject.map(s => {
                          const subj = s.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
                          const subjectGrade = subj?.grade;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10 text-xs">
                              <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{s.name}</td>
                              <td className="px-4 py-3 text-slate-450 dark:text-slate-500 font-mono">{s.studentId}</td>
                              <td className="px-4 py-3 font-bold">
                                <span className={subjectGrade && subjectGrade > 2.5 ? 'text-rose-600 dark:text-rose-450' : 'text-emerald-600 dark:text-emerald-450'}>
                                  {subjectGrade !== undefined ? subjectGrade.toFixed(2) : 'N/A'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${
                                  s.status === 'critical' 
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30'
                                    : s.status === 'warning'
                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30'
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

          {/* Attendance Trend Chart */}
          <Card className="p-4">
            <h4 className="text-xs font-bold text-slate-805 dark:text-slate-200 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <CalendarCheck className="w-4 h-4 text-clinical-550" />
              Weekly Attendance Trend ({selectedSubjectCode})
            </h4>
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
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
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

        {/* Right Column: Alerts & Recent Assessments (spans 5) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Watchlist Alerts */}
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-850 dark:text-slate-100 flex items-center gap-1.5 mb-3 font-heading">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
              Retention Alerts
            </h3>
            <div className="border border-slate-150 dark:border-slate-800/80 rounded-2xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Student</th>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Subject</th>
                    <th className="px-3.5 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase">GWA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                  {atRiskStudents.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3.5 py-6 text-center text-slate-400">
                        🎉 All assigned students in good standing.
                      </td>
                    </tr>
                  ) : (
                    atRiskStudents.map(student => {
                      const subjFails = student.enrolledSubjects.filter(sub => assignedSubjects.includes(sub.code) && sub.grade > 2.5);
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                            <span className="text-[10px] text-slate-400">{student.studentId}</span>
                          </td>
                          <td className="px-3.5 py-3">
                            <span className="font-semibold text-slate-650 dark:text-slate-450">{subjFails.map(s=>s.code).join(', ') || 'General Warning'}</span>
                          </td>
                          <td className="px-3.5 py-3 text-right font-extrabold text-rose-500">
                            {student.overallGWA.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Remedials Grading Watch */}
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-850 dark:text-slate-100 flex items-center gap-1.5 mb-3 font-heading">
              <Clock className="w-4.5 h-4.5 text-clinical-550" />
              Remedials to Evaluate
            </h3>
            <div className="border border-slate-150 dark:border-slate-800/80 rounded-2xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Student</th>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Subject</th>
                    <th className="px-3.5 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                  {pendingRemedials.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3.5 py-6 text-center text-slate-400">
                        No pending remedial scores to record.
                      </td>
                    </tr>
                  ) : (
                    pendingRemedials.map(rem => (
                      <tr key={rem.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-3.5 py-3 font-semibold text-slate-850 dark:text-slate-200">{rem.studentName}</td>
                        <td className="px-3.5 py-3 text-slate-450 font-mono">{rem.subjectCode}</td>
                        <td className="px-3.5 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedRemedialId(rem.id);
                              setRemedialScore('');
                              setRemedialNotes('');
                            }}
                            className="px-2.5 py-1 bg-clinical-500 hover:bg-clinical-600 text-white font-bold text-[9px] rounded-lg shadow-sm transition-colors"
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

          {/* Recent Assessments Tracker */}
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-850 dark:text-slate-100 flex items-center gap-1.5 mb-3 font-heading">
              <FileText className="w-4.5 h-4.5 text-accent-500" />
              Recent Assessments
            </h3>
            <div className="border border-slate-150 dark:border-slate-800/80 rounded-2xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Assessment Details</th>
                    <th className="px-3.5 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase">Subject</th>
                    <th className="px-3.5 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase">Max Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs">
                  {facultyAssessments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3.5 py-6 text-center text-slate-400">
                        No active assessments. Click "New Assessment" to create one.
                      </td>
                    </tr>
                  ) : (
                    facultyAssessments.slice(0, 4).map(ass => (
                      <tr key={ass.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-slate-805 dark:text-slate-200">{ass.title}</div>
                          <span className="text-[9px] px-1 bg-clinical-50 text-clinical-600 dark:bg-clinical-950/40 dark:text-clinical-400 rounded-sm font-semibold">{ass.type}</span>
                        </td>
                        <td className="px-3.5 py-3 text-slate-450 dark:text-slate-500 font-mono">{ass.subjectCode}</td>
                        <td className="px-3.5 py-3 text-right font-extrabold text-slate-700 dark:text-slate-350">
                          {ass.maxScore}
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

      {/* Analytics Visualizations Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
        
        {/* Retention Standings Pie Chart */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Layers className="w-4 h-4 text-clinical-550" />
              Retention Watch Standings
            </h4>
            <p className="text-[10px] text-slate-400 mb-4">Proportion of student academic warning classifications</p>
          </div>
          <div className="h-56 flex items-center justify-center">
            {pieData.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold">No distribution data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Students`, 'Count']} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* GWA Frequencies Bar Chart */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ClipboardCheck className="w-4 h-4 text-accent-500" />
              GWA Distribution
            </h4>
            <p className="text-[10px] text-slate-400 mb-4">Number of students within GWA academic score thresholds</p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gwaBuckets} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-900" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(67, 160, 71, 0.05)' }} />
                <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                  {gwaBuckets.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === 4 && entry.count > 0 ? '#ef4444' : '#4f46e5'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-1 justify-end">
              <button
                type="button"
                onClick={() => setSelectedRemedialId(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md shadow-clinical-500/10 transition-colors"
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
            >
              {activeSubjects.map(subj => (
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
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
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-clinical-500 text-xs"
            />
          </div>

          <div className="flex space-x-3 pt-1 justify-end">
            <button
              type="button"
              onClick={() => setIsCreateSessionOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md shadow-clinical-500/10 transition-colors"
            >
              Initialize Session
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
