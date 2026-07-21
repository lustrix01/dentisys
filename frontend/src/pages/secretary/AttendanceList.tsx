import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Search, ShieldCheck, AlertCircle } from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { getSecretaryAttendanceApi } from '../../services/apiClient';
import {
  formatStatus,
  getAssignedClassId,
  getAssignedClassName,
  getAttendanceRate,
  getClassAttendance,
  getClassStudents,
  getCurrentSecretary,
  getStatusClasses,
} from './utils';

interface AttendanceItem {
  id: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  date: string;
  subjectCode: string;
  status: any;
  overrideReason?: string | null;
  overrideAt?: string | null;
}

export const AttendanceList: React.FC = () => {
  const { students, attendanceRecords } = useApp();
  const secretary = getCurrentSecretary();
  const classId = getAssignedClassId(secretary);
  const className = getAssignedClassName(secretary);
  const classStudents = getClassStudents(students, classId);
  const fallbackClassAttendance = getClassAttendance(attendanceRecords, classStudents);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backendRecords, setBackendRecords] = useState<AttendanceItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const fetchAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSecretaryAttendanceApi();
      if (res.records && Array.isArray(res.records)) {
        setBackendRecords(res.records);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch attendance records from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const activeRecords: AttendanceItem[] = useMemo(() => {
    if (backendRecords.length > 0) return backendRecords;
    return fallbackClassAttendance.map(rec => {
      const student = classStudents.find(s => s.id === rec.studentId);
      return {
        id: rec.id,
        studentId: rec.studentId,
        studentNumber: student?.studentId || 'STU-001',
        studentName: student?.name || 'Student',
        date: rec.date,
        subjectCode: rec.subjectCode,
        status: rec.status,
        overrideReason: rec.overrideReason,
        overrideAt: rec.overrideAt,
      };
    });
  }, [backendRecords, fallbackClassAttendance, classStudents]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(activeRecords.map(record => record.date))).sort().reverse();
  }, [activeRecords]);

  const filteredRecords = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return activeRecords
      .filter(record => !selectedDate || record.date === selectedDate)
      .filter(record => {
        if (!lowerQuery) return true;
        return record.studentName.toLowerCase().includes(lowerQuery) || record.studentNumber.toLowerCase().includes(lowerQuery);
      })
      .sort((a, b) => `${b.date}-${b.subjectCode}`.localeCompare(`${a.date}-${a.subjectCode}`));
  }, [activeRecords, query, selectedDate]);

  const totals = {
    present: filteredRecords.filter(record => record.status === 'present').length,
    late: filteredRecords.filter(record => record.status === 'late').length,
    absent: filteredRecords.filter(record => record.status === 'absent').length,
  };

  const calculatedAttendanceRate = useMemo(() => {
    if (filteredRecords.length === 0) return 0;
    const attended = filteredRecords.filter(record => record.status === 'present' || record.status === 'late').length;
    return Math.round((attended / filteredRecords.length) * 100);
  }, [filteredRecords]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Read-only Attendance Register</p>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">{className} Attendance List</h1>
          <p className="text-xs text-slate-400">View attendance records for your assigned class only. Manual corrections are handled on the override page.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAttendance}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh attendance records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold border border-blue-500/20">
            <ShieldCheck className="w-4 h-4" />
            Class-scoped view
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchAttendance}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visible Records</span>
          <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{filteredRecords.length}</p>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Present</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{totals.present}</p>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Late</span>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{totals.late}</p>
        </Card>
        <Card className="p-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance Rate</span>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{calculatedAttendanceRate}%</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by student name or ID"
              maxLength={80}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100"
            />
          </label>
          <label className="relative block">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100"
            >
              <option value="">All dates</option>
              {availableDates.map(date => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">Fetching class attendance records...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80 text-left text-[11px] uppercase tracking-wider text-slate-400 z-10 shadow-sm">
                <tr>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                      No attendance records match the current search or date filter.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(record => {
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{record.studentName}</p>
                          <p className="text-xs text-slate-400">{record.studentNumber}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{record.date}</td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{record.subjectCode}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getStatusClasses(record.status)}`}>
                            {formatStatus(record.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                          {record.overrideAt ? new Date(record.overrideAt).toLocaleString() : 'No manual changes'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};

