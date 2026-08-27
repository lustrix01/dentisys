import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  History, 
  Search, 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Camera, 
  Filter,
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';

export const AttendanceLogs: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, attendanceRecords } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = currentStudent?.name || user?.display_name || 'Dental Student';
  const studentIdNum = currentStudent?.studentId || '2023-BU-0142';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const allStudentRecords = attendanceRecords.filter(r => r.studentId === currentStudent?.id);

  // Filter records
  const filteredRecords = allStudentRecords.filter(r => {
    const matchesSearch = 
      r.date.includes(searchQuery) ||
      r.subjectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.verifiedLocationName && r.verifiedLocationName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSubject = selectedSubject === 'all' || r.subjectCode === selectedSubject;
    const matchesStatus = selectedStatus === 'all' || r.status === selectedStatus;

    return matchesSearch && matchesSubject && matchesStatus;
  });

  // Summary Metrics
  const totalLogs = allStudentRecords.length;
  const presentCount = allStudentRecords.filter(r => r.status === 'present').length;
  const lateCount = allStudentRecords.filter(r => r.status === 'late').length;
  const attendanceRate = totalLogs > 0 ? Math.round(((presentCount + lateCount) / totalLogs) * 100) : 92;

  // Unique subject codes for filter dropdown
  const uniqueSubjects = Array.from(new Set(allStudentRecords.map(r => r.subjectCode)));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in">
      
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider mb-2">
            <History className="w-3.5 h-3.5" />
            Attendance Audit Trail
          </div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
            My Session Attendance Logs
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete historical audit log of facial recognition and geofence verified class check-ins.
          </p>
        </div>

        <button
          onClick={() => navigate('/student/attendance')}
          className="self-start sm:self-center flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Take Daily Attendance</span>
        </button>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Recorded Sessions</span>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">
            {totalLogs}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
          <span className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 block mt-1">
            {attendanceRate}%
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">On-Time Check-Ins</span>
          <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 block mt-1">
            {presentCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Late Entries</span>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 block mt-1">
            {lateCount}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search date, course code, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 placeholder-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Subject:</span>
            </div>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Subjects</option>
              {uniqueSubjects.map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium ml-2">
              <span>Status:</span>
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present (On-time)</option>
              <option value="late">Late</option>
            </select>
          </div>
        </div>
      </div>

      {/* ATTENDANCE HISTORY TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            Attendance Log Entries ({filteredRecords.length})
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">Student: {studentName} ({studentIdNum})</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-3">Date</th>
                <th className="pb-3">Class Subject</th>
                <th className="pb-3">Check-In Time</th>
                <th className="pb-3">Verification Method</th>
                <th className="pb-3">Verified Location</th>
                <th className="pb-3 text-right">Attendance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No matching attendance logs found.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 font-semibold text-slate-800 dark:text-slate-200">{r.date}</td>
                    <td className="py-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">{r.subjectCode}</td>
                    <td className="py-3.5 text-slate-500">{r.verifiedAt || '08:15 AM'}</td>
                    <td className="py-3.5">
                      <span className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900">
                        Face + Geofence
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-blue-600" />
                      <span>{r.verifiedLocationName || 'BU Dental Clinic'}</span>
                    </td>
                    <td className="py-3.5 text-right">
                      <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === 'present' 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
