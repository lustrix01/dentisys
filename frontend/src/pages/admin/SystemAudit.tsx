import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Users,
  BookOpen,
  ShieldAlert,
  CalendarDays,
  Filter,
  Search,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { recordAudit } from '../../services/auditService';

type ReportTab = 'students' | 'academic' | 'retention' | 'attendance';

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #dean-report-print, #dean-report-print * { visibility: visible !important; }
  #dean-report-print { position: absolute; left: 0; top: 0; width: 100%; font-size: 11px; }
  .no-print { display: none !important; }
  @page { margin: 1.2cm; }
}`;

import { getAdminReportsSummaryApi, getAdminSettingsApi, revokeStudentBiometricApi } from '../../services/apiClient';
import { Modal } from '../../components/Modal';
import { SchoolYearFilter } from '../../components/SchoolYearFilter';

const csvEscapeField = (value: unknown) => {
  const text = String(value ?? '—');
  // Spreadsheet formula detection must recognize control characters before a formula marker.
  // eslint-disable-next-line no-control-regex
  const safeText = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export const DeanReports: React.FC = () => {
  const [retentionThreshold, setRetentionThreshold] = useState(2.5);
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
        setDbStudents(res.reports?.students ?? []);
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
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const uniqueClasses = useMemo(() => Array.from(new Set(students.map((s: any) => s.classId).filter(Boolean))), [students]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [classFilter, statusFilter, search, activeTab]);

  // ── Filtered students ────────────────────────────────────
  const filtered = useMemo(() => {
    return students.filter((s: any) => {
      const matchClass = classFilter === 'all' || s.classId === classFilter;
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchSearch = !search
        || s.name.toLowerCase().includes(search.toLowerCase())
        || s.studentId.toLowerCase().includes(search.toLowerCase());
      return matchClass && matchStatus && matchSearch;
    });
  }, [students, classFilter, statusFilter, search]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  // ── CSV export ───────────────────────────────────────────
  const handleExportCSV = () => {
    recordAudit({ action: 'Exported report CSV', module: 'Reports & Analytics', description: `Exported ${activeTab} report data as CSV.`, status: 'Success' });
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').substring(0, 19);
    let csv = '';
    let fileName = '';

    if (activeTab === 'students') {
      csv = `Dean's Student Summary Report\nGenerated: ${ts}\n\nStudent ID,Name,Class,Year Level,GWA,Status,Face Enrolled\n`;
      csv += filtered.map(s => {
        const gwaStr = s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA).toFixed(2) : 'N/A';
        return `${s.studentId},"${s.name}",${csvEscapeField(s.className || '—')},${s.yearLevel},${gwaStr},${s.status},${s.faceEnrolled ? 'Yes' : 'No'}`;
      }).join('\n');
      fileName = `Student_Summary_${ts.replace(/[: ]/g, '-')}.csv`;

    } else if (activeTab === 'academic') {
      csv = `Academic Grade Report\nGenerated: ${ts}\n\nStudent ID,Name,Subject Code,Subject Name,Grade,Has Remedial\n`;
      csv += filtered.flatMap((s: any) =>
        (s.enrolledSubjects || []).map((sub: any) => {
          const gradeStr = sub.grade !== null && sub.grade !== undefined && Number(sub.grade) > 0 ? Number(sub.grade).toFixed(2) : 'N/A';
          return `${s.studentId},"${s.name}",${sub.code},"${sub.name}",${gradeStr},${sub.hasRemedial ? 'Yes' : 'No'}`;
        })
      ).join('\n');
      fileName = `Academic_Report_${ts.replace(/[: ]/g, '-')}.csv`;

    } else if (activeTab === 'retention') {
      csv = `Retention Status Report\nGenerated: ${ts}\n\nStudent ID,Name,Class,GWA,Status,Pending Remedials\n`;
      csv += filtered.map((s: any) => {
        const pendingRem = Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0;
        const gwaStr = s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA).toFixed(2) : 'N/A';
        return `${s.studentId},"${s.name}",${csvEscapeField(s.className || '—')},${gwaStr},${s.status},${pendingRem}`;
      }).join('\n');
      fileName = `Retention_Report_${ts.replace(/[: ]/g, '-')}.csv`;

    } else {
      csv = `Attendance Report\nGenerated: ${ts}\n\nStudent ID,Name,Subject Code,Date,Status\n`;
      const relevantIds = new Set(filtered.map(s => s.id));
      csv += attendanceRecords
        .filter(r => relevantIds.has(r.studentId))
        .map(r => {
          const s = students.find(st => st.id === r.studentId);
          return `${s?.studentId || '-'},"${s?.name || '-'}",${r.subjectCode},${r.date},${r.status}`;
        }).join('\n');
      fileName = `Attendance_Report_${ts.replace(/[: ]/g, '-')}.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => { recordAudit({ action: 'Generated report PDF', module: 'Reports & Analytics', description: `Opened ${activeTab} report for PDF printing.`, status: 'Success' }); window.print(); };

  // ── Status badge ─────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
      warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
      critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
      remedial: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
      cleared: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400',
    };
    return (
      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${map[status] || 'bg-slate-100 text-slate-500'}`}>
        {status}
      </span>
    );
  };

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'students', label: 'Student Summaries', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'academic', label: 'Academic Reports', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'retention', label: 'Retention Reports', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'Attendance Reports', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  ];

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'short' });

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <style>{PRINT_STYLES}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-4 no-print">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Generate institutional academic, retention, and attendance reports.
          </p>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0 no-print">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs transition-all shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold text-xs transition-all cursor-pointer bg-white dark:bg-slate-950"
          >
            <Printer className="w-3.5 h-3.5" />
            Print PDF
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm no-print overflow-x-auto gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-450 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4 no-print">
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-905 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500 w-48"
            />
          </div>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-905 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Classes</option>
            {uniqueClasses.map(cls => {
              const label = students.find(s => s.classId === cls)?.className || cls;
              return <option key={cls} value={cls}>{label}</option>;
            })}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-905 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Good Standing</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="remedial">Remedial</option>
            <option value="cleared">Cleared</option>
          </select>
          <SchoolYearFilter
            value={schoolYear}
            currentSchoolYear={currentSchoolYear}
            availableSchoolYears={availableSchoolYears}
            onChange={value => { setSchoolYear(value); setClassFilter('all'); }}
          />
          <span className="text-[10px] text-slate-400 font-semibold ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </Card>

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
      <div id="dean-report-print">
        {/* Report Header (shows on print) */}
        <div className="hidden print:block mb-6 border-b-2 border-slate-300 pb-4">
          <h1 className="text-xl font-extrabold">Bicol University College of Dental Medicine</h1>
          <h2 className="text-base font-bold mt-1">{tabs.find(t => t.id === activeTab)?.label} — Dean's Office</h2>
          <p className="text-xs text-slate-500 mt-0.5">Generated: {now} · Filtered: {filtered.length} records</p>
        </div>

        {/* ── STUDENT SUMMARIES ────────────────────────────── */}
        {activeTab === 'students' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-accent-500" />
                Student Information & Academic Standing
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                  <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3">Student ID</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Year</th>
                    <th className="py-2.5 px-3">GWA</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Face ID</th>
                    <th className="py-2.5 px-3">Remedials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {paginatedStudents.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-500">{s.studentId}</td>
                      <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                      <td className="py-3 px-3 text-slate-500">{s.className || '—'}</td>
                      <td className="py-3 px-3 text-slate-500">Year {s.yearLevel}</td>
                      <td className="py-3 px-3 font-extrabold text-slate-700 dark:text-slate-300">
                        {s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA).toFixed(2) : '—'}
                      </td>
                      <td className="py-3 px-3"><StatusBadge status={s.status} /></td>
                      <td className="py-3 px-3">
                        <span className={`text-[9px] font-bold ${s.faceEnrolled ? 'text-emerald-600' : 'text-slate-400'}`}>
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
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No students match the current filters.</p>}
              
              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-400">
                    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records
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
        )}

        {/* ── ACADEMIC REPORTS ─────────────────────────────── */}
        {activeTab === 'academic' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-accent-500" />
                Grade Summaries & Subject Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                  <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Subject Code</th>
                    <th className="py-2.5 px-3">Subject Name</th>
                    <th className="py-2.5 px-3">Quizzes</th>
                    <th className="py-2.5 px-3">Exams</th>
                    <th className="py-2.5 px-3">Practicum</th>
                    <th className="py-2.5 px-3">Attendance</th>
                    <th className="py-2.5 px-3">Grade</th>
                    <th className="py-2.5 px-3">Remedial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {filtered.flatMap((s: any) =>
                    (s.enrolledSubjects || []).map((sub: any) => (
                      <tr key={`${s.id}-${sub.code}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{s.classId}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{sub.code}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{sub.name}</td>
                        <td className="py-2.5 px-3">{sub.components?.quizzes !== undefined ? `${sub.components.quizzes}%` : '—'}</td>
                        <td className="py-2.5 px-3">{sub.components?.exams !== undefined ? `${sub.components.exams}%` : '—'}</td>
                        <td className="py-2.5 px-3">{sub.isClinical ? (sub.components?.practicum !== undefined ? `${sub.components.practicum}%` : '—') : '—'}</td>
                        <td className="py-2.5 px-3">{sub.components?.attendance !== undefined ? `${sub.components.attendance}%` : '—'}</td>
                        <td className={`py-2.5 px-3 font-extrabold ${sub.grade !== null && sub.grade !== undefined && Number(sub.grade) >= retentionThreshold ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {sub.grade !== null && sub.grade !== undefined && Number(sub.grade) > 0 ? Number(sub.grade).toFixed(2) : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {sub.hasRemedial
                            ? <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">Yes</span>
                            : <span className="text-[9px] text-slate-400">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No students match the current filters.</p>}
            </CardContent>
          </Card>
        )}

        {/* ── RETENTION REPORTS ────────────────────────────── */}
        {activeTab === 'retention' && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 no-print">
              {[
                { label: 'Good Standing', val: filtered.filter((s: any) => s.status === 'active').length, color: 'text-emerald-600' },
                { label: 'Warning', val: filtered.filter((s: any) => s.status === 'warning').length, color: 'text-amber-600' },
                { label: 'Critical', val: filtered.filter((s: any) => s.status === 'critical').length, color: 'text-rose-600' },
                { label: 'Remedial', val: filtered.filter((s: any) => s.status === 'remedial').length, color: 'text-violet-600' },
                { label: 'Cleared', val: filtered.filter((s: any) => s.status === 'cleared').length, color: 'text-sky-600' },
              ].map(item => (
                <Card key={item.label} className="p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                  <p className={`text-3xl font-extrabold font-heading mt-1 ${item.color}`}>{item.val}</p>
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
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                    <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">GWA</th>
                      <th className="py-2.5 px-3">Standing</th>
                      <th className="py-2.5 px-3">Clinic Hrs</th>
                      <th className="py-2.5 px-3">Pending Remedials</th>
                      <th className="py-2.5 px-3">Flagged Subjects</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {filtered.map((s: any) => {
                      const flagged = (s.enrolledSubjects || []).filter((sub: any) => sub.grade !== null && sub.grade !== undefined && Number(sub.grade) >= retentionThreshold).length;
                      const pendingRem = Array.isArray(s.remedialExams) ? s.remedialExams.filter((r: any) => r.status === 'pending').length : 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                          <td className="py-3 px-3 text-slate-500">{s.className || '—'}</td>
                          <td className={`py-3 px-3 font-extrabold ${['warning', 'critical', 'remedial'].includes(String(s.status || '').toLowerCase()) ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {s.overallGWA !== null && s.overallGWA !== undefined ? Number(s.overallGWA).toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-3"><StatusBadge status={s.status} /></td>
                          <td className="py-3 px-3 text-slate-500">{s.clinicHoursCompleted}h</td>
                          <td className="py-3 px-3">
                            {pendingRem > 0
                              ? <span className="text-[9px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-md">{pendingRem} Pending</span>
                              : <span className="text-slate-400 text-[10px]">None</span>}
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
                {filtered.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No students match the current filters.</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ATTENDANCE REPORTS ───────────────────────────── */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            {/* Per-class summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from(new Set(filtered.map(s => s.classId).filter(Boolean))).map(cls => {
                const clsStudents = filtered.filter(s => s.classId === cls);
                const clsName = clsStudents[0]?.className || cls;
                const recs = attendanceRecords.filter(r => clsStudents.some(s => s.id === r.studentId));
                const total = recs.length;
                const present = recs.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'excused').length;
                const rate = total > 0 ? Math.round((present / total) * 100) : 0;
                return (
                  <Card key={cls} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{clsName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{clsStudents.length} students · {total} records</p>
                      </div>
                      <span className={`text-2xl font-extrabold font-heading ${rate >= 90 ? 'text-emerald-600' : rate >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>{rate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${rate >= 90 ? 'bg-emerald-500' : rate >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Full attendance log */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-sky-500" />
                  Student Attendance History
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950 z-10">
                    <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {(() => {
                      const filteredIds = new Set(filtered.map(s => s.id));
                      const rows = attendanceRecords
                        .filter(r => filteredIds.has(r.studentId))
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 200);
                      if (rows.length === 0) return (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400">No attendance records match the current filters.</td></tr>
                      );
                      return rows.map((r, i) => {
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
                            <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{s?.name || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.className || '—'}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{r.subjectCode}</td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${badgeMap[r.status] || ''}`}>{r.status}</span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-slate-300 text-[10px] text-slate-500 flex justify-between">
          <span>BU College of Dental Medicine — Confidential Academic Document</span>
          <span>{now}</span>
        </div>
      </div>

    </div>
  );
};
