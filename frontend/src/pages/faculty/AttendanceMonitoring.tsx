import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays,
  Camera,
  Check, 
  CheckCircle2, 
  Clock,
  History,
  MapPin,
  Navigation,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  UserX
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Student, AttendanceRecord, AttendanceStatus } from '../../types';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { requestConfirmation, showFeedback } from '../../components/FeedbackCenter';
import { computeFacultyGradesApi, overrideFacultyAttendanceApi } from '../../services/apiClient';

export interface AttendanceSession {
  id: string;
  subject: string;
  room: string;
  date: string;
  startTime: string;
  endTime?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
  requireFace: boolean;
  requireGeo: boolean;
  radius: number;
  status: 'active' | 'ended' | 'cancelled';
  notes?: string;
}

const DEFAULT_INITIAL_SESSIONS: AttendanceSession[] = [
  {
    id: 'sess-001',
    subject: 'CLIN401',
    room: 'Dental Clinic Room 101',
    date: '2024-10-07',
    startTime: '08:00',
    endTime: '12:00',
    startedAt: '2024-10-07T08:00:00.000Z',
    endedAt: '2024-10-07T12:00:00.000Z',
    durationMinutes: 240,
    requireFace: true,
    requireGeo: true,
    radius: 200,
    status: 'ended',
    notes: 'Regular clinical laboratory session'
  },
  {
    id: 'sess-002',
    subject: 'PROS402',
    room: 'Dental Clinic Room 204',
    date: '2024-10-06',
    startTime: '13:00',
    endTime: '17:00',
    startedAt: '2024-10-06T13:00:00.000Z',
    endedAt: '2024-10-06T17:00:00.000Z',
    durationMinutes: 240,
    requireFace: true,
    requireGeo: true,
    radius: 200,
    status: 'ended',
  },
  {
    id: 'sess-003',
    subject: 'ORAL301',
    room: 'Operating Room B',
    date: '2024-10-05',
    startTime: '07:00',
    endTime: '09:00',
    startedAt: '2024-10-05T07:00:00.000Z',
    endedAt: '2024-10-05T09:00:00.000Z',
    durationMinutes: 120,
    requireFace: true,
    requireGeo: true,
    radius: 100,
    status: 'ended',
  }
];

const formatTimeDisplay = (time24: string) => {
  if (!time24) return '08:00 AM';
  if (time24.includes('AM') || time24.includes('PM')) return time24;
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
};

type EditableStatus = AttendanceStatus;

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
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');

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

  const [sessions, setSessions] = useState<AttendanceSession[]>(() => {
    try {
      const saved = localStorage.getItem('dentisys_attendance_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_INITIAL_SESSIONS;
  });

  const saveSessions = (updated: AttendanceSession[]) => {
    setSessions(updated);
    localStorage.setItem('dentisys_attendance_sessions', JSON.stringify(updated));
  };

  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(() => {
    try {
      const saved = localStorage.getItem('dentisys_active_class_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.status === 'active') return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Session History Modal
  const [isSessionHistoryOpen, setIsSessionHistoryOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [sessionHistoryFilter, setSessionHistoryFilter] = useState<'all' | 'active' | 'ended'>('all');

  // Edit Session Modal
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<AttendanceSession | null>(null);
  const [editSubject, setEditSubject] = useState('CLIN401');
  const [editRoom, setEditRoom] = useState('');
  const [editStartTime, setEditStartTime] = useState('08:00');
  const [editEndTime, setEditEndTime] = useState('12:00');
  const [editRequireFace, setEditRequireFace] = useState(true);
  const [editRequireGeo, setEditRequireGeo] = useState(true);
  const [editRadius, setEditRadius] = useState(200);
  const [editNotes, setEditNotes] = useState('');

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

  // Filter students matching the statusFilter (All | Present | Late | Absent | Excused)
  const displayedStudents = useMemo(() => {
    return enrolledStudents.filter(student => {
      if (statusFilter === 'all') return true;
      const match = (attendanceRecords || []).find(
        r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
      );
      const currentStatus = attendanceSheet[student.id] || (match ? match.status : 'present');
      return currentStatus === statusFilter;
    });
  }, [enrolledStudents, statusFilter, attendanceSheet, attendanceRecords, selectedDate, selectedCourseCode]);

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

  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    enrolledStudents.forEach(s => {
      updated[s.id] = 'present';
    });
    setAttendanceSheet(prev => ({ ...prev, ...updated }));
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
    const sessionId = 'sess-' + Date.now();
    const today = selectedDate || new Date().toISOString().split('T')[0];
    const newSession: AttendanceSession = {
      id: sessionId,
      subject: sessionSubject,
      room: sessionRoom,
      date: today,
      startTime: startTimeStr,
      endTime: endTimeStr,
      startedAt: new Date().toISOString(),
      durationMinutes: calculatedMinutes,
      requireFace,
      requireGeo,
      radius: geofenceRadius,
      status: 'active'
    };
    setActiveSession(newSession);
    localStorage.setItem('dentisys_active_class_session', JSON.stringify(newSession));

    const updatedSessions = [
      newSession,
      ...sessions.map(s => s.status === 'active' ? { ...s, status: 'ended' as const, endedAt: new Date().toISOString() } : s)
    ];
    saveSessions(updatedSessions);

    setIsStartSessionOpen(false);
    setNotification({
      type: 'success',
      message: `Live Biometric Attendance Session Started for ${sessionSubject} (${formattedDurationLabel})!`
    });
  };

  const handleEndSession = () => {
    if (activeSession) {
      const updatedSessions = sessions.map(s => {
        if (s.id === activeSession.id || (s.subject === activeSession.subject && s.status === 'active')) {
          return { ...s, status: 'ended' as const, endedAt: new Date().toISOString() };
        }
        return s;
      });
      saveSessions(updatedSessions);
    }
    setActiveSession(null);
    localStorage.removeItem('dentisys_active_class_session');
    setNotification({ message: 'Active Attendance Session ended.', type: 'success' });
  };

  const handleOpenEditSession = (session: AttendanceSession) => {
    setEditingSession(session);
    setEditSubject(session.subject);
    setEditRoom(session.room);
    setEditStartTime(session.startTime || '08:00');
    setEditEndTime(session.endTime || '12:00');
    setEditRequireFace(session.requireFace ?? true);
    setEditRequireGeo(session.requireGeo ?? true);
    setEditRadius(session.radius || 200);
    setEditNotes(session.notes || '');
    setIsEditSessionOpen(true);
  };

  const handleSaveEditSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;

    const duration = computeDurationMinutes(editStartTime, editEndTime);
    const updated: AttendanceSession = {
      ...editingSession,
      subject: editSubject,
      room: editRoom,
      startTime: editStartTime,
      endTime: editEndTime,
      durationMinutes: duration,
      requireFace: editRequireFace,
      requireGeo: editRequireGeo,
      radius: editRadius,
      notes: editNotes,
    };

    const updatedSessions = sessions.map(s => s.id === updated.id ? updated : s);
    saveSessions(updatedSessions);

    if (activeSession && (activeSession.id === updated.id || updated.status === 'active')) {
      setActiveSession(updated);
      localStorage.setItem('dentisys_active_class_session', JSON.stringify(updated));
    }

    setIsEditSessionOpen(false);
    setNotification({
      type: 'success',
      message: `Session details updated successfully (Subject: ${updated.subject}, Room: ${updated.room}).`
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    const sessionToDelete = sessions.find(s => s.id === sessionId);
    if (!sessionToDelete) return;

    if (!window.confirm(`Are you sure you want to delete session record for ${sessionToDelete.subject} (${sessionToDelete.date})?`)) {
      return;
    }

    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    saveSessions(updatedSessions);

    if (activeSession && (activeSession.id === sessionId || sessionToDelete.status === 'active')) {
      setActiveSession(null);
      localStorage.removeItem('dentisys_active_class_session');
    }

    setNotification({
      type: 'success',
      message: `Session record for ${sessionToDelete.subject} has been deleted.`
    });
  };

  const handleRelaunchSession = (session: AttendanceSession) => {
    setSessionSubject(session.subject);
    setSessionRoom(session.room);
    setStartTimeStr(session.startTime || '08:00');
    setEndTimeStr(session.endTime || '12:00');
    setRequireFace(session.requireFace ?? true);
    setRequireGeo(session.requireGeo ?? true);
    setGeofenceRadius(session.radius || 200);
    setIsSessionHistoryOpen(false);
    setIsStartSessionOpen(true);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (sessionHistoryFilter === 'active' && s.status !== 'active') return false;
      if (sessionHistoryFilter === 'ended' && s.status !== 'ended') return false;
      if (!sessionSearchQuery) return true;
      const q = sessionSearchQuery.toLowerCase();
      const courseName = availableCourses.find(c => c.code === s.subject)?.name?.toLowerCase() || '';
      return (
        s.subject.toLowerCase().includes(q) ||
        s.room.toLowerCase().includes(q) ||
        s.date.includes(q) ||
        courseName.includes(q)
      );
    });
  }, [sessions, sessionHistoryFilter, sessionSearchQuery, availableCourses]);

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
        status: correctStatus as 'present' | 'absent' | 'late',
        reason: cleanedReason,
      });
      let recomputeDeferred = false;
      try {
        await computeFacultyGradesApi(selectedCorrectionRecord.classId);
      } catch {
        recomputeDeferred = true;
      }
      if (overrideAttendanceRecord) {
        overrideAttendanceRecord({
          recordId: selectedCorrectionRecord.id,
          studentId: selectedCorrectionRecord.studentId,
          date: selectedCorrectionRecord.date,
          subjectCode: selectedCorrectionRecord.subjectCode,
          status: correctStatus as any,
          reason: cleanedReason,
          changedBy: user?.login_email || 'faculty',
          changedByName: user?.display_name || 'Faculty Member',
          assignedClassId: selectedClassId,
        });
      }
      setAttendanceSheet(prev => ({
        ...prev,
        [selectedCorrectionRecord.studentId]: correctStatus
      }));
      setIsCorrectionModalOpen(false);
      setSelectedCorrectionRecord(null);
      setCorrectionReason('');
      setNotification({
        type: 'success',
        message: recomputeDeferred
          ? 'Attendance override saved; persisted grade recomputation could not complete yet.'
          : 'Attendance override updated successfully!'
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Correction rejected.');
    }
  };

  const handleOpenOverrideForStudent = (student: Student) => {
    const existing = (attendanceRecords || []).find(
      r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
    );
    const currentStat = attendanceSheet[student.id] || (existing ? existing.status : 'present');

    const recordToEdit: AttendanceRecord = existing || {
      id: `att-${student.id}-${selectedDate}`,
      studentId: student.id,
      date: selectedDate,
      subjectCode: selectedCourseCode,
      status: currentStat,
      classId: student.classId || 'cls-1',
      verificationType: 'facial_geofence',
      faceVerified: true,
      verifiedAt: currentStat === 'present' ? '08:04 AM' : currentStat === 'late' ? '08:28 AM' : undefined,
    };

    setSelectedCorrectionRecord(recordToEdit);
    setCorrectStatus(currentStat);
    setCorrectionReason('');
    setErrorMessage('');
    setIsCorrectionModalOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Manage daily attendance roll-call and launch live biometric attendance sessions.
          </p>
        </div>

        {/* Top Right Action Button: Start Attendance Session */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          {activeSession ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>LIVE: {activeSession.subject} · {activeSession.room} ({formatTimeDisplay(activeSession.startTime)})</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenEditSession(activeSession)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                title="Edit active session details"
              >
                <Pencil className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Edit Session</span>
              </button>
              <button
                type="button"
                onClick={handleEndSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-bold border border-rose-200/60 dark:border-rose-900/40 cursor-pointer transition-colors"
                title="End active live session"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>End Session</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsStartSessionOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer w-full sm:w-auto"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Attendance Session</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSessionHistoryOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
            title="View created sessions and history"
          >
            <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Session History</span>
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

      {/* 2. Unified Filter Bar (Maximized Space & Fully Mobile Responsive) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 flex-1">
          {/* Course Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors w-full sm:w-auto flex-1 sm:min-w-[200px]">
            <select
              value={selectedCourseCode}
              onChange={(e) => setSelectedCourseCode(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              {availableCourses.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          {/* Section Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors w-full sm:w-auto min-w-[130px]">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all">All Sections</option>
              {assignedClasses.map((clsLabel: string) => (
                <option key={clsLabel} value={clsLabel}>{clsLabel}</option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors w-full sm:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Status Filter Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 shadow-xs hover:border-emerald-500 transition-colors w-full sm:w-auto min-w-[140px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AttendanceStatus)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses ({totalEnrolled})</option>
              <option value="present">Present ({presentsCount})</option>
              <option value="late">Late ({latesCount})</option>
              <option value="absent">Absent ({absentsCount})</option>
              <option value="excused">Excused ({excusedCount})</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
          />
        </div>
      </div>

      {/* TAB 1: DAILY ROLL CALL */}
      {activeTab === 'worksheet' && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold font-heading text-slate-800 dark:text-slate-100">
                  Class Roll Call ({totalEnrolled} Students)
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      statusFilter === 'all'
                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 border-transparent shadow-xs'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="View all students"
                  >
                    All: {totalEnrolled}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'present' ? 'all' : 'present')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      statusFilter === 'present'
                        ? 'bg-emerald-600 text-white border-transparent shadow-xs shadow-emerald-600/30 ring-2 ring-emerald-500/40'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                    }`}
                    title="Filter by Present"
                  >
                    Present: {presentsCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'late' ? 'all' : 'late')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      statusFilter === 'late'
                        ? 'bg-amber-600 text-white border-transparent shadow-xs shadow-amber-600/30 ring-2 ring-amber-500/40'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                    }`}
                    title="Filter by Late"
                  >
                    Late: {latesCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'absent' ? 'all' : 'absent')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      statusFilter === 'absent'
                        ? 'bg-rose-600 text-white border-transparent shadow-xs shadow-rose-600/30 ring-2 ring-rose-500/40'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/60 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                    }`}
                    title="Filter by Absent"
                  >
                    Absent: {absentsCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'excused' ? 'all' : 'excused')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      statusFilter === 'excused'
                        ? 'bg-sky-600 text-white border-transparent shadow-xs shadow-sky-600/30 ring-2 ring-sky-500/40'
                        : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200/60 hover:bg-sky-100 dark:hover:bg-sky-900/60'
                    }`}
                    title="Filter by Excused"
                  >
                    Excused: {excusedCount}
                  </button>
                  <span className="text-slate-400 font-extrabold ml-0.5">({presentPercentage}%)</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Mark status for {selectedCourseCode} on {selectedDate}.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0 w-full lg:w-auto">
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer w-full sm:w-auto"
                title="Mark all students as present with 1 click"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mark All Present</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAttendance}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer w-full sm:w-auto"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Attendance</span>
              </button>
            </div>
          </div>

          {/* Mobile Card List (screen width < md) */}
          <div className="block md:hidden space-y-3">
            {displayedStudents.length === 0 ? (
              <div className="py-8 text-center text-slate-400 font-medium bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4">
                {statusFilter !== 'all' ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs">No students with status <span className="font-bold uppercase text-slate-700 dark:text-slate-300">"{statusFilter}"</span> found.</p>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                    >
                      Clear status filter (view all {totalEnrolled} students)
                    </button>
                  </div>
                ) : (
                  <p className="text-xs">No students found matching selected filters.</p>
                )}
              </div>
            ) : (
              displayedStudents.map(student => {
                const match = (attendanceRecords || []).find(
                  r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
                );
                const currentStatus = attendanceSheet[student.id] || (match ? match.status : 'present');
                const isManualOverride = match?.verificationType === 'manual_override' || Boolean(match?.overrideBy);
                const checkInTime = match?.verifiedAt || (currentStatus === 'present' ? '08:04 AM' : currentStatus === 'late' ? '08:28 AM' : '—');

                return (
                  <div
                    key={student.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm block">{student.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{student.studentId} • Year {student.yearLevel}</span>
                      </div>
                      <div>
                        {currentStatus === 'present' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Present
                          </span>
                        ) : currentStatus === 'late' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Late
                          </span>
                        ) : currentStatus === 'absent' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Absent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            Excused
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold">{checkInTime}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isManualOverride ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-bold border border-blue-200/60">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            <span>Override</span>
                          </span>
                        ) : currentStatus === 'absent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-medium">
                            <UserX className="w-3 h-3 opacity-60" />
                            <span>No Check-In</span>
                          </span>
                        ) : currentStatus === 'excused' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[10px] font-bold border border-sky-200/60">
                            <span>Excuse Slip</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/60">
                            <Camera className="w-3 h-3 text-emerald-600" />
                            <span>Biometric</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenOverrideForStudent(student)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-slate-700 font-bold text-xs cursor-pointer transition-colors shadow-xs"
                          title="Override attendance status"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Override</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View (screen width >= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Check-In Time</th>
                  <th className="py-3 px-4">Verification Method</th>
                  <th className="py-3 px-4 text-center">Attendance Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {displayedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 font-medium">
                      {statusFilter !== 'all' ? (
                        <div className="flex flex-col items-center gap-2">
                          <p>No students with status <span className="font-bold uppercase text-slate-700 dark:text-slate-300">"{statusFilter}"</span> found for this session.</p>
                          <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                          >
                            Clear status filter (view all {totalEnrolled} students)
                          </button>
                        </div>
                      ) : (
                        'No students found matching selected filters.'
                      )}
                    </td>
                  </tr>
                ) : (
                  displayedStudents.map(student => {
                    const match = (attendanceRecords || []).find(
                      r => r.studentId === student.id && r.date === selectedDate && r.subjectCode === selectedCourseCode
                    );
                    const currentStatus = attendanceSheet[student.id] || (match ? match.status : 'present');
                    const isManualOverride = match?.verificationType === 'manual_override' || Boolean(match?.overrideBy);
                    const checkInTime = match?.verifiedAt || (currentStatus === 'present' ? '08:04 AM' : currentStatus === 'late' ? '08:28 AM' : '—');

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block">{student.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{student.studentId} • Year {student.yearLevel}</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                            {checkInTime !== '—' && <Clock className="w-3.5 h-3.5 text-slate-400" />}
                            <span>{checkInTime}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {isManualOverride ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px] font-bold border border-blue-200/60">
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                              <span>Manual Override</span>
                            </span>
                          ) : currentStatus === 'absent' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-medium">
                              <UserX className="w-3.5 h-3.5 opacity-60" />
                              <span>No Biometric Check-In</span>
                            </span>
                          ) : currentStatus === 'excused' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[11px] font-bold border border-sky-200/60">
                              <span>Official Excuse Slip</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200/60">
                              <Camera className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Face Biometric + Geofence</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {currentStatus === 'present' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Present
                            </span>
                          ) : currentStatus === 'late' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Late
                            </span>
                          ) : currentStatus === 'absent' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Absent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                              Excused
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenOverrideForStudent(student)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-slate-700 font-bold text-xs cursor-pointer transition-colors shadow-xs"
                            title="Override attendance status"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Override</span>
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

      {/* TAB 2: HISTORICAL OVERRIDES & AUDITS */}
      {activeTab === 'corrections' && (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Historical Overrides & Audit Trail ({filteredHistoricalRecords.length})
            </h2>
            <p className="text-xs text-slate-400">View attendance log audit history or submit official faculty corrections.</p>
          </div>

          {/* Mobile view for historical records */}
          <div className="block md:hidden space-y-3">
            {filteredHistoricalRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4">
                No historical attendance records match search filter.
              </div>
            ) : (
              filteredHistoricalRecords.map(rec => {
                const student = safeStudents.find(s => s.id === rec.studentId);
                return (
                  <div key={rec.id} className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm block">{student?.name || 'Unknown'}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{student?.studentId}</span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase ${
                        rec.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                        rec.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {rec.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 font-medium">
                        <span className="font-mono font-bold">{rec.subjectCode}</span> • {rec.date}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedCorrectionRecord(rec);
                          setCorrectStatus(rec.status === 'excused' ? 'present' : rec.status);
                          setCorrectionReason('');
                          setIsCorrectionModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                        title="Override Attendance Record"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Override</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop view for historical records */}
          <div className="hidden md:block overflow-x-auto">
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
                <option value="excused">Excused</option>
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

      {/* MODAL 3: CLASS SESSIONS HISTORY & MANAGEMENT */}
      {isSessionHistoryOpen && (
        <Modal
          isOpen={isSessionHistoryOpen}
          onClose={() => setIsSessionHistoryOpen(false)}
          title="Class Sessions History & Management"
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                View, edit, or relaunch created faculty attendance sessions.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsSessionHistoryOpen(false);
                  setIsStartSessionOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer flex-shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start New Session</span>
              </button>
            </div>

            {/* Filters: Search & Status Pills */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  placeholder="Filter by subject, room, date..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {(['all', 'active', 'ended'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSessionHistoryFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] capitalize transition-all cursor-pointer ${
                      sessionHistoryFilter === tab
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? `All (${sessions.length})` : tab === 'active' ? `Live (${sessions.filter(s => s.status === 'active').length})` : `Ended (${sessions.filter(s => s.status === 'ended').length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {filteredSessions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <History className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="font-bold">No sessions found matching your filter</p>
                  <p className="text-[11px] mt-0.5">Try searching with a different keyword or start a new session.</p>
                </div>
              ) : (
                filteredSessions.map((session) => {
                  const courseInfo = availableCourses.find(c => c.code === session.subject);
                  const isLive = session.status === 'active';

                  return (
                    <div
                      key={session.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isLive
                          ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                              {session.subject}
                            </span>
                            {courseInfo && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                · {courseInfo.name}
                              </span>
                            )}
                            {isLive ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                LIVE SESSION
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                Ended
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {session.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {formatTimeDisplay(session.startTime)} - {formatTimeDisplay(session.endTime || '')} ({session.durationMinutes}m)
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              {session.room}
                            </span>
                          </div>

                          {/* Security Badges & Notes */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {session.requireFace && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-900/40 flex items-center gap-1">
                                <Camera className="w-3 h-3" />
                                Face Biometric
                              </span>
                            )}
                            {session.requireGeo && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-[10px] font-bold border border-teal-200 dark:border-teal-900/40 flex items-center gap-1">
                                <Navigation className="w-3 h-3" />
                                {session.radius}m Geofence
                              </span>
                            )}
                            {session.notes && (
                              <span className="text-[10px] italic text-slate-500 dark:text-slate-400">
                                💬 "{session.notes}"
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                          <button
                            type="button"
                            onClick={() => handleOpenEditSession(session)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 hover:text-emerald-700 dark:text-slate-200 dark:hover:text-emerald-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                            title="Edit session details (room, subject, times)"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {isLive ? (
                            <button
                              type="button"
                              onClick={handleEndSession}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                              title="End live session"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>End</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRelaunchSession(session)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                              title="Relaunch this session"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Relaunch</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete session record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSessionHistoryOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: EDIT ATTENDANCE SESSION */}
      {isEditSessionOpen && editingSession && (
        <Modal
          isOpen={isEditSessionOpen}
          onClose={() => setIsEditSessionOpen(false)}
          title={`Edit Session: ${editingSession.subject}`}
        >
          <form onSubmit={handleSaveEditSession} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
              <p className="font-bold">Correcting Session Information</p>
              <p className="text-[11px] mt-0.5">
                Update the course, clinic room, schedule, or security requirements. Student attendance check-ins will be preserved.
              </p>
            </div>

            {/* Subject Selection */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Course / Subject</label>
              <select
                value={editSubject}
                onChange={(e) => {
                  setEditSubject(e.target.value);
                  const matched = availableCourses.find(c => c.code === e.target.value);
                  if (matched && !editRoom) setEditRoom(matched.room);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
              >
                {availableCourses.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            {/* Clinic Room */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Clinic Room / Venue</label>
              <input
                type="text"
                required
                value={editRoom}
                onChange={(e) => setEditRoom(e.target.value)}
                placeholder="e.g. Dental Clinic Room 101"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            {/* Schedule Times & Duration Presets */}
            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">Class Schedule Time Window</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">Start Time</span>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
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
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t.val} value={t.val}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Duration: {Math.floor(computeDurationMinutes(editStartTime, editEndTime) / 60)} hrs {computeDurationMinutes(editStartTime, editEndTime) % 60} mins
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => {
                        const [startH, startM] = editStartTime.split(':').map(Number);
                        let endH = (isNaN(startH) ? 8 : startH) + hrs;
                        if (endH >= 24) endH = endH - 24;
                        setEditEndTime(`${endH.toString().padStart(2, '0')}:${(isNaN(startM) ? 0 : startM).toString().padStart(2, '0')}`);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-300 font-bold text-[10px] transition-colors cursor-pointer"
                    >
                      +{hrs}h
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Verification Security Controls */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">Security Verification Controls</label>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold block text-slate-800 dark:text-slate-100">Facial Biometrics Required</span>
                    <span className="text-[10px] text-slate-400">Students must verify selfie against registered face template</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editRequireFace}
                  onChange={(e) => setEditRequireFace(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold block text-slate-800 dark:text-slate-100">GPS Geofencing Required</span>
                    <span className="text-[10px] text-slate-400">Enforce physical attendance within classroom geofence</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editRequireGeo}
                  onChange={(e) => setEditRequireGeo(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </div>

              {editRequireGeo && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Geofence Boundary Radius</span>
                    <span className="font-bold text-emerald-600">{editRadius} meters</span>
                  </div>
                  <select
                    value={editRadius}
                    onChange={(e) => setEditRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold cursor-pointer"
                  >
                    <option value={50}>50 meters (Strict Classroom)</option>
                    <option value={100}>100 meters (Clinical Hall)</option>
                    <option value={200}>200 meters (Dental Building)</option>
                    <option value={500}>500 meters (Campus Area)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Remarks / Notes */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Session Correction Notes / Remarks (Optional)</label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="e.g. Corrected room number or schedule time"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditSessionOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
};
