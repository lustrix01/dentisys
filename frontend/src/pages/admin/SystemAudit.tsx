import React, { useMemo, useState } from 'react';
import {
  Printer,
  Download,
  Users,
  ShieldAlert,
  CalendarDays,
  Filter,
  Search,
  ArrowLeft,
  GraduationCap,
  ChevronRight,
  Archive,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { recordAudit } from '../../services/auditService';
import { formatGrade } from '../../utils/gradeHelper';
import { downloadXlsx } from '../../utils/xlsxDownload';
import { buildReportSheet, dayToDate } from '../../utils/reportWorkbook';
import { STANDING_LABELS, classStanding, pageStanding } from './deanStanding';

type ReportTab = 'students' | 'retention' | 'attendance';

import { getAdminReportsSummaryApi, getAdminSettingsApi, revokeStudentBiometricApi } from '../../services/apiClient';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { SchoolYearFilter } from '../../components/SchoolYearFilter';
import GradeValue from '../../components/GradeValue';
import { flushSync } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { PrintStyle, PrintHeader, PrintCaption, PrintSignatures, formatPrintedAt, printCellClass } from '../../components/PrintSheet';

export const DeanReports: React.FC = () => {
  const { user } = useAuth();
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  const [retentionThreshold, setRetentionThreshold] = useState(2.5);
  // Flags by comparing the recorded grade to the threshold (Owner ruling 2026-10-22).
  const failsRetention = (sub: any): boolean =>
    sub.grade !== null && sub.grade !== undefined && Number(sub.grade) >= retentionThreshold;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbStudents, setDbStudents] = useState<any[]>([]);
  const [dbAttendance, setDbAttendance] = useState<any[]>([]);
  const [schoolYear, setSchoolYear] = useState('current');
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeNotice, setRevokeNotice] = useState('');
  const [currentSchoolYear, setCurrentSchoolYear] = useState<string | null>(null);
  const [availableSchoolYears, setAvailableSchoolYears] = useState<string[]>([]);

  const fetchReportData = () => {
    setLoading(true);
    setError('');
    getAdminReportsSummaryApi(schoolYear)
      .then((res) => {
        setDbStudents((res.reports?.students ?? []).map((s: any) => ({ ...s, status: classStanding(s) })));
        setDbAttendance(res.reports?.attendance ?? []);
        setCurrentSchoolYear(res.currentSchoolYear ?? null);
        setAvailableSchoolYears(res.availableSchoolYears ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch report summary from server.');
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear]);

  React.useEffect(() => {
    getAdminSettingsApi()
      .then((res) => {
        if (typeof res.settings?.retentionThreshold === 'number') {
          setRetentionThreshold(res.settings.retentionThreshold);
        }
      })
      .catch(() => undefined);
  }, []);

  const students = dbStudents;
  const attendanceRecords = dbAttendance;


  const [activeTab, setActiveTab] = useState<ReportTab>('students');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classSectionTab, setClassSectionTab] = useState<'active' | 'archived'>('active');
  const [classSearch, setClassSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const uniqueClasses = useMemo(() => Array.from(new Set(students.map((s: any) => s.classId).filter(Boolean))), [students]);

  // Aggregate student records into distinct class representations
  const classCardsData = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      yearLevel: number | null;
      subjectCode?: string;
      subjectName?: string;
      instructorName?: string | null;
      finished?: boolean;
      students: any[];
      isArchived: boolean;
      activeCount: number;
      noGradeCount: number;
      remedialCount: number;
    }>();

    students.forEach((s: any) => {
      const clsId = s.classId || 'unassigned';
      const clsName = s.className || (clsId === 'unassigned' ? 'Unassigned' : `Class ${clsId}`);
      if (!map.has(clsId)) {
        const isPastSy = schoolYear !== 'current' && currentSchoolYear ? schoolYear < currentSchoolYear : false;
        const isArchived = Boolean(
          s.classStatus?.toLowerCase() === 'archived' ||
          s.status?.toLowerCase() === 'archived' ||
          s.isArchived ||
          isPastSy
        );
        const subj = s.enrolledSubjects?.[0];
        map.set(clsId, {
          id: clsId,
          name: clsName,
          yearLevel: s.yearLevel ?? null,
          subjectCode: subj?.code,
          subjectName: subj?.name,
          instructorName: s.instructorName ?? null,
          finished: Boolean(s.classFinished),
          students: [],
          isArchived,
          activeCount: 0,
          noGradeCount: 0,
          remedialCount: 0,
        });
      }
      const item = map.get(clsId)!;
      item.students.push(s);
      if (s.yearLevel && !item.yearLevel) item.yearLevel = s.yearLevel;
      const st = String(s.status || '');
      if (st === 'active' || st === 'cleared') item.activeCount++;
      else if (st === 'noGrade') item.noGradeCount++;
      else if (st === 'remedial') item.remedialCount++;
    });

    return Array.from(map.values());
  }, [students, schoolYear, currentSchoolYear]);

  const activeClasses = useMemo(() => {
    return classCardsData.filter(c => !c.isArchived);
  }, [classCardsData]);

  const archivedClasses = useMemo(() => {
    return classCardsData.filter(c => c.isArchived);
  }, [classCardsData]);

  const displayedClassCards = useMemo(() => {
    const list = classSectionTab === 'active' ? activeClasses : archivedClasses;
    if (!classSearch.trim()) return list;
    const q = classSearch.toLowerCase();
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.subjectCode && c.subjectCode.toLowerCase().includes(q)) ||
      (c.subjectName && c.subjectName.toLowerCase().includes(q))
    );
  }, [classSectionTab, activeClasses, archivedClasses, classSearch]);

  const currentSelectedClass = useMemo(() => {
    if (!selectedClassId) return null;
    return classCardsData.find(c => c.id === selectedClassId) || null;
  }, [classCardsData, selectedClassId]);

  // Reset drill-down and filter inputs when switching main tabs
  React.useEffect(() => {
    setSelectedClassId(null);
    setClassFilter('all');
    setSearch('');
    setStatusFilter('all');
    setCurrentPage(1);
  }, [activeTab]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [classFilter, selectedClassId, statusFilter, search, activeTab]);

  // ── Filtered students ────────────────────────────────────
  const filtered = useMemo(() => {
    return students.filter((s: any) => {
      const targetClass = selectedClassId ? selectedClassId : classFilter;
      const matchClass = targetClass === 'all' || (s.classId || 'unassigned') === targetClass;
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchSearch = !search
        || s.name.toLowerCase().includes(search.toLowerCase())
        || s.studentId.toLowerCase().includes(search.toLowerCase());
      return matchClass && matchStatus && matchSearch;
    });
  }, [students, classFilter, selectedClassId, statusFilter, search]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  // Attendance statistics per class section
  const classAttendanceMap = useMemo(() => {
    const map = new Map<string, { total: number; present: number; rate: number }>();
    classCardsData.forEach(c => {
      const clsStudents = c.students;
      const recs = attendanceRecords.filter(r => clsStudents.some(s => s.id === r.studentId));
      const total = recs.length;
      const present = recs.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      map.set(c.id, { total, present, rate });
    });
    return map;
  }, [classCardsData, attendanceRecords]);

  // Attendance tab: per-class summary and the history rows, shared by the screen and the PDF.
  const classSummaries = Array.from(new Set(filtered.map(s => s.classId).filter(Boolean))).map(cls => {
    const clsStudents = filtered.filter(s => s.classId === cls);
    const recs = attendanceRecords.filter(r => clsStudents.some(s => s.id === r.studentId));
    const total = recs.length;
    const present = recs.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
    return { cls, count: clsStudents.length, name: clsStudents[0]?.className || cls, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  });

  const historyRows = useMemo(() => {
    const filteredIds = new Set(filtered.map(s => s.id));
    return attendanceRecords
      .filter(r => filteredIds.has(r.studentId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered, attendanceRecords]);

  const classAttendanceRecords = useMemo(() => {
    if (!selectedClassId) return [];
    const clsStudents = currentSelectedClass?.students || [];
    const studentIdSet = new Set(clsStudents.map(s => s.id));
    return attendanceRecords.filter(r => studentIdSet.has(r.studentId));
  }, [selectedClassId, currentSelectedClass, attendanceRecords]);

  const filteredAttendanceRows = useMemo(() => {
    let rows = selectedClassId ? classAttendanceRecords : historyRows;
    if (statusFilter !== 'all') {
      rows = rows.filter(r => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => {
        const s = students.find(st => st.id === r.studentId);
        return (
          r.date.includes(q) ||
          r.subjectCode.toLowerCase().includes(q) ||
          (s?.name && s.name.toLowerCase().includes(q)) ||
          (s?.studentId && s.studentId.toLowerCase().includes(q))
        );
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedClassId, classAttendanceRecords, historyRows, statusFilter, search, students]);

  const paginatedAttendance = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAttendanceRows.slice(start, start + pageSize);
  }, [filteredAttendanceRows, currentPage, pageSize]);

  const totalAttendancePages = Math.ceil(filteredAttendanceRows.length / pageSize) || 1;

  // ── Excel export ─────────────────────────────────────────
  const handleExportExcel = async () => {
    recordAudit({ action: 'Exported report', module: 'Reports & Analytics', description: `Exported ${activeTab} report data as Excel.`, status: 'Success' });
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19).replace(/[: ]/g, '-');
    const term = schoolYear === 'all' ? 'All school years' : `AY ${schoolYear === 'current' ? (currentSchoolYear ?? '') : schoolYear}`;
    const filter = currentSelectedClass?.name ? `Class: ${currentSelectedClass.name}` : 'All classes';
    const gradeOf = (s: any) => {
      const sub = s.enrolledSubjects?.find((item: any) => item.code === currentSelectedClass?.subjectCode) || s.enrolledSubjects?.[0];
      const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
      return gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? formatGrade(Number(gradeVal)) : 'N/A';
    };
    const base = { filter, term, by: user?.display_name ?? '' };
    let fileName: string;
    let sheet;

    if (activeTab === 'students') {
      fileName = `Student_Summary_${ts}.xlsx`;
      sheet = buildReportSheet({
        ...base, sheet: 'Students', title: 'STUDENT SUMMARY',
        columns: [{ header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Class', width: 24 }, { header: 'Year Level', width: 11 },
          { header: 'Grade', width: 9 }, { header: 'Status', width: 12 }, { header: 'Face Enrolled', width: 14 }],
        rows: filtered.map(s => [s.studentId, s.name, s.className || '—', s.yearLevel, gradeOf(s), STANDING_LABELS[s.status] ?? s.status, s.faceEnrolled ? 'Yes' : 'No']),
      });
    } else if (activeTab === 'retention') {
      fileName = `Retention_Report_${ts}.xlsx`;
      sheet = buildReportSheet({
        ...base, sheet: 'Retention', title: 'RETENTION REPORT',
        columns: [{ header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Class', width: 24 },
          { header: 'Grade', width: 9 }, { header: 'Status', width: 12 }, { header: 'Pending Remedials', width: 18 }],
        rows: filtered.map((s: any) => [s.studentId, s.name, s.className || '—', gradeOf(s), STANDING_LABELS[s.status] ?? s.status,
          Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0]),
      });
    } else {
      fileName = `Attendance_Report_${ts}.xlsx`;
      const relevantRows = selectedClassId ? filteredAttendanceRows : (historyRows.length > 0 ? historyRows : attendanceRecords);
      sheet = buildReportSheet({
        ...base, sheet: 'Attendance', title: 'ATTENDANCE REPORT',
        columns: [{ header: 'Student Number', width: 16 }, { header: 'Student Name', width: 32 }, { header: 'Class', width: 24 },
          { header: 'Course Code', width: 14 }, { header: 'Date', width: 14 }, { header: 'Status', width: 12 }],
        rows: relevantRows.map(r => {
          const s = students.find(st => st.id === r.studentId);
          return [s?.studentId || '-', s?.name || '-', r.className || currentSelectedClass?.name || '—', r.subjectCode, dayToDate(String(r.date)) ?? r.date, r.status];
        }),
      });
    }
    await downloadXlsx(fileName, [sheet]);
  };

  const handlePrint = () => {
    recordAudit({ action: 'Generated report PDF', module: 'Reports & Analytics', description: `Opened ${activeTab} report for PDF printing.`, status: 'Success' });
    flushSync(() => setPrintedAt(new Date()));
    window.print();
  };

  // ── Status badge ─────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
      warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
      critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
      remedial: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
      cleared: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
      noGrade: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    };
    return (
      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${map[status] || 'bg-slate-100 text-slate-500'}`}>
        {STANDING_LABELS[status] ?? status}
      </span>
    );
  };

  const exportPrintControls = (
    <div className="no-print inline-flex flex-shrink-0 items-center rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={handleExportExcel}
        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
      >
        <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span>Export Excel</span>
      </button>
      <div className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-800" />
      <button
        type="button"
        onClick={handlePrint}
        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-slate-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
      >
        <Printer className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        <span>Print PDF</span>
      </button>
    </div>
  );

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'students', label: 'Student Summaries', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'retention', label: 'Retention Reports', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'Attendance Reports', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-1 sm:px-2 animate-fade-in">
      {/* Tab Navigation */}
      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm no-print overflow-x-auto gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[125px] sm:min-w-[140px] py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {revokeNotice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 no-print">{revokeNotice}</div>
      )}
      <Modal isOpen={revokeTarget !== null} onClose={() => setRevokeTarget(null)} title="Revoke biometric enrollment">
        <form
          className="space-y-4 text-xs"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!revokeTarget) return;
            const reason = revokeReason.trim();
            if (reason.length < 8) {
              setRevokeError('Give a reason of at least 8 characters.');
              return;
            }
            setRevoking(true);
            setRevokeError('');
            try {
              const response = await revokeStudentBiometricApi(revokeTarget.id, reason);
              setRevokeNotice(`${revokeTarget.name}: ${response.message}`);
              showFeedback(`${revokeTarget.name}: ${response.message}`, 'success');
              setRevokeTarget(null);
              fetchReportData();
            } catch (err) {
              setRevokeError(err instanceof Error ? err.message : 'Unable to revoke the biometric enrollment.');
            } finally {
              setRevoking(false);
            }
          }}
        >
          <p className="text-slate-600 dark:text-slate-300">
            This deletes <strong>{revokeTarget?.name}</strong>'s facial reference. The Student is notified and must re-enroll to use face check-in; manual attendance stays available and recorded attendance is kept.
          </p>
          <label className="block font-bold text-slate-700 dark:text-slate-300">
            Reason
            <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} maxLength={240} rows={3} required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-900" />
          </label>
          {revokeError && <p role="alert" className="text-rose-600">{revokeError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRevokeTarget(null)} className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={revoking} className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-700 disabled:opacity-50">{revoking ? 'Revoking…' : 'Revoke enrollment'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Printable Report Area ──────────────────────────── */}
      <div className="no-print">
        {/* ── STUDENT SUMMARIES: CLASS CARDS OVERVIEW ──────── */}
        {activeTab === 'students' && selectedClassId === null && (
          <div className="space-y-4">
            {/* Class Section Filter Bar */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-full sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setClassSectionTab('active')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'active'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Active Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-accent-100 dark:bg-accent-950/50 text-accent-700 dark:text-accent-300">
                    {activeClasses.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setClassSectionTab('archived')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'archived'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archived Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {archivedClasses.length}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search classes..."
                    value={classSearch}
                    onChange={e => setClassSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-56"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <SchoolYearFilter
                    value={schoolYear}
                    currentSchoolYear={currentSchoolYear}
                    availableSchoolYears={availableSchoolYears}
                    onChange={value => { setSchoolYear(value); setSelectedClassId(null); setClassFilter('all'); }}
                  />
                </div>
                <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                {exportPrintControls}
              </div>
            </div>

            {/* Overall Student Summaries Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 no-print">
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Enrolled</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-accent-600 dark:text-accent-400">{students.length}</p>
              </Card>
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Classes</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-slate-700 dark:text-slate-200">{activeClasses.length}</p>
              </Card>
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Good Standing</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {students.filter((s: any) => pageStanding(s) === 'active').length}
                </p>
              </Card>
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Remedial</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-violet-600 dark:text-violet-400">
                  {students.filter((s: any) => s.status === 'remedial').length}
                </p>
              </Card>
            </div>

            {/* Class Cards Grid */}
            {displayedClassCards.length === 0 ? (
              <Card className="p-8 sm:p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400 mb-3">
                  {classSectionTab === 'archived' ? <Archive className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {classSectionTab === 'archived' ? 'No Archived Classes' : 'No Active Classes Found'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {classSearch
                    ? 'No classes match your search query. Try clearing the search filter.'
                    : classSectionTab === 'archived'
                    ? 'There are no archived classes recorded for this school year.'
                    : 'No active classes available for the selected school year.'}
                </p>
              </Card>
            ) : (
              <div className={`grid ${displayedClassCards.length === 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-3.5 sm:gap-4`}>
                {displayedClassCards.map(cls => (
                  <div
                    key={cls.id}
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setClassFilter(cls.id);
                    }}
                    className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 hover:shadow-lg hover:border-accent-400 dark:hover:border-accent-600 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-500 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity" />

                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400 flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
                            <GraduationCap className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-sm font-heading text-slate-800 dark:text-slate-100 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                              {cls.name}
                            </h3>
                            {cls.yearLevel && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500">
                                Year {cls.yearLevel}
                              </span>
                            )}
                          </div>
                        </div>
                        {cls.finished && !cls.isArchived && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Finished
                          </span>
                        )}
                        {cls.isArchived && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                            Archived
                          </span>
                        )}
                      </div>

                      {(cls.subjectCode || cls.subjectName) && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{cls.subjectCode}</span>
                          {cls.subjectName && <span> · {cls.subjectName}</span>}
                        </div>
                      )}
                      {cls.instructorName && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{cls.instructorName}</div>}

                      <div className="mt-4 flex flex-wrap gap-1.5 items-center">
                        {cls.activeCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                            {cls.activeCount} Good Standing
                          </span>
                        )}
                        {cls.noGradeCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {cls.noGradeCount} No Grade Yet
                          </span>
                        )}
                        {cls.remedialCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400">
                            {cls.remedialCount} Remedial
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-accent-500" />
                        {cls.students.length} student{cls.students.length !== 1 ? 's' : ''}
                      </span>
                      <span className="font-bold text-accent-600 dark:text-accent-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        View Students
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STUDENT SUMMARIES: CLASS DRILL-DOWN ROSTER ────── */}
        {activeTab === 'students' && selectedClassId !== null && (
          <div className="space-y-4">
            {/* Drill-down Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassId(null);
                    setClassFilter('all');
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Back to Classes</span>
                  <span className="xs:hidden">Back</span>
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate">
                    <span className="truncate">{currentSelectedClass?.name || 'Class Roster'}</span>
                    {currentSelectedClass?.yearLevel && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent-50 dark:bg-accent-950/40 text-accent-600 dark:text-accent-400">
                        Year {currentSelectedClass.yearLevel}
                      </span>
                    )}
                  </h2>
                  {currentSelectedClass?.subjectCode && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {currentSelectedClass.subjectCode} {currentSelectedClass.subjectName ? `· ${currentSelectedClass.subjectName}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-44"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Good Standing</option>
                    <option value="noGrade">No Grade Yet</option>
                    <option value="remedial">Remedial</option>
                    <option value="cleared">Cleared</option>
                  </select>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
                  <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                  {exportPrintControls}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-accent-500" />
                  Student Information & Academic Standing
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                    <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2.5 px-3">Student ID</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3">Grade</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Face check-in</th>
                      <th className="py-2.5 px-3">Remedials</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {paginatedStudents.map((s: any) => {
                      const sub = s.enrolledSubjects?.find((item: any) => item.code === currentSelectedClass?.subjectCode) || s.enrolledSubjects?.[0];
                      const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <td className="py-3 px-3 font-mono text-slate-500">{s.studentId}</td>
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                          <td className="py-3 px-3 text-slate-500">{s.className || '—'}</td>
                          <td className="py-3 px-3 text-slate-500">Year {s.yearLevel}</td>
                          <td className="py-3 px-3 font-extrabold text-slate-700 dark:text-slate-300">
                            {gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? (
                              <GradeValue percentage={sub?.percentage} grade={Number(gradeVal)}>{formatGrade(Number(gradeVal))}</GradeValue>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400 font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3"><StatusBadge status={s.status} /></td>
                          <td className="py-3 px-3">
                            <span className={`text-[9px] font-bold ${s.faceEnrolled ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`}>
                              {s.faceEnrolled ? '✓ Enrolled' : 'Not enrolled'}
                            </span>
                            {s.faceEnrolled && (
                              <button
                                type="button"
                                onClick={() => { setRevokeTarget({ id: String(s.id), name: s.name }); setRevokeReason(''); setRevokeError(''); }}
                                className="ml-2 text-[9px] font-bold text-rose-600 hover:underline no-print"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-bold text-slate-700 dark:text-slate-300">{Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">No students match the current filters.</p>}

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 text-center sm:text-left text-[11px] sm:text-xs">
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records
                    </span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="px-2.5 py-1.5 font-bold text-slate-700 dark:text-slate-200 text-xs">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── RETENTION REPORTS: CLASS CARDS OVERVIEW ────────── */}
        {activeTab === 'retention' && selectedClassId === null && (
          <div className="space-y-4">
            {/* Class Section Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-full sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setClassSectionTab('active')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'active'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Active Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-accent-100 dark:bg-accent-950/50 text-accent-700 dark:text-accent-300">
                    {activeClasses.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setClassSectionTab('archived')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'archived'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archived Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {archivedClasses.length}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search classes..."
                    value={classSearch}
                    onChange={e => setClassSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-56"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <SchoolYearFilter
                    value={schoolYear}
                    currentSchoolYear={currentSchoolYear}
                    availableSchoolYears={availableSchoolYears}
                    onChange={value => { setSchoolYear(value); setSelectedClassId(null); setClassFilter('all'); }}
                  />
                </div>
                <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                {exportPrintControls}
              </div>
            </div>

            {/* Overall Institutional Retention Summary */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 no-print">
              {[
                { label: 'Good Standing', val: students.filter((s: any) => pageStanding(s) === 'active').length, color: 'text-emerald-600' },
                { label: 'Remedial', val: students.filter((s: any) => s.status === 'remedial').length, color: 'text-violet-600' },
                { label: 'Cleared', val: students.filter((s: any) => s.status === 'cleared').length, color: 'text-sky-600' },
              ].map(item => (
                <Card key={item.label} className="p-2.5 sm:p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className={`text-xl sm:text-2xl font-extrabold font-heading mt-0.5 ${item.color}`}>{item.val}</p>
                </Card>
              ))}
            </div>

            {/* Class Cards Grid */}
            {displayedClassCards.length === 0 ? (
              <Card className="p-8 sm:p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400 mb-3">
                  {classSectionTab === 'archived' ? <Archive className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {classSectionTab === 'archived' ? 'No Archived Classes' : 'No Active Classes Found'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {classSearch
                    ? 'No classes match your search query.'
                    : classSectionTab === 'archived'
                    ? 'There are no archived classes recorded for this school year.'
                    : 'No active classes available for the selected school year.'}
                </p>
              </Card>
            ) : (
              <div className={`grid ${displayedClassCards.length === 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-3.5 sm:gap-4`}>
                {displayedClassCards.map(cls => {
                  const atRisk = cls.remedialCount;
                  return (
                    <div
                      key={cls.id}
                      onClick={() => {
                        setSelectedClassId(cls.id);
                        setClassFilter(cls.id);
                      }}
                      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 hover:shadow-lg hover:border-accent-400 dark:hover:border-accent-600 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500 opacity-80 group-hover:opacity-100 transition-opacity" />

                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
                              <ShieldAlert className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-extrabold text-sm font-heading text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {cls.name}
                              </h3>
                              {cls.yearLevel && (
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500">
                                  Year {cls.yearLevel}
                                </span>
                              )}
                            </div>
                          </div>
                          {cls.finished && !cls.isArchived && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Finished
                            </span>
                          )}
                          {cls.isArchived && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Archived
                            </span>
                          )}
                        </div>

                        {(cls.subjectCode || cls.subjectName) && (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{cls.subjectCode}</span>
                            {cls.subjectName && <span> · {cls.subjectName}</span>}
                          </div>
                        )}
                        {cls.instructorName && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{cls.instructorName}</div>}

                        <div className="mt-4 flex flex-wrap gap-1.5 items-center">
                          {atRisk === 0 && cls.activeCount === 0 ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              No Grades Yet
                            </span>
                          ) : atRisk > 0 ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400">
                              {atRisk} Flagged / At Risk
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                              All Clear
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {cls.students.length} student{cls.students.length !== 1 ? 's' : ''}
                        </span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          View Retention
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RETENTION REPORTS: CLASS DRILL-DOWN ─────────────── */}
        {activeTab === 'retention' && selectedClassId !== null && (
          <div className="space-y-4">
            {/* Drill-down Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassId(null);
                    setClassFilter('all');
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Back to Classes</span>
                  <span className="xs:hidden">Back</span>
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate">
                    <span className="truncate">{currentSelectedClass?.name || 'Class Retention'}</span>
                    {currentSelectedClass?.yearLevel && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                        Year {currentSelectedClass.yearLevel}
                      </span>
                    )}
                  </h2>
                  {currentSelectedClass?.subjectCode && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {currentSelectedClass.subjectCode} {currentSelectedClass.subjectName ? `· ${currentSelectedClass.subjectName}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-44"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Good Standing</option>
                    <option value="noGrade">No Grade Yet</option>
                    <option value="remedial">Remedial</option>
                    <option value="cleared">Cleared</option>
                  </select>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
                  <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                  {exportPrintControls}
                </div>
              </div>
            </div>

            {/* Class-level Summary Row */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 no-print">
              {[
                { label: 'Good Standing', val: filtered.filter((s: any) => s.status === 'active').length, color: 'text-emerald-600' },
                { label: 'Remedial', val: filtered.filter((s: any) => s.status === 'remedial').length, color: 'text-violet-600' },
                { label: 'Cleared', val: filtered.filter((s: any) => s.status === 'cleared').length, color: 'text-sky-600' },
              ].map(item => (
                <Card key={item.label} className="p-2.5 sm:p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className={`text-xl sm:text-2xl font-extrabold font-heading mt-0.5 ${item.color}`}>{item.val}</p>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  Retention Status Report
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                    <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Grade</th>
                      <th className="py-2.5 px-3">Standing</th>
                      <th className="py-2.5 px-3">Clinic Hrs</th>
                      <th className="py-2.5 px-3">Pending Remedials</th>
                      <th className="py-2.5 px-3">Flagged Subjects</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {paginatedStudents.map((s: any) => {
                      const flagged = (s.enrolledSubjects || []).filter(failsRetention).length;
                      const pendingRem = Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0;
                      const sub = s.enrolledSubjects?.find((item: any) => item.code === currentSelectedClass?.subjectCode) || s.enrolledSubjects?.[0];
                      const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                          <td className="py-3 px-3 text-slate-500">{s.className || '—'}</td>
                          <td className="py-3 px-3 font-extrabold text-slate-700 dark:text-slate-300">
                            {gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? (
                              <GradeValue percentage={sub?.percentage} grade={Number(gradeVal)}>{formatGrade(Number(gradeVal))}</GradeValue>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400 font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3"><StatusBadge status={s.status} /></td>
                          <td className="py-3 px-3 text-slate-500">{s.clinicHoursCompleted}h</td>
                          <td className="py-3 px-3">
                            {pendingRem > 0
                              ? <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-md">{pendingRem} Pending</span>
                              : <span className="text-slate-500 dark:text-slate-400 text-[10px]">None</span>}
                          </td>
                          <td className="py-3 px-3">
                            {flagged > 0
                              ? <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-md">{flagged} Subject{flagged > 1 ? 's' : ''}</span>
                              : <span className="text-emerald-600 text-[10px] font-semibold">✓ Clear</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">No students match the current filters.</p>}

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 text-center sm:text-left text-[11px] sm:text-xs">
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records
                    </span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="px-2.5 py-1.5 font-bold text-slate-700 dark:text-slate-200 text-xs">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ATTENDANCE REPORTS: CLASS CARDS OVERVIEW ──────── */}
        {activeTab === 'attendance' && selectedClassId === null && (
          <div className="space-y-4">
            {/* Class Section Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-full sm:w-auto sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setClassSectionTab('active')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'active'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Active Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-accent-100 dark:bg-accent-950/50 text-accent-700 dark:text-accent-300">
                    {activeClasses.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setClassSectionTab('archived')}
                  className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-3.5 max-[359px]:px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    classSectionTab === 'archived'
                      ? 'bg-white dark:bg-slate-900 text-accent-600 dark:text-accent-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archived Classes</span>
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {archivedClasses.length}
                  </span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search classes..."
                    value={classSearch}
                    onChange={e => setClassSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-56"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <SchoolYearFilter
                    value={schoolYear}
                    currentSchoolYear={currentSchoolYear}
                    availableSchoolYears={availableSchoolYears}
                    onChange={value => { setSchoolYear(value); setSelectedClassId(null); setClassFilter('all'); }}
                  />
                </div>
                <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                {exportPrintControls}
              </div>
            </div>

            {/* Overall Attendance Summary */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 no-print">
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attendance Records</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-sky-600 dark:text-sky-400">{attendanceRecords.length}</p>
              </Card>
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Classes</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-slate-700 dark:text-slate-200">{activeClasses.length}</p>
              </Card>
              <Card className="p-2.5 sm:p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Overall Attendance</p>
                <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {attendanceRecords.length > 0
                    ? `${Math.round((attendanceRecords.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length / attendanceRecords.length) * 100)}%`
                    : '0%'}
                </p>
              </Card>
            </div>

            {/* Class Attendance Cards Grid */}
            {displayedClassCards.length === 0 ? (
              <Card className="p-8 sm:p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400 mb-3">
                  {classSectionTab === 'archived' ? <Archive className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {classSectionTab === 'archived' ? 'No Archived Classes' : 'No Active Classes Found'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  {classSearch
                    ? 'No classes match your search query.'
                    : classSectionTab === 'archived'
                    ? 'There are no archived classes recorded for this school year.'
                    : 'No active classes available for the selected school year.'}
                </p>
              </Card>
            ) : (
              <div className={`grid ${displayedClassCards.length === 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-3.5 sm:gap-4`}>
                {displayedClassCards.map(cls => {
                  const att = classAttendanceMap.get(cls.id);
                  const rate = att ? att.rate : 0;
                  const totalRecs = att ? att.total : 0;
                  return (
                    <div
                      key={cls.id}
                      onClick={() => {
                        setSelectedClassId(cls.id);
                        setClassFilter(cls.id);
                      }}
                      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 hover:shadow-lg hover:border-accent-400 dark:hover:border-accent-600 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity" />

                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
                              <CalendarDays className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-extrabold text-sm font-heading text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                {cls.name}
                              </h3>
                              {cls.yearLevel && (
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500">
                                  Year {cls.yearLevel}
                                </span>
                              )}
                            </div>
                          </div>
                          {cls.finished && !cls.isArchived && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Finished
                            </span>
                          )}
                          {cls.isArchived && (
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Archived
                            </span>
                          )}
                        </div>

                        {(cls.subjectCode || cls.subjectName) && (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{cls.subjectCode}</span>
                            {cls.subjectName && <span> · {cls.subjectName}</span>}
                          </div>
                        )}
                        {cls.instructorName && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{cls.instructorName}</div>}

                        <div className="mt-4">
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attendance Rate</span>
                            <span className={`text-xl font-extrabold font-heading ${rate >= 90 ? 'text-emerald-600' : rate >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {rate}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${rate >= 90 ? 'bg-emerald-500' : rate >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {cls.students.length} students · {totalRecs} records
                        </span>
                        <span className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          View History
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ATTENDANCE REPORTS: CLASS DRILL-DOWN ───────────── */}
        {activeTab === 'attendance' && selectedClassId !== null && (
          <div className="space-y-4">
            {/* Drill-down Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassId(null);
                    setClassFilter('all');
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Back to Classes</span>
                  <span className="xs:hidden">Back</span>
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-extrabold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2 truncate">
                    <span className="truncate">{currentSelectedClass?.name || 'Attendance History'}</span>
                    {currentSelectedClass?.yearLevel && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400">
                        Year {currentSelectedClass.yearLevel}
                      </span>
                    )}
                  </h2>
                  {currentSelectedClass?.subjectCode && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {currentSelectedClass.subjectCode} {currentSelectedClass.subjectName ? `· ${currentSelectedClass.subjectName}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-full sm:w-44"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excused</option>
                  </select>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">{filteredAttendanceRows.length} record{filteredAttendanceRows.length !== 1 ? 's' : ''}</span>
                  <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-800" />
                  {exportPrintControls}
                </div>
              </div>
            </div>

            {/* Class Attendance KPI Summary */}
            {(() => {
              const att = classAttendanceMap.get(selectedClassId);
              const rate = att ? att.rate : 0;
              const presentCount = classAttendanceRecords.filter(r => r.status === 'present').length;
              const lateCount = classAttendanceRecords.filter(r => r.status === 'late').length;
              const absentCount = classAttendanceRecords.filter(r => r.status === 'absent').length;
              const excusedCount = classAttendanceRecords.filter(r => r.status === 'excused').length;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 no-print">
                  <Card className="p-2.5 sm:p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attendance Rate</p>
                    <p className={`text-xl sm:text-2xl font-extrabold font-heading mt-0.5 ${rate >= 90 ? 'text-emerald-600' : rate >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>{rate}%</p>
                  </Card>
                  <Card className="p-2.5 sm:p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Present</p>
                    <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-emerald-600">{presentCount}</p>
                  </Card>
                  <Card className="p-2.5 sm:p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Late</p>
                    <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-amber-600">{lateCount}</p>
                  </Card>
                  <Card className="p-2.5 sm:p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Absent</p>
                    <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-rose-600">{absentCount}</p>
                  </Card>
                  <Card className="p-2.5 sm:p-3 text-center col-span-2 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Excused</p>
                    <p className="text-xl sm:text-2xl font-extrabold font-heading mt-0.5 text-sky-600">{excusedCount}</p>
                  </Card>
                </div>
              );
            })()}

            {/* Attendance Log Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-sky-500" />
                  Student Attendance History
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                    <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Student No.</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {filteredAttendanceRows.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">No attendance records match the current filters.</td></tr>
                    ) : (
                      paginatedAttendance.map((r, i) => {
                        const s = students.find(st => st.id === r.studentId);
                        const badgeMap: Record<string, string> = {
                          present: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20',
                          late: 'text-amber-700 bg-amber-50 dark:bg-amber-950/20',
                          absent: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20',
                          excused: 'text-sky-700 bg-sky-50 dark:bg-sky-950/20',
                        };
                        return (
                          <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-500">{r.date}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{s?.studentId || '—'}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{s?.name || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.className || currentSelectedClass?.name || '—'}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{r.subjectCode}</td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${badgeMap[r.status] || ''}`}>{r.status}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Pagination controls */}
                {totalAttendancePages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 text-center sm:text-left text-[11px] sm:text-xs">
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAttendanceRows.length)} of {filteredAttendanceRows.length} records
                    </span>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="px-2.5 py-1.5 font-bold text-slate-700 dark:text-slate-200 text-xs">
                        Page {currentPage} of {totalAttendancePages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalAttendancePages))}
                        disabled={currentPage === totalAttendancePages}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {(() => {
        const tabLabel = tabs.find(t => t.id === activeTab)?.label ?? '';
        const captions: Record<ReportTab, string> = {
          students: 'Student Information & Academic Standing',
          retention: 'Retention Status Report',
          attendance: 'Student Attendance History',
        };
        const generated = formatPrintedAt(printedAt ?? new Date());
        const sy = schoolYear === 'current' ? (currentSchoolYear ?? 'Current') : schoolYear;
        const classLabel = selectedClassId
          ? (currentSelectedClass?.name || selectedClassId)
          : (classFilter === 'all' ? 'All classes' : (students.find(s => s.classId === classFilter)?.className || classFilter));
        const statusLabel = statusFilter === 'all' ? 'All statuses' : (STANDING_LABELS[statusFilter] ?? statusFilter);
        const gwa = (s: any) => (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA).toFixed(2) : '—');
        const pending = (s: any) => (Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0);
        const standingBad = (s: any) => String(s.status || '').toLowerCase() === 'remedial';
        const rowCount = activeTab === 'attendance' ? historyRows.length : filtered.length;
        const widths: Record<ReportTab, number[]> = {
          students: [12, 22, 17, 8, 10, 13, 10, 8],
          retention: [11, 22, 14, 8, 11, 9, 13, 12],
          attendance: [12, 13, 28, 22, 15, 10],
        };
        const cols = (w: number[]) => <colgroup>{w.map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>;
        return (
          <div className="print-only hidden bg-white text-slate-900 font-sans ps">
            <PrintStyle title={tabLabel} running={`${tabLabel} · Dean's Office · S.Y. ${sy}`} generated={generated} note="Confidential Academic Document" />
            <PrintHeader
              title={tabLabel}
              sub="Dean's Office"
              rows={[
                ['Office', "Dean's Office"],
                ['School Year', sy],
                ['Filters', `${classLabel} · ${statusLabel}${search ? ` · Search: "${search}"` : ''}`],
                ['Records', String(rowCount)],
                ['Date', generated],
              ]}
            />
            {activeTab === 'attendance' && (
              <>
                <PrintCaption>Attendance by Class</PrintCaption>
                <table>
                  {cols([40, 20, 20, 20])}
                  <thead><tr><th className="l">Class</th><th>Students</th><th>Records</th><th>Attendance Rate</th></tr></thead>
                  <tbody>
                    {classSummaries.map(c => (
                      <tr key={c.cls}><td className="nm">{c.name}</td><td>{c.count}</td><td>{c.total}</td><td>{c.rate}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <PrintCaption>{captions[activeTab]}</PrintCaption>
            <table>
              {cols(widths[activeTab])}
              <thead>
                {activeTab === 'students' && (
                  <tr><th className="l">Student No.</th><th className="l">Student Name</th><th className="l">Class</th><th>Year</th><th>Grade</th><th>Status</th><th>Face check-in</th><th>Remedials</th></tr>
                )}
                {activeTab === 'retention' && (
                  <tr><th className="l">Student No.</th><th className="l">Student Name</th><th className="l">Class</th><th>Grade</th><th>Standing</th><th>Clinic Hrs</th><th>Pending Remedials</th><th>Flagged Subjects</th></tr>
                )}
                {activeTab === 'attendance' && (
                  <tr><th className="l">Date</th><th className="l">Student No.</th><th className="l">Student Name</th><th className="l">Class</th><th className="l">Course Code</th><th>Status</th></tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'students' && filtered.map((s: any) => {
                  const sub = s.enrolledSubjects?.find((item: any) => item.code === currentSelectedClass?.subjectCode) || s.enrolledSubjects?.[0];
                  const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
                  const gradeStr = gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? formatGrade(Number(gradeVal)) : '—';
                  return (
                    <tr key={s.id}>
                      <td className="id">{s.studentId}</td>
                      <td className="nm">{s.name}</td>
                      <td className={`l ${printCellClass(s.className || '—')}`}>{s.className || '—'}</td>
                      <td>Year {s.yearLevel}</td>
                      <td className={`grade ${printCellClass(gradeStr)}`}>{gradeStr}</td>
                      <td className={`cap ${standingBad(s) ? 'bad' : ''}`}>{STANDING_LABELS[s.status] ?? s.status}</td>
                      <td>{s.faceEnrolled ? 'Enrolled' : 'Not enrolled'}</td>
                      <td>{pending(s)}</td>
                    </tr>
                  );
                })}
                {activeTab === 'retention' && filtered.map((s: any) => {
                  const sub = s.enrolledSubjects?.find((item: any) => item.code === currentSelectedClass?.subjectCode) || s.enrolledSubjects?.[0];
                  const gradeVal = sub?.grade ?? (s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA) : null);
                  const gradeStr = gradeVal !== null && gradeVal !== undefined && Number(gradeVal) > 0 ? formatGrade(Number(gradeVal)) : '—';
                  const flagged = (s.enrolledSubjects || []).filter(failsRetention).length;
                  const pend = pending(s);
                  return (
                    <tr key={s.id}>
                      <td className="id">{s.studentId}</td>
                      <td className="nm">{s.name}</td>
                      <td className={`l ${printCellClass(s.className || '—')}`}>{s.className || '—'}</td>
                      <td className={`grade ${standingBad(s) ? 'bad' : printCellClass(gradeStr)}`}>{gradeStr}</td>
                      <td className={`cap ${standingBad(s) ? 'bad' : ''}`}>{STANDING_LABELS[s.status] ?? s.status}</td>
                      <td>{s.clinicHoursCompleted}h</td>
                      <td className={pend > 0 ? 'bad' : ''}>{pend > 0 ? `${pend} Pending` : 'None'}</td>
                      <td className={flagged > 0 ? 'bad' : ''}>{flagged > 0 ? `${flagged} Subject${flagged > 1 ? 's' : ''}` : 'Clear'}</td>
                    </tr>
                  );
                })}
                {activeTab === 'attendance' && (selectedClassId ? filteredAttendanceRows : historyRows).map((r, i) => {
                  const st = students.find(x => x.id === r.studentId);
                  return (
                    <tr key={i}>
                      <td className="id">{r.date}</td>
                      <td className="id">{st?.studentId || '—'}</td>
                      <td className="nm">{st?.name || '—'}</td>
                      <td className={`l ${printCellClass(r.className || currentSelectedClass?.name || '—')}`}>{r.className || currentSelectedClass?.name || '—'}</td>
                      <td className="id">{r.subjectCode}</td>
                      <td className={`cap ${r.status === 'absent' ? 'bad' : ''}`}>{r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PrintSignatures faculty={user?.display_name} role="Dean" />
          </div>
        );
      })()}
    </div>
  );
};
