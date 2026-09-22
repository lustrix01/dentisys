import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  Search,
  Clock,
  Camera,
  Filter,
  UserCheck,
  ShieldCheck,
  ClipboardCheck,
  AlertCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { StudentUnavailable } from './RealStudentSurfaces';
import { getStudentAttendanceLogs } from '../../services/apiClient';
import type { StudentAttendanceLogRecord, AttendanceVerificationMethod } from '../../types';

function formatVerificationMethod(method: AttendanceVerificationMethod): { label: string; icon: React.ComponentType<{ className?: string }> } {
  switch (method) {
    case 'biometric':
      return { label: 'Biometric 1:1 Verification', icon: ShieldCheck };
    case 'faculty_manual':
      return { label: 'Faculty Manual Entry', icon: UserCheck };
    case 'secretary_manual':
      return { label: 'Secretary Manual Entry', icon: ClipboardCheck };
    default:
      return { label: 'Manual Entry', icon: UserCheck };
  }
}

export const AttendanceLogs: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, attendanceRecords } = useApp();
  const runtimeConfig = useRuntimeConfig();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);
  const simulationEnabled = !isAuthoritative
    && user?.authentication_source === 'development_mock'
    && runtimeConfig.features.browser_attendance_prototype;

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = user?.display_name || currentStudent?.name || 'Dental Student';
  const studentIdNum = user?.student?.student_number || currentStudent?.studentId || '2023-BU-0142';

  // --- AUTHORITATIVE STATE ---
  const [logs, setLogs] = useState<StudentAttendanceLogRecord[]>([]);
  const [authLoading, setAuthLoading] = useState(isAuthoritative);
  const [authError, setAuthError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const loadAuthoritativeLogs = useCallback(async () => {
    if (!isAuthoritative) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await getStudentAttendanceLogs({
        courseCode: selectedSubject !== 'all' ? selectedSubject : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      });
      setLogs(response.records);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load attendance history.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, [isAuthoritative, selectedSubject, selectedStatus]);

  useEffect(() => {
    if (isAuthoritative) {
      void loadAuthoritativeLogs();
    }
  }, [isAuthoritative, loadAuthoritativeLogs]);

  // --- MOCK PROTOTYPE STATE ---
  const mockStudentRecords = attendanceRecords.filter(r => r.studentId === currentStudent?.id);

  // Access check
  if (!isAuthoritative && !simulationEnabled) {
    return <StudentUnavailable title="Attendance Logs unavailable" />;
  }

  // Filtered records for display
  const displayRecords = isAuthoritative
    ? logs.filter(r => {
      const matchesSearch =
        r.courseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.date.includes(searchQuery);
      return matchesSearch;
    })
    : mockStudentRecords.filter(r => {
      const matchesSearch =
        r.date.includes(searchQuery) ||
        r.subjectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.verifiedLocationName && r.verifiedLocationName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSubject = selectedSubject === 'all' || r.subjectCode === selectedSubject;
      const matchesStatus = selectedStatus === 'all' || r.status === selectedStatus;
      return matchesSearch && matchesSubject && matchesStatus;
    });

  // Metrics
  const totalCount = isAuthoritative ? logs.length : mockStudentRecords.length;
  const presentCount = isAuthoritative
    ? logs.filter(r => r.status === 'present').length
    : mockStudentRecords.filter(r => r.status === 'present').length;
  const lateCount = isAuthoritative
    ? logs.filter(r => r.status === 'late').length
    : mockStudentRecords.filter(r => r.status === 'late').length;
  const excusedCount = isAuthoritative
    ? logs.filter(r => r.status === 'excused').length
    : mockStudentRecords.filter(r => r.status === 'excused').length;

  const uniqueSubjects = Array.from(
    new Set(
      isAuthoritative
        ? logs.map(r => r.courseCode)
        : mockStudentRecords.map(r => r.subjectCode)
    )
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in">

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Session Attendance Logs
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {isAuthoritative
              ? 'Authoritative attendance audit trail including biometric, faculty manual, and secretary manual entries.'
              : 'Complete historical audit log of facial recognition and geofence verified class check-ins.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentIdNum}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">{studentName}</span>
          </div>

          <button
            onClick={() => navigate('/student/attendance')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>Daily Check-In</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {authError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">{authError}</p>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Recorded Sessions</span>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">
            {totalCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Present</span>
          <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 block mt-1">
            {presentCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Late</span>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 block mt-1">
            {lateCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Excused</span>
          <span className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400 block mt-1">
            {excusedCount}
          </span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by course code, name, date…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Filter:</span>
          </div>

          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Courses</option>
            {uniqueSubjects.map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
            <option value="absent">Absent</option>
            <option value="unresolved">Pending Resolution</option>
          </select>

          {isAuthoritative && (
            <button
              onClick={() => { void loadAuthoritativeLogs(); }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              title="Refresh logs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {authLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-slate-500">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs font-semibold">Loading attendance logs…</p>
          </div>
        ) : displayRecords.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <History className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Attendance Records Found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No matching attendance logs were found for the selected search and filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-5">Date & Time</th>
                  <th className="py-3.5 px-5">Course</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5">Verification Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {isAuthoritative
                  ? (displayRecords as StudentAttendanceLogRecord[]).map((rec) => {
                    const methodInfo = formatVerificationMethod(rec.verificationMethod);
                    const MethodIcon = methodInfo.icon;
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 px-5">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">{rec.date}</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {rec.time}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">{rec.courseCode}</span>
                          <span className="text-slate-600 dark:text-slate-300 text-[11px] block">{rec.courseName}</span>
                          {rec.room && (
                            <span className="text-slate-400 text-[10px] block mt-0.5">{rec.room}</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${rec.status === 'present'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : rec.status === 'late'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : rec.status === 'excused'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                                : rec.status === 'absent'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                            {rec.status === 'unresolved' ? 'Pending' : rec.status}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                            <MethodIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>{methodInfo.label}</span>
                          </span>
                          {rec.instructorName && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">By {rec.instructorName}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  : (displayRecords as typeof mockStudentRecords).map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-5">
                        <span className="font-bold text-slate-800 dark:text-slate-100 block">{rec.date}</span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {rec.verifiedAt?.split(' ')[1] || '08:15 AM'}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">{rec.subjectCode}</span>
                        <span className="text-slate-400 text-[10px] block mt-0.5">{rec.verifiedLocationName || 'BU Dental Clinic'}</span>
                      </td>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${rec.status === 'present'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : rec.status === 'late'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                          }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Facial & Geofence Verified</span>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
