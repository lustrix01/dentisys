import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, 
  BookOpen, 
  Check, 
  UserX, 
  Clock, 
  CheckCircle2, 
  Save, 
  AlertCircle,
  History,
  ShieldCheck,
  Search,
  Sliders,
  AlertOctagon
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, AttendanceRecord, AttendanceStatus } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { Modal } from '../../components/Modal';

type EditableStatus = Exclude<AttendanceStatus, 'excused'>;

export const AttendanceMonitoring: React.FC = () => {
  const { students, attendanceRecords, addAttendanceRecord, overrideAttendanceRecord } = useApp();
  const { user } = useAuth();

  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['CLINIC-A', 'CLINIC-B'];

  // Tab State: 'worksheet' | 'corrections'
  const [activeTab, setActiveTab] = useState<'worksheet' | 'corrections'>('worksheet');

  // List of all assigned courses
  const availableCourses = useMemo(() => {
    const rawCourses = Array.from(
      new Set(students.flatMap(s => s.enrolledSubjects.map(subj => JSON.stringify({ code: subj.code, name: subj.name }))))
    ).map(str => JSON.parse(str) as { code: string; name: string });

    return rawCourses.filter(c => assignedSubjects.includes(c.code));
  }, [students, assignedSubjects]);

  // State selectors
  const [selectedClassId, setSelectedClassId] = useState<string>(
    assignedClasses[0] || 'CLINIC-A'
  );
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>(
    availableCourses.length > 0 ? availableCourses[0].code : ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Daily Worksheet States
  const [attendanceSheet, setAttendanceSheet] = useState<Record<string, AttendanceStatus>>({});
  const [isSaved, setIsSaved] = useState(false);

  // Filter students enrolled in the active course and class (RBAC check)
  const enrolledStudents = useMemo(() => {
    return students.filter(s => 
      s.classId && assignedClasses.includes(s.classId) &&
      s.enrolledSubjects.some(subj => subj.code === selectedCourseCode)
    );
  }, [students, selectedCourseCode, assignedClasses]);

  // Load existing daily worksheet records
  const existingRecordsForDay = useMemo(() => {
    return attendanceRecords.filter(
      r => r.date === selectedDate && r.subjectCode === selectedCourseCode
    );
  }, [attendanceRecords, selectedDate, selectedCourseCode]);

  // Initialize daily sheet state — only re-run when the user changes date or course
  useEffect(() => {
    const initialSheet: Record<string, AttendanceStatus> = {};
    const enrolled = students.filter(s =>
      s.classId && assignedClasses.includes(s.classId) &&
      s.enrolledSubjects.some(subj => subj.code === selectedCourseCode)
    );
    enrolled.forEach(student => {
      const match = attendanceRecords.find(
        r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
      );
      initialSheet[student.id] = match ? match.status : 'present';
    });
    setAttendanceSheet(initialSheet);
    setIsSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseCode, selectedDate]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceSheet(prev => ({
      ...prev,
      [studentId]: status
    }));
    setIsSaved(false);
  };

  const handleSaveAttendance = () => {
    Object.entries(attendanceSheet).forEach(([studentId, status]) => {
      addAttendanceRecord({
        studentId,
        date: selectedDate,
        subjectCode: selectedCourseCode,
        status
      });
    });

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  // Calculations for current day stats
  const totalEnrolled = enrolledStudents.length;
  const countStatus = (status: AttendanceStatus) => {
    return Object.values(attendanceSheet).filter(s => s === status).length;
  };

  const presentsCount = countStatus('present');
  const latesCount = countStatus('late');
  const absentsCount = countStatus('absent');
  const excusedCount = countStatus('excused');

  const presentPercentage = totalEnrolled > 0 
    ? Math.round(((presentsCount + latesCount) / totalEnrolled) * 105 - 5) // weighted average
    : 100;
  const boundPercentage = Math.min(100, Math.max(0, presentPercentage));

  // Past logs list
  const pastDatesLogs = useMemo(() => {
    return Array.from(
      new Set(attendanceRecords.filter(r => r.subjectCode === selectedCourseCode && r.date !== selectedDate).map(r => r.date))
    ).sort().reverse().slice(0, 5);
  }, [attendanceRecords, selectedCourseCode, selectedDate]);

  const getPastDateStats = (date: string) => {
    const records = attendanceRecords.filter(r => r.subjectCode === selectedCourseCode && r.date === date);
    const total = records.length;
    if (total === 0) return '0%';
    const presentOrLate = records.filter(r => r.status === 'present' || r.status === 'late').length;
    return `${Math.round((presentOrLate / total) * 100)}% Present`;
  };

  // ----------------------------------------------------
  // CORRECTIONS & HISTORY TAB STATE
  // ----------------------------------------------------
  const [correctionsSearch, setCorrectionsSearch] = useState('');
  const [selectedCorrectionRecord, setSelectedCorrectionRecord] = useState<AttendanceRecord | null>(null);
  
  // Correction Form Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctStatus, setCorrectStatus] = useState<EditableStatus>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Audit trail modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditRecord, setAuditRecord] = useState<AttendanceRecord | null>(null);

  // Filter attendance records under assigned subjects scope
  const historicalRecords = useMemo(() => {
    return attendanceRecords.filter(r =>
      assignedSubjects.includes(r.subjectCode) &&
      students.some(s => s.id === r.studentId && s.classId === selectedClassId)
    );
  }, [attendanceRecords, assignedSubjects, students, selectedClassId]);

  const filteredHistoricalRecords = useMemo(() => {
    return historicalRecords.filter(record => {
      const student = students.find(s => s.id === record.studentId);
      if (!student) return false;

      const matchesSearch = student.name.toLowerCase().includes(correctionsSearch.toLowerCase()) ||
                            student.studentId.toLowerCase().includes(correctionsSearch.toLowerCase());
      
      const matchesCourse = selectedCourseCode ? record.subjectCode === selectedCourseCode : true;

      return matchesSearch && matchesCourse;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [historicalRecords, students, correctionsSearch, selectedCourseCode]);

  const handleCorrectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (user?.role !== 'faculty') {
      setErrorMessage('Access denied! Only authorized faculty members can correct attendance ledgers.');
      return;
    }

    if (!selectedCorrectionRecord) return;

    const cleanedReason = correctionReason.trim().replace(/\s+/g, ' ');
    if (cleanedReason.length < 8) {
      setErrorMessage('Justification error: Reason must be at least 8 characters.');
      return;
    }

    if (cleanedReason.length > 240) {
      setErrorMessage('Justification error: Reason must not exceed 240 characters.');
      return;
    }

    if (selectedCorrectionRecord.status === correctStatus) {
      setErrorMessage('Change error: Please select a status different from the current one.');
      return;
    }

    const confirmed = window.confirm(
      `Correct attendance status for student?\n` +
      `Date: ${selectedCorrectionRecord.date}\n` +
      `Change: ${selectedCorrectionRecord.status.toUpperCase()} to ${correctStatus.toUpperCase()}\n` +
      `Reason: ${cleanedReason}`
    );

    if (!confirmed) return;

    try {
      overrideAttendanceRecord({
        recordId: selectedCorrectionRecord.id,
        studentId: selectedCorrectionRecord.studentId,
        date: selectedCorrectionRecord.date,
        subjectCode: selectedCorrectionRecord.subjectCode,
        status: correctStatus,
        reason: cleanedReason,
        changedBy: user?.login_email,
        changedByName: user?.display_name,
        assignedClassId: selectedClassId,
      });
      setIsCorrectionModalOpen(false);
      setSelectedCorrectionRecord(null);
      setCorrectionReason('');
      alert('Manual correction saved and audit trail updated successfully.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Correction rejected.');
    }
  };

  const getStatusBadgeStyles = (status: AttendanceStatus) => {
    const maps = {
      present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
      late: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
      absent: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
      excused: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
    };
    return maps[status];
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring Portal
          </h1>
          <p className="text-xs text-slate-405">Verify biometric entries and submit manual attendance override ledgers</p>
        </div>
      </div>

      {/* Course Selector Filter Bar */}
      <div className="space-y-3">
        {/* Class / Block Switcher */}
        {assignedClasses.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Active Block:</span>
            <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl gap-1">
              {assignedClasses.map((clsId: string) => {
                const cls = students.find(s => s.classId === clsId);
                const label = cls?.className || clsId;
                const isActive = selectedClassId === clsId;
                return (
                  <button
                    key={clsId}
                    onClick={() => setSelectedClassId(clsId)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-4 md:col-span-2 flex flex-col sm:flex-row gap-4 items-center">
          <div className="w-full sm:flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <BookOpen className="w-4 h-4 text-clinical-550" />
              Assigned Course
            </label>
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-clinical-500"
            >
              {availableCourses.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-56">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <CalendarDays className="w-4 h-4 text-accent-500" />
              Worksheet Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-808 dark:text-slate-100 text-xs font-semibold focus:outline-none"
            />
          </div>
        </Card>

        {/* Live Stat Box */}
        <Card className="p-4 bg-gradient-to-tr from-clinical-600 to-accent-600 text-white flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-clinical-100">Intake Presence Rate</p>
            <h3 className="text-3xl font-extrabold font-heading">{boundPercentage}%</h3>
            <p className="text-[10px] text-clinical-200 font-medium">Selected Period: {selectedDate}</p>
          </div>
          <div className="text-right text-[11px] font-medium text-clinical-100 space-y-0.5">
            <div>Present: {presentsCount}</div>
            <div>Late: {latesCount}</div>
            <div>Excused: {excusedCount}</div>
            <div>Absent: {absentsCount}</div>
          </div>
        </Card>
      </div>
      </div>

      {/* Tabs Layout */}
      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveTab('worksheet')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'worksheet' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-455 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Daily Attendance Worksheet
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'corrections' ? 'bg-clinical-600 text-white shadow-md shadow-clinical-500/10' : 'text-slate-500 dark:text-slate-455 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Historical Overrides & Audits
        </button>
      </div>

      {/* TAB 1: DAILY WORKSHEET */}
      {activeTab === 'worksheet' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex justify-between items-center">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">
                  Daily Register ({totalEnrolled} Enrolled)
                </h3>
                {existingRecordsForDay.length > 0 && (
                  <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-555 font-bold uppercase tracking-wider">
                    Overwrite Active
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-150 dark:divide-slate-800/60">
                {enrolledStudents.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 font-semibold text-xs">
                    No students currently enrolled in this dentistry subject.
                  </div>
                ) : (
                  enrolledStudents.map(student => {
                    const currentStatus = attendanceSheet[student.id] || 'present';
                    return (
                      <div key={student.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors">
                        <div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">{student.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">{student.studentId}</span>
                        </div>

                        {/* Status Buttons */}
                        <div className="flex flex-wrap gap-1.5 self-start sm:self-auto">
                          {(['present', 'late', 'excused', 'absent'] as AttendanceStatus[]).map(st => (
                            <button
                              key={st}
                              onClick={() => handleStatusChange(student.id, st)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                                currentStatus === st
                                  ? st === 'present' ? 'bg-emerald-555 text-white shadow-sm' :
                                    st === 'late' ? 'bg-amber-500 text-white shadow-sm' :
                                    st === 'excused' ? 'bg-sky-500 text-white shadow-sm' : 'bg-rose-500 text-white shadow-sm'
                                  : 'bg-slate-100 dark:bg-slate-950 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {enrolledStudents.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
                  <button
                    onClick={handleSaveAttendance}
                    className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-xs shadow-md transition-all active:scale-97"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaved ? 'Ledger Logged Successfully!' : 'Save Attendance Ledger'}</span>
                  </button>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="w-4.5 h-4.5 text-accent-500" />
                  Recent Daily Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pastDatesLogs.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No historical logs recorded for this course.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {pastDatesLogs.map(date => (
                      <div
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 hover:border-clinical-500/35 cursor-pointer flex justify-between items-center transition-all"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-202 font-mono">{date}</div>
                          <p className="text-[9px] text-slate-405 mt-0.5">Click to load checklist</p>
                        </div>
                        <span className="text-[10px] px-2.5 py-0.5 bg-clinical-50 text-clinical-650 dark:bg-clinical-950/40 dark:text-clinical-450 rounded-md font-extrabold">
                          {getPastDateStats(date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORICAL OVERRIDES & CORRECTIONS */}
      {activeTab === 'corrections' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-202">Attendance Ledger History</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Correct incorrect biometrics logs. Every modification tracks a security audit trail.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student ID or Name..."
                  value={correctionsSearch}
                  onChange={(e) => setCorrectionsSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-xs font-medium">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr className="text-left font-bold text-[9px] uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Course Code</th>
                  <th className="px-5 py-3">Logged Status</th>
                  <th className="px-5 py-3 text-center">Actions Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {filteredHistoricalRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      No historical logs match your selectors.
                    </td>
                  </tr>
                ) : (
                  filteredHistoricalRecords.map(record => {
                    const studentObj = students.find(s => s.id === record.studentId);
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-850 dark:text-slate-202">{studentObj ? studentObj.name : 'Unknown'}</div>
                          <span className="text-[10px] text-slate-400">{studentObj?.studentId}</span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-700 dark:text-slate-350">{record.date}</td>
                        <td className="px-5 py-3.5 font-bold font-mono text-clinical-600 dark:text-clinical-450">{record.subjectCode}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${getStatusBadgeStyles(record.status)}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => {
                                setSelectedCorrectionRecord(record);
                                setCorrectStatus(record.status === 'excused' ? 'present' : record.status);
                                setCorrectionReason('');
                                setErrorMessage('');
                                setIsCorrectionModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-[10px] rounded-lg font-bold border border-slate-200 dark:border-slate-800 shadow-sm"
                            >
                              Correct Log
                            </button>
                            <button
                              onClick={() => {
                                setAuditRecord(record);
                                setIsAuditModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-clinical-650 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
                              title="Audit History Trail"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* CORRECT ATTENDANCE OVERRIDE MODAL */}
      <Modal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        title="Manual Attendance Correction"
      >
        {selectedCorrectionRecord && (
          <form onSubmit={handleCorrectSubmit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1.5 text-slate-500">
              <div><span className="font-bold text-slate-400">Student:</span> <strong className="text-slate-800 dark:text-slate-200">{students.find(s=>s.id === selectedCorrectionRecord.studentId)?.name}</strong></div>
              <div><span className="font-bold text-slate-400">Course Code:</span> <strong className="text-clinical-600">{selectedCorrectionRecord.subjectCode}</strong></div>
              <div><span className="font-bold text-slate-400">Record Date:</span> <strong className="text-slate-800 dark:text-slate-200 font-mono">{selectedCorrectionRecord.date}</strong></div>
              <div>
                <span className="font-bold text-slate-400">Current Status:</span>{' '}
                <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${getStatusBadgeStyles(selectedCorrectionRecord.status)}`}>
                  {selectedCorrectionRecord.status}
                </span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                <AlertOctagon className="w-4.5 h-4.5" />
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                New Correct Status
              </label>
              <select
                value={correctStatus}
                onChange={(e) => setCorrectStatus(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-808 dark:text-slate-100 text-xs focus:outline-none"
              >
                <option value="present">PRESENT</option>
                <option value="late">LATE</option>
                <option value="absent">ABSENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Justification / Reason
              </label>
              <textarea
                required
                rows={3}
                placeholder="Must explain correction reason for compliance checks..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs focus:outline-none resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-2 justify-end">
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-clinical-500 hover:bg-clinical-600 text-white font-semibold text-xs shadow-md"
              >
                Confirm Correction
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* VIEW HISTORICAL AUDIT TRAIL MODAL */}
      <Modal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Override Audit Trail Ledger"
      >
        <div className="space-y-4">
          <div className="border border-slate-150 dark:border-slate-850 rounded-2xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/60 font-bold uppercase text-[9px] text-slate-400 tracking-wider">
                <tr>
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Previous</th>
                  <th className="px-4 py-2">Override</th>
                  <th className="px-4 py-2">Audit justification</th>
                  <th className="px-4 py-2">By Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-[11px]">
                {!auditRecord?.auditTrail || auditRecord.auditTrail.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-450 italic">
                      This record contains no manual override overrides; logged via automated face biometrics scanning.
                    </td>
                  </tr>
                ) : (
                  auditRecord.auditTrail.map(trail => (
                    <tr key={trail.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono whitespace-nowrap">{new Date(trail.changedAt).toLocaleString()}</td>
                      <td className="px-4 py-2 capitalize font-semibold text-slate-450">{trail.previousStatus}</td>
                      <td className="px-4 py-2 capitalize font-bold text-slate-800 dark:text-slate-205">{trail.newStatus}</td>
                      <td className="px-4 py-2 text-slate-550 dark:text-slate-400">{trail.reason}</td>
                      <td className="px-4 py-2 font-semibold text-clinical-600">{trail.changedByName} ({trail.changedBy})</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setIsAuditModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
            >
              Close Ledger
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
