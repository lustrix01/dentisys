import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  User, 
  GraduationCap, 
  AlertTriangle, 
  CalendarDays,
  FileCheck,
  CheckCircle,
  BookOpen,
  Sparkles,
  Clock,
  TrendingUp,
  Layers,
  FileText,
  AlertCircle,
  Filter
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
import { flushSync } from 'react-dom';
import { PrintStyle, PrintHeader, PrintCaption, PrintLegend, PrintSignatures, formatPrintedAt, printCellClass } from '../../components/PrintSheet';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, AttendanceRecord, Assessment, AssessmentScore } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { effectiveAssessmentPercentage, formatGrade, gwaToDescription, percentageToGWA } from '../../utils/gradeHelper';
import { extractPeriodEvaluation, type PeriodComponentEvaluation } from '../../utils/periodGradingHelper';

import {
  getFacultyReportsSummaryApi,
  getFacultyClassesApi,
  getFacultyGradingConfigApi,
  getFacultyRetentionApi,
  getFacultyAttendanceWorksheetApi,
  type FacultyGradingConfiguration,
  type FacultyRetentionRecord,
  type FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';
import GradeValue from '../../components/GradeValue';
import { downloadXlsx, type Cell as XlsxCell, type CellObject, type XlsxSheet } from '../../utils/xlsxDownload';
import { showFeedback } from '../../components/FeedbackCenter';
import { buildReportSheet, dayToDate, termLine } from '../../utils/reportWorkbook';

type ReportsBundleSnapshot = {
  retention: FacultyRetentionRecord[];
  attendance: FacultyAttendanceWorksheetRosterItem[];
  analyticsAttendance: FacultyAttendanceWorksheetRosterItem[];
};

type ReportAnalyticsRow = { dataset: string; metric: string; value: number; unit: string };

async function buildAnalyticsChartImage(rows: ReportAnalyticsRow[]): Promise<{ blob: Blob; height: number }> {
  const canvas = document.createElement('canvas');
  const width = 1200;
  const rowHeight = 34;
  const groups = [
    { title: 'Retention standing', rows: rows.filter(row => row.dataset === 'Retention Watch Standings'), color: '#15803d' },
    { title: 'Grade distribution', rows: rows.filter(row => row.dataset === 'Grade Distribution'), color: '#2563eb' },
    { title: 'Assessment averages', rows: rows.filter(row => row.dataset === 'Assessment Average Success Rates'), color: '#0d9488' },
  ];
  const height = groups.reduce((total, group) => total + 72 + Math.max(group.rows.length, 1) * rowHeight + 28, 30);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare the analytics charts.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  let y = 28;
  for (const group of groups) {
    context.fillStyle = '#172033';
    context.font = 'bold 26px Arial';
    context.fillText(group.title, 24, y + 28);
    y += 52;
    const max = Math.max(...group.rows.map(row => row.value), group.rows[0]?.unit === '%' ? 100 : 1);
    for (const row of group.rows) {
      context.fillStyle = '#334155';
      context.font = '19px Arial';
      context.fillText(row.metric, 30, y + 22, 330);
      const barX = 380;
      const barWidth = 650;
      context.fillStyle = '#e2e8f0';
      context.fillRect(barX, y + 4, barWidth, 18);
      context.fillStyle = group.color;
      context.fillRect(barX, y + 4, Math.max(0, Math.min(1, row.value / max)) * barWidth, 18);
      context.fillStyle = '#172033';
      context.font = 'bold 18px Arial';
      context.fillText(`${row.value}${row.unit === '%' ? '%' : ` ${row.unit}`}`, 1050, y + 21);
      y += rowHeight;
    }
    y += 28;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to render the analytics charts.')), 'image/png'));
  return { blob, height };
}

async function loadReportAttendance(csId: number, date: string, selectedSessionId: string) {
  const initial = await getFacultyAttendanceWorksheetApi({
    csId,
    date,
    sessionId: selectedSessionId ? Number(selectedSessionId) : undefined,
  });
  const sessions = initial.worksheet?.attendanceSessions ?? [];
  const fallbackSessionId = !selectedSessionId && sessions.length > 1
    ? String(sessions[0]?.sessionId ?? '')
    : '';
  if (fallbackSessionId) {
    const selected = await getFacultyAttendanceWorksheetApi({ csId, date, sessionId: Number(fallbackSessionId) });
    return { sessions, records: selected.worksheet?.roster ?? [], selectedSessionId: fallbackSessionId };
  }
  return { sessions, records: initial.worksheet?.roster ?? [], selectedSessionId };
}

async function loadReportAnalyticsAttendance(csId: number, dates: string[]) {
  const records: FacultyAttendanceWorksheetRosterItem[] = [];
  for (const date of dates) {
    const initial = await getFacultyAttendanceWorksheetApi({ csId, date });
    const sessionIds = (initial.worksheet?.attendanceSessions ?? [])
      .map(session => Number(session.sessionId))
      .filter(sessionId => Number.isFinite(sessionId) && sessionId > 0);
    if (sessionIds.length === 0) {
      records.push(...(initial.worksheet?.roster ?? []));
      continue;
    }
    const sessions = await Promise.all(sessionIds.map(sessionId => getFacultyAttendanceWorksheetApi({ csId, date, sessionId })));
    sessions.forEach(response => records.push(...(response.worksheet?.roster ?? [])));
  }
  return Array.from(new Map(
    records.map(record => [`${record.enrollmentId}:${record.attendanceSessionId ?? record.sessionCode ?? record.date}`, record]),
  ).values());
}

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const { assessments, assessmentScores } = useApp();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbStudents, setDbStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedGradingConfiguration, setSelectedGradingConfiguration] = useState<FacultyGradingConfiguration | null>(null);
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

  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('all');
  const [currentSchoolYear, setCurrentSchoolYear] = useState<string>('');
  const syInitializedRef = useRef(false);

  const fetchFacultyReports = () => {
    setLoading(true);
    setError('');
    setRetentionLoading(true);
    setRetentionLoadError(false);
    setRetentionRecords([]);
    Promise.all([
      getFacultyReportsSummaryApi(),
      getFacultyClassesApi().catch(() => ({ status: 'success', currentSchoolYear: '', classes: [] })),
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
        const curSy = clsRes?.currentSchoolYear || repRes.currentSchoolYear || repRes.reports?.currentSchoolYear || '';
        if (curSy) {
          setCurrentSchoolYear(curSy);
          if (!syInitializedRef.current) {
            setSelectedSchoolYear(curSy);
            syInitializedRef.current = true;
          }
        } else if (!syInitializedRef.current && clsRes?.classes && clsRes.classes.length > 0) {
          const syOptions = Array.from(new Set(clsRes.classes.map((c: any) => c.schoolYear).filter(Boolean))).sort().reverse();
          if (syOptions.length > 0) {
            setSelectedSchoolYear(syOptions[0] as string);
            syInitializedRef.current = true;
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to fetch report summary from server.');
        setDbStudents([]);
        setClasses([]);
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

  // Strictly authoritative students assigned to this faculty member only
  const students = dbStudents;

  const retentionForStudentSubject = (student: any, subject: any, classId?: string) => {
    const resolvedClassId = classId ?? (subject?.classId ? String(subject.classId) : undefined);
    const matches = retentionRecords.filter(record =>
      String(record.studentId) === String(student.id)
      && record.subjectCode === subject.code
      && (!resolvedClassId || String(record.classId) === resolvedClassId)
      && (selectedSchoolYear === 'all' || !record.schoolYear || record.schoolYear === selectedSchoolYear)
    );
    return matches[0] ?? null;
  };

  const retentionIsAtRisk = (record: FacultyRetentionRecord | null) =>
    record !== null && record.state === 'remedial';

  const retentionUnavailable = retentionLoading || retentionLoadError;

  // Available School Years derived from classes, students, and current active year
  const availableSchoolYears = useMemo(() => {
    const years = new Set<string>();
    if (currentSchoolYear) years.add(currentSchoolYear);
    classes.forEach(c => {
      if (c.schoolYear) years.add(c.schoolYear);
    });
    students.forEach(s => {
      if (s.schoolYear) years.add(s.schoolYear);
      (s.enrolledSubjects || []).forEach((sub: any) => {
        if (sub.schoolYear) years.add(sub.schoolYear);
      });
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [classes, students, currentSchoolYear]);

  // Classes filtered by selected school year (strictly assigned to logged-in faculty)
  const classesForSchoolYear = useMemo(() => {
    if (selectedSchoolYear === 'all') return classes;
    return classes.filter(c => c.schoolYear === selectedSchoolYear);
  }, [classes, selectedSchoolYear]);

  // Active courses derived from classes for selected school year
  const activeCourses = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const c of classesForSchoolYear) {
      if (c.courseCode && !map.has(c.courseCode)) {
        map.set(c.courseCode, {
          code: c.courseCode,
          name: c.courseName || c.courseCode,
        });
      }
    }
    return Array.from(map.values());
  }, [classesForSchoolYear]);

  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    if (classesForSchoolYear.length > 0 && !classesForSchoolYear.some(c => String(c.csId || c.id) === selectedClassId)) {
      const first = classesForSchoolYear[0];
      setSelectedClassId(String(first.csId || first.id));
      if (first.courseCode) {
        setSelectedSubjectCode(first.courseCode);
      }
    } else if (classesForSchoolYear.length === 0) {
      setSelectedClassId('');
      setSelectedSubjectCode('');
    }
  }, [classesForSchoolYear, selectedClassId]);

  useEffect(() => {
    if (selectedClassId) {
      const match = classesForSchoolYear.find(c => String(c.csId || c.id) === selectedClassId);
      if (match?.courseCode && match.courseCode !== selectedSubjectCode) {
        setSelectedSubjectCode(match.courseCode);
      }
    }
  }, [selectedClassId, classesForSchoolYear, selectedSubjectCode]);

  // Available classes for selected course within selected school year
  const availableClasses = useMemo(() => {
    return classesForSchoolYear.filter(c => c.courseCode === selectedSubjectCode);
  }, [classesForSchoolYear, selectedSubjectCode]);

  const selectedClass = useMemo(
    () => classesForSchoolYear.find(c => String(c.csId || c.id) === selectedClassId) ?? null,
    [classesForSchoolYear, selectedClassId],
  );

  useEffect(() => {
    if (!selectedClass?.courseId || !selectedClass.semester || !selectedClass.schoolYear) {
      setSelectedGradingConfiguration(null);
      return;
    }

    let ignore = false;
    setSelectedGradingConfiguration(null);
    getFacultyGradingConfigApi({
      courseId: selectedClass.courseId,
      semester: String(selectedClass.semester),
      schoolYear: String(selectedClass.schoolYear),
    })
      .then(response => {
        if (!ignore) setSelectedGradingConfiguration(response.configuration);
      })
      .catch(() => {
        if (!ignore) setSelectedGradingConfiguration(null);
      });
    return () => { ignore = true; };
  }, [selectedClass?.courseId, selectedClass?.semester, selectedClass?.schoolYear]);

  const assignedClasses = useMemo(() => {
    return availableClasses.map(c => String(c.csId || c.id));
  }, [availableClasses]);

  const assignedSubjects = useMemo(() => {
    return activeCourses.map(c => c.code);
  }, [activeCourses]);

  const analyticsAssessmentDates = useMemo(() => Array.from(new Set(
    assessments
      .filter(assessment => assignedSubjects.includes(assessment.subjectCode)
        && assessment.status !== 'Archived'
        && String(assessment.classId) === selectedClassId
        && assessment.transmutationEnabled
        && assessment.attendanceSessionDate)
      .map(assessment => String(assessment.attendanceSessionDate))
  )), [assessments, assignedSubjects, selectedClassId]);

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
    loadReportAnalyticsAttendance(Number(selectedClass.csId), analyticsAssessmentDates)
      .then(records => { if (!ignore) setAnalyticsAttendanceRecords(records); })
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

  // The selected course's enrollment for a student (course + section filter).
  const subjectForSelection = (student: any) => (student.enrolledSubjects || []).find((sub: any) =>
    sub.code === selectedSubjectCode
    && (!selectedClassId || String(sub.classId ?? student.classId) === selectedClassId)
  ) ?? null;

  // Midterm %, Final % and the course grade come from the server breakdown.
  // A course without a complete grade is Pending, never PASS.
  const formatPercent = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
  const courseEvaluation = (subj: any) => extractPeriodEvaluation(
    subj ?? null,
    null,
    selectedGradingConfiguration?.schemaMode ?? null,
  );
  const formatCourseGrade = (evaluation: ReturnType<typeof courseEvaluation>) =>
    evaluation.overallGwa !== null
      ? formatGrade(evaluation.overallGwa)
      : evaluation.historicalGwa !== null
        ? `Prior: ${formatGrade(evaluation.historicalGwa)} (Historical)`
        : 'Pending';
  const formatComponentResult = (
    component: PeriodComponentEvaluation | undefined,
    periodStatus: ReturnType<typeof courseEvaluation>['midtermStatus'],
  ): string => {
    if (component?.percentage !== null && component?.percentage !== undefined) {
      return formatPercent(component.percentage);
    }
    if (periodStatus === 'pending' || component?.status === 'pending') return 'Pending';
    if (component) return component.reasons.length > 0 ? `Incomplete (${component.reasons[0]})` : 'Incomplete';
    return 'Unavailable (recompute required)';
  };
  const courseRemark = (student: any, subj: any): string => {
    const grade = subj ? courseEvaluation(subj).overallGwa : null;
    if (grade === null) return 'PENDING';
    if (grade === 5.0) return 'FAILED';
    if (retentionUnavailable) return 'RETENTION UNAVAILABLE';
    return retentionIsAtRisk(retentionForStudentSubject(student, subj, selectedClassId)) ? 'REVIEW RETENTION' : 'PASS';
  };

  // Multi-course standing GWA, scoped to the selected school year.
  const standingGwa = (student: any): number | null => {
    if (selectedSchoolYear !== 'all') {
      const value = student.gwaBySchoolYear?.[selectedSchoolYear];
      return typeof value === 'number' ? value : null;
    }
    return typeof student.overallGWA === 'number' ? student.overallGWA : null;
  };

  // Remedial status from the server's attempt progression (enrollment_remedial_attempts).
  const remedialStatusFor = (student: any): string => {
    if (retentionUnavailable) return 'Unavailable';
    const stages = retentionRecords
      .filter(record => String(record.studentId) === String(student.id)
        && (!selectedClassId || String(record.classId) === selectedClassId)
        && (selectedSchoolYear === 'all' || !record.schoolYear || record.schoolYear === selectedSchoolYear))
      .map(record => record.remedialProgression?.stage ?? 'none');
    if (stages.some(stage => stage === 'attempt_1_pending' || stage === 'attempt_2_pending')) return 'Remedial exam scheduled';
    if (stages.includes('attempt_2_available')) return 'Second attempt available';
    if (stages.includes('cost_recovery_required')) return 'Cost recovery required';
    if (stages.includes('cost_recovery_failed')) return 'Cost recovery failed';
    if (stages.some(stage => stage === 'passed' || stage === 'cost_recovery_passed')) return 'Cleared';
    return 'No remedial';
  };

  // Search & Pagination states
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClassId, reportTab, search]);

  // Filter students based on selected school year, class, and search
  const facultyStudents = useMemo(() => {
    return students.filter(s => {
      const inSchoolYear = selectedSchoolYear === 'all'
        || s.schoolYear === selectedSchoolYear
        || (s.enrolledSubjects || []).some((sub: any) => !sub.schoolYear || sub.schoolYear === selectedSchoolYear);
      const inClass = !selectedClassId
        || String(s.classId) === selectedClassId
        || (s.enrolledSubjects || []).some((sub: any) => String(sub.classId) === selectedClassId);
      const matchesSearch = !search
        || s.name.toLowerCase().includes(search.toLowerCase())
        || (s.studentId && s.studentId.toLowerCase().includes(search.toLowerCase()));
      return inSchoolYear && inClass && matchesSearch;
    });
  }, [students, search, selectedClassId, selectedSchoolYear]);

  // Filter roster by course selector
  const studentsInSelectedSubject = useMemo(() => {
    return facultyStudents.filter(s => {
      const hasSubject = (s.enrolledSubjects || []).some((sub: any) =>
        sub.code === selectedSubjectCode
        && (!selectedClassId || String(sub.classId ?? s.classId) === selectedClassId)
        && (selectedSchoolYear === 'all' || !sub.schoolYear || sub.schoolYear === selectedSchoolYear)
      );
      const enrolledInSelectedClass = selectedClass && (!selectedClassId || String(s.classId) === selectedClassId);
      return hasSubject || enrolledInSelectedClass;
    });
  }, [facultyStudents, selectedSubjectCode, selectedClassId, selectedClass, selectedSchoolYear]);

  const isLectureLaboratoryMode = useMemo(() =>
    selectedGradingConfiguration?.componentMode === 'lecture_laboratory'
      || studentsInSelectedSubject.some(student => {
        const evaluation = courseEvaluation(subjectForSelection(student));
        return Boolean(evaluation.midtermComponents || evaluation.finalComponents);
      }),
  [selectedGradingConfiguration?.componentMode, studentsInSelectedSubject, selectedClassId, selectedSubjectCode]);

  const paginatedStudentsInSubject = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return studentsInSelectedSubject.slice(start, start + pageSize);
  }, [studentsInSelectedSubject, currentPage, pageSize]);

  const totalPagesInSubject = Math.ceil(studentsInSelectedSubject.length / pageSize) || 1;

  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  const [reportsBundlePrint, setReportsBundlePrint] = useState<ReportsBundleSnapshot | null>(null);
  const [isPreparingBundlePrint, setIsPreparingBundlePrint] = useState(false);
  const handlePrint = () => {
    flushSync(() => setPrintedAt(new Date()));
    window.print();
  };

  // Academic exports the five-sheet Reports bundle; Retention and Attendance keep their focused .xlsx exports.
  const [isExportingAcademic, setIsExportingAcademic] = useState(false);
  const handleExportExcel = async (type: 'academic' | 'retention' | 'attendance') => {
    if (type === 'academic') {
      setIsExportingAcademic(true);
      try {
        await handleExportReportsBundle();
      } catch (err) {
        showFeedback(err instanceof Error ? err.message : 'Unable to export the reports workbook.', 'error');
      } finally {
        setIsExportingAcademic(false);
      }
      return;
    }
    const by = user?.display_name ?? '';
    const term = selectedClass?.semester && selectedClass.schoolYear ? termLine(String(selectedClass.semester), String(selectedClass.schoolYear)) : '';
    if (type === 'retention') {
      const rows = facultyStudents.map((student: any) => {
        const atRiskCourses = retentionUnavailable ? null : (student.enrolledSubjects || []).filter((sub: any) =>
          assignedSubjects.includes(sub.code)
          && retentionIsAtRisk(retentionForStudentSubject(student, sub))
        ).length;
        const riskLevel = retentionUnavailable ? 'UNAVAILABLE' : atRiskCourses && atRiskCourses > 0 ? 'At Risk' : '';
        const gwa = standingGwa(student);
        return [student.studentId, student.name, gwa !== null ? gwa : 'N/A', atRiskCourses ?? 'UNAVAILABLE', riskLevel, remedialStatusFor(student)];
      });
      await downloadXlsx('Retention_Report.xlsx', [buildReportSheet({
        sheet: 'Retention', title: 'RETENTION REPORT', filter: 'All assigned classes', term: selectedSchoolYear === 'all' ? 'All school years' : `AY ${selectedSchoolYear}`, by,
        columns: [{ header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Standing Grade', width: 15, format: '0.00' },
          { header: 'At-Risk Courses', width: 16 }, { header: 'Risk Level', width: 14 }, { header: 'Remedial Status', width: 20 }],
        rows,
      })]);
      return;
    }
    const rows = attendanceRecords.map(record => [
      dayToDate(String(record.date)) ?? record.date,
      record.studentNumber || '',
      record.studentName || '',
      selectedClass?.courseCode || '',
      String(record.status || 'not recorded').toUpperCase(),
    ]);
    await downloadXlsx(`Attendance_${selectedClass?.courseCode || 'Class'}_${attendanceDate}.xlsx`, [buildReportSheet({
      sheet: 'Attendance', title: 'ATTENDANCE REPORT', filter: selectedClass ? `${selectedClass.courseCode} · ${selectedClass.csName}` : '', term: `${term}${term ? ' · ' : ''}Session ${attendanceDate}`, by,
      columns: [{ header: 'Date', width: 14 }, { header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Course Code', width: 14 }, { header: 'Status', width: 14 }],
      rows,
    })]);
  };

  // Recharts Stats: course grade distribution for the selected course and
  // section. A grade of 2.50 or worse triggers remedial (UI-003).
  const gradeHistogramData = (() => {
    const buckets = [
      { name: '1.0–1.5', count: 0 },
      { name: '1.6–2.4', count: 0 },
      { name: '2.5–3.0', count: 0 },
      { name: 'Above 3.0', count: 0 },
      { name: 'Pending', count: 0 },
    ];
    studentsInSelectedSubject.forEach((student: any) => {
      const grade = courseEvaluation(subjectForSelection(student)).overallGwa;
      if (grade === null) buckets[4].count++;
      else if (grade <= 1.5) buckets[0].count++;
      else if (grade < 2.5) buckets[1].count++;
      else if (grade <= 3.0) buckets[2].count++;
      else buckets[3].count++;
    });
    return buckets;
  })();

  // Recharts Stats: Retention Distribution
  const pieData = useMemo(() => {
    const counts: Record<string, number> = { active: 0, cleared: 0, remedial: 0 };
    const rank: Record<string, number> = { active: 0, cleared: 1, remedial: 2 };
    const studentStates = new Map<string, string>();
    retentionRecords
      .filter(record => (!selectedClassId || String(record.classId) === selectedClassId)
        && (selectedSchoolYear === 'all' || !record.schoolYear || record.schoolYear === selectedSchoolYear))
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
      { name: 'Cleared (Remedial Passed)', value: counts.cleared || 0, color: '#14B8A6' },
      { name: 'Remedial Programs', value: counts.remedial || 0, color: '#8B5CF6' },
    ].filter(item => item.value > 0);
  }, [retentionRecords, selectedClassId, selectedSchoolYear]);

  // Recharts Stats: Assessment Success Rates. Also used by the five-sheet export.
  const buildAssessmentStatsData = (attendanceRows: FacultyAttendanceWorksheetRosterItem[]) => {
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
          const linked = Boolean(ass.attendanceSessionDate && ass.attendanceSessionCode);
          const attendance = ass.transmutationEnabled && linked
            ? attendanceRows.find(record => record.studentId === score.studentId
              && record.date === ass.attendanceSessionDate
              && record.sessionCode === ass.attendanceSessionCode)
            : undefined;
          return effectiveAssessmentPercentage(score.score, ass.maxScore, ass, linked ? attendance?.status : 'unlinked');
        })
        .filter((value): value is number => value !== null);
      if (effectiveValues.length === 0) return [];
      const avgPct = Math.round(effectiveValues.reduce((acc, value) => acc + value, 0) / effectiveValues.length);
      return [{
        name: ass.title.length > 15 ? ass.title.substring(0, 15) + '...' : ass.title,
        average: avgPct
      }];
    });
  };
  const assessmentStatsData = analyticsAttendanceLoading ? [] : buildAssessmentStatsData(analyticsAttendanceRecords);

  async function collectReportsBundleSnapshot(): Promise<ReportsBundleSnapshot> {
    if (!selectedClass?.csId) throw new Error('Select a class before exporting the Grades & Assessments report.');
    const [retentionResponse, attendanceSnapshot, analyticsAttendance] = await Promise.all([
      getFacultyRetentionApi(),
      loadReportAttendance(Number(selectedClass.csId), attendanceDate, selectedAttendanceSessionId),
      loadReportAnalyticsAttendance(Number(selectedClass.csId), analyticsAssessmentDates),
    ]);
    if (attendanceSnapshot.selectedSessionId && !selectedAttendanceSessionId) {
      setSelectedAttendanceSessionId(attendanceSnapshot.selectedSessionId);
    }
    return {
      retention: retentionResponse.retention ?? [],
      attendance: attendanceSnapshot.records,
      analyticsAttendance,
    };
  }

  function buildReportsBundleTables(snapshot: ReportsBundleSnapshot) {
    if (!selectedClass) throw new Error('Select a class before exporting the Grades & Assessments report.');
    const classId = String(selectedClass.csId || selectedClass.id);
    const categories = [
      ...(selectedGradingConfiguration?.midtermCategories ?? []),
      ...(selectedGradingConfiguration?.finalCategories ?? []),
    ];
    const classAssessments = assessments
      .filter(assessment => String(assessment.classId) === classId
        && assessment.subjectCode === selectedClass.courseCode
        && assessment.status !== 'Archived')
      .sort((a, b) => {
        const categoryA = categories.find(item => String(item.id ?? '') === String(a.gradingCategoryId ?? '')
          && (!item.gradingPeriod || item.gradingPeriod === a.gradingPeriod));
        const categoryB = categories.find(item => String(item.id ?? '') === String(b.gradingCategoryId ?? '')
          && (!item.gradingPeriod || item.gradingPeriod === b.gradingPeriod));
        const componentRank = (component: string | null | undefined) => {
          const normalized = String(component ?? '').toLowerCase();
          return normalized === 'lecture' ? 0 : normalized === 'laboratory' || normalized === 'lab' ? 1 : 2;
        };
        return (a.gradingPeriod === 'Midterm' ? 0 : 1) - (b.gradingPeriod === 'Midterm' ? 0 : 1)
          || componentRank(categoryA?.component) - componentRank(categoryB?.component)
          || (categoryA?.sortOrder ?? 999) - (categoryB?.sortOrder ?? 999)
          || a.dueDate.localeCompare(b.dueDate)
          || a.title.localeCompare(b.title);
      });
    const scoreByStudentAndAssessment = new Map(assessmentScores.map(score => [`${score.studentId}|${score.assessmentId}`, score.score]));
    const classStudents = ([...studentsInSelectedSubject] as Student[]).sort((a, b) => a.name.localeCompare(b.name));
    const assessmentColumns = classAssessments.map(assessment => {
      const category = categories.find(item => String(item.id ?? '') === String(assessment.gradingCategoryId ?? '')
        && (!item.gradingPeriod || item.gradingPeriod === assessment.gradingPeriod));
      return {
        id: assessment.id,
        period: assessment.gradingPeriod === 'Final' ? 'Finals' : 'Midterm',
        component: category?.component ?? 'Course',
        category: category?.name ?? assessment.type,
        title: assessment.title,
        maxScore: assessment.maxScore,
      };
    });
    const assessmentMatrixRows = classStudents.map(student => ({
      studentNumber: student.studentId,
      studentName: student.name,
      scores: assessmentColumns.map(column => scoreByStudentAndAssessment.get(`${student.id}|${column.id}`) ?? null),
    }));
    const gradeRows = classStudents.map(student => {
      const subject = (student.enrolledSubjects || []).find(sub => sub.code === selectedClass.courseCode
        && String(sub.classId ?? student.classId ?? classId) === classId) ?? null;
      const evaluation = courseEvaluation(subject);
      return {
        studentNumber: student.studentId,
        studentName: student.name,
        midterm: evaluation.midtermPercentage,
        finals: evaluation.finalPercentage,
        finalCourseGrade: evaluation.overallGwa,
        remarks: courseRemark(student, subject),
      };
    });
    const watchlistRows = snapshot.retention
      .filter(record => String(record.classId) === classId
        && record.subjectCode === selectedClass.courseCode
        && record.midtermAtRisk === true
        && (!record.schoolYear || record.schoolYear === selectedClass.schoolYear))
      .sort((a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? ''))
      .map(record => ({
        studentNumber: record.studentNumber ?? '',
        studentName: record.studentName ?? 'Student name unavailable',
        className: record.className ?? `${selectedClass.courseCode} · ${selectedClass.csName}`,
        midtermPercentage: record.midtermPercentage,
        midtermGrade: typeof record.midtermPercentage === 'number' ? percentageToGWA(record.midtermPercentage, 'Midterm') : null,
        riskStanding: 'At Risk',
        status: 'Computed · Ready',
      }));
    const attendanceRows = snapshot.attendance.map(record => ({
      date: record.date,
      session: record.sessionCode ?? '',
      studentNumber: record.studentNumber,
      studentName: record.studentName,
      courseCode: selectedClass.courseCode,
      status: record.status ?? 'Not recorded',
    }));
    const assessmentAverages = buildAssessmentStatsData(snapshot.analyticsAttendance);
    const retentionRank: Record<string, number> = { active: 0, cleared: 1, remedial: 2 };
    const retentionByStudent = new Map<string, string>();
    snapshot.retention
      .filter(record => String(record.classId) === classId
        && (!record.schoolYear || record.schoolYear === selectedClass.schoolYear))
      .forEach(record => {
        const state = record.state === 'archived' ? 'active' : record.state;
        const key = String(record.studentId);
        const current = retentionByStudent.get(key);
        if (!current || retentionRank[state] > retentionRank[current]) retentionByStudent.set(key, state);
      });
    const retentionCounts: Record<string, number> = { active: 0, cleared: 0, remedial: 0 };
    retentionByStudent.forEach(state => { retentionCounts[state] = (retentionCounts[state] || 0) + 1; });
    const analyticsRows = [
      ...[
        { name: 'Active Standing', value: retentionCounts.active },
        { name: 'Cleared (Remedial Passed)', value: retentionCounts.cleared },
        { name: 'Remedial Programs', value: retentionCounts.remedial },
      ].filter(item => item.value > 0).map(item => ({ dataset: 'Retention Watch Standings', metric: item.name, value: item.value, unit: 'students' })),
      ...gradeHistogramData.map(item => ({ dataset: 'Grade Distribution', metric: item.name, value: item.count, unit: 'students' })),
      ...assessmentAverages.map(item => ({ dataset: 'Assessment Average Success Rates', metric: item.name, value: item.average, unit: '%' })),
    ];
    const classLabel = `${selectedClass.courseCode} · ${selectedClass.csName}`;
    const term = selectedClass.semester && selectedClass.schoolYear
      ? termLine(String(selectedClass.semester), String(selectedClass.schoolYear))
      : `S.Y. ${selectedClass.schoolYear || selectedSchoolYear}`;
    const by = user?.display_name ?? '';
    const titleInput = (sheet: string, title: string, columns: Parameters<typeof buildReportSheet>[0]['columns'], rows: Array<Array<string | number | Date | null>>) => buildReportSheet({
      sheet,
      title,
      filter: classLabel,
      term,
      by,
      columns,
      rows,
    });
    const matrixHead = (value: string | number, extra: Partial<CellObject> = {}): XlsxCell => ({
      value, fontWeight: 'bold', backgroundColor: '#E1BEE8', align: 'center', alignVertical: 'center', wrap: true, ...extra,
    });
    const matrixWidth = 2 + assessmentColumns.length * 2;
    const matrixBlank = (): XlsxCell[] => Array.from({ length: matrixWidth }, () => null);
    const matrixData: XlsxCell[][] = [
      ...['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE', 'GRADES & ASSESSMENT SCORES', classLabel, term, `Exported by ${by}`, ''].map((value, index) => {
        const row = matrixBlank();
        row[0] = { value, columnSpan: matrixWidth, align: 'center', fontWeight: index === 1 || index === 2 || index === 3 ? 'bold' : undefined };
        return row;
      }),
    ];
    const periodHeader = matrixBlank();
    periodHeader[0] = matrixHead('Student Number', { rowSpan: 5 });
    periodHeader[1] = matrixHead('Student Name', { rowSpan: 5 });
    const groupedColumns = (key: 'period' | 'component' | 'category', header: XlsxCell[]) => {
      let start = 0;
      while (start < assessmentColumns.length) {
        let end = start + 1;
        while (end < assessmentColumns.length && assessmentColumns[end][key] === assessmentColumns[start][key]
          && (key !== 'category' || assessmentColumns[end].component === assessmentColumns[start].component)) end++;
        const columnIndex = 2 + start * 2;
        const label = key === 'category' ? `${assessmentColumns[start].component} · ${assessmentColumns[start].category}` : assessmentColumns[start][key];
        header[columnIndex] = matrixHead(label, { columnSpan: (end - start) * 2 });
        start = end;
      }
    };
    groupedColumns('period', periodHeader);
    const componentHeader = matrixBlank();
    groupedColumns('component', componentHeader);
    const categoryHeader = matrixBlank();
    groupedColumns('category', categoryHeader);
    const assessmentHeader = matrixBlank();
    assessmentColumns.forEach((column, index) => { assessmentHeader[2 + index * 2] = matrixHead(`${column.title} (Max ${column.maxScore})`, { columnSpan: 2 }); });
    const scoreHeader = matrixBlank();
    assessmentColumns.forEach((_column, index) => {
      scoreHeader[2 + index * 2] = matrixHead('Score');
      scoreHeader[3 + index * 2] = matrixHead('%');
    });
    matrixData.push(periodHeader, componentHeader, categoryHeader, assessmentHeader, scoreHeader,
      ...assessmentMatrixRows.map(row => [
        { value: row.studentNumber }, { value: row.studentName, align: 'left' as const },
        ...row.scores.flatMap((score, index) => {
          const max = assessmentColumns[index].maxScore;
          return [score === null ? null : { value: score, format: '0.##' }, score === null || max <= 0 ? null : { value: score / max, format: '0.00%' }];
        }),
      ]));
    const assessmentSheet: XlsxSheet = {
      sheet: 'Assessment Scores', data: matrixData,
      columns: [{ width: 16 }, { width: 28 }, ...assessmentColumns.flatMap(() => [{ width: 12 }, { width: 10 }])],
      stickyRowsCount: 13, stickyColumnsCount: 2, orientation: 'landscape',
    };
    const sheets = [
      assessmentSheet,
      titleInput('Grade Summary', 'MIDTERM, FINALS & COURSE GRADE SUMMARY', [
        { header: 'Student Number', width: 16 }, { header: 'Student Name', width: 30 },
        { header: 'Midterm Period', width: 16, format: '0.00%' }, { header: 'Finals Period', width: 16, format: '0.00%' },
        { header: 'Final Course Grade', width: 18, format: '0.00' }, { header: 'Remarks', width: 24 },
      ], gradeRows.map(row => [row.studentNumber, row.studentName, row.midterm === null ? null : row.midterm / 100,
        row.finals === null ? null : row.finals / 100, row.finalCourseGrade, row.remarks])),
      titleInput('Midterm Watchlist', 'MIDTERM WATCHLIST', [
        { header: 'Student Number', width: 16 }, { header: 'Student Name', width: 30 }, { header: 'Class', width: 24 },
        { header: 'Midterm %', width: 14, format: '0.00%' }, { header: 'Midterm Grade', width: 16, format: '0.0' },
        { header: 'Risk Standing', width: 16 }, { header: 'Status', width: 18 },
      ], watchlistRows.map(row => [row.studentNumber, row.studentName, row.className,
        typeof row.midtermPercentage === 'number' ? row.midtermPercentage / 100 : null, row.midtermGrade, row.riskStanding, row.status])),
      titleInput('Attendance Register', 'ATTENDANCE REGISTER', [
        { header: 'Date', width: 14 }, { header: 'Session', width: 16 }, { header: 'Student Number', width: 16 },
        { header: 'Student Name', width: 30 }, { header: 'Course Code', width: 14 }, { header: 'Status', width: 16 },
      ], attendanceRows.map(row => [dayToDate(row.date) ?? row.date, row.session, row.studentNumber, row.studentName, row.courseCode, row.status])),
      buildReportSheet({ sheet: 'Interactive Analytics', title: 'INTERACTIVE ANALYTICS', filter: classLabel, term, by,
        columns: [{ header: 'Dataset', width: 34 }, { header: 'Metric', width: 34 }, { header: 'Value', width: 16, format: '0.00' }, { header: 'Unit', width: 14 }],
        rows: analyticsRows.map(row => [row.dataset, row.metric, row.value, row.unit]) }),
    ];
    return { assessmentColumns, assessmentMatrixRows, gradeRows, watchlistRows, attendanceRows, analyticsRows, sheets, classLabel, term };
  }

  async function handleExportReportsBundle() {
    if (!selectedClass) throw new Error('Your classes are still loading. Try Export Excel again in a moment.');
    const snapshot = await collectReportsBundleSnapshot();
    const bundle = buildReportsBundleTables(snapshot);
    const chart = await buildAnalyticsChartImage(bundle.analyticsRows);
    const chartHeightInRows = Math.ceil((chart.height * 0.75) / 20) + 2;
    const analyticsSheet = bundle.sheets[4];
    const analyticsData = [...analyticsSheet.data.slice(0, 8), ...Array.from({ length: chartHeightInRows }, () => [] as XlsxCell[]), ...analyticsSheet.data.slice(8)];
    bundle.sheets[4] = { ...analyticsSheet, data: analyticsData, stickyRowsCount: 9 + chartHeightInRows, images: [{
      content: chart.blob, contentType: 'image/png', width: 900, height: chart.height * 0.75, dpi: 96,
      anchor: { row: 8, column: 1 },
    }] };
    const filename = `${selectedClass.courseCode}_${selectedClass.csName}_Grades_Assessments_${selectedClass.schoolYear}_${selectedClass.semester}`
      .replace(/[^a-zA-Z0-9_.-]+/g, '_');
    await downloadXlsx(`${filename}.xlsx`, bundle.sheets);
  }

  async function handlePrintReportsBundle() {
    if (!selectedClass) {
      showFeedback('Your classes are still loading. Try Print PDF again in a moment.', 'info');
      return;
    }
    setIsPreparingBundlePrint(true);
    try {
      const snapshot = await collectReportsBundleSnapshot();
      const restoreAfterPrint = () => {
        setReportsBundlePrint(null);
        window.removeEventListener('afterprint', restoreAfterPrint);
      };
      window.addEventListener('afterprint', restoreAfterPrint);
      flushSync(() => {
        setPrintedAt(new Date());
        setReportsBundlePrint(snapshot);
      });
      try {
        window.print();
      } catch (err) {
        restoreAfterPrint();
        throw err;
      }
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Unable to prepare the reports PDF.', 'error');
    } finally {
      setIsPreparingBundlePrint(false);
    }
  }

  return (
    <div className="space-y-6">
      

      {/* Unified Course, Class, and School Year Selector Bar */}
      <Card className="p-4 flex flex-col xl:flex-row gap-4 xl:items-center no-print">
        {/* School Year Filter */}
        <div className="w-full xl:w-56 rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center gap-2 focus-within:ring-2 focus-within:ring-clinical-500">
          <CalendarDays className="w-4 h-4 shrink-0 text-clinical-600 dark:text-clinical-400" aria-hidden="true" />
          <select
            value={selectedSchoolYear}
            onChange={(e) => setSelectedSchoolYear(e.target.value)}
            aria-label="School year"
            className="min-w-0 flex-1 pr-6 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
          >
            <option value="all">All School Years</option>
            {availableSchoolYears.map(sy => (
              <option key={sy} value={sy}>
                S.Y. {sy}{sy === currentSchoolYear ? ' (Current)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Active Class & Section (Unified Course and Section Filter) */}
        <div className="w-full xl:flex-1 rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center gap-2 focus-within:ring-2 focus-within:ring-clinical-500">
          <Filter className="w-4 h-4 shrink-0 text-clinical-600 dark:text-clinical-400" aria-hidden="true" />
          <select
            value={selectedClassId}
            onChange={(e) => {
              const newClassId = e.target.value;
              setSelectedClassId(newClassId);
              const found = classesForSchoolYear.find(c => String(c.csId || c.id) === newClassId);
              if (found?.courseCode) {
                setSelectedSubjectCode(found.courseCode);
              }
            }}
            aria-label="Class: course code, section, and course title"
            className="min-w-0 flex-1 pr-6 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
          >
            {classesForSchoolYear.length === 0 ? (
              <option value="">No active classes for selected year</option>
            ) : (
              classesForSchoolYear.map(classItem => {
                const classId = String(classItem.csId || classItem.id);
                const code = classItem.courseCode || 'Course';
                const title = classItem.courseTitle || classItem.courseName || code;
                const section = classItem.csName || classItem.block || `Section ${classItem.id}`;
                return <option key={classId} value={classId}>{code} · {section} · {title}</option>;
              })
            )}
          </select>
        </div>
      </Card>

      {/* Navigation Sub-Tabs Bar - Consistent with other faculty portals */}
      <div className="flex flex-wrap xl:flex-nowrap bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm no-print">
        <button
          onClick={() => setReportTab('academic')}
          className={`flex-1 min-w-fit xl:min-w-[auto] whitespace-nowrap py-2 px-3 max-sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            reportTab === 'academic' 
              ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Grades & Assessments
</button>
        <button
          onClick={() => setReportTab('retention')}
          className={`flex-1 min-w-fit xl:min-w-[auto] whitespace-nowrap py-2 px-3 max-sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            reportTab === 'retention' 
              ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Retention Watch Lists
        </button>
        <button
          onClick={() => setReportTab('attendance')}
          className={`flex-1 min-w-fit xl:min-w-[auto] whitespace-nowrap py-2 px-3 max-sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            reportTab === 'attendance' 
              ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Attendance Registers
        </button>
        <button
          onClick={() => setReportTab('analytics')}
          className={`flex-1 min-w-fit xl:min-w-[auto] whitespace-nowrap py-2 px-3 max-sm:px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            reportTab === 'analytics' 
              ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' 
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Interactive Analytics
        </button>
      </div>

      {/* ----------------------------------------------------
          TAB 1: ACADEMIC REPORTS LEDGER
      ---------------------------------------------------- */}
      {reportTab === 'academic' && (
        <Card className="p-0 overflow-hidden no-print">
          <div className="px-5 py-4 border-b dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex flex-wrap gap-2 justify-between items-center">
            <div className="flex-1 basis-40">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Grades & Assessment Summary</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedClass ? `${selectedClass.courseCode} · ${selectedClass.csName}` : 'Overview of final academic standing'}
              </p>
            </div>
            <div className="flex shrink-0 items-center bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
              <button
                type="button"
                onClick={() => handleExportExcel('academic')}
                disabled={isExportingAcademic}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                title="Export official grade sheet as an Excel workbook"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{isExportingAcademic ? 'Exporting…' : 'Export Excel'}</span>
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
              <button
                type="button"
                onClick={handlePrintReportsBundle}
                disabled={isPreparingBundlePrint || !selectedClass}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                title="Export or print academic report as PDF document"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>{isPreparingBundlePrint ? 'Preparing PDF…' : 'Export PDF'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Midterm Lecture</th>}
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Midterm Laboratory</th>}
                  <th className="px-5 py-3 text-center">Midterm</th>
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Finals Lecture</th>}
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Finals Laboratory</th>}
                  <th className="px-5 py-3 text-center">{isLectureLaboratoryMode ? 'Finals' : 'Final'}</th>
                  <th className="px-5 py-3 text-center">Grade</th>
                  <th className="px-5 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {paginatedStudentsInSubject.length === 0 ? (
                  <tr>
                    <td colSpan={isLectureLaboratoryMode ? 9 : 5} className="px-5 py-12 text-center text-slate-500 dark:text-slate-400 font-semibold">
                      No student records found for the selected course and class section.
                    </td>
                  </tr>
                ) : (
                  paginatedStudentsInSubject.map((student: any) => {
                    const subj = subjectForSelection(student);
                    const evaluation = courseEvaluation(subj);
                    const remark = courseRemark(student, subj);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                          <span className="whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400 font-mono">{student.studentId}</span>
                        </td>
                        {isLectureLaboratoryMode && <td className="px-5 py-3.5 text-center font-mono">{formatComponentResult(evaluation.midtermComponents?.lecture, evaluation.midtermStatus)}</td>}
                        {isLectureLaboratoryMode && <td className="px-5 py-3.5 text-center font-mono">{formatComponentResult(evaluation.midtermComponents?.laboratory, evaluation.midtermStatus)}</td>}
                        <td className="px-5 py-3.5 text-center font-mono">{formatPercent(evaluation.midtermPercentage)}</td>
                        {isLectureLaboratoryMode && <td className="px-5 py-3.5 text-center font-mono">{formatComponentResult(evaluation.finalComponents?.lecture, evaluation.finalStatus)}</td>}
                        {isLectureLaboratoryMode && <td className="px-5 py-3.5 text-center font-mono">{formatComponentResult(evaluation.finalComponents?.laboratory, evaluation.finalStatus)}</td>}
                        <td className="px-5 py-3.5 text-center font-mono">{formatPercent(evaluation.finalPercentage)}</td>
                        <td className="px-5 py-3.5 text-center font-extrabold text-sm dark:text-slate-100">
                          {evaluation.overallGwa !== null ? <GradeValue percentage={evaluation.overallPercentage} grade={evaluation.overallGwa} lecture={selectedGradingConfiguration?.componentMode === 'lecture' && selectedGradingConfiguration.termRatio && evaluation.midtermPercentage !== null && evaluation.finalPercentage !== null ? { midterm: evaluation.midtermPercentage, final: evaluation.finalPercentage, midtermShare: Number(selectedGradingConfiguration.termRatio.midterm), finalShare: Number(selectedGradingConfiguration.termRatio.final) } : null}>{formatCourseGrade(evaluation)}</GradeValue> : formatCourseGrade(evaluation)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            remark === 'FAILED'
                              ? 'bg-rose-100 text-rose-700'
                              : remark === 'PENDING' || remark === 'RETENTION UNAVAILABLE'
                              ? 'bg-slate-100 text-slate-600'
                              : remark === 'REVIEW RETENTION'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {remark}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPagesInSubject > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
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
          <div className="px-5 py-4 border-b dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex flex-wrap gap-2 justify-between items-center">
            <h3 className="flex-1 basis-40 font-bold text-sm text-slate-800 dark:text-slate-200">Retention Status Reports</h3>
            <div className="flex shrink-0 items-center bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
              <button
                type="button"
                onClick={() => handleExportExcel('retention')}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                title="Export retention report as Excel spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Export Excel</span>
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer"
                title="Export or print retention report as PDF document"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3 text-center">Standing Grade</th>
                  <th className="px-5 py-3 text-center">At-Risk Courses</th>
                  <th className="px-5 py-3 text-center">Risk Level</th>
                  <th className="px-5 py-3">Remedial Program Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {facultyStudents.map((student: any) => {
                  const warnings = retentionUnavailable ? [] : (student.enrolledSubjects || []).filter((sub: any) =>
                    assignedSubjects.includes(sub.code)
                    && retentionIsAtRisk(retentionForStudentSubject(student, sub))
                  );
                  const isAtRisk = !retentionUnavailable && warnings.length > 0;
                  const gwa = standingGwa(student);
                  const remedialStatus = remedialStatusFor(student);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                        <span className="whitespace-nowrap text-[10px]">{student.studentId} • Year {student.yearLevel}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-slate-800 dark:text-slate-100">
                        {gwa !== null ? gwa.toFixed(2) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-rose-500">{retentionUnavailable ? 'Unavailable' : warnings.length}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          retentionUnavailable ? 'bg-slate-100 text-slate-600' : isAtRisk ? 'bg-rose-100 text-rose-700' : ''
                        }`}>
                          {retentionUnavailable ? 'UNAVAILABLE' : isAtRisk ? 'At Risk' : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 dark:text-slate-400">
                        {remedialStatus === 'No remedial' || remedialStatus === 'Unavailable' ? (
                          <span className="font-medium text-slate-500 dark:text-slate-400">{remedialStatus}</span>
                        ) : (
                          <span className="font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {remedialStatus}
                          </span>
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
          <div className="px-5 py-4 border-b dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex flex-wrap gap-2 justify-between items-center">
            <div className="flex-1 basis-40">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Authoritative Attendance Register</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{selectedClass?.courseCode || 'Class unavailable'} · {attendanceDate}</p>
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
              <div className="flex shrink-0 items-center bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleExportExcel('attendance')}
                  disabled={attendanceRecords.length === 0}
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Export attendance register as Excel spreadsheet"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export Excel</span>
                </button>
                <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={attendanceRecords.length === 0}
                  className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Export or print attendance register as PDF document"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Export PDF</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {attendanceError && (
              <div className="m-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{attendanceError}</span>
              </div>
            )}
            {attendanceLoading && <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">Loading persisted attendance records…</p>}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Student details</th>
                  <th className="px-5 py-3">Subject Code</th>
                  <th className="px-5 py-3">Recorded Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {!attendanceLoading && attendanceRecords.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">No persisted attendance records for this class and date.</td></tr>
                ) : attendanceRecords.map(record => {
                    return (
                      <tr key={record.enrollmentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3 font-mono">{record.date}</td>
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">{record.studentName || 'Student name unavailable'}</div>
                          <span className="whitespace-nowrap text-[10px] text-slate-500 dark:text-slate-400 font-mono">{record.studentNumber || 'Student number unavailable'}</span>
                        </td>
                        <td className="px-5 py-3 font-bold font-mono">{selectedClass?.courseCode || 'Course unavailable'}</td>
                        <td className="px-5 py-3">
                          <span className={`whitespace-nowrap px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${
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
              <h4 className="text-xs font-bold dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Layers className="w-4 h-4" />
                Retention Watch Standings
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4">Proportion of students by computed retention status</p>
            </div>
            <div className="h-56 flex items-center justify-center">
              {retentionUnavailable ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                  {retentionLoading ? 'Loading authoritative retention data…' : 'Retention distribution unavailable.'}
                </p>
              ) : pieData.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">No retention distribution data available.</p>
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
              <h4 className="text-xs font-bold dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileCheck className="w-4 h-4" />
                Grade Distribution
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4">Students per course grade band in the selected section; 2.50 or worse triggers remedial</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeHistogramData}margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
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
              <h4 className="text-xs font-bold dark:text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Assessment Average Success Rates
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4">Average scores across created assessment activities (out of 100%)</p>
            </div>
            <div className="h-56">
              {analyticsAttendanceLoading ? (
                <div className="py-12 text-center text-xs">Loading authoritative attendance records…</div>
              ) : analyticsAttendanceError ? (
                <div className="py-12 text-center text-xs">Assessment attendance data is unavailable.</div>
              ) : assessmentStatsData.length === 0 ? (
                <div className="py-12 text-center text-xs">No assessment grades recorded yet.</div>
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
      {(() => {
        if (reportsBundlePrint && selectedClass) {
          const bundle = buildReportsBundleTables(reportsBundlePrint);
          const generated = formatPrintedAt(printedAt ?? new Date());
          const renderTable = (headers: string[], rows: React.ReactNode[][]) => (
            <table>
              <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className={index < 2 ? 'l' : ''}>{header}</th>)}</tr></thead>
              <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex < 2 ? 'l' : ''}>{cell ?? '—'}</td>)}</tr>)}</tbody>
            </table>
          );
          const scoreGroups = (key: 'period' | 'component' | 'category') => {
            const groups: Array<{ label: string; count: number }> = [];
            bundle.assessmentColumns.forEach(column => {
              const label = key === 'period' ? column.period : `${column.component} · ${column.category}`;
              const previous = groups[groups.length - 1];
              if (previous?.label === label) previous.count++;
              else groups.push({ label, count: 1 });
            });
            return groups;
          };
          const analyticsGroups = [
            { title: 'Retention standing', key: 'Retention Watch Standings', color: '#15803d' },
            { title: 'Grade distribution', key: 'Grade Distribution', color: '#2563eb' },
            { title: 'Assessment averages', key: 'Assessment Average Success Rates', color: '#0d9488' },
          ].map(group => {
            const rows = bundle.analyticsRows.filter(row => row.dataset === group.key);
            return { ...group, rows, max: Math.max(...rows.map(row => row.value), rows[0]?.unit === '%' ? 100 : 1) };
          });
          const sections = [
            <section key="scores" className="report-bundle-section">
              <PrintCaption>1. Assessment Scores</PrintCaption>
              <table className="assessment-matrix">
                <thead>
                  <tr><th className="l" rowSpan={5}>Student Number</th><th className="l" rowSpan={5}>Student Name</th>
                    {scoreGroups('period').map((group, index) => <th key={index} colSpan={group.count * 2}>{group.label}</th>)}</tr>
                  <tr>{scoreGroups('component').map((group, index) => <th key={index} colSpan={group.count * 2}>{group.label}</th>)}</tr>
                  <tr>{scoreGroups('category').map((group, index) => <th key={index} colSpan={group.count * 2}>{group.label}</th>)}</tr>
                  <tr>{bundle.assessmentColumns.map(column => <th key={column.id} colSpan={2}>{column.title} (Max {column.maxScore})</th>)}</tr>
                  <tr>{bundle.assessmentColumns.flatMap(column => [<th key={`${column.id}-score`}>Score</th>, <th key={`${column.id}-percent`}>%</th>])}</tr>
                </thead>
                <tbody>{bundle.assessmentMatrixRows.map((row, rowIndex) => <tr key={rowIndex}>
                  <td className="id">{row.studentNumber}</td><td className="nm">{row.studentName}</td>
                  {row.scores.flatMap((score, index) => {
                    const max = bundle.assessmentColumns[index].maxScore;
                    return [<td key={`${index}-score`}>{score === null ? '?' : score}</td>,
                      <td key={`${index}-percent`}>{score === null || max <= 0 ? '?' : `${(score / max * 100).toFixed(2)}%`}</td>];
                  })}
                </tr>)}</tbody>
              </table>
            </section>,
            <section key="grades" className="report-bundle-section" style={{ breakBefore: 'page' }}>
              <PrintCaption>2. Grade Summary</PrintCaption>
              {renderTable(['Student Number', 'Student Name', 'Midterm Period', 'Finals Period', 'Final Course Grade', 'Remarks'],
                bundle.gradeRows.map(row => [row.studentNumber, row.studentName, formatPercent(row.midterm), formatPercent(row.finals),
                  row.finalCourseGrade === null ? 'Pending' : formatGrade(row.finalCourseGrade), row.remarks]))}
            </section>,
            <section key="watchlist" className="report-bundle-section" style={{ breakBefore: 'page' }}>
              <PrintCaption>3. Midterm Watchlist</PrintCaption>
              {renderTable(['Student Number', 'Student Name', 'Class', 'Midterm %', 'Midterm Grade', 'Risk Standing', 'Status'],
                bundle.watchlistRows.map(row => [row.studentNumber, row.studentName, row.className, formatPercent(row.midtermPercentage ?? null),
                  row.midtermGrade === null ? '—' : row.midtermGrade.toFixed(1), row.riskStanding, row.status]))}
            </section>,
            <section key="attendance" className="report-bundle-section" style={{ breakBefore: 'page' }}>
              <PrintCaption>4. Attendance Register · {attendanceDate}</PrintCaption>
              {renderTable(['Date', 'Session', 'Student Number', 'Student Name', 'Course Code', 'Status'],
                bundle.attendanceRows.map(row => [row.date, row.session || '—', row.studentNumber, row.studentName, row.courseCode, row.status]))}
            </section>,
            <section key="analytics" className="report-bundle-section" style={{ breakBefore: 'page' }}>
              <PrintCaption>5. Interactive Analytics</PrintCaption>
              <div className="report-analytics-graphs">
                {analyticsGroups.map(group => <div key={group.key} className="report-analytics-group">
                  <h3>{group.title}</h3>
                  {group.rows.length === 0 ? <p>No data available.</p> : group.rows.map(row => (
                    <div className="report-analytics-row" key={row.metric}>
                      <span>{row.metric}</span>
                      <div className="report-analytics-track"><div style={{ width: `${Math.max(0, Math.min(100, row.value / group.max * 100))}%`, backgroundColor: group.color }} /></div>
                      <strong>{row.value}{row.unit === '%' ? '%' : ` ${row.unit}`}</strong>
                    </div>
                  ))}
                </div>)}
              </div>
              <h3 className="analytics-data-heading">Chart data</h3>
              {renderTable(['Dataset', 'Metric', 'Value', 'Unit'], bundle.analyticsRows.map(row => [row.dataset, row.metric, row.value, row.unit]))}
            </section>,
          ];
          return (
            <div className="print-only hidden bg-white text-slate-900 font-sans ps">
              <PrintStyle title="Grades & Assessment Report" running={`Grades & Assessment Report · ${selectedClass.courseCode} · ${selectedClass.csName}`} generated={generated} />
              <PrintHeader
                title="Grades & Assessment Report"
                sub={`${selectedClass.courseCode}${selectedClass.courseName ? ` · ${selectedClass.courseName}` : ''}`}
                rows={[
                  ['Class', `${selectedClass.courseCode} · ${selectedClass.csName}`],
                  ['Term', bundle.term],
                  ['Faculty', user?.display_name ?? ''],
                  ['Students', String(studentsInSelectedSubject.length)],
                  ['Generated', generated],
                ]}
              />
              {sections}
            </div>
          );
        }
        const printTitle = 'Official Academic & Evaluations Report';
        const printCaption = reportTab === 'academic' ? `Grades & Assessment Summary (${selectedSubjectCode})` : reportTab === 'retention' ? 'Retention watch ledger' : `Attendance Register ledger (${attendanceDate})`;
        const course = selectedClass?.courseCode || selectedSubjectCode || 'Course';
        const section = selectedClass?.csName || selectedClassId || 'All Sections';
        const schoolYear = selectedClass?.schoolYear || currentSchoolYear;
        const term = selectedClass?.semester
          ? `${selectedClass.semester}, S.Y. ${schoolYear}`
          : schoolYear ? `S.Y. ${schoolYear}` : 'School Year';
        const generated = formatPrintedAt(printedAt ?? new Date());
        const rowCount = reportTab === 'academic' ? studentsInSelectedSubject.length : reportTab === 'retention' ? facultyStudents.length : attendanceRecords.length;
        const academicRows = reportTab === 'academic' ? studentsInSelectedSubject.map((student: any) => {
          const subj = subjectForSelection(student);
          const evaluation = courseEvaluation(subj);
          return {
            student,
            midLec: formatComponentResult(evaluation.midtermComponents?.lecture, evaluation.midtermStatus),
            midLab: formatComponentResult(evaluation.midtermComponents?.laboratory, evaluation.midtermStatus),
            mid: formatPercent(evaluation.midtermPercentage),
            finLec: formatComponentResult(evaluation.finalComponents?.lecture, evaluation.finalStatus),
            finLab: formatComponentResult(evaluation.finalComponents?.laboratory, evaluation.finalStatus),
            fin: formatPercent(evaluation.finalPercentage),
            grade: formatCourseGrade(evaluation),
            remark: courseRemark(student, subj),
          };
        }) : [];
        const needsLegend = academicRows.some(r => [r.midLec, r.midLab, r.finLec, r.finLab].includes('Unavailable (recompute required)'));
        const widths = reportTab === 'retention' ? [12, 34, 13, 15, 26]
          : reportTab === 'attendance' ? [13, 13, 40, 14, 20]
          : isLectureLaboratoryMode ? [9, 19, 8.5, 8.5, 7.5, 8.5, 8.5, 7.5, 10, 12.5]
          : [11, 31, 12, 12, 16, 18];
        return (
      <div className="print-only hidden bg-white text-slate-900 font-sans ps">
        <PrintStyle title={printTitle} running={`${printTitle} · ${course} · ${section} · S.Y. ${schoolYear}`} generated={generated} />
        <PrintHeader
          title={printTitle}
          sub={`${course}${selectedClass?.courseName ? ` · ${selectedClass.courseName}` : ''}`}
          rows={[
            ['Section', section],
            ['Term', term],
            ['Faculty', user?.display_name ?? ''],
            ['Students', String(rowCount)],
            ['Date', generated],
          ]}
        />
        <PrintCaption>{printCaption}</PrintCaption>
        <table>
          <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead>
            {reportTab === 'academic' && (isLectureLaboratoryMode ? (
              <>
                <tr>
                  <th className="l" rowSpan={2}>Student No.</th>
                  <th className="l" rowSpan={2}>Student Name</th>
                  <th className="band" scope="colgroup" colSpan={3}>Midterm</th>
                  <th className="band" scope="colgroup" colSpan={3}>Finals</th>
                  <th rowSpan={2}>Grade</th>
                  <th className="l" rowSpan={2}>Remarks</th>
                </tr>
                <tr>
                  <th scope="col" aria-label="Midterm Lecture %">Lecture %</th>
                  <th scope="col" aria-label="Midterm Laboratory %">Laboratory %</th>
                  <th scope="col" aria-label="Midterm">Midterm %</th>
                  <th scope="col" aria-label="Finals Lecture %">Lecture %</th>
                  <th scope="col" aria-label="Finals Laboratory %">Laboratory %</th>
                  <th scope="col" aria-label="Finals">Finals %</th>
                </tr>
              </>
            ) : (
              <tr>
                <th className="l">Student No.</th>
                <th className="l">Student Name</th>
                <th>Midterm</th>
                <th>Final</th>
                <th>Grade</th>
                <th className="l">Remarks</th>
              </tr>
            ))}
            {reportTab === 'retention' && (
              <tr>
                <th className="l">Student No.</th>
                <th className="l">Student Name</th>
                <th>Standing Grade</th>
                <th>Standing Status</th>
                <th className="l">Remedials Status</th>
              </tr>
            )}
            {reportTab === 'attendance' && (
              <tr>
                <th className="l">Date</th>
                <th className="l">Student No.</th>
                <th className="l">Student Name</th>
                <th className="l">Course Code</th>
                <th className="l">Status</th>
              </tr>
            )}
          </thead>
          <tbody>
            {reportTab === 'academic' && academicRows.map(r => (
              <tr key={r.student.id}>
                <td className="id">{r.student.studentId}</td>
                <td className="nm">{r.student.name}</td>
                {isLectureLaboratoryMode && <td className={printCellClass(r.midLec)}>{r.midLec}</td>}
                {isLectureLaboratoryMode && <td className={printCellClass(r.midLab)}>{r.midLab}</td>}
                <td className={printCellClass(r.mid)}>{r.mid}</td>
                {isLectureLaboratoryMode && <td className={printCellClass(r.finLec)}>{r.finLec}</td>}
                {isLectureLaboratoryMode && <td className={printCellClass(r.finLab)}>{r.finLab}</td>}
                <td className={printCellClass(r.fin)}>{r.fin}</td>
                <td className={`grade ${printCellClass(r.grade)}`}>{r.grade}</td>
                <td className={`l ${printCellClass(r.remark)}`}>{r.remark}</td>
              </tr>
            ))}
            {reportTab === 'retention' && facultyStudents.map((student: any) => {
              const gwa = standingGwa(student);
              const gwaText = gwa !== null ? gwa.toFixed(2) : '—';
              const status = retentionUnavailable ? 'Unavailable' : student.status;
              const remedial = remedialStatusFor(student);
              return (
                <tr key={student.id}>
                  <td className="id">{student.studentId}</td>
                  <td className="nm">{student.name}</td>
                  <td className={printCellClass(gwaText)}>{gwaText}</td>
                  <td className={`cap ${printCellClass(status)}`}>{status}</td>
                  <td className={`l ${printCellClass(remedial)}`}>{remedial}</td>
                </tr>
              );
            })}
            {reportTab === 'attendance' && attendanceRecords.map(record => (
              <tr key={record.enrollmentId}>
                <td className="id">{record.date}</td>
                <td className="id">{record.studentNumber || '—'}</td>
                <td className="nm">{record.studentName || 'Student name unavailable'}</td>
                <td className="id">{selectedClass?.courseCode || '—'}</td>
                <td className="l cap">{record.status || 'Not recorded'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {needsLegend && <PrintLegend />}
        <PrintSignatures faculty={user?.display_name} />
      </div>
        );
      })()}

    </div>
  );
};
