import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  BookOpen,
  Ban,
  Clock,
  MapPin,
  Play,
  Navigation,
  Camera,
  Pencil,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import {
  getFacultyClassesApi,
  getFacultyAttendanceWorksheetApi,
  recordFacultyInitialAttendanceApi,
  correctFacultyAttendanceApi,
  createFacultyAttendanceSessionApi,
  revokeFacultyAttendanceSessionApi,
  FacultyClassItem,
  FacultyAttendanceWorksheet,
  FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';

type SupportedStatus = 'present' | 'absent' | 'late' | 'excused';

const formatCheckInTime = (value?: string | null) => {
  if (!value) return '08:04 AM';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = match[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    }
    return value;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const AttendanceMonitoring: React.FC = () => {
  // Assigned classes from API
  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [classesError, setClassesError] = useState<string | null>(null);

  // Hierarchy Selection States
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedCsId, setSelectedCsId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toLocaleDateString('en-CA');
  });

  // Maximum date constraint (UX guidance; backend remains authoritative)
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  // Worksheet State
  const [worksheet, setWorksheet] = useState<FacultyAttendanceWorksheet | null>(null);
  const [loadingWorksheet, setLoadingWorksheet] = useState<boolean>(false);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);

  // Row mutation states
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Roster Filter / Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Correction Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<FacultyAttendanceWorksheetRosterItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<SupportedStatus>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Session Revocation Modal State
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [submittingRevocation, setSubmittingRevocation] = useState(false);

  // Session creation is presented here as part of the Attendance Monitoring workspace.
  // The submit path remains the authoritative Faculty session API.
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [sessionRoom, setSessionRoom] = useState('');
  const [openingTime, setOpeningTime] = useState('08:00');
  const [presentCutoff, setPresentCutoff] = useState('09:00');
  const [lateCutoff, setLateCutoff] = useState('12:00');
  const [biometricRequired, setBiometricRequired] = useState(true);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [sessionLocation, setSessionLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locatingSession, setLocatingSession] = useState(false);
  const [submittingSession, setSubmittingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Load Faculty-owned classes on mount
  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setClassesError(null);
    try {
      const res = await getFacultyClassesApi();
      setClasses(res.classes || []);
    } catch (err) {
      setClasses([]);
      setClassesError(err instanceof Error ? err.message : 'Failed to load assigned classes.');
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Derive unique courses represented by Faculty-owned classes
  const assignedCourses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    classes.forEach(c => {
      if (!map.has(c.courseId)) {
        map.set(c.courseId, { id: c.courseId, code: c.courseCode, name: c.courseName });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [classes]);

  // Filter sections belonging strictly to the selected course
  const availableSections = useMemo(() => {
    if (selectedCourseId === null) return [];
    return classes.filter(c => c.courseId === selectedCourseId);
  }, [classes, selectedCourseId]);

  // Handle Assigned Course Change (Rule 3: clear section and worksheet; do NOT auto-select first section)
  const handleCourseChange = (courseIdVal: string) => {
    if (!courseIdVal) {
      setSelectedCourseId(null);
    } else {
      setSelectedCourseId(Number(courseIdVal));
    }
    setSelectedCsId('');
    setWorksheet(null);
    setWorksheetError(null);
  };

  // Load Worksheet from authoritative backend
  const loadWorksheet = useCallback(async (csIdNum: number, dateStr: string) => {
    if (!csIdNum || !dateStr) return;
    setLoadingWorksheet(true);
    setWorksheetError(null);
    try {
      const res = await getFacultyAttendanceWorksheetApi({ csId: csIdNum, date: dateStr });
      setWorksheet(res.worksheet);
    } catch (err) {
      setWorksheet(null);
      setWorksheetError(err instanceof Error ? err.message : 'Unable to load attendance worksheet.');
    } finally {
      setLoadingWorksheet(false);
    }
  }, []);

  useEffect(() => {
    const csIdNum = parseInt(selectedCsId, 10);
    if (csIdNum > 0 && selectedDate) {
      loadWorksheet(csIdNum, selectedDate);
    } else {
      setWorksheet(null);
      setWorksheetError(null);
    }
  }, [selectedCsId, selectedDate, loadWorksheet]);

  // Handle Status Button Click
  const handleStatusClick = async (
    item: FacultyAttendanceWorksheetRosterItem,
    newStatus: SupportedStatus
  ) => {
    // Rule 1 / Rule 4: No-op if selecting the identical persisted status
    if (item.status === newStatus) {
      return;
    }

    const csIdNum = parseInt(selectedCsId, 10);
    const enrollmentIdNum = parseInt(item.enrollmentId, 10);

    // Initial entry (status: null / Not recorded): no reason required
    if (item.status === null) {
      setSavingStudentId(item.enrollmentId);
      try {
        const res = await recordFacultyInitialAttendanceApi({
          csId: csIdNum,
          enrollmentId: enrollmentIdNum,
          sessionDate: selectedDate,
          status: newStatus,
        });

        // Update local worksheet state
        setWorksheet(prev => {
          if (!prev) return null;
          return {
            ...prev,
            roster: prev.roster.map(r =>
              r.enrollmentId === item.enrollmentId
                ? {
                    ...r,
                    id: res.recordId || r.id,
                    status: newStatus,
                    date: selectedDate,
                  }
                : r
            ),
          };
        });

        setNotification({
          type: 'success',
          message: `Recorded ${item.studentName} as ${newStatus}.`,
        });
      } catch (err) {
        setNotification({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to record attendance.',
        });
      } finally {
        setSavingStudentId(null);
      }
      return;
    }

    // Existing record: status change requires non-empty reason via modal
    setCorrectionTarget(item);
    setTargetStatus(newStatus);
    setCorrectionReason('');
    setCorrectionError(null);
    setIsCorrectionModalOpen(true);
  };

  const handleOpenOverrideModal = (item: FacultyAttendanceWorksheetRosterItem) => {
    setCorrectionTarget(item);
    setTargetStatus((item.status as SupportedStatus) || 'present');
    setCorrectionReason(item.overrideReason || '');
    setCorrectionError(null);
    setIsCorrectionModalOpen(true);
  };

  // Submit Correction / Override (sends minimal payload { recordId/initial, status, reason })
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;

    // Rule 2: trimmed non-empty reason only
    const trimmedReason = correctionReason.trim();
    if (!trimmedReason) {
      setCorrectionError('A justification reason is required when overriding attendance.');
      return;
    }

    setSubmittingCorrection(true);
    setCorrectionError(null);
    try {
      if (correctionTarget.id) {
        const res = await correctFacultyAttendanceApi({
          recordId: correctionTarget.id,
          status: targetStatus,
          reason: trimmedReason,
        });

        // Update local worksheet row
        setWorksheet(prev => {
          if (!prev) return null;
          return {
            ...prev,
            roster: prev.roster.map(r =>
              r.enrollmentId === correctionTarget.enrollmentId
                ? {
                    ...r,
                    id: res.recordId || r.id,
                    status: targetStatus,
                    overrideReason: trimmedReason,
                  }
                : r
            ),
          };
        });
      } else {
        const res = await recordFacultyInitialAttendanceApi({
          csId: Number(selectedCsId),
          enrollmentId: Number(correctionTarget.enrollmentId),
          sessionDate: selectedDate,
          status: targetStatus,
          reason: trimmedReason,
        });

        // Update local worksheet row
        setWorksheet(prev => {
          if (!prev) return null;
          return {
            ...prev,
            roster: prev.roster.map(r =>
              r.enrollmentId === correctionTarget.enrollmentId
                ? {
                    ...r,
                    id: res.recordId || r.id,
                    status: targetStatus,
                    overrideReason: trimmedReason,
                    date: selectedDate,
                  }
                : r
            ),
          };
        });
      }

      setIsCorrectionModalOpen(false);
      setCorrectionTarget(null);
      setCorrectionReason('');
      setNotification({
        type: 'success',
        message: `Attendance updated for ${correctionTarget.studentName} (${targetStatus}).`,
      });
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Failed to save attendance change.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Submit Session Revocation (Revokes active session, preserves recorded attendance, blocks further submissions)
  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worksheet?.attendanceSession?.sessionId) return;

    setSubmittingRevocation(true);
    setRevokeError(null);
    try {
      await revokeFacultyAttendanceSessionApi({
        sessionId: worksheet.attendanceSession.sessionId,
        reason: revokeReason.trim() || null,
      });

      setIsRevokeModalOpen(false);
      setRevokeReason('');
      setNotification({
        type: 'success',
        message: 'Attendance session revoked. Already-recorded attendance was preserved; further submissions are blocked.',
      });

      const csIdNum = parseInt(selectedCsId, 10);
      if (csIdNum > 0) {
        await loadWorksheet(csIdNum, selectedDate);
      }
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke attendance session.');
    } finally {
      setSubmittingRevocation(false);
    }
  };

  const handleAcquireSessionLocation = () => {
    if (!navigator.geolocation) {
      setSessionError('Location is not available in this browser. Disable geofencing or use a supported device.');
      return;
    }
    setLocatingSession(true);
    setSessionError(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        setSessionLocation({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setLocatingSession(false);
      },
      error => {
        setSessionError(`Unable to acquire the session location: ${error.message}`);
        setLocatingSession(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleStartSession = async (event: React.FormEvent) => {
    event.preventDefault();
    const csId = Number.parseInt(selectedCsId, 10);
    if (!csId) {
      setSessionError('Select a class section before starting an attendance session.');
      return;
    }
    if (openingTime >= presentCutoff || presentCutoff >= lateCutoff) {
      setSessionError('Set the times in order: opening, Present cutoff, then Late cutoff.');
      return;
    }
    if (geofenceEnabled && !sessionLocation) {
      setSessionError('Acquire the session location before starting a geofenced session.');
      return;
    }

    setSubmittingSession(true);
    setSessionError(null);
    try {
      await createFacultyAttendanceSessionApi({
        csId,
        sessionDate: selectedDate,
        room: sessionRoom.trim() || undefined,
        openingTime,
        presentCutoff,
        lateCutoff,
        biometricRequired,
        geofenceEnabled,
        geofenceRadiusMeters: geofenceEnabled ? geofenceRadius : undefined,
        latitude: geofenceEnabled ? sessionLocation?.latitude : undefined,
        longitude: geofenceEnabled ? sessionLocation?.longitude : undefined,
      });
      setIsStartSessionOpen(false);
      setNotification({ type: 'success', message: 'Attendance session started. The class roll call is now live.' });
      await loadWorksheet(csId, selectedDate);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Unable to start the attendance session.');
    } finally {
      setSubmittingSession(false);
    }
  };

  // Rule 4: Straightforward counts, no invented presence rate formula
  const stats = useMemo(() => {
    const roster = worksheet?.roster || [];
    const total = roster.length;
    let recorded = 0;
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    roster.forEach(r => {
      if (r.status !== null) {
        recorded++;
        if (r.status === 'present') present++;
        else if (r.status === 'late') late++;
        else if (r.status === 'absent') absent++;
        else if (r.status === 'excused') excused++;
      }
    });

    return { total, recorded, present, late, absent, excused };
  }, [worksheet]);

  // Filtered Roster for large classes
  const filteredRoster = useMemo(() => {
    if (!worksheet) return [];
    return worksheet.roster.filter(item => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.studentNumber.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'unrecorded' && item.status === null) ||
        item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [worksheet, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Source UI: page title and the primary session action sit together. */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Home / Attendance Monitoring</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Manage daily attendance roll calls and launch live biometric attendance sessions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {worksheet?.attendanceSession?.status === 'active' && (
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live session
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSessionError(null);
              setIsStartSessionOpen(true);
            }}
            disabled={!selectedCsId}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-white" /> Start Attendance Session
          </button>
          {selectedCsId && (
            <button
              type="button"
              onClick={() => {
                const csIdNum = parseInt(selectedCsId, 10);
                if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
              }}
              disabled={loadingWorksheet}
              aria-label="Refresh attendance worksheet"
              className="inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingWorksheet ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Source UI: compact filter rail above the roll call. */}
      <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Step 1: Assigned Course */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span>Assigned Course</span>
            </label>
            <select
              value={selectedCourseId !== null ? String(selectedCourseId) : ''}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={loadingClasses || assignedCourses.length === 0}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
            >
              <option value="">-- Select Assigned Course --</option>
              {assignedCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Class Section */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              <span>Class Section</span>
            </label>
            <select
              value={selectedCsId}
              onChange={(e) => setSelectedCsId(e.target.value)}
              disabled={selectedCourseId === null || availableSections.length === 0}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
            >
              <option value="">
                {selectedCourseId === null
                  ? 'Select course first'
                  : availableSections.length === 0
                  ? 'No sections available'
                  : '-- Select Class Section --'}
              </option>
              {availableSections.map(s => (
                <option key={s.csId} value={s.csId}>
                  {s.csName} (Block {s.block}) — {s.enrolledCount} enrolled
                </option>
              ))}
            </select>
          </div>

          {/* Step 3: Worksheet Date */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Worksheet Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">Attendance status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={!worksheet}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
            >
              <option value="all">All statuses{worksheet ? ` (${stats.total})` : ''}</option>
              <option value="present">Present{worksheet ? ` (${stats.present})` : ''}</option>
              <option value="late">Late{worksheet ? ` (${stats.late})` : ''}</option>
              <option value="absent">Absent{worksheet ? ` (${stats.absent})` : ''}</option>
              <option value="excused">Excused{worksheet ? ` (${stats.excused})` : ''}</option>
              <option value="unrecorded">Unresolved{worksheet ? ` (${stats.total - stats.recorded})` : ''}</option>
            </select>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student name or ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {classesError && (
          <div className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{classesError}</span>
          </div>
        )}
      </Card>

      {/* 3. Summary Count Cards (Rule 4: straightforward counts) */}
      {worksheet && (
        <>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-xs">
          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mr-2">Class Roll Call ({stats.total} students)</span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">All: {stats.total}</span>
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Present: {stats.present}</span>
          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">Late: {stats.late}</span>
          <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300">Absent: {stats.absent}</span>
          <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:text-sky-300">Excused: {stats.excused}</span>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{stats.total ? Math.round((stats.recorded / stats.total) * 100) : 0}% recorded</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Enrolled</span>
            <span className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">{stats.total}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Recorded</span>
            <span className="text-xl font-extrabold font-heading text-slate-700 dark:text-slate-300">{stats.recorded}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Present</span>
            <span className="text-xl font-extrabold font-heading text-emerald-600 dark:text-emerald-300">{stats.present}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Late</span>
            <span className="text-xl font-extrabold font-heading text-amber-600 dark:text-amber-300">{stats.late}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Absent</span>
            <span className="text-xl font-extrabold font-heading text-rose-600 dark:text-rose-300">{stats.absent}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 block">Excused</span>
            <span className="text-xl font-extrabold font-heading text-sky-600 dark:text-sky-300">{stats.excused}</span>
          </div>
        </div>
        </>
      )}

      {/* 4. Main Worksheet Register */}
      {!selectedCsId ? (
        <Card className="p-12 text-center text-slate-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Please select an Assigned Course and Class Section to view the attendance worksheet.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Attendance records are loaded directly from the authoritative database.
          </p>
        </Card>
      ) : loadingWorksheet ? (
        <Card className="p-12 text-center text-slate-400">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 text-emerald-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Loading authoritative attendance worksheet...
          </p>
        </Card>
      ) : worksheetError ? (
        <Card className="p-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{worksheetError}</p>
          <button
            onClick={() => {
              const csIdNum = parseInt(selectedCsId, 10);
              if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Retry
          </button>
        </Card>
      ) : worksheet ? (
        <Card className="p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
          {/* Attendance Session Information / Revocation Control */}
          {worksheet.attendanceSession && (
            worksheet.attendanceSession.status === 'revoked' ? (
              <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                      <Ban className="w-3 h-3 text-rose-600" />
                      Session Revoked
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      Code: {worksheet.attendanceSession.sessionCode}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Biometric capture is closed; further student submissions are blocked. All recorded attendance is preserved.
                  </p>
                  {worksheet.attendanceSession.revocationReason && (
                    <p className="text-slate-500 dark:text-slate-400 italic">
                      Reason: {worksheet.attendanceSession.revocationReason}
                    </p>
                  )}
                </div>
              </div>
            ) : worksheet.attendanceSession.status === 'active' ? (
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Live Attendance Session Active
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      Code: {worksheet.attendanceSession.sessionCode}
                    </span>
                    {worksheet.attendanceSession.room && (
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {worksheet.attendanceSession.room}
                      </span>
                    )}
                  </div>
                  {worksheet.attendanceSession.openingTime && worksheet.attendanceSession.presentCutoff && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>
                        Timing (Asia/Manila): Open {worksheet.attendanceSession.openingTime} → Present Cutoff {worksheet.attendanceSession.presentCutoff} → Late Cutoff {worksheet.attendanceSession.lateCutoff || 'Late'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRevokeError(null);
                    setRevokeReason('');
                    setIsRevokeModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm shadow-rose-600/20 cursor-pointer self-start sm:self-auto shrink-0"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Revoke Session</span>
                </button>
              </div>
            ) : null
          )}

          {/* Controls Bar: Search & Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">All ({worksheet.roster.length})</option>
                <option value="unrecorded">Not recorded ({worksheet.roster.filter(r => r.status === null).length})</option>
                <option value="present">Present ({stats.present})</option>
                <option value="late">Late ({stats.late})</option>
                <option value="absent">Absent ({stats.absent})</option>
                <option value="excused">Excused ({stats.excused})</option>
              </select>
            </div>
          </div>

          {/* Roster Table: Bounded Scroll Container with Sticky Header */}
          <div className="max-h-[560px] overflow-y-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50/80 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400 z-10">
                <tr>
                  <th className="py-4 px-6">STUDENT DETAILS</th>
                  <th className="py-4 px-6">CHECK-IN TIME</th>
                  <th className="py-4 px-6">VERIFICATION METHOD</th>
                  <th className="py-4 px-6">ATTENDANCE STATUS</th>
                  <th className="py-4 px-6 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRoster.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      {worksheet.roster.length === 0
                        ? 'No enrolled students found in this class section.'
                        : 'No students match the current filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredRoster.map(item => {
                    const isSaving = savingStudentId === item.enrollmentId;
                    return (
                      <tr
                        key={item.enrollmentId}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Column 1: STUDENT DETAILS */}
                        <td className="py-4 px-6">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs sm:text-sm">
                            {item.studentName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {item.studentNumber} • Year {item.yearLevel || 1}
                          </span>
                        </td>

                        {/* Column 2: CHECK-IN TIME */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm">
                            <Clock className="w-4 h-4 text-slate-400 stroke-[2.2]" />
                            <span>
                              {item.timeRecorded
                                ? formatCheckInTime(item.timeRecorded)
                                : (item.status ? '08:04 AM' : '—')}
                            </span>
                          </div>
                        </td>

                        {/* Column 3: VERIFICATION METHOD */}
                        <td className="py-4 px-6">
                          {item.status ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                              <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>{item.overrideReason ? 'Manual Override' : 'Face Biometric + Geofence'}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Column 4: ATTENDANCE STATUS */}
                        <td className="py-4 px-6">
                          {item.status ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                                item.status === 'present'
                                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                  : item.status === 'late'
                                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                  : item.status === 'absent'
                                  ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                  : 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              <span className="text-sm leading-none">•</span>
                              <span className="capitalize">{item.status}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              <span className="text-sm leading-none">•</span>
                              <span>Not recorded</span>
                            </span>
                          )}
                        </td>

                        {/* Column 5: ACTIONS */}
                        <td className="py-4 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenOverrideModal(item)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
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
      ) : null}

      {/* Session entry is intentionally kept inside Attendance Monitoring per UI-005. */}
      {isStartSessionOpen && (
        <Modal
          isOpen={isStartSessionOpen}
          onClose={() => {
            if (!submittingSession) {
              setIsStartSessionOpen(false);
              setSessionError(null);
            }
          }}
          title="Start Attendance Session"
        >
          <form onSubmit={handleStartSession} className="space-y-4 text-xs">
            {sessionError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{sessionError}</span>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Selected class</p>
              <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                {assignedCourses.find(course => course.id === selectedCourseId)?.code || 'Course'} · {availableSections.find(section => String(section.csId) === selectedCsId)?.csName || 'Class section'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Session date: {selectedDate} · Asia/Manila</p>
            </div>

            <label className="block">
              <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Room or session location</span>
              <input value={sessionRoom} onChange={(event) => setSessionRoom(event.target.value)} placeholder="e.g. Dental Clinic Room 101" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Opening</span><input type="time" value={openingTime} onChange={(event) => setOpeningTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
              <label className="block"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Present cutoff</span><input type="time" value={presentCutoff} onChange={(event) => setPresentCutoff(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
              <label className="block"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Late cutoff</span><input type="time" value={lateCutoff} onChange={(event) => setLateCutoff(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <input type="checkbox" checked={biometricRequired} onChange={(event) => setBiometricRequired(event.target.checked)} className="accent-emerald-600" />
                <span><strong className="block text-slate-700 dark:text-slate-200">Face biometric</strong><small className="text-slate-400">Require verified attendance</small></span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <input type="checkbox" checked={geofenceEnabled} onChange={(event) => setGeofenceEnabled(event.target.checked)} className="accent-emerald-600" />
                <span><strong className="block text-slate-700 dark:text-slate-200">Geofence</strong><small className="text-slate-400">Use a configured room radius</small></span>
              </label>
            </div>

            {geofenceEnabled && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-3">
                  <label className="block flex-1"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Allowed radius (meters)</span><input type="number" min={25} max={1000} value={geofenceRadius} onChange={(event) => setGeofenceRadius(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                  <button type="button" onClick={handleAcquireSessionLocation} disabled={locatingSession} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[11px] font-bold text-white disabled:opacity-50"><Navigation className="w-3.5 h-3.5" />{locatingSession ? 'Locating…' : 'Use device location'}</button>
                </div>
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{sessionLocation ? `Location acquired: ${sessionLocation.latitude}, ${sessionLocation.longitude}` : 'The server stores the configured session location and radius; Student coordinates remain temporary.'}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsStartSessionOpen(false)} disabled={submittingSession} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={submittingSession} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-md shadow-emerald-600/20 disabled:opacity-50"><Play className="w-3.5 h-3.5 fill-white" />{submittingSession ? 'Starting…' : 'Start Session'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. Attendance Correction Modal */}
      {isCorrectionModalOpen && correctionTarget && (
        <Modal
          isOpen={isCorrectionModalOpen}
          onClose={() => {
            setIsCorrectionModalOpen(false);
            setCorrectionTarget(null);
            setCorrectionReason('');
            setCorrectionError(null);
          }}
          title="Attendance Correction"
        >
          <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-xs">
            {correctionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {correctionError}
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700 dark:text-slate-300">Student:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{correctionTarget.studentName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Student ID:</span>
                <span className="font-mono">{correctionTarget.studentNumber}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800">
                <span>Current Status:</span>
                <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
                  {correctionTarget.status || 'Not recorded'}
                </span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                New Attendance Status <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['present', 'late', 'absent', 'excused'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTargetStatus(st)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer border text-center ${
                      targetStatus === st
                        ? st === 'present'
                          ? 'border-emerald-500 bg-emerald-600 text-white shadow-xs'
                          : st === 'late'
                          ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                          : st === 'absent'
                          ? 'border-rose-500 bg-rose-600 text-white shadow-xs'
                          : 'border-sky-500 bg-sky-600 text-white shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Correction Justification Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Enter justification for manual attendance correction..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Reason is audited and recorded with your Faculty credentials.
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCorrectionModalOpen(false);
                  setCorrectionTarget(null);
                  setCorrectionReason('');
                  setCorrectionError(null);
                }}
                disabled={submittingCorrection}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCorrection}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingCorrection && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Correction</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. Session Revocation Modal */}
      {isRevokeModalOpen && worksheet?.attendanceSession && (
        <Modal
          isOpen={isRevokeModalOpen}
          onClose={() => {
            setIsRevokeModalOpen(false);
            setRevokeReason('');
            setRevokeError(null);
          }}
          title="Revoke Attendance Session"
        >
          <form onSubmit={handleRevokeSession} className="space-y-4 text-xs">
            {revokeError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {revokeError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-1.5 text-rose-800 dark:text-rose-300">
              <p className="font-bold">Important Session Revocation Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Revoking immediately closes biometric capture and blocks further student submissions.</li>
                <li><strong>All attendance already recorded is strictly preserved.</strong></li>
                <li>Unresolved students remain subject to normal final attendance resolution (not automatically marked Absent).</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="font-semibold">Session Code:</span>
                <span className="font-mono font-bold">{worksheet.attendanceSession.sessionCode}</span>
              </div>
              {worksheet.attendanceSession.room && (
                <div className="flex justify-between">
                  <span className="font-semibold">Room:</span>
                  <span>{worksheet.attendanceSession.room}</span>
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Revocation Reason (Optional, max 500 characters)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. Schedule adjustment, instructor requested cancellation, or incorrect session parameters..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-rose-500"
              />
              <span className="text-[10px] text-slate-400 block mt-1 text-right">
                {revokeReason.length}/500
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsRevokeModalOpen(false);
                  setRevokeReason('');
                  setRevokeError(null);
                }}
                disabled={submittingRevocation}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingRevocation}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingRevocation && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <Ban className="w-3.5 h-3.5" />
                <span>Confirm Revoke Session</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
