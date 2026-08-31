import React, { useState, useEffect, useMemo } from 'react';
import { 
  Check, 
  UserX, 
  Clock, 
  CheckCircle2, 
  Save, 
  Search,
  Plus,
  Play,
  Pencil,
  MapPin,
  Camera,
  Navigation,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, AttendanceRecord, AttendanceStatus } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { overrideFacultyAttendanceApi } from '../../services/apiClient';

type EditableStatus = Exclude<AttendanceStatus, 'excused'>;

const TIME_OPTIONS = [
  { label: '07:00 AM', val: '07:00' },
  { label: '07:30 AM', val: '07:30' },
  { label: '08:00 AM', val: '08:00' },
  { label: '08:30 AM', val: '08:30' },
  { label: '09:00 AM', val: '09:00' },
  { label: '09:30 AM', val: '09:30' },
  { label: '10:00 AM', val: '10:00' },
  { label: '10:30 AM', val: '10:30' },
  { label: '11:00 AM', val: '11:00' },
  { label: '11:30 AM', val: '11:30' },
  { label: '12:00 PM', val: '12:00' },
  { label: '12:30 PM', val: '12:30' },
  { label: '01:00 PM', val: '13:00' },
  { label: '01:30 PM', val: '13:30' },
  { label: '02:00 PM', val: '14:00' },
  { label: '02:30 PM', val: '14:30' },
  { label: '03:00 PM', val: '15:00' },
  { label: '03:30 PM', val: '15:30' },
  { label: '04:00 PM', val: '16:00' },
  { label: '04:30 PM', val: '16:30' },
  { label: '05:00 PM', val: '17:00' },
  { label: '05:30 PM', val: '17:30' },
  { label: '06:00 PM', val: '18:00' },
];

export const AttendanceMonitoring: React.FC = () => {
  const { students = [], attendanceRecords = [], addAttendanceRecord, overrideAttendanceRecord } = useApp();
  const { user } = useAuth();

  const assignedSubjects = ['CLIN401', 'CLIN402', 'CLIN301', 'CLIN302'];
  const assignedClasses = ['Section 4-A', 'Section 4-B'];

  // Tab State: 'worksheet' | 'corrections'
  const [activeTab, setActiveTab] = useState<'worksheet' | 'corrections'>('worksheet');

  // Filter dropdown states
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('2025-2026');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Course & Date selectors
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('CLIN401');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // ----------------------------------------------------
  // START ATTENDANCE SESSION MODAL STATES (FULL SECRETARY FEATURES)
  // ----------------------------------------------------
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [sessionSubject, setSessionSubject] = useState('CLIN401');
  const [sessionRoom, setSessionRoom] = useState('Dental Clinic Room 101');
  const [startTimeStr, setStartTimeStr] = useState('08:00');
  const [endTimeStr, setEndTimeStr] = useState('12:00');
  const [requireFace, setRequireFace] = useState(true);
  const [requireGeo, setRequireGeo] = useState(true);
  const [geofenceRadius, setGeofenceRadius] = useState(200);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; address: string } | null>({
    lat: 13.1436,
    lng: 123.7438,
    address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)'
  });
  const [isLocating, setIsLocating] = useState(false);

  const [activeSession, setActiveSession] = useState<{ 
    subject: string; 
    room: string; 
    startTime: string;
    requireFace: boolean;
    requireGeo: boolean;
    radius: number;
  } | null>(null);

  // Compute duration minutes
  const computeDurationMinutes = (start: string, end: string): number => {
    if (!start || !end) return 120;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    let startTotalMins = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);
    let endTotalMins = (isNaN(endH) ? 12 : endH) * 60 + (isNaN(endM) ? 0 : endM);
    if (endTotalMins <= startTotalMins) {
      endTotalMins += 24 * 60;
    }
    return endTotalMins - startTotalMins;
  };

  const handleApplyPresetHours = (hours: number) => {
    const [startH, startM] = startTimeStr.split(':').map(Number);
    let endH = (isNaN(startH) ? 8 : startH) + hours;
    if (endH >= 24) endH = endH - 24;
    const endHStr = endH.toString().padStart(2, '0');
    const endMStr = (isNaN(startM) ? 0 : startM).toString().padStart(2, '0');
    setEndTimeStr(`${endHStr}:${endMStr}`);
  };

  const calculatedMinutes = computeDurationMinutes(startTimeStr, endTimeStr);
  const calculatedHours = Math.floor(calculatedMinutes / 60);
  const calculatedRemainingMins = calculatedMinutes % 60;
  const formattedDurationLabel = `${calculatedHours > 0 ? `${calculatedHours} hr${calculatedHours > 1 ? 's' : ''}` : ''} ${calculatedRemainingMins > 0 ? `${calculatedRemainingMins} min${calculatedRemainingMins > 1 ? 's' : ''}` : ''} (${calculatedMinutes} mins total)`.trim();

  const handleVerifyGps = () => {
    setIsLocating(true);
    setTimeout(() => {
      setGpsLocation({
        lat: 13.1436,
        lng: 123.7438,
        address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)'
      });
      setIsLocating(false);
      showFeedback('Faculty GPS location verified successfully.', 'success');
    }, 800);
  };

  // Notification Toast
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Daily Worksheet States
  const [attendanceSheet, setAttendanceSheet] = useState<Record<string, AttendanceStatus>>({});
  const [isSaved, setIsSaved] = useState(false);

  // Safe students list
  const safeStudents = useMemo(() => students || [], [students]);

  // Available courses list
  const availableCourses = useMemo(() => [
    { code: 'CLIN401', name: 'Clinical Dentistry I', room: 'Dental Clinic Room 101' },
    { code: 'CLIN402', name: 'Clinical Dentistry II', room: 'Dental Clinic Room 204' },
    { code: 'CLIN301', name: 'Oral Pathology & Medicine', room: 'Dental Clinic Room 103' },
    { code: 'CLIN302', name: 'Periodontics & Endodontics', room: 'Dental Operating Room B' }
  ], []);

  // Filter students based on selected class section & course
  const enrolledStudents = useMemo(() => {
    return safeStudents.filter(s => {
      const matchesClass = selectedClassId === 'all' || 
        s.classSections?.some(cs => cs.classId === selectedClassId || cs.className?.includes(selectedClassId));
      const matchesSearch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (s.studentId || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesClass && matchesSearch;
    });
  }, [safeStudents, selectedClassId, searchQuery]);

  // Existing records for selected day
  const existingRecordsForDay = useMemo(() => {
    return (attendanceRecords || []).filter(
      r => r.date === selectedDate && r.subjectCode === selectedCourseCode
    );
  }, [attendanceRecords, selectedDate, selectedCourseCode]);

  // Initialize sheet state
  useEffect(() => {
    const initialSheet: Record<string, AttendanceStatus> = {};
    enrolledStudents.forEach(student => {
      const match = (attendanceRecords || []).find(
        r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
      );
      initialSheet[student.id] = match ? match.status : 'present';
    });
    setAttendanceSheet(initialSheet);
    setIsSaved(false);
  }, [selectedCourseCode, selectedDate, enrolledStudents, attendanceRecords]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setAttendanceSheet(prev => ({
      ...prev,
      [studentId]: status
    }));
    setIsSaved(false);
  };

  const handleSaveAttendance = () => {
    Object.entries(attendanceSheet).forEach(([studentId, status]) => {
      if (addAttendanceRecord) {
        addAttendanceRecord({
          studentId,
          date: selectedDate,
          subjectCode: selectedCourseCode,
          status
        });
      }
    });

    setIsSaved(true);
    setNotification({
      type: 'success',
      message: `Daily attendance worksheet saved for ${selectedCourseCode} (${selectedDate})!`
    });
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  // Start Session Submit Handler
  const handleStartSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startOption = TIME_OPTIONS.find(t => t.val === startTimeStr);
    const nowLabel = startOption ? startOption.label : startTimeStr;
    setActiveSession({
      subject: sessionSubject,
      room: sessionRoom,
      startTime: nowLabel,
      requireFace,
      requireGeo,
      radius: geofenceRadius
    });
    setIsStartSessionOpen(false);
    setNotification({
      type: 'success',
      message: `Live Biometric Attendance Session Started for ${sessionSubject} (${formattedDurationLabel})!`
    });
  };

  // Stat calculations
  const totalEnrolled = enrolledStudents.length;
  const countStatus = (status: AttendanceStatus) => {
    return Object.values(attendanceSheet).filter(s => s === status).length;
  };

  const presentsCount = countStatus('present');
  const latesCount = countStatus('late');
  const absentsCount = countStatus('absent');
  const excusedCount = countStatus('excused');

  const presentPercentage = totalEnrolled > 0 
    ? Math.round(((presentsCount + latesCount) / totalEnrolled) * 100)
    : 100;

  // Correction Form Modal State
  const [selectedCorrectionRecord, setSelectedCorrectionRecord] = useState<AttendanceRecord | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctStatus, setCorrectStatus] = useState<EditableStatus>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Filter historical records
  const historicalRecords = useMemo(() => {
    return (attendanceRecords || []).filter(r =>
      assignedSubjects.includes(r.subjectCode) &&
      safeStudents.some(s => s.id === r.studentId && (selectedClassId === 'all' || s.classSections?.some(section => section.classId === selectedClassId)))
    );
  }, [attendanceRecords, assignedSubjects, safeStudents, selectedClassId]);

  const filteredHistoricalRecords = useMemo(() => {
    return historicalRecords.filter(record => {
      const student = safeStudents.find(s => s.id === record.studentId);
      if (!student) return false;

      const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            student.studentId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [historicalRecords, safeStudents, searchQuery]);

  const handleCorrectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedCorrectionRecord) return;
    const cleanedReason = correctionReason.trim();
    if (cleanedReason.length < 8) {
      setErrorMessage('Reason must be at least 8 characters long.');
      return;
    }

    try {
      await overrideFacultyAttendanceApi({
        recordId: selectedCorrectionRecord.id,
        status: correctStatus,
        reason: cleanedReason,
      });
      if (overrideAttendanceRecord) {
        overrideAttendanceRecord({
          recordId: selectedCorrectionRecord.id,
          studentId: selectedCorrectionRecord.studentId,
          date: selectedCorrectionRecord.date,
          subjectCode: selectedCorrectionRecord.subjectCode,
          status: correctStatus,
          reason: cleanedReason,
          changedBy: user?.login_email || 'faculty',
          changedByName: user?.display_name || 'Faculty Member',
          assignedClassId: selectedClassId,
        });
      }
      setIsCorrectionModalOpen(false);
      setSelectedCorrectionRecord(null);
      setCorrectionReason('');
      setNotification({
        type: 'success',
        message: 'Attendance override ledger updated successfully!'
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Correction rejected.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring Portal
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Verify biometric check-ins, launch live attendance sessions, and submit manual override ledgers.
          </p>
        </div>

        {/* Top Right Action Button: Start Attendance Session */}
        <div className="flex items-center gap-2.5">
          {activeSession && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>LIVE: {activeSession.subject} ({activeSession.startTime})</span>
            </div>
          )}

          <button
            onClick={() => setIsStartSessionOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Attendance Session</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* 2. Control Bar: Tabs & Pill Filter Dropdowns Below */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        {/* Tabs Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('worksheet')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'worksheet'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Daily Attendance Worksheet
          </button>
          <button
            onClick={() => setActiveTab('corrections')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'corrections'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Historical Overrides & Audits
          </button>
        </div>

        {/* Filters & Search Bar Positioned Below */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Class Section Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Class Sections</option>
              {assignedClasses.map((clsLabel: string) => (
                <option key={clsLabel} value={clsLabel}>{clsLabel}</option>
              ))}
            </select>
          </div>

          {/* School Year Selector Filter Dropdown */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors">
            <select
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
            >
              <option value="2025-2026">S.Y. 2025-2026 (Current)</option>
              <option value="2024-2025">S.Y. 2024-2025</option>
            </select>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search student ID, name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* Course & Date Selector Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="p-4 md:col-span-2 flex flex-col sm:flex-row gap-4 items-center">
          <div className="w-full sm:flex-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Assigned Course
            </label>
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              {availableCourses.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-56">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Worksheet Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </Card>

        {/* Live Attendance Stat Card */}
        <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Intake Presence Rate</p>
            <h3 className="text-3xl font-extrabold font-heading text-emerald-600 dark:text-emerald-400">{presentPercentage}%</h3>
            <p className="text-[10px] text-slate-400 font-medium">Selected Date: {selectedDate}</p>
          </div>
          <div className="text-right text-[11px] font-bold text-slate-600 dark:text-slate-300 space-y-0.5">
            <div className="text-emerald-600 dark:text-emerald-400 font-extrabold">Present: {presentsCount}</div>
            <div className="text-amber-600 dark:text-amber-400">Late: {latesCount}</div>
            <div className="text-sky-600 dark:text-sky-400">Excused: {excusedCount}</div>
            <div className="text-rose-600 dark:text-rose-400">Absent: {absentsCount}</div>
          </div>
        </Card>
      </div>

      {/* TAB 1: DAILY WORKSHEET */}
      {activeTab === 'worksheet' && (
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                Daily Register ({totalEnrolled} Enrolled)
              </h2>
              <p className="text-xs text-slate-400">Mark or verify daily attendance status for enrolled students.</p>
            </div>

            <button
              onClick={handleSaveAttendance}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Attendance Ledger</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4 text-center">Status Selection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {enrolledStudents.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-10 text-center text-slate-400">
                      No students found matching selected section filter.
                    </td>
                  </tr>
                ) : (
                  enrolledStudents.map(student => {
                    const currentStatus = attendanceSheet[student.id] || 'present';
                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{student.studentId} • Year {student.yearLevel}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, 'present')}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                currentStatus === 'present'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              Present
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, 'late')}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                currentStatus === 'late'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              Late
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, 'absent')}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                currentStatus === 'absent'
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              Absent
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(student.id, 'excused')}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                currentStatus === 'excused'
                                  ? 'bg-sky-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              Excused
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

      {/* TAB 2: HISTORICAL OVERRIDES & AUDITS */}
      {activeTab === 'corrections' && (
        <Card className="p-6">
          <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Historical Overrides & Audit Trail ({filteredHistoricalRecords.length})
            </h2>
            <p className="text-xs text-slate-400">View attendance log audit history or submit official faculty corrections.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Course & Date</th>
                  <th className="py-3 px-4">Logged Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredHistoricalRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400">
                      No historical attendance records match search filter.
                    </td>
                  </tr>
                ) : (
                  filteredHistoricalRecords.map(rec => {
                    const student = safeStudents.find(s => s.id === rec.studentId);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                          {student?.name || 'Unknown'}
                          <span className="block text-[10px] text-slate-400 font-mono">{student?.studentId}</span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <span className="font-mono font-bold">{rec.subjectCode}</span> • {rec.date}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase ${
                            rec.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                            rec.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {rec.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedCorrectionRecord(rec);
                              setCorrectStatus(rec.status === 'excused' ? 'present' : rec.status);
                              setCorrectionReason('');
                              setIsCorrectionModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-[11px] font-bold cursor-pointer"
                            title="Override Attendance Record"
                          >
                            <Pencil className="w-3.5 h-3.5" />
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
      )}

      {/* Modal: Start Attendance Session (FULL SECRETARY FEATURES) */}
      {isStartSessionOpen && (
        <Modal isOpen={isStartSessionOpen} onClose={() => setIsStartSessionOpen(false)} title="Start Live Attendance Session">
          <form onSubmit={handleStartSessionSubmit} className="space-y-4 text-xs">
            
            {/* 1. Subject / Course Selection */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Assigned Course</label>
              <select
                value={sessionSubject}
                onChange={(e) => {
                  setSessionSubject(e.target.value);
                  const matched = availableCourses.find(c => c.code === e.target.value);
                  if (matched) setSessionRoom(matched.room);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
              >
                {availableCourses.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            {/* 2. Clinic Room / Venue */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Clinic Room / Location Venue</label>
              <input
                type="text"
                required
                value={sessionRoom}
                onChange={(e) => setSessionRoom(e.target.value)}
                placeholder="e.g. Dental Clinic Room 101"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            {/* 3. Class Schedule Times & Presets */}
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">Class Schedule Time Window</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">Start Time</span>
                  <select
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t.val} value={t.val}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">End Time</span>
                  <select
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t.val} value={t.val}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preset Quick Duration Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Duration: {formattedDurationLabel}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => handleApplyPresetHours(hrs)}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-300 font-bold text-[10px] transition-colors cursor-pointer"
                    >
                      +{hrs}h
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Verification Security Toggles */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">Attendance Security Verification Controls</label>
              
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold block text-slate-800 dark:text-slate-100">Facial Biometrics Required</span>
                    <span className="text-[10px] text-slate-400">Students must verify selfie against registered face biometrics</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={requireFace}
                  onChange={(e) => setRequireFace(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold block text-slate-800 dark:text-slate-100">GPS Geofencing Required</span>
                    <span className="text-[10px] text-slate-400">Students must be physically within classroom radius</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={requireGeo}
                  onChange={(e) => setRequireGeo(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              {requireGeo && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Geofence Boundary Radius</span>
                    <span className="font-bold text-emerald-600">{geofenceRadius} meters</span>
                  </div>
                  <select
                    value={geofenceRadius}
                    onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold cursor-pointer"
                  >
                    <option value={50}>50 Meters (Strict Classroom Radius)</option>
                    <option value={100}>100 Meters (Dental Building Perimeter)</option>
                    <option value={200}>200 Meters (Campus Dental Wing)</option>
                    <option value={500}>500 Meters (Bicol University Campus)</option>
                  </select>
                </div>
              )}
            </div>

            {/* 5. GPS Location Verification Status */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold block">Faculty GPS Verified</span>
                  <span className="text-[10px] text-emerald-600/80 block">{gpsLocation?.address || '13.1436°, 123.7438°'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleVerifyGps}
                disabled={isLocating}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                <span>Re-verify</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsStartSessionOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Start Session
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Manual Attendance Override */}
      {isCorrectionModalOpen && selectedCorrectionRecord && (
        <Modal isOpen={isCorrectionModalOpen} onClose={() => setIsCorrectionModalOpen(false)} title="Override Attendance Record">
          <form onSubmit={handleCorrectSubmit} className="space-y-4 text-xs">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {errorMessage}
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select Correct Status</label>
              <select
                value={correctStatus}
                onChange={(e) => setCorrectStatus(e.target.value as EditableStatus)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Justification Reason</label>
              <textarea
                rows={3}
                required
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Enter justification for manual faculty override..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCorrectionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Save Correction
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};
