import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  User, 
  GraduationCap, 
  AlertTriangle, 
  CalendarDays,
  FileCheck,
  CheckCircle,
  Download,
  BookOpen,
  Sparkles,
  Clock,
  TrendingUp,
  Layers,
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
import { Student, AttendanceRecord, Assessment, AssessmentScore } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { gwaToDescription } from '../../utils/gradeHelper';

import { getFacultyReportsSummaryApi } from '../../services/apiClient';

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const { students: appStudents, attendanceRecords: appAttendanceRecords, assessments, assessmentScores, settings } = useApp();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbStudents, setDbStudents] = useState<any[]>([]);

  const fetchFacultyReports = () => {
    setLoading(true);
    setError('');
    getFacultyReportsSummaryApi()
      .then((res) => {
        if (res.reports?.students) {
          setDbStudents(res.reports.students);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to fetch report summary from server.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFacultyReports();
  }, []);

  const students = dbStudents.length > 0 ? dbStudents : appStudents;
  const attendanceRecords = appAttendanceRecords;

  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['CLINIC-A', 'CLINIC-B'];

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState<string>(assignedClasses[0] || 'CLINIC-A');

  // Report Category State: 'academic' | 'retention' | 'attendance' | 'analytics'
  const [reportTab, setReportTab] = useState<'academic' | 'retention' | 'attendance' | 'analytics'>('academic');

  // Search & Pagination states
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClassId, reportTab, search]);

  // Filter students based on selected class and subjects (RBAC)
  const facultyStudents = useMemo(() => {
    return students.filter(s =>
      s.classId === selectedClassId &&
      s.enrolledSubjects.some((sub: any) => assignedSubjects.includes(sub.code)) &&
      (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.studentId.toLowerCase().includes(search.toLowerCase()))
    );
  }, [students, selectedClassId, assignedSubjects, search]);

  const [selectedSubjectCode, setSelectedSubjectCode] = useState(assignedSubjects[0] || 'CLIN401');

  // Filter roster by course tab selector
  const studentsInSelectedSubject = useMemo(() => {
    return facultyStudents.filter(s =>
      s.enrolledSubjects.some((sub: any) => sub.code === selectedSubjectCode)
    );
  }, [facultyStudents, selectedSubjectCode]);

  const paginatedStudentsInSubject = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return studentsInSelectedSubject.slice(start, start + pageSize);
  }, [studentsInSelectedSubject, currentPage, pageSize]);

  const totalPagesInSubject = Math.ceil(studentsInSelectedSubject.length / pageSize) || 1;

  const handlePrint = () => {
    window.print();
  };

  // CSV Exporter Utility
  const handleExportCSV = (type: 'academic' | 'retention' | 'attendance') => {
    let headers = '';
    let rows = '';
    let fileName = '';

    if (type === 'academic') {
      headers = 'Student ID,Name,Course Code,Quizzes %,Exams %,Practicum %,Attendance %,GWA,Remarks\n';
      rows = studentsInSelectedSubject.map((student: any) => {
        const subj = (student.enrolledSubjects || []).find((sub: any) => sub.code === selectedSubjectCode);
        const q = subj && subj.components?.quizzes !== undefined ? Number(subj.components.quizzes).toFixed(1) : '80.0';
        const e = subj && subj.components?.exams !== undefined ? Number(subj.components.exams).toFixed(1) : '80.0';
        const p = subj && subj.components?.practicum !== undefined ? Number(subj.components.practicum).toFixed(1) : '80.0';
        const a = subj && subj.components?.attendance !== undefined ? Number(subj.components.attendance).toFixed(1) : '90.0';
        const g = subj && subj.grade !== undefined ? Number(subj.grade).toFixed(2) : '2.50';
        const rem = subj && subj.grade > 2.5 && subj.isClinical ? 'FAILS RETENTION' : 'PASS';
        return `${student.studentId},"${student.name}",${selectedSubjectCode},${q},${e},${p},${a},${g},${rem}`;
      }).join('\n');
      fileName = `${selectedSubjectCode}_Academic_Report.csv`;
    } else if (type === 'retention') {
      headers = 'Student ID,Name,Standing GWA,Warning Count,Risk Level,Remedial Status\n';
      rows = facultyStudents.map((student: any) => {
        const warningCount = (student.enrolledSubjects || []).filter((sub: any) => assignedSubjects.includes(sub.code) && sub.grade > 2.5).length;
        const riskLevel = warningCount > 0 ? 'HIGH' : 'LOW';
        const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;
        const remStatus = remedialCount > 0 ? 'PENDING EXAM' : 'STABLE';
        return `${student.studentId},"${student.name}",${Number(student.overallGWA || 1.75).toFixed(2)},${warningCount},${riskLevel},${remStatus}`;
      }).join('\n');
      fileName = `Retention_Report.csv`;
    } else {
      headers = 'Date,Student ID,Name,Subject Code,Status\n';
      rows = attendanceRecords
        .filter((r: any) => assignedSubjects.includes(r.subjectCode))
        .map((record: any) => {
          const s = students.find((x: any) => x.id === record.studentId);
          return `${record.date},${s?.studentId || ''},"${s?.name || ''}",${record.subjectCode},${String(record.status || '').toUpperCase()}`;
        }).join('\n');
      fileName = `Attendance_Report.csv`;
    }

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Recharts Stats: GWA Distribution
  const gwaHistogramData = useMemo(() => {
    const buckets = [
      { range: '1.0–1.5 (High Honor)', count: 0 },
      { range: '1.51–2.0 (Above Avg)', count: 0 },
      { range: '2.01–2.5 (Average)', count: 0 },
      { range: '2.51–3.0 (Retention Warning)', count: 0 },
      { range: '3.0+ (Critical Risk)', count: 0 },
    ];
    facultyStudents.forEach((s: any) => {
      const gwa = s.overallGWA || 1.75;
      if (gwa <= 1.5) buckets[0].count++;
      else if (gwa <= 2.0) buckets[1].count++;
      else if (gwa <= 2.5) buckets[2].count++;
      else if (gwa <= 3.0) buckets[3].count++;
      else buckets[4].count++;
    });
    return buckets;
  }, [facultyStudents]);

  // Recharts Stats: Retention Distribution
  const pieData = useMemo(() => {
    const counts: Record<string, number> = { active: 0, warning: 0, critical: 0, remedial: 0 };
    facultyStudents.forEach((s: any) => {
      const statusKey = (s.status || 'active').toLowerCase();
      counts[statusKey] = (counts[statusKey] || 0) + 1;
    });
    return [
      { name: 'Active Standing', value: counts.active || 0, color: '#10B981' },
      { name: 'Warning Status', value: counts.warning || 0, color: '#F59E0B' },
      { name: 'Critical Watch', value: counts.critical || 0, color: '#EF4444' },
      { name: 'Remedial Programs', value: counts.remedial || 0, color: '#8B5CF6' },
    ].filter(item => item.value > 0);
  }, [facultyStudents]);

  // Recharts Stats: Assessment Success Rates
  const assessmentStatsData = useMemo(() => {
    const activeAss = assessments.filter(a => assignedSubjects.includes(a.subjectCode) && a.status !== 'Archived');
    return activeAss.flatMap(ass => {
      const scores = assessmentScores.filter(s => s.assessmentId === ass.id);
      if (scores.length === 0) return [];
      const avg = scores.reduce((acc, curr) => acc + curr.score, 0) / scores.length;
      const avgPct = Math.round((avg / ass.maxScore) * 100);
      return [{
        name: ass.title.length > 15 ? ass.title.substring(0, 15) + '...' : ass.title,
        average: avgPct
      }];
    }).slice(0, 5);
  }, [assessments, assessmentScores, assignedSubjects]);

  return (
    <div className="space-y-6">
      
      {/* Page Header - Hidden during print */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print border-b border-slate-205 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-clinical-550" />
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Generate GWA evaluation logs, print transcript records, and review analytics dashboards</p>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 text-slate-650 hover:bg-slate-50 dark:text-slate-350 dark:hover:bg-slate-900 bg-white dark:bg-slate-950 font-bold text-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report Sheet</span>
          </button>
        </div>
      </div>

      {/* Selector Controls Card - Hidden during print */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center no-print">
        <div className="w-full md:flex-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Report Template Category</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setReportTab('academic')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                reportTab === 'academic' 
                  ? 'bg-clinical-500 text-white shadow-md shadow-clinical-500/10' 
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Academic GWAs Ledger
            </button>
            <button
              onClick={() => setReportTab('retention')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                reportTab === 'retention' 
                  ? 'bg-clinical-500 text-white shadow-md shadow-clinical-500/10' 
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Retention Watch Lists
            </button>
            <button
              onClick={() => setReportTab('attendance')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                reportTab === 'attendance' 
                  ? 'bg-clinical-500 text-white shadow-md shadow-clinical-500/10' 
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Attendance Registers
            </button>
            <button
              onClick={() => setReportTab('analytics')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                reportTab === 'analytics' 
                  ? 'bg-clinical-500 text-white shadow-md shadow-clinical-500/10' 
                  : 'bg-slate-100 dark:bg-slate-950 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Interactive Analytics
            </button>
          </div>
        </div>

        {reportTab === 'academic' && (
          <div className="w-full md:w-56 self-end md:self-auto">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Select Subject</label>
            <select
              value={selectedSubjectCode}
              onChange={(e) => setSelectedSubjectCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-808 dark:text-slate-100 text-xs font-semibold focus:outline-none"
            >
              {assignedSubjects.map((subCode: string) => (
                <option key={subCode} value={subCode}>{subCode}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* ----------------------------------------------------
          TAB 1: ACADEMIC REPORTS LEDGER
      ---------------------------------------------------- */}
      {reportTab === 'academic' && (
        <Card className="p-0 overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">Class Course Grade Reports</h3>
            <button
              onClick={() => handleExportCSV('academic')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3 text-center">Quizzes</th>
                  <th className="px-5 py-3 text-center">Practicum</th>
                  <th className="px-5 py-3 text-center">Exams</th>
                  <th className="px-5 py-3 text-center">Attendance</th>
                  <th className="px-5 py-3 text-center">Computed GWA</th>
                  <th className="px-5 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium text-slate-750">
                {paginatedStudentsInSubject.map((student: any) => {
                  const subj = student.enrolledSubjects ? student.enrolledSubjects.find((sub: any) => sub.code === selectedSubjectCode) : null;
                  const isFailsRetention = subj && subj.isClinical && subj.grade > (settings?.retentionThreshold || 2.5);
                  const isFailed = subj && subj.grade === 5.0;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-205">{student.name}</div>
                        <span className="text-[10px] text-slate-400 font-mono">{student.studentId}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.quizzes !== undefined ? Number(subj.components.quizzes).toFixed(1) : '80.0'}%</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.practicum !== undefined ? Number(subj.components.practicum).toFixed(1) : '80.0'}%</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.exams !== undefined ? Number(subj.components.exams).toFixed(1) : '80.0'}%</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.attendance !== undefined ? Number(subj.components.attendance).toFixed(1) : '90.0'}%</td>
                      <td className="px-5 py-3.5 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                        {subj && subj.grade !== undefined ? Number(subj.grade).toFixed(2) : '2.50'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          isFailed 
                            ? 'bg-rose-100 text-rose-700' 
                            : isFailsRetention 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isFailed ? 'FAILED' : isFailsRetention ? 'FAILS RETENTION' : 'PASS'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPagesInSubject > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-400">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, studentsInSelectedSubject.length)} of {studentsInSelectedSubject.length} records
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200">
                  Page {currentPage} of {totalPagesInSubject}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPagesInSubject))}
                  disabled={currentPage === totalPagesInSubject}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 2: RETENTION REPORTS
      ---------------------------------------------------- */}
      {reportTab === 'retention' && (
        <Card className="p-0 overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">Retention Status Reports</h3>
            <button
              onClick={() => handleExportCSV('retention')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3 text-center">Standing GWA</th>
                  <th className="px-5 py-3 text-center">Warning Counts</th>
                  <th className="px-5 py-3 text-center">Risk Level</th>
                  <th className="px-5 py-3">Remedial Program Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium text-slate-750">
                {facultyStudents.map((student: any) => {
                  const warnings = (student.enrolledSubjects || []).filter((sub: any) => assignedSubjects.includes(sub.code) && sub.grade > 2.5);
                  const isAtRisk = warnings.length > 0;
                  const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-205">{student.name}</div>
                        <span className="text-[10px] text-slate-404">{student.studentId} • Year {student.yearLevel}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-slate-800 dark:text-slate-100">{student.overallGWA.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-center font-semibold text-rose-500">{warnings.length} Warnings</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          isAtRisk ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isAtRisk ? 'HIGH RISK' : 'LOW RISK'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-550 dark:text-slate-400">
                        {remedialCount > 0 ? (
                          <span className="font-semibold text-violet-555 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Pending {remedialCount} exam(s)
                          </span>
                        ) : (
                          <span className="font-medium text-slate-400">Stable standing</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 3: ATTENDANCE REPORTS
      ---------------------------------------------------- */}
      {reportTab === 'attendance' && (
        <Card className="p-0 overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">Intake Attendance Registers</h3>
            <button
              onClick={() => handleExportCSV('attendance')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3">Subject Code</th>
                  <th className="px-5 py-3">Recorded Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium text-slate-750">
                {attendanceRecords
                  .filter(r => assignedSubjects.includes(r.subjectCode))
                  .map(record => {
                    const studentObj = students.find(s => s.id === record.studentId);
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3 font-mono">{record.date}</td>
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-202">{studentObj?.name}</div>
                          <span className="text-[10px] text-slate-400 font-mono">{studentObj?.studentId}</span>
                        </td>
                        <td className="px-5 py-3 font-bold font-mono text-clinical-650">{record.subjectCode}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${
                            record.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                            record.status === 'late' ? 'bg-amber-100 text-amber-700' :
                            record.status === 'excused' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ----------------------------------------------------
          TAB 4: ANALYTICS CHARTS
      ---------------------------------------------------- */}
      {reportTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 no-print">
          {/* Pie Chart */}
          <Card className="p-5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Layers className="w-4 h-4 text-clinical-550" />
                Retention Watch Standings
              </h4>
              <p className="text-[10px] text-slate-400 mb-4">Proportion of student academic standing warnings</p>
            </div>
            <div className="h-56 flex items-center justify-center">
              {pieData.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold">No warning distribution data available.</p>
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

          {/* Bar Chart */}
          <Card className="p-5 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-850 dark:text-slate-205 uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileCheck className="w-4 h-4 text-accent-505" />
                GWA Distribution
              </h4>
              <p className="text-[10px] text-slate-400 mb-4">Number of students within GWA academic thresholds</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gwaHistogramData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-900" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Assessment Performance Chart */}
          <Card className="p-5 flex flex-col justify-between md:col-span-2">
            <div>
              <h4 className="text-xs font-bold text-slate-855 dark:text-slate-205 uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4 text-clinical-550" />
                Assessment Average Success Rates
              </h4>
              <p className="text-[10px] text-slate-400 mb-4">Average scores across created assessment activities (out of 100%)</p>
            </div>
            <div className="h-56">
              {assessmentStatsData.length === 0 ? (
                <div className="py-12 text-center text-slate-405 text-xs">No assessment grades recorded yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assessmentStatsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-900" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} domain={[0, 100]} />
                    <Tooltip formatter={(v: any) => [`${v}%`, 'Average']} />
                    <Bar dataKey="average" fill="#0d9488" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------
          PRINT LAYOUT SHEETS PRINT AREA
      ---------------------------------------------------- */}
      <div className="print-only hidden p-8 bg-white text-slate-900 space-y-6">
        
        {/* school header */}
        <div className="text-center space-y-1.5 border-b-2 border-slate-800 pb-5 mb-6">
          <h2 className="font-heading font-extrabold text-2xl tracking-tight uppercase">DentiSys Academic Portal</h2>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Official College Evaluations Report</p>
          <p className="text-[10px] text-slate-400">Class: {assignedClasses.join(', ')} • Date: {new Date().toISOString().split('T')[0]}</p>
        </div>

        {/* Dynamic content printing tables */}
        {reportTab === 'academic' && (
          <div className="space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider">Academic GWA Evaluation Ledger ({selectedSubjectCode})</h3>
            <table className="w-full border-collapse border border-slate-350 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-left font-bold uppercase">
                  <th className="border border-slate-300 px-3 py-2">Student ID</th>
                  <th className="border border-slate-300 px-3 py-2">Student Name</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Quizzes</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Practicum</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Exams</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Attendance</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">GWA</th>
                </tr>
              </thead>
              <tbody>
                {studentsInSelectedSubject.map((student: any) => {
                  const subj = (student.enrolledSubjects || []).find((sub: any) => sub.code === selectedSubjectCode);
                  return (
                    <tr key={student.id}>
                      <td className="border border-slate-300 px-3 py-1.5 font-mono">{student.studentId}</td>
                      <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.name}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.quizzes !== undefined ? Number(subj.components.quizzes).toFixed(1) : '80.0'}%</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.practicum !== undefined ? Number(subj.components.practicum).toFixed(1) : '80.0'}%</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.exams !== undefined ? Number(subj.components.exams).toFixed(1) : '80.0'}%</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.attendance !== undefined ? Number(subj.components.attendance).toFixed(1) : '90.0'}%</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center font-extrabold">{subj && subj.grade !== undefined ? Number(subj.grade).toFixed(2) : '2.50'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {reportTab === 'retention' && (
          <div className="space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider">Retention watch ledger</h3>
            <table className="w-full border-collapse border border-slate-350 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-left font-bold uppercase">
                  <th className="border border-slate-300 px-3 py-2">Student ID</th>
                  <th className="border border-slate-300 px-3 py-2">Student Name</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">GWA</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">Standing Status</th>
                  <th className="border border-slate-300 px-3 py-2">Remedials Status</th>
                </tr>
              </thead>
              <tbody>
                {facultyStudents.map((student: any) => {
                  const warnings = (student.enrolledSubjects || []).filter((sub: any) => assignedSubjects.includes(sub.code) && sub.grade > 2.5);
                  const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;
                  return (
                    <tr key={student.id}>
                      <td className="border border-slate-300 px-3 py-1.5 font-mono">{student.studentId}</td>
                      <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.name}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{student.overallGWA.toFixed(2)}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center capitalize">{student.status}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-slate-500">
                        {remedialCount > 0 ? `Pending ${remedialCount} exam(s)` : 'Stable standing'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {reportTab === 'attendance' && (
          <div className="space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider">Attendance Register ledger</h3>
            <table className="w-full border-collapse border border-slate-350 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-left font-bold uppercase">
                  <th className="border border-slate-300 px-3 py-2">Date</th>
                  <th className="border border-slate-300 px-3 py-2">Student ID</th>
                  <th className="border border-slate-300 px-3 py-2">Name</th>
                  <th className="border border-slate-300 px-3 py-2">Subject</th>
                  <th className="border border-slate-300 px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords
                  .filter(r => assignedSubjects.includes(r.subjectCode))
                  .map(record => {
                    const s = students.find(x => x.id === record.studentId);
                    return (
                      <tr key={record.id}>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{record.date}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{s?.studentId}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-bold">{s?.name}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{record.subjectCode}</td>
                        <td className="border border-slate-300 px-3 py-1.5 capitalize">{record.status}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* seal signature */}
        <div className="flex justify-between items-end mt-12 pt-8 border-t border-dashed border-slate-300 text-xs">
          <div className="text-center w-40">
            <div className="h-0.5 w-full bg-slate-400 mb-1" />
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Registrar Seal</p>
          </div>
          
          <div className="text-center w-48">
            <p className="font-bold">{user?.display_name}</p>
            <div className="h-0.5 w-full bg-slate-400 mt-1 mb-1" />
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Academic Faculty Dean</p>
          </div>
        </div>

      </div>

    </div>
  );
};
