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
  FileText,
  AlertCircle
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
import { effectiveAssessmentPercentage, gwaToDescription } from '../../utils/gradeHelper';

import {
  getFacultyReportsSummaryApi,
  getFacultyClassesApi,
  getFacultyRetentionApi,
  getFacultyAttendanceWorksheetApi,
  type FacultyRetentionRecord,
  type FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const { assessments, assessmentScores } = useApp();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbStudents, setDbStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [retentionRecords, setRetentionRecords] = useState<FacultyRetentionRecord[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionLoadError, setRetentionLoadError] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<FacultyAttendanceWorksheetRosterItem[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<Array<Record<string, unknown>>>([]);
  const [selectedAttendanceSessionId, setSelectedAttendanceSessionId] = useState('');
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [analyticsAttendanceRecords, setAnalyticsAttendanceRecords] = useState<FacultyAttendanceWorksheetRosterItem[]>([]);
  const [analyticsAttendanceLoading, setAnalyticsAttendanceLoading] = useState(false);
  const [analyticsAttendanceError, setAnalyticsAttendanceError] = useState<string | null>(null);

  const fetchFacultyReports = () => {
    setLoading(true);
    setError('');
    setRetentionLoading(true);
    setRetentionLoadError(false);
    setRetentionRecords([]);
    Promise.all([
      getFacultyReportsSummaryApi(),
      getFacultyClassesApi().catch(() => ({ status: 'success', classes: [] })),
    ])
      .then(([repRes, clsRes]) => {
        if (repRes.reports?.students) {
          setDbStudents(repRes.reports.students);
        } else {
          setDbStudents([]);
        }
        if (clsRes?.classes) {
          setClasses(clsRes.classes);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to fetch report summary from server.');
        setDbStudents([]);
      })
      .finally(() => setLoading(false));

    getFacultyRetentionApi()
      .then(retentionRes => {
        setRetentionRecords(retentionRes.retention ?? []);
      })
      .catch(() => {
        setRetentionRecords([]);
        setRetentionLoadError(true);
      })
      .finally(() => {
        setRetentionLoading(false);
      });
  };

  useEffect(() => {
    fetchFacultyReports();
  }, []);

  const students = dbStudents;

  const retentionForStudentSubject = (student: any, subject: any, classId?: string) => {
    const resolvedClassId = classId ?? (subject?.classId ? String(subject.classId) : undefined);
    const matches = retentionRecords.filter(record =>
      String(record.studentId) === String(student.id)
      && record.subjectCode === subject.code
      && (!resolvedClassId || String(record.classId) === resolvedClassId)
    );
    return matches[0] ?? null;
  };

  const retentionIsAtRisk = (record: FacultyRetentionRecord | null) =>
    record !== null && ['warning', 'critical', 'remedial'].includes(record.state);

  const retentionUnavailable = retentionLoading || retentionLoadError;

  // Selected class block state
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const assignedClasses = useMemo(() => {
    const list = Array.from(new Set(classes.map(c => c.csId).filter((id): id is number => Number.isFinite(Number(id)) && Number(id) > 0)))
      .map(id => String(id));
    return list;
  }, [classes]);

  const assignedSubjects = useMemo(() => {
    const list = Array.from(new Set(classes
      .filter(c => !selectedClassId || String(c.csId) === selectedClassId)
      .map(c => c.courseCode)
      .filter(Boolean)));
    return list;
  }, [classes, selectedClassId]);

  const analyticsAssessmentDates = useMemo(() => Array.from(new Set(
    assessments
      .filter(assessment => assignedSubjects.includes(assessment.subjectCode)
        && assessment.status !== 'Archived'
        && String(assessment.classId) === selectedClassId
        && assessment.transmutationEnabled
        && assessment.attendanceSessionDate)
      .map(assessment => String(assessment.attendanceSessionDate))
  )), [assessments, assignedSubjects, selectedClassId]);
  useEffect(() => {
    if (assignedClasses.length > 0 && (!selectedClassId || !assignedClasses.includes(selectedClassId))) {
      setSelectedClassId(assignedClasses[0]);
    } else if (assignedClasses.length === 0) {
      setSelectedClassId('');
    }
  }, [assignedClasses, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find(c => String(c.csId) === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  // Report Category State: 'academic' | 'retention' | 'attendance' | 'analytics'
  const [reportTab, setReportTab] = useState<'academic' | 'retention' | 'attendance' | 'analytics'>('academic');
  const [attendanceDate, setAttendanceDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));

  useEffect(() => {
    setSelectedAttendanceSessionId('');
    setAttendanceSessions([]);
  }, [attendanceDate, selectedClassId]);

  useEffect(() => {
    if (reportTab !== 'attendance' || !selectedClass?.csId || !attendanceDate) {
      setAttendanceRecords([]);
      setAttendanceError(null);
      setAttendanceLoading(false);
      return;
    }
    let ignore = false;
    setAttendanceLoading(true);
    setAttendanceRecords([]);
    setAttendanceError(null);
    getFacultyAttendanceWorksheetApi({
      csId: Number(selectedClass.csId),
      date: attendanceDate,
      sessionId: selectedAttendanceSessionId ? Number(selectedAttendanceSessionId) : undefined,
    })
      .then(response => {
        if (ignore) return;
        const sessions = response.worksheet?.attendanceSessions ?? [];
        setAttendanceSessions(sessions);
        if (sessions.length > 1 && !selectedAttendanceSessionId) {
          const firstSessionId = sessions[0]?.sessionId;
          if (firstSessionId) {
            setSelectedAttendanceSessionId(String(firstSessionId));
            setAttendanceRecords([]);
            return;
          }
        }
        setAttendanceRecords(response.worksheet?.roster ?? []);
      })
      .catch(requestError => {
        if (!ignore) {
          setAttendanceRecords([]);
          setAttendanceError(requestError instanceof Error
            ? requestError.message
            : 'Authoritative attendance records are unavailable for this class and date.');
        }
      })
      .finally(() => {
        if (!ignore) setAttendanceLoading(false);
      });
    return () => { ignore = true; };
  }, [attendanceDate, reportTab, selectedClass, selectedAttendanceSessionId]);

  useEffect(() => {
    if (reportTab !== 'analytics' || !selectedClass?.csId || analyticsAssessmentDates.length === 0) {
      setAnalyticsAttendanceRecords([]);
      setAnalyticsAttendanceError(null);
      setAnalyticsAttendanceLoading(false);
      return;
    }
    let ignore = false;
    setAnalyticsAttendanceLoading(true);
    setAnalyticsAttendanceError(null);
    const loadAnalyticsAttendance = async () => {
      const records: FacultyAttendanceWorksheetRosterItem[] = [];
      for (const date of analyticsAssessmentDates) {
        const initial = await getFacultyAttendanceWorksheetApi({
          csId: Number(selectedClass.csId),
          date,
        });
        const sessions = initial.worksheet?.attendanceSessions ?? [];
        const sessionIds = sessions
          .map(session => Number(session.sessionId))
          .filter(sessionId => Number.isFinite(sessionId) && sessionId > 0);
        if (sessionIds.length === 0) {
          records.push(...(initial.worksheet?.roster ?? []));
          continue;
        }
        const sessionWorksheets = await Promise.all(sessionIds.map(sessionId =>
          getFacultyAttendanceWorksheetApi({
            csId: Number(selectedClass.csId),
            date,
            sessionId,
          })
        ));
        sessionWorksheets.forEach(response => records.push(...(response.worksheet?.roster ?? [])));
      }
      if (!ignore) {
        const uniqueRecords = Array.from(new Map(
          records.map(record => [`${record.enrollmentId}:${record.attendanceSessionId ?? record.sessionCode ?? record.date}`, record])
        ).values());
        setAnalyticsAttendanceRecords(uniqueRecords);
      }
    };
    loadAnalyticsAttendance()
      .catch(requestError => {
        if (!ignore) {
          setAnalyticsAttendanceRecords([]);
          setAnalyticsAttendanceError(requestError instanceof Error
            ? requestError.message
            : 'Authoritative attendance records are unavailable for analytics.');
        }
      })
      .finally(() => {
        if (!ignore) setAnalyticsAttendanceLoading(false);
      });
    return () => { ignore = true; };
  }, [analyticsAssessmentDates, reportTab, selectedClass]);

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
      (!selectedClassId || (s.enrolledSubjects || []).some((subject: any) => String(subject.classId ?? s.classId) === selectedClassId))
      &&
      (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.studentId.toLowerCase().includes(search.toLowerCase()))
    );
  }, [students, search, selectedClassId]);

  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('');
  useEffect(() => {
    if (assignedSubjects.length > 0 && (!selectedSubjectCode || !assignedSubjects.includes(selectedSubjectCode))) {
      setSelectedSubjectCode(assignedSubjects[0]);
    }
  }, [assignedSubjects, selectedSubjectCode]);

  // Filter roster by course tab selector
  const studentsInSelectedSubject = useMemo(() => {
    return facultyStudents.filter(s =>
      (s.enrolledSubjects || []).some((sub: any) =>
        sub.code === selectedSubjectCode
        && (!selectedClassId || String(sub.classId ?? s.classId) === selectedClassId)
      )
    );
  }, [facultyStudents, selectedSubjectCode, selectedClassId]);

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
        const subj = (student.enrolledSubjects || []).find((sub: any) =>
          sub.code === selectedSubjectCode
          && (!selectedClassId || String(sub.classId ?? student.classId) === selectedClassId)
        );
        const q = subj && subj.components?.quizzes !== undefined && subj.components.quizzes !== null ? Number(subj.components.quizzes).toFixed(1) : 'N/A';
        const e = subj && subj.components?.exams !== undefined && subj.components.exams !== null ? Number(subj.components.exams).toFixed(1) : 'N/A';
        const p = subj && subj.components?.practicum !== undefined && subj.components.practicum !== null ? Number(subj.components.practicum).toFixed(1) : 'N/A';
        const a = subj && subj.components?.attendance !== undefined && subj.components.attendance !== null ? Number(subj.components.attendance).toFixed(1) : 'N/A';
        const g = subj && subj.grade !== undefined && subj.grade !== null ? Number(subj.grade).toFixed(2) : 'N/A';
        const retention = subj ? retentionForStudentSubject(student, subj, selectedClassId) : null;
        const rem = subj && typeof subj.grade === 'number'
          ? (retentionUnavailable ? 'RETENTION STATE UNAVAILABLE' : retentionIsAtRisk(retention) ? 'REVIEW RETENTION STATE' : 'PASS')
          : 'PENDING';
        return [student.studentId, student.name, selectedSubjectCode, q, e, p, a, g, rem].map(csvCell).join(',');
      }).join('\n');
      fileName = `${selectedSubjectCode || 'Course'}_Academic_Report.csv`;
    } else if (type === 'retention') {
      headers = 'Student ID,Name,Standing GWA,Warning Count,Risk Level,Remedial Status\n';
      rows = facultyStudents.map((student: any) => {
        const warningCount = retentionUnavailable ? null : (student.enrolledSubjects || []).filter((sub: any) =>
          assignedSubjects.includes(sub.code)
          && retentionIsAtRisk(retentionForStudentSubject(student, sub))
        ).length;
        const riskLevel = retentionUnavailable ? 'UNAVAILABLE' : warningCount && warningCount > 0 ? 'HIGH' : 'LOW';
        const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;
        const remStatus = remedialCount > 0 ? 'PENDING EXAM' : 'STABLE';
        const standingGwa = typeof student.overallGWA === 'number' ? student.overallGWA.toFixed(2) : (student.overallGWA ? String(student.overallGWA) : 'N/A');
        return [student.studentId, student.name, standingGwa, warningCount ?? 'UNAVAILABLE', riskLevel, remStatus].map(csvCell).join(',');
      }).join('\n');
      fileName = `Retention_Report.csv`;
    } else {
      headers = 'Date,Student ID,Name,Subject Code,Status\n';
      rows = attendanceRecords
        .map(record => [
          record.date,
          record.studentNumber || '',
          record.studentName || '',
          selectedClass?.courseCode || '',
          String(record.status || 'not recorded').toUpperCase(),
        ].map(csvCell).join(','))
        .join('\n');
      fileName = `Attendance_${selectedClass?.courseCode || 'Class'}_${attendanceDate}.csv`;
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
      { name: '1.0–1.5', count: 0 },
      { name: '1.51–2.0', count: 0 },
      { name: '2.01–3.0', count: 0 },
      { name: '3.0+', count: 0 },
    ];
    facultyStudents.forEach((s: any) => {
      const selectedSubjects = (s.enrolledSubjects || []).filter((subject: any) =>
        !selectedClassId || String(subject.classId ?? s.classId) === selectedClassId
      );
      const gradedSubjects = selectedSubjects.filter((subject: any) =>
        subject.grade !== null
        && subject.grade !== undefined
        && subject.grade !== ''
        && Number.isFinite(Number(subject.grade))
      );
      const totalUnits = gradedSubjects.reduce((sum: number, subject: any) => sum + (Number(subject.units) || 0), 0);
      const gwa = totalUnits > 0
        ? gradedSubjects.reduce((sum: number, subject: any) => sum + Number(subject.grade) * (Number(subject.units) || 0), 0) / totalUnits
        : null;
      if (gwa === null || isNaN(gwa)) return;
      if (gwa <= 1.5) buckets[0].count++;
      else if (gwa <= 2.0) buckets[1].count++;
      else if (gwa <= 3.0) buckets[2].count++;
      else buckets[3].count++;
    });
    return buckets;
  }, [facultyStudents, selectedClassId]);

  // Recharts Stats: Retention Distribution
  const pieData = useMemo(() => {
    const counts: Record<string, number> = { active: 0, warning: 0, critical: 0, remedial: 0 };
    const rank: Record<string, number> = { active: 0, warning: 1, critical: 2, remedial: 3 };
    const studentStates = new Map<string, string>();
    retentionRecords
      .filter(record => !selectedClassId || String(record.classId) === selectedClassId)
      .forEach(record => {
        const status = record.state === 'archived' ? 'active' : record.state;
        const current = studentStates.get(String(record.studentId));
        if (!current || rank[status] > rank[current]) studentStates.set(String(record.studentId), status);
      });
    studentStates.forEach(statusKey => {
      counts[statusKey] = (counts[statusKey] || 0) + 1;
    });
    return [
      { name: 'Active Standing', value: counts.active || 0, color: '#10B981' },
      { name: 'Warning Status', value: counts.warning || 0, color: '#F59E0B' },
      { name: 'Critical Watch', value: counts.critical || 0, color: '#EF4444' },
      { name: 'Remedial Programs', value: counts.remedial || 0, color: '#8B5CF6' },
    ].filter(item => item.value > 0);
  }, [retentionRecords, selectedClassId]);

  // Recharts Stats: Assessment Success Rates
  const assessmentStatsData = useMemo(() => {
    if (analyticsAttendanceLoading) return [];
    const activeAss = assessments.filter(a =>
      assignedSubjects.includes(a.subjectCode)
      && a.status !== 'Archived'
      && (!selectedClassId || String(a.classId) === selectedClassId)
    );
    return activeAss.flatMap(ass => {
      const scores = assessmentScores.filter(s => s.assessmentId === ass.id);
      if (scores.length === 0) return [];
      const effectiveValues = scores
        .map(score => {
          const attendance = ass.transmutationEnabled
            ? analyticsAttendanceRecords.find(record => record.studentId === score.studentId
              && record.date === ass.attendanceSessionDate
              && record.sessionCode === ass.attendanceSessionCode)
            : undefined;
          return effectiveAssessmentPercentage(score.score, ass.maxScore, ass, attendance?.status);
        })
        .filter((value): value is number => value !== null);
      if (effectiveValues.length === 0) return [];
      const avgPct = Math.round(effectiveValues.reduce((acc, value) => acc + value, 0) / effectiveValues.length);
      return [{
        name: ass.title.length > 15 ? ass.title.substring(0, 15) + '...' : ass.title,
        average: avgPct
      }];
    }).slice(0, 5);
  }, [analyticsAttendanceLoading, analyticsAttendanceRecords, assessments, assessmentScores, assignedSubjects, selectedClassId]);

  return (
    <div className="space-y-6">
      
      {/* Page Header - Hidden during print */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print border-b border-slate-205 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Generate GWA evaluation logs, print transcript records, and review analytics dashboards</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Class / Block Switcher */}
          {assignedClasses.length > 1 && (
            <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl gap-1">
              {assignedClasses.map((clsId: string) => {
                const section = classes.find(item => String(item.csId) === clsId);
                const label = section?.block || section?.csName || section?.courseCode || clsId;
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
                  const subj = student.enrolledSubjects
                    ? student.enrolledSubjects.find((sub: any) =>
                      sub.code === selectedSubjectCode
                      && (!selectedClassId || String(sub.classId ?? student.classId) === selectedClassId)
                    )
                    : null;
                  const isFailsRetention = Boolean(subj && retentionIsAtRisk(retentionForStudentSubject(student, subj, selectedClassId)));
                  const retentionUnavailableForSubject = retentionUnavailable && Boolean(subj);
                  const isFailed = subj && subj.grade === 5.0;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-205">{student.name}</div>
                        <span className="text-[10px] text-slate-400 font-mono">{student.studentId}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.quizzes !== undefined && subj.components.quizzes !== null ? `${Number(subj.components.quizzes).toFixed(1)}%` : '—'}</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.practicum !== undefined && subj.components.practicum !== null ? `${Number(subj.components.practicum).toFixed(1)}%` : '—'}</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.exams !== undefined && subj.components.exams !== null ? `${Number(subj.components.exams).toFixed(1)}%` : '—'}</td>
                      <td className="px-5 py-3.5 text-center font-mono">{subj && subj.components?.attendance !== undefined && subj.components.attendance !== null ? `${Number(subj.components.attendance).toFixed(1)}%` : '—'}</td>
                      <td className="px-5 py-3.5 text-center font-extrabold text-sm text-slate-850 dark:text-slate-100">
                        {subj && subj.grade !== undefined && subj.grade !== null ? Number(subj.grade).toFixed(2) : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          isFailed
                            ? 'bg-rose-100 text-rose-700' 
                            : retentionUnavailableForSubject
                            ? 'bg-slate-100 text-slate-600'
                            : isFailsRetention 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isFailed ? 'FAILED' : retentionUnavailableForSubject ? 'RETENTION UNAVAILABLE' : isFailsRetention ? 'FAILS RETENTION' : 'PASS'}
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
                  const warnings = retentionUnavailable ? [] : (student.enrolledSubjects || []).filter((sub: any) =>
                    assignedSubjects.includes(sub.code)
                    && retentionIsAtRisk(retentionForStudentSubject(student, sub))
                  );
                  const isAtRisk = !retentionUnavailable && warnings.length > 0;
                  const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-205">{student.name}</div>
                        <span className="text-[10px] text-slate-404">{student.studentId} • Year {student.yearLevel}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-slate-800 dark:text-slate-100">
                        {typeof student.overallGWA === 'number' ? student.overallGWA.toFixed(2) : (student.overallGWA ? String(student.overallGWA) : '—')}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-rose-500">{retentionUnavailable ? 'Unavailable' : `${warnings.length} Warnings`}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          retentionUnavailable ? 'bg-slate-100 text-slate-600' : isAtRisk ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {retentionUnavailable ? 'UNAVAILABLE' : isAtRisk ? 'HIGH RISK' : 'LOW RISK'}
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
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">Authoritative Attendance Register</h3>
              <p className="text-[11px] text-slate-400 mt-1">{selectedClass?.courseCode || 'Class unavailable'} · {attendanceDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={attendanceDate}
                onChange={event => setAttendanceDate(event.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
              />
              {attendanceSessions.length > 1 && (
                <select
                  aria-label="Attendance session"
                  value={selectedAttendanceSessionId}
                  onChange={event => setSelectedAttendanceSessionId(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  {attendanceSessions.map(session => {
                    const sessionId = String(session.sessionId ?? '');
                    const sessionCode = String(session.sessionCode ?? `Session ${sessionId}`);
                    return <option key={sessionId} value={sessionId}>{sessionCode}</option>;
                  })}
                </select>
              )}
              <button
                onClick={() => handleExportCSV('attendance')}
                disabled={attendanceRecords.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {attendanceError && (
              <div className="m-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{attendanceError}</span>
              </div>
            )}
            {attendanceLoading && <p className="p-6 text-center text-xs text-slate-400">Loading persisted attendance records…</p>}
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
                {!attendanceLoading && attendanceRecords.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-xs text-slate-400">No persisted attendance records for this class and date.</td></tr>
                ) : attendanceRecords.map(record => {
                    return (
                      <tr key={record.enrollmentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3 font-mono">{record.date}</td>
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-202">{record.studentName || 'Student name unavailable'}</div>
                          <span className="text-[10px] text-slate-400 font-mono">{record.studentNumber || 'Student number unavailable'}</span>
                        </td>
                        <td className="px-5 py-3 font-bold font-mono text-clinical-650">{selectedClass?.courseCode || 'Course unavailable'}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${
                            record.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                            record.status === 'late' ? 'bg-amber-100 text-amber-700' :
                            record.status === 'excused' ? 'bg-sky-100 text-sky-700' :
                            record.status === null ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {record.status || 'Not recorded'}
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
              {retentionUnavailable ? (
                <p className="text-xs text-slate-400 font-semibold">
                  {retentionLoading ? 'Loading authoritative retention data…' : 'Retention distribution unavailable.'}
                </p>
              ) : pieData.length === 0 ? (
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
              {analyticsAttendanceLoading ? (
                <div className="py-12 text-center text-slate-405 text-xs">Loading authoritative attendance records…</div>
              ) : analyticsAttendanceError ? (
                <div className="py-12 text-center text-slate-405 text-xs">Assessment attendance data is unavailable.</div>
              ) : assessmentStatsData.length === 0 ? (
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
          <p className="text-[10px] text-slate-400">Class: {classes.filter(cls => assignedClasses.includes(String(cls.csId))).map(cls => cls.block || cls.csName || cls.courseCode).join(', ') || 'unavailable'} • Date: {new Date().toISOString().split('T')[0]}</p>
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
                  const subj = (student.enrolledSubjects || []).find((sub: any) =>
                    sub.code === selectedSubjectCode
                    && (!selectedClassId || String(sub.classId ?? student.classId) === selectedClassId)
                  );
                  return (
                    <tr key={student.id}>
                      <td className="border border-slate-300 px-3 py-1.5 font-mono">{student.studentId}</td>
                      <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.name}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.quizzes !== undefined && subj.components.quizzes !== null ? `${Number(subj.components.quizzes).toFixed(1)}%` : '—'}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.practicum !== undefined && subj.components.practicum !== null ? `${Number(subj.components.practicum).toFixed(1)}%` : '—'}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.exams !== undefined && subj.components.exams !== null ? `${Number(subj.components.exams).toFixed(1)}%` : '—'}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{subj && subj.components?.attendance !== undefined && subj.components.attendance !== null ? `${Number(subj.components.attendance).toFixed(1)}%` : '—'}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center font-extrabold">{subj && subj.grade !== undefined && subj.grade !== null ? Number(subj.grade).toFixed(2) : '—'}</td>
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
                  const warnings = retentionUnavailable ? [] : (student.enrolledSubjects || []).filter((sub: any) =>
                    assignedSubjects.includes(sub.code)
                    && retentionIsAtRisk(retentionForStudentSubject(student, sub))
                  );
                  const remedialCount = Array.isArray(student.remedialExams) ? student.remedialExams.filter((rem: any) => rem.status === 'pending').length : 0;
                  return (
                    <tr key={student.id}>
                      <td className="border border-slate-300 px-3 py-1.5 font-mono">{student.studentId}</td>
                      <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.name}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center">{typeof student.overallGWA === 'number' ? student.overallGWA.toFixed(2) : (student.overallGWA ? String(student.overallGWA) : '—')}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-center capitalize">{retentionUnavailable ? 'Unavailable' : student.status}</td>
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
            <h3 className="font-bold text-xs uppercase tracking-wider">Attendance Register ledger ({attendanceDate})</h3>
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
                {attendanceRecords.map(record => {
                    return (
                      <tr key={record.enrollmentId}>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{record.date}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{record.studentNumber || '—'}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-bold">{record.studentName || 'Student name unavailable'}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-mono">{selectedClass?.courseCode || '—'}</td>
                        <td className="border border-slate-300 px-3 py-1.5 capitalize">{record.status || 'Not recorded'}</td>
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
