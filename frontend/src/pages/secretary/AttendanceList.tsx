import React, { useMemo, useState } from 'react';
import { CalendarDays, Search, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/Card';
import { useApp } from '../../context/AppContext';
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

export const AttendanceList: React.FC = () => {
  const { students, attendanceRecords } = useApp();
  const secretary = getCurrentSecretary();
  const classId = getAssignedClassId(secretary);
  const className = getAssignedClassName(secretary);
  const classStudents = getClassStudents(students, classId);
  const classAttendance = getClassAttendance(attendanceRecords, classStudents);
  const availableDates = Array.from(new Set(classAttendance.map(record => record.date))).sort().reverse();

  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const filteredRecords = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return classAttendance
      .filter(record => !selectedDate || record.date === selectedDate)
      .filter(record => {
        const student = classStudents.find(item => item.id === record.studentId);
        if (!student || !lowerQuery) return true;
        return student.name.toLowerCase().includes(lowerQuery) || student.studentId.toLowerCase().includes(lowerQuery);
      })
      .sort((a, b) => `${b.date}-${b.subjectCode}`.localeCompare(`${a.date}-${a.subjectCode}`));
  }, [classAttendance, classStudents, query, selectedDate]);

  const totals = {
    present: filteredRecords.filter(record => record.status === 'present').length,
    late: filteredRecords.filter(record => record.status === 'late').length,
    absent: filteredRecords.filter(record => record.status === 'absent').length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-clinical-600 dark:text-clinical-400 uppercase tracking-widest">Read-only Attendance Register</p>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">{className} Attendance List</h1>
          <p className="text-xs text-slate-400">View attendance records for your assigned class only. Manual corrections are handled on the override page.</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-clinical-500/10 text-clinical-700 dark:text-clinical-400 text-xs font-bold border border-clinical-500/20">
          <ShieldCheck className="w-4 h-4" />
          Class-scoped view
        </div>
      </div>

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
          <p className="text-2xl font-extrabold text-clinical-600 dark:text-clinical-400 mt-1">{getAttendanceRate(filteredRecords)}%</p>
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
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 dark:text-slate-100"
            />
          </label>
          <label className="relative block">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500 dark:text-slate-100"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-left text-[11px] uppercase tracking-wider text-slate-400">
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
                  const student = classStudents.find(item => item.id === record.studentId);
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800 dark:text-slate-100">{student?.name || 'Unknown student'}</p>
                        <p className="text-xs text-slate-400">{student?.studentId}</p>
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
        </div>
      </Card>
    </div>
  );
};
