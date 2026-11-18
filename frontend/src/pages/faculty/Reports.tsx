import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  User, 
  GraduationCap, 
  AlertTriangle, 
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  CheckCircle,
  BookOpen,
  Sparkles,
  Clock,
  TrendingUp,
  Layers,
  FileText,
  AlertCircle,
  Filter,
  Inbox
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
import { PrintStyle, PrintHeader, PrintCaption, PrintLegend, PrintSignatures, PrintExportTable, formatPrintedAt, printCellClass } from '../../components/PrintSheet';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, AttendanceRecord, Assessment, AssessmentScore } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { SortableHeader, ariaSort, compareValues, type SortState } from '../../components/SortableHeader';
import { formatShortDate } from '../../utils/sessionDate';
import { formatSchoolYear } from '../../utils/schoolYear';
import { effectiveAssessmentPercentage, formatGrade, gwaToDescription, percentageToGWA } from '../../utils/gradeHelper';
import { extractPeriodEvaluation, type PeriodComponentEvaluation } from '../../utils/periodGradingHelper';

import {
  getFacultyReportsSummaryApi,
  getFacultyClassesApi,
  getFacultyAttendanceSheetApi,
  getFacultyGradingConfigApi,
  getFacultyRetentionApi,
  getFacultyAttendanceWorksheetApi,
  previewFacultyGradesApi,
  isPeriodComputeResult,
  ApiError,
  type FacultyGradingConfiguration,
  type FacultyRetentionRecord,
  type FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';
import GradeValue from '../../components/GradeValue';
import Tabs from '../../components/Tabs';
import { downloadXlsx } from '../../utils/xlsxDownload';
import { showFeedback } from '../../components/FeedbackCenter';
import { assessmentMatrixCells, assessmentMatrixGroups, buildAssessmentScoresSheet, buildReportSheet, dayToDate, termLine, watchlistStatusText } from '../../utils/reportWorkbook';
import { IBU_SUMMARY_COLUMNS, ibuGradeSummaryRow, savedGradeResult, sheetName } from '../../utils/officialGradeSheetExport';
import { buildAttendanceSheetTable, type AttendanceSheetTable } from '../../utils/attendanceSheet';
import { ExportPair } from '../../components/ExportMenu';
import { buildRemedialSummaryTable, type RemedialSummaryTable } from '../../utils/remedialSummary';
import { buildFacultyAcademicSummarySheet, buildFacultyAcademicSummaryTable, type FacultyAcademicSummaryValues } from '../../utils/facultyAcademicSummaryExport';


type AcademicSummaryPrintSnapshot = {
  courseLabel: string;
  section: string;
  term: string;
  faculty: string;
  lectureLaboratory: boolean;
  columns: string[];
  rows: string[][];
};

async function loadReportAnalyticsAttendance(csId: number, dates: string[]) {
  const records: FacultyAttendanceWorksheetRosterItem[] = [];
  const revokedSessions = new Set<string>();
  for (const date of dates) {
    const initial = await getFacultyAttendanceWorksheetApi({ csId, date });
    const availableSessions = initial.worksheet?.attendanceSessions ?? [];
    availableSessions.filter(session => session.status === 'revoked')
      .forEach(session => revokedSessions.add(`${date}|${session.sessionCode}`));
    const sessionIds = availableSessions
      .map(session => Number(session.sessionId))
      .filter(sessionId => Number.isFinite(sessionId) && sessionId > 0);
    if (sessionIds.length === 0) {
      records.push(...(initial.worksheet?.roster ?? []));
      continue;
    }
    const sessions = await Promise.all(sessionIds.map(sessionId => getFacultyAttendanceWorksheetApi({ csId, date, sessionId })));
    sessions.forEach(response => records.push(...(response.worksheet?.roster ?? [])));
  }
  return {
    records: Array.from(new Map(
      records.map(record => [`${record.enrollmentId}:${record.attendanceSessionId ?? record.sessionCode ?? record.date}`, record]),
    ).values()),
    revokedSessions: Array.from(revokedSessions),
  };
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
  const [revokedAnalyticsSessions, setRevokedAnalyticsSessions] = useState<string[]>([]);
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
        setError(err instanceof Error ? err.message : 'Could not load the report summary from the server.');
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
  const [attendanceSessionDates, setAttendanceSessionDates] = useState<string[]>([]);
  const [attendanceCalendarOpen, setAttendanceCalendarOpen] = useState(false);
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    if (!selectedClass?.csId) {
      setAttendanceSessionDates([]);
      setAttendanceDate('');
      return;
    }
    let ignore = false;
    getFacultyAttendanceSheetApi(Number(selectedClass.csId)).then(response => {
      if (ignore) return;
      const dates = Array.from(new Set((response.sheet?.sessions ?? []).map(session => session.date).filter(Boolean))).sort();
      setAttendanceSessionDates(dates);
      setAttendanceDate(current => dates.includes(current) ? current : (dates[dates.length - 1] ?? ''));
    }).catch(() => {
      if (!ignore) {
        setAttendanceSessionDates([]);
        setAttendanceDate('');
      }
    });
    return () => { ignore = true; };
  }, [selectedClass?.csId]);

  useEffect(() => {
    if (!attendanceDate) return;
    const [year, month] = attendanceDate.split('-').map(Number);
    if (year && month) setAttendanceCalendarMonth(new Date(year, month - 1, 1));
  }, [attendanceDate]);

  const attendanceSessionDateSet = useMemo(() => new Set(attendanceSessionDates), [attendanceSessionDates]);
  const attendanceCalendarCells = useMemo(() => {
    const year = attendanceCalendarMonth.getFullYear();
    const month = attendanceCalendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: dayCount }, (_, index) => `${year}-${pad(month + 1)}-${pad(index + 1)}`),
    ];
  }, [attendanceCalendarMonth]);

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
      setRevokedAnalyticsSessions([]);
      setAnalyticsAttendanceError(null);
      setAnalyticsAttendanceLoading(false);
      return;
    }
    let ignore = false;
    setAnalyticsAttendanceLoading(true);
    setAnalyticsAttendanceError(null);
    loadReportAnalyticsAttendance(Number(selectedClass.csId), analyticsAssessmentDates)
      .then(result => {
        if (!ignore) {
          setAnalyticsAttendanceRecords(result.records);
          setRevokedAnalyticsSessions(result.revokedSessions);
        }
      })
      .catch(requestError => {
        if (!ignore) {
          setAnalyticsAttendanceRecords([]);
          setRevokedAnalyticsSessions([]);
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
    if (grade === 5.0) return 'IRREGULAR REENROLLMENT';
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
  const [gradeSort, setGradeSort] = useState<SortState<'default' | 'name' | 'grade'>>({ key: 'default', dir: 'asc' });
  const [retentionSort, setRetentionSort] = useState<SortState<'default' | 'name' | 'grade'>>({ key: 'default', dir: 'asc' });

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClassId, reportTab, search, gradeSort]);

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

  // The export contains every filtered row and preserves the current table sort.
  const sortedStudentsInSubject = useMemo(() => {
    if (gradeSort.key === 'default') return studentsInSelectedSubject;
    const value = (student: any) => gradeSort.key === 'name' ? student.name : courseEvaluation(subjectForSelection(student)).overallGwa;
    return [...studentsInSelectedSubject].sort((a, b) => compareValues(value(a), value(b), gradeSort.dir));
  }, [studentsInSelectedSubject, gradeSort, selectedClassId, selectedSubjectCode]);

  const buildAcademicSummaryData = () => {
    if (!selectedClass) throw new Error('Select a class before exporting the Grades & Assessment Summary.');
    const values: FacultyAcademicSummaryValues[] = sortedStudentsInSubject.map(student => {
      const subj = subjectForSelection(student);
      const evaluation = courseEvaluation(subj);
      return {
        studentNumber: student.studentId,
        studentName: student.name,
        ...(isLectureLaboratoryMode ? {
          midtermLecture: formatComponentResult(evaluation.midtermComponents?.lecture, evaluation.midtermStatus),
          midtermLaboratory: formatComponentResult(evaluation.midtermComponents?.laboratory, evaluation.midtermStatus),
          finalsLecture: formatComponentResult(evaluation.finalComponents?.lecture, evaluation.finalStatus),
          finalsLaboratory: formatComponentResult(evaluation.finalComponents?.laboratory, evaluation.finalStatus),
        } : {}),
        midterm: formatPercent(evaluation.midtermPercentage),
        finals: formatPercent(evaluation.finalPercentage),
        grade: formatCourseGrade(evaluation),
        remarks: courseRemark(student, subj),
      };
    });
    const table = buildFacultyAcademicSummaryTable(isLectureLaboratoryMode, values);
    const courseLabel = `${selectedClass.courseCode}${selectedClass.courseName ? ` · ${selectedClass.courseName}` : ''}`;
    const term = selectedClass.semester && selectedClass.schoolYear
      ? termLine(String(selectedClass.semester), String(selectedClass.schoolYear))
      : `S.Y. ${selectedClass.schoolYear || selectedSchoolYear}`;
    return { ...table, courseLabel, section: selectedClass.csName, term };
  };

  const sortedFacultyStudents = retentionSort.key === 'default'
    ? facultyStudents
    : [...facultyStudents].sort((a, b) => compareValues(retentionSort.key === 'name' ? a.name : standingGwa(a), retentionSort.key === 'name' ? b.name : standingGwa(b), retentionSort.dir));

  const paginatedStudentsInSubject = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedStudentsInSubject.slice(start, start + pageSize);
  }, [sortedStudentsInSubject, currentPage, pageSize]);

  const totalPagesInSubject = Math.ceil(studentsInSelectedSubject.length / pageSize) || 1;

  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  const [academicSummaryPrint, setAcademicSummaryPrint] = useState<AcademicSummaryPrintSnapshot | null>(null);
  const handlePrint = () => {
    flushSync(() => setPrintedAt(new Date()));
    window.print();
  };

  // Academic export matches the selected table; Retention and Attendance keep their focused .xlsx exports.
  const [isExportingAcademic, setIsExportingAcademic] = useState(false);
  // Plain exports and prints name students `LAST, First Middle`, ordered by last name.
  const byLastName = <T extends Student>(list: T[]) => [...list].sort((a, b) => sheetName(a).localeCompare(sheetName(b)));
  const nameByNumber = (studentNumber: string | undefined, fallback: string) => {
    const found = students.find(s => s.studentId === studentNumber);
    return found ? sheetName(found) : fallback;
  };
  const attendanceByName = <T extends { studentNumber?: string; studentName?: string }>(list: T[]) =>
    [...list].sort((a, b) => nameByNumber(a.studentNumber, a.studentName ?? '').localeCompare(nameByNumber(b.studentNumber, b.studentName ?? '')));
  const handleExportExcel = async (type: 'academic' | 'retention' | 'attendance') => {
    if (type === 'academic') {
      setIsExportingAcademic(true);
      try {
        const table = buildAcademicSummaryData();
        const fileBase = `${selectedClass?.courseCode || 'Course'}_${selectedClass?.csName || 'Class'}_Grades_Assessment_Summary_${selectedClass?.schoolYear || selectedSchoolYear}_${selectedClass?.semester || ''}`
          .replace(/[^a-zA-Z0-9_.-]+/g, '_');
        await downloadXlsx(`${fileBase}.xlsx`, [buildFacultyAcademicSummarySheet({
          table,
          lectureLaboratory: isLectureLaboratoryMode,
          courseLabel: table.courseLabel,
          section: table.section,
          term: table.term,
          by: user?.display_name ?? '',
          generated: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        })]);
      } catch (err) {
        showFeedback(err instanceof Error ? err.message : 'Could not export the Grades & Assessment Summary.', 'error');
      } finally {
        setIsExportingAcademic(false);
      }
      return;
    }
    const by = user?.display_name ?? '';
    const term = selectedClass?.semester && selectedClass.schoolYear ? termLine(String(selectedClass.semester), String(selectedClass.schoolYear)) : '';
    if (type === 'retention') {
      const rows = byLastName(facultyStudents).map((student: any) => {
        const atRiskCourses = retentionUnavailable ? null : (student.enrolledSubjects || []).filter((sub: any) =>
          assignedSubjects.includes(sub.code)
          && retentionIsAtRisk(retentionForStudentSubject(student, sub))
        ).length;
        const gwa = standingGwa(student);
        return [student.studentId, sheetName(student), gwa !== null ? gwa : 'N/A', atRiskCourses ?? 'UNAVAILABLE', remedialStatusFor(student)];
      });
      await downloadXlsx('Retention_Report.xlsx', [buildReportSheet({
        sheet: 'Retention', title: 'RETENTION REPORT', filter: 'All assigned classes', term: selectedSchoolYear === 'all' ? 'All school years' : `AY ${selectedSchoolYear}`, by,
        columns: [{ header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Standing Grade', width: 15, format: '0.00' },
          { header: 'Remedial Courses', width: 17 }, { header: 'Remedial Status', width: 20 }],
        rows,
      })]);
      return;
    }
    const rows = attendanceByName(attendanceRecords).map(record => [
      dayToDate(String(record.date)) ?? record.date,
      record.studentNumber || '',
      nameByNumber(record.studentNumber, record.studentName || ''),
      selectedClass?.courseCode || '',
      String(record.status || 'not recorded').toUpperCase(),
    ]);
    await downloadXlsx(`Attendance_${selectedClass?.courseCode || 'Class'}_${attendanceDate}.xlsx`, [buildReportSheet({
      sheet: 'Attendance', title: 'ATTENDANCE REPORT', filter: selectedClass ? `${selectedClass.courseCode} · ${selectedClass.csName}` : '', term: `${term}${term ? ' · ' : ''}Session ${attendanceDate}`, by,
      columns: [{ header: 'Date', width: 14 }, { header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Course Code', width: 14 }, { header: 'Status', width: 14 }],
      rows,
    })]);
  };

  // X31 / X32: the attendance sheet (one class, whole term) and the remedial summary; Excel and PDF share one table.
  const [sheetPrint, setSheetPrint] = useState<{ table: AttendanceSheetTable | RemedialSummaryTable; leftColumns: number } | null>(null);
  const exportSheet = async (kind: 'attendance' | 'remedial', mode: 'excel' | 'pdf') => {
    try {
      let table: AttendanceSheetTable | RemedialSummaryTable;
      if (kind === 'attendance') {
        table = buildAttendanceSheetTable((await getFacultyAttendanceSheetApi(Number(selectedClassId))).sheet);
      } else {
        table = buildRemedialSummaryTable({
          schoolYear: selectedSchoolYear === 'all' ? 'All school years' : selectedSchoolYear,
          filter: 'All assigned classes',
          rows: retentionRecords
            .filter(record => selectedSchoolYear === 'all' || !record.schoolYear || record.schoolYear === selectedSchoolYear)
            .map(record => ({
              studentNumber: record.studentNumber,
              studentName: nameByNumber(record.studentNumber ?? undefined, record.studentName ?? ''),
              courseCode: record.subjectCode,
              section: record.className,
              finalGrade: record.gwa,
              state: record.state,
              progression: record.remedialProgression,
            })),
        });
      }
      if (mode === 'excel') {
        await downloadXlsx(table.fileName, [buildReportSheet({
          sheet: kind === 'attendance' ? 'Attendance Sheet' : 'Remedial Summary', title: table.title, filter: table.filter, term: table.term,
          by: user?.display_name ?? '', columns: table.columns, rows: table.rows,
        })]);
        return;
      }
      const restoreAfterPrint = () => {
        setSheetPrint(null);
        window.removeEventListener('afterprint', restoreAfterPrint);
      };
      window.addEventListener('afterprint', restoreAfterPrint);
      flushSync(() => {
        setPrintedAt(new Date());
        setSheetPrint({ table, leftColumns: kind === 'attendance' ? 2 : 4 });
      });
      window.print();
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Could not export the report.', 'error');
    }
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

  // Recharts Stats: Assessment Success Rates.
  const buildAssessmentStatsData = (attendanceRows: FacultyAttendanceWorksheetRosterItem[], revokedSessions: string[] = []) => {
    const revokedKeys = new Set(revokedSessions);
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
          const revoked = linked && revokedKeys.has(`${ass.attendanceSessionDate}|${ass.attendanceSessionCode}`);
          const attendance = ass.transmutationEnabled && linked
            ? attendanceRows.find(record => record.studentId === score.studentId
              && record.date === ass.attendanceSessionDate
              && record.sessionCode === ass.attendanceSessionCode)
            : undefined;
          return effectiveAssessmentPercentage(score.score, ass.maxScore, ass, !linked || revoked ? 'unlinked' : attendance?.status);
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
  const assessmentStatsData = analyticsAttendanceLoading ? [] : buildAssessmentStatsData(analyticsAttendanceRecords, revokedAnalyticsSessions);

  const handlePrintAcademicSummary = () => {
    if (!selectedClass) {
      showFeedback('Select a class before exporting the Grades & Assessment Summary.', 'info');
      return;
    }
    try {
      const table = buildAcademicSummaryData();
      const restoreAfterPrint = () => {
        setAcademicSummaryPrint(null);
        window.removeEventListener('afterprint', restoreAfterPrint);
      };
      window.addEventListener('afterprint', restoreAfterPrint);
      flushSync(() => {
        setPrintedAt(new Date());
        setAcademicSummaryPrint({
          courseLabel: table.courseLabel,
          section: table.section,
          term: table.term,
          faculty: user?.display_name ?? '',
          lectureLaboratory: isLectureLaboratoryMode,
          columns: table.columns.map(column => column.header),
          rows: table.rows.map(row => row.map(value => value == null ? '—' : String(value))),
        });
      });
      try {
        window.print();
      } catch (err) {
        restoreAfterPrint();
        throw err;
      }
    } catch (err) {
      showFeedback(err instanceof Error ? err.message : 'Could not prepare the Grades & Assessment Summary PDF.', 'error');
    }
  };
  // Shared by the phone blocks and the wider-screen table of the Grades & Assessments summary.
  const renderCourseGrade = (evaluation: ReturnType<typeof courseEvaluation>) => (
    evaluation.overallGwa !== null ? <GradeValue percentage={evaluation.overallPercentage} grade={evaluation.overallGwa} lecture={selectedGradingConfiguration?.componentMode === 'lecture' && selectedGradingConfiguration.termRatio && evaluation.midtermPercentage !== null && evaluation.finalPercentage !== null ? { midterm: evaluation.midtermPercentage, final: evaluation.finalPercentage, midtermShare: Number(selectedGradingConfiguration.termRatio.midterm), finalShare: Number(selectedGradingConfiguration.termRatio.final) } : null}>{formatCourseGrade(evaluation)}</GradeValue> : formatCourseGrade(evaluation)
  );
  const renderRemark = (remark: string) => (
    <span className={`inline-flex whitespace-nowrap px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
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
  );

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
            <option value="all">All school years</option>
            {availableSchoolYears.map(sy => (
              <option key={sy} value={sy}>
                {formatSchoolYear(sy)}{sy === currentSchoolYear ? ' (Current)' : ''}
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
      <Tabs
        variant="section"
        color="clinical"
        label="Report sections"
        value={reportTab}
        onChange={setReportTab}
        className="no-print"
        tabs={[
          { id: 'academic', label: 'Grades & Assessments', shortLabel: 'Grades', icon: <GraduationCap className="w-4 h-4" /> },
          { id: 'retention', label: 'Retention & Remedials', shortLabel: 'Retention', icon: <AlertTriangle className="w-4 h-4" /> },
          { id: 'attendance', label: 'Attendance Registers', shortLabel: 'Attendance', icon: <CalendarDays className="w-4 h-4" /> },
          { id: 'analytics', label: 'Interactive Analytics', shortLabel: 'Analytics', icon: <TrendingUp className="w-4 h-4" /> },
        ]}
      />

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
                title="Export the selected grade summary table as an Excel workbook"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{isExportingAcademic ? 'Exporting…' : 'Export Excel'}</span>
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-800 mx-0.5" />
              <button
                type="button"
                onClick={handlePrintAcademicSummary}
                disabled={!selectedClass}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                title="Print the selected grade summary table as a PDF"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          {/* Phones: one block per student (name first, then the grade fields) instead of a clipped table. */}
          <ul className="md:hidden max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
            {paginatedStudentsInSubject.length === 0 ? (
              <li className="px-6 py-14 text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No student records found for the selected course and class section.</h3></li>
            ) : (
              paginatedStudentsInSubject.map((student) => {
                const subj = subjectForSelection(student);
                const evaluation = courseEvaluation(subj);
                const fields: [string, React.ReactNode][] = [
                  ...(isLectureLaboratoryMode ? [
                    ['Midterm Lecture', formatComponentResult(evaluation.midtermComponents?.lecture, evaluation.midtermStatus)],
                    ['Midterm Laboratory', formatComponentResult(evaluation.midtermComponents?.laboratory, evaluation.midtermStatus)],
                  ] as [string, React.ReactNode][] : []),
                  ['Midterm', formatPercent(evaluation.midtermPercentage)],
                  ...(isLectureLaboratoryMode ? [
                    ['Finals Lecture', formatComponentResult(evaluation.finalComponents?.lecture, evaluation.finalStatus)],
                    ['Finals Laboratory', formatComponentResult(evaluation.finalComponents?.laboratory, evaluation.finalStatus)],
                  ] as [string, React.ReactNode][] : []),
                  [isLectureLaboratoryMode ? 'Finals' : 'Final', formatPercent(evaluation.finalPercentage)],
                ];
                return (
                  <li key={student.id} className="px-5 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{student.name}</div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{student.studentId}</span>
                      </div>
                      <span className="shrink-0 text-right">{renderRemark(courseRemark(student, subj))}</span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2">
                      {fields.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
                          <dd className="font-mono text-slate-700 dark:text-slate-200">{value}</dd>
                        </div>
                      ))}
                      <div className="min-w-0">
                        <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Grade</dt>
                        <dd className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{renderCourseGrade(evaluation)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })
            )}
          </ul>

          <div className="table-pin table-pin-first hidden md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3" aria-sort={ariaSort(gradeSort, 'name')}><SortableHeader label="Student Details" sortKey="name" sort={gradeSort} onSort={setGradeSort} /></th>
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Midterm Lecture</th>}
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Midterm Laboratory</th>}
                  <th className="px-5 py-3 text-center">Midterm</th>
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Finals Lecture</th>}
                  {isLectureLaboratoryMode && <th className="px-5 py-3 text-center">Finals Laboratory</th>}
                  <th className="px-5 py-3 text-center">{isLectureLaboratoryMode ? 'Finals' : 'Final'}</th>
                  <th className="px-5 py-3 text-center" aria-sort={ariaSort(gradeSort, 'grade')}><SortableHeader label="Grade" sortKey="grade" sort={gradeSort} onSort={setGradeSort} /></th>
                  <th className="px-5 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {paginatedStudentsInSubject.length === 0 ? (
                  <tr>
                    <td colSpan={isLectureLaboratoryMode ? 9 : 5} className="px-6 py-14 text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No student records found for the selected course and class section.</h3></td>
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
                          {renderCourseGrade(evaluation)}
                        </td>
                        <td className="px-5 py-3.5">
                          {renderRemark(remark)}
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
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, studentsInSelectedSubject.length)} of {studentsInSelectedSubject.length} records
              </span>
              <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="whitespace-nowrap px-3 py-1.5 font-bold text-slate-700 dark:text-slate-200">
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
            <ExportPair
              excelItems={[
                { label: 'Retention list', onSelect: () => handleExportExcel('retention') },
                { label: 'Remedial summary', onSelect: () => exportSheet('remedial', 'excel'), disabledReason: retentionUnavailable ? 'Retention data is not available yet' : undefined },
              ]}
              pdfItems={[
                { label: 'Retention list', onSelect: handlePrint },
                { label: 'Remedial summary', onSelect: () => exportSheet('remedial', 'pdf'), disabledReason: retentionUnavailable ? 'Retention data is not available yet' : undefined },
              ]}
            />
          </div>

          <div className="table-pin table-pin-first">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3" aria-sort={ariaSort(retentionSort, 'name')}><SortableHeader label="Student Details" sortKey="name" sort={retentionSort} onSort={setRetentionSort} /></th>
                  <th className="px-5 py-3 text-center" aria-sort={ariaSort(retentionSort, 'grade')}><SortableHeader label="Standing Grade" sortKey="grade" sort={retentionSort} onSort={setRetentionSort} /></th>
                  <th className="px-5 py-3 text-center">Remedial Courses</th>
                  <th className="px-5 py-3">Remedial Program Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {sortedFacultyStudents.map((student: any) => {
                  const warnings = retentionUnavailable ? [] : (student.enrolledSubjects || []).filter((sub: any) =>
                    assignedSubjects.includes(sub.code)
                    && retentionIsAtRisk(retentionForStudentSubject(student, sub))
                  );
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
        <Card className="relative z-20 p-0 overflow-visible no-print">
          <div className="px-5 py-4 border-b dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 flex flex-wrap gap-2 justify-between items-center">
            <div className="flex-1 basis-40">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Authoritative Attendance Register</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{selectedClass?.courseCode || 'Class unavailable'} · {formatShortDate(attendanceDate)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={attendanceCalendarOpen}
                  aria-label={attendanceDate ? `Attendance date ${formatShortDate(attendanceDate)}` : 'Choose attendance session date'}
                  disabled={attendanceSessionDates.length === 0}
                  onClick={() => setAttendanceCalendarOpen(open => !open)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                >
                  <CalendarDays className="h-4 w-4 text-clinical-600 dark:text-clinical-400" />
                  {attendanceDate ? formatShortDate(attendanceDate) : 'No sessions'}
                </button>
                {attendanceCalendarOpen && attendanceSessionDates.length > 0 && (
                  <div role="dialog" aria-label="Select attendance session date" className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between">
                      <button type="button" aria-label="Previous month" onClick={() => setAttendanceCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                      <button type="button" aria-label="Next month" onClick={() => setAttendanceCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase text-slate-400" aria-hidden="true">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="py-1">{day}</span>)}
                    </div>
                    <div role="grid" aria-label={attendanceCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} className="grid grid-cols-7 gap-y-1">
                      {attendanceCalendarCells.map((date, index) => {
                        if (!date) return <span key={`empty-${index}`} aria-hidden="true" />;
                        const available = attendanceSessionDateSet.has(date);
                        const selected = date === attendanceDate;
                        return (
                          <button
                            key={date}
                            type="button"
                            role="gridcell"
                            aria-label={`${Number(date.slice(-2))}${available ? ', attendance session available' : ', no attendance session'}`}
                            aria-pressed={selected}
                            disabled={!available}
                            onClick={() => { setAttendanceDate(date); setAttendanceCalendarOpen(false); }}
                            className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs ${selected ? 'bg-emerald-700 font-bold text-white' : available ? 'font-semibold text-slate-700 hover:bg-emerald-50 dark:text-slate-200 dark:hover:bg-emerald-950/50' : 'cursor-not-allowed text-slate-300 dark:text-slate-700'}`}
                          >
                            {Number(date.slice(-2))}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">Only dates with attendance sessions can be selected.</p>
                  </div>
                )}
              </div>
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
              <ExportPair
                excelItems={[
                  { label: 'Attendance register', onSelect: () => handleExportExcel('attendance'), disabledReason: attendanceRecords.length === 0 ? 'No attendance records to export' : undefined },
                  { label: 'Attendance sheet', onSelect: () => exportSheet('attendance', 'excel'), disabledReason: !selectedClassId ? 'Select one class first' : undefined },
                ]}
                pdfItems={[
                  { label: 'Attendance register', onSelect: handlePrint, disabledReason: attendanceRecords.length === 0 ? 'No attendance records to export' : undefined },
                  { label: 'Attendance sheet', onSelect: () => exportSheet('attendance', 'pdf'), disabledReason: !selectedClassId ? 'Select one class first' : undefined },
                ]}
              />
            </div>
          </div>

          <div className="table-pin table-pin-first">
            {attendanceError && (
              <div className="m-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{attendanceError}</span>
              </div>
            )}
            {attendanceLoading && <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading persisted attendance records…</div>}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Student Details</th>
                  <th className="px-5 py-3">Subject Code</th>
                  <th className="px-5 py-3">Recorded Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-xs font-medium">
                {!attendanceLoading && attendanceRecords.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-14 text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No persisted attendance records for this class and date.</h3></td></tr>
                ) : attendanceRecords.map(record => {
                    return (
                      <tr key={record.enrollmentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3 font-mono">{formatShortDate(record.date)}</td>
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
                retentionLoading ? <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading authoritative retention data…</div> : <div className="text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">Retention distribution unavailable.</h3></div>
              ) : pieData.length === 0 ? (
                <div className="text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No retention distribution data available.</h3></div>
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
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4">Students per course grade band in the selected section; grades 2.5–4.9 are eligible for remedial attempts</p>
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
                <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading authoritative attendance records…</div>
              ) : analyticsAttendanceError ? (
                <div className="text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">Assessment attendance data is unavailable.</h3></div>
              ) : assessmentStatsData.length === 0 ? (
                <div className="text-center"><Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">No assessment grades recorded yet.</h3></div>
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
        if (sheetPrint) {
          return <PrintExportTable table={sheetPrint.table} leftColumns={sheetPrint.leftColumns} generated={formatPrintedAt(printedAt ?? new Date())} faculty={user?.display_name} />;
        }
        if (academicSummaryPrint && selectedClass) {
          const generated = formatPrintedAt(printedAt ?? new Date());
          const widths = academicSummaryPrint.lectureLaboratory
            ? [9, 19, 8.5, 8.5, 7.5, 8.5, 8.5, 7.5, 10, 12.5]
            : [13, 30, 12, 12, 14, 19];
          return (
            <div className="print-only hidden bg-white text-slate-900 font-sans ps">
              <PrintStyle title="Class Grade Ledger Report" running={`Class Grade Ledger Report | ${academicSummaryPrint.courseLabel} | ${academicSummaryPrint.section}`} generated={generated} />
              <PrintHeader
                title="Class Grade Ledger Report"
                sub={academicSummaryPrint.courseLabel}
                rows={[
                  ['Section', academicSummaryPrint.section],
                  ['Term', academicSummaryPrint.term],
                  ['Faculty', academicSummaryPrint.faculty],
                  ['Students', String(academicSummaryPrint.rows.length)],
                  ['Date', generated],
                ]}
              />
              <table>
                <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
                {academicSummaryPrint.lectureLaboratory ? (
                  <thead>
                    <tr>
                      <th className="l" rowSpan={2}>Student No.</th>
                      <th className="l" rowSpan={2}>Student Name</th>
                      <th className="band" scope="colgroup" colSpan={3}>Midterm</th>
                      <th className="band" scope="colgroup" colSpan={3}>Finals</th>
                      <th rowSpan={2}>Final Grade</th>
                      <th className="l" rowSpan={2}>Remarks</th>
                    </tr>
                    <tr>
                      <th scope="col">Lecture %</th>
                      <th scope="col">Laboratory %</th>
                      <th scope="col">Midterm %</th>
                      <th scope="col">Lecture %</th>
                      <th scope="col">Laboratory %</th>
                      <th scope="col">Finals %</th>
                    </tr>
                  </thead>
                ) : (
                  <thead><tr>{academicSummaryPrint.columns.map((column, index) => <th key={`${column}-${index}`} className={index < 2 || column === 'Remarks' ? 'l' : ''}>{column}</th>)}</tr></thead>
                )}
                <tbody>
                  {academicSummaryPrint.rows.length === 0 ? (
                    <tr><td colSpan={academicSummaryPrint.columns.length} className="l">No matching student grade summaries found.</td></tr>
                  ) : academicSummaryPrint.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={columnIndex} className={columnIndex < 2 || academicSummaryPrint.columns[columnIndex] === 'Remarks' ? 'l' : ''}>{value}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <PrintSignatures faculty={academicSummaryPrint.faculty} seal />
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
        const academicRows = reportTab === 'academic' ? byLastName(studentsInSelectedSubject).map((student: any) => {
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
                <td className="nm">{sheetName(r.student)}</td>
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
            {reportTab === 'retention' && byLastName(facultyStudents).map((student: any) => {
              const gwa = standingGwa(student);
              const gwaText = gwa !== null ? gwa.toFixed(2) : '—';
              const status = retentionUnavailable ? 'Unavailable'
                : student.status === 'irregular_reenrollment' ? 'Irregular reenrollment' : student.status;
              const remedial = remedialStatusFor(student);
              return (
                <tr key={student.id}>
                  <td className="id">{student.studentId}</td>
                  <td className="nm">{sheetName(student)}</td>
                  <td className={printCellClass(gwaText)}>{gwaText}</td>
                  <td className={`cap ${printCellClass(status)}`}>{status}</td>
                  <td className={`l ${printCellClass(remedial)}`}>{remedial}</td>
                </tr>
              );
            })}
            {reportTab === 'attendance' && attendanceByName(attendanceRecords).map(record => (
              <tr key={record.enrollmentId}>
                <td className="id">{record.date}</td>
                <td className="id">{record.studentNumber || '—'}</td>
                <td className="nm">{nameByNumber(record.studentNumber, record.studentName || 'Student name unavailable')}</td>
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
