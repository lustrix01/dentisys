import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Search, ShieldAlert, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { AttendanceRecord, AttendanceStatus } from '../../types';
import {
  formatStatus,
  getAssignedClassId,
  getAssignedClassName,
  getClassAttendance,
  getClassStudents,
  getCurrentSecretary,
  getStatusClasses,
} from './utils';

type EditableStatus = Exclude<AttendanceStatus, 'excused'>;

export const ManualAttendanceOverride: React.FC = () => {
  const { students, attendanceRecords, overrideAttendanceRecord } = useApp();
  const secretary = getCurrentSecretary();
  const classId = getAssignedClassId(secretary);
  const className = getAssignedClassName(secretary);
  const classStudents = getClassStudents(students, classId);
  const classAttendance = getClassAttendance(attendanceRecords, classStudents);
  const availableDates = Array.from(new Set(classAttendance.map(record => record.date))).sort().reverse();

  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || new Date().toISOString().split('T')[0]);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [status, setStatus] = useState<EditableStatus>('present');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const matchingRecords = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return classAttendance
      .filter(record => !selectedDate || record.date === selectedDate)
      .filter(record => {
        const student = classStudents.find(item => item.id === record.studentId);
        if (!student || !lowerQuery) return true;
        return student.name.toLowerCase().includes(lowerQuery) || student.studentId.toLowerCase().includes(lowerQuery);
      })
      .sort((a, b) => `${a.subjectCode}-${a.studentId}`.localeCompare(`${b.subjectCode}-${b.studentId}`));
  }, [classAttendance, classStudents, query, selectedDate]);

  const selectedRecord = classAttendance.find(record => record.id === selectedRecordId) || null;
  const selectedStudent = selectedRecord ? classStudents.find(student => student.id === selectedRecord.studentId) : null;

  const selectRecord = (record: AttendanceRecord) => {
    setSelectedRecordId(record.id);
    setStatus(record.status === 'excused' ? 'present' : record.status);
    setReason('');
    setMessage(null);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!secretary || secretary.role !== 'secretary') {
      setMessage({ type: 'error', text: 'Unauthorized action. Only Class Secretaries can apply manual attendance overrides.' });
      return;
    }

    if (!selectedRecord || !selectedStudent) {
      setMessage({ type: 'error', text: 'Select an attendance record from your assigned class before saving.' });
      return;
    }

    if (selectedStudent.classId !== classId) {
      setMessage({ type: 'error', text: 'Access denied. This student is outside your assigned class.' });
      return;
    }

    const cleanedReason = reason.trim().replace(/\s+/g, ' ');
    if (cleanedReason.length < 8) {
      setMessage({ type: 'error', text: 'Provide a clear reason for the manual correction.' });
      return;
    }

    if (cleanedReason.length > 240) {
      setMessage({ type: 'error', text: 'The override reason must be 240 characters or fewer.' });
      return;
    }

    if (selectedRecord.status === status) {
      setMessage({ type: 'error', text: 'Choose a different attendance status before saving an override.' });
      return;
    }

    const confirmed = window.confirm(
      `Apply manual override for ${selectedStudent.name} on ${selectedRecord.date}?\n\n` +
      `Change: ${formatStatus(selectedRecord.status)} to ${formatStatus(status)}\n` +
      `Reason: ${cleanedReason}`
    );

    if (!confirmed) return;

    try {
      overrideAttendanceRecord({
        recordId: selectedRecord.id,
        studentId: selectedRecord.studentId,
        date: selectedRecord.date,
        subjectCode: selectedRecord.subjectCode,
        status,
        reason: cleanedReason,
        changedBy: secretary.email,
        changedByName: secretary.name,
        assignedClassId: classId,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Attendance override rejected.',
      });
      return;
    }

    setReason('');
    setSelectedRecordId('');
    setMessage({ type: 'success', text: 'Manual override saved and audit trail updated.' });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Manual Corrections Only</p>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">Manual Attendance Override</h1>
          <p className="text-xs text-slate-400">Apply justified corrections for {className}. Every saved change is timestamped and audited.</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
          <ShieldAlert className="w-4 h-4" />
          Least-privilege correction flow
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search student name or ID"
                  maxLength={80}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100"
                />
              </label>
              <label className="relative block">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedRecordId('');
                  }}
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
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Select Record to Correct</h2>
              <p className="text-xs text-slate-400 mt-0.5">Only records from your assigned class are listed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Subject</th>
                    <th className="px-5 py-3">Current Status</th>
                    <th className="px-5 py-3 text-right">Select</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {matchingRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        No attendance records match your filters.
                      </td>
                    </tr>
                  ) : (
                    matchingRecords.map(record => {
                      const student = classStudents.find(item => item.id === record.studentId);
                      const isSelected = selectedRecordId === record.id;
                      return (
                        <tr key={record.id} className={isSelected ? 'bg-blue-50/70 dark:bg-blue-950/20' : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/50'}>
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
                          <td className="px-5 py-4 text-right">
                            <button
                               type="button"
                               onClick={() => selectRecord(record)}
                               className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                 isSelected
                                   ? 'bg-blue-600 text-white'
                                   : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                               }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </button>
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

        <Card>
          <CardHeader>
            <CardTitle>Correction Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {message && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${
                  message.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                }`}>
                  {message.text}
                </div>
              )}

              {selectedRecord && selectedStudent ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 text-xs">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{selectedStudent.name}</p>
                  <p className="text-slate-400 mt-1">{selectedStudent.studentId} - {selectedRecord.subjectCode}</p>
                  <p className="text-slate-400 mt-1">{selectedRecord.date}</p>
                  <p className="mt-3">
                    <span className="text-slate-400">Current status:</span>{' '}
                    <span className={`px-2 py-0.5 rounded-md font-bold ${getStatusClasses(selectedRecord.status)}`}>
                      {formatStatus(selectedRecord.status)}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="py-10 px-4 text-center text-sm text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Select an attendance record before applying a correction.
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {(['present', 'late', 'absent'] as EditableStatus[]).map(nextStatus => {
                  const Icon = nextStatus === 'present' ? CheckCircle2 : nextStatus === 'late' ? Clock : UserX;
                  return (
                    <button
                      key={nextStatus}
                      type="button"
                      onClick={() => setStatus(nextStatus)}
                      disabled={!selectedRecord}
                      className={`min-h-20 rounded-xl border text-xs font-bold capitalize flex flex-col items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        status === nextStatus
                          ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {nextStatus}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Required Correction Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  maxLength={240}
                  placeholder="Example: Faculty verified the signed paper attendance sheet."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 resize-none"
                />
                <p className="text-[10px] text-slate-400">{reason.trim().length}/240 characters</p>
              </div>

              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>Manual overrides require confirmation and are permanently recorded in the attendance audit trail.</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedRecord}
                className="w-full px-5 py-3 bg-gradient-to-r from-blue-600 to-accent-600 hover:from-blue-700 hover:to-accent-700 text-white font-semibold text-sm rounded-2xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Review and Apply Override
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
