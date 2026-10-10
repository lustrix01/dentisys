import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { formatSessionDate } from '../../utils/sessionDate';
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
import { useSearchParams } from 'react-router-dom';
import { ClassAttendanceActivity } from './ClassAttendanceActivity';
import { SessionTimingFields } from '../../components/SessionTimingFields';
import { Card } from '../../components/Card';
import { LocationPicker } from '../../components/LocationPicker';
import { FacultyExcusedRequestsPanel } from '../../components/FacultyExcusedRequestsPanel';
import { Modal } from '../../components/Modal';
import {
  getFacultyClassesApi,
  getFacultyAttendanceWorksheetApi,
  recordFacultyInitialAttendanceApi,
  correctFacultyAttendanceApi,
  createFacultyAttendanceSessionApi,
  updateFacultyAttendanceSessionApi,
  FacultyManagedAttendanceSession,
  revokeFacultyAttendanceSessionApi,
  endFacultyAttendanceSessionApi,
  FacultyClassItem,
  FacultyAttendanceWorksheet,
  FacultyAttendanceWorksheetRosterItem,
} from '../../services/apiClient';

type SupportedStatus = 'present' | 'absent' | 'late' | 'excused';

const STATUS_ORDER: SupportedStatus[] = ['present', 'late', 'absent', 'excused'];
const STATUS_LABELS: Record<SupportedStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};

const formatCheckInTime = (value?: string | null) => {
  if (!value) return '—';
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

const attendanceMethodLabel = (method?: string | null, overrideReason?: string | null): string => {
  if (overrideReason) return 'Manual Override';
  switch (method) {
    case 'biometric':
      return 'Face Biometric';
    case 'manual_faculty':
    case 'faculty_manual':
      return 'Faculty Manual Entry';
    case 'manual_secretary':
    case 'secretary_manual':
      return 'Secretary Manual Entry';
    case 'system_resolution':
      return 'System Resolution';
    default:
      return 'Not recorded';
  }
};

const manilaDateToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export const AttendanceMonitoring: React.FC = () => <AttendanceWorksheet />;

const AttendanceWorksheet: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'activity' ? 'activity' : searchParams.get('tab') === 'rollcall' ? 'rollcall' : 'sessions';
  const switchTab = (nextTab: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (nextTab === 'sessions') next.delete('tab'); else next.set('tab', nextTab);
    return next;
  });
  // Assigned classes from API
  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [currentSchoolYear, setCurrentSchoolYear] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('current');

  // Hierarchy Selection States
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDate, setSessionDate] = useState(() => manilaDateToday());
  const [selectedCsId, setSelectedCsId] = useState<string>('');
  // Attendance dates are Asia/Manila calendar days, as on the server.
  const [selectedDate, setSelectedDate] = useState<string>(() => manilaDateToday());

  // Worksheet State
  const worksheetRequest = useRef(0);
  const worksheetMutations = useRef(0);
  const [worksheetMutationCount, setWorksheetMutationCount] = useState(0);
  const worksheetRefreshPending = useRef(false);
  const [worksheetReload, setWorksheetReload] = useState(0);
  const worksheetScope = useRef('');
  const [worksheet, setWorksheet] = useState<FacultyAttendanceWorksheet | null>(null);
  const renderedWorksheetScope = `${selectedCsId}:${selectedDate}:${selectedSessionId || worksheet?.attendanceSession?.sessionId || ''}`;
  useLayoutEffect(() => {
    worksheetScope.current = renderedWorksheetScope;
  }, [renderedWorksheetScope]);
  const [loadingWorksheet, setLoadingWorksheet] = useState<boolean>(false);
  const [worksheetError, setWorksheetError] = useState<string | null>(null);

  const beginWorksheetMutation = () => {
    ++worksheetMutations.current;
    setWorksheetMutationCount(worksheetMutations.current);
    ++worksheetRequest.current;
    setLoadingWorksheet(false);
    return worksheetScope.current;
  };
  const finishWorksheetMutation = (scope: string) => {
    --worksheetMutations.current;
    setWorksheetMutationCount(worksheetMutations.current);
    // Cancel stale reads of the written worksheet and their loading state,
    // while allowing a newly selected class/date/session to finish loading.
    if (worksheetScope.current === scope) {
      ++worksheetRequest.current;
      setLoadingWorksheet(false);
    }
    if (worksheetMutations.current === 0 && worksheetRefreshPending.current) {
      worksheetRefreshPending.current = false;
      setWorksheetReload(version => version + 1);
    }
  };

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

  // Bulk "mark all unrecorded as Present"
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);

  // Session Revocation Modal State
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [submittingRevocation, setSubmittingRevocation] = useState(false);

  // Session creation is presented here as part of the Attendance Monitoring workspace.
  // The submit path remains the authoritative Faculty session API.
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<FacultyManagedAttendanceSession | null>(null);
  const [sessionActionTarget, setSessionActionTarget] = useState<FacultyManagedAttendanceSession | null>(null);
  const [sessionRoom, setSessionRoom] = useState('');
  const [openingTime, setOpeningTime] = useState('08:00');
  const [presentCutoff, setPresentCutoff] = useState('09:00');
  const [lateCutoff, setLateCutoff] = useState('12:00');
  const [classEndTime, setClassEndTime] = useState('13:00');
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [submittingEnd, setSubmittingEnd] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(true);
  const [geofenceEnabled, setGeofenceEnabled] = useState(true);
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [sessionLocation, setSessionLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showSessionMap, setShowSessionMap] = useState(false);
  const [locatingSession, setLocatingSession] = useState(false);
  const [submittingSession, setSubmittingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const attendanceWritePending = savingStudentId !== null || bulkMarking || submittingCorrection
    || submittingSession || submittingEnd || submittingRevocation || worksheetMutationCount > 0;

  // Load Faculty-owned classes on mount
  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setClassesError(null);
    try {
      const res = await getFacultyClassesApi();
      setClasses(res.classes || []);
      setCurrentSchoolYear(res.currentSchoolYear || '');
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
  const availableSchoolYears = useMemo(() => Array.from(new Set([
    currentSchoolYear, ...classes.map(item => item.schoolYear || ''),
  ].filter(Boolean))).sort().reverse(), [classes, currentSchoolYear]);
  const scopedClasses = useMemo(() => classes.filter(item => selectedSchoolYear === 'all'
    || item.schoolYear === (selectedSchoolYear === 'current' ? currentSchoolYear : selectedSchoolYear)), [classes, currentSchoolYear, selectedSchoolYear]);
  const selectedClassIsPast = Boolean(selectedCsId && currentSchoolYear && classes.find(item => String(item.csId) === selectedCsId)?.schoolYear !== currentSchoolYear);
  const worksheetIsReadOnly = selectedClassIsPast || selectedDate > manilaDateToday() || worksheet?.attendanceSession?.status === 'scheduled' || (Boolean(worksheet?.attendanceSessions.length) && !worksheet?.attendanceSession);
  const assignedCourses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    scopedClasses.forEach(c => {
      if (!map.has(c.courseId)) {
        map.set(c.courseId, { id: c.courseId, code: c.courseCode, name: c.courseName });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [scopedClasses]);

  // Filter sections belonging strictly to the selected course
  const availableSections = useMemo(() => {
    if (selectedCourseId === null) return [];
    return scopedClasses.filter(c => c.courseId === selectedCourseId);
  }, [scopedClasses, selectedCourseId]);

  // Handle Assigned Course Change (Rule 3: clear section and worksheet; do NOT auto-select first section)
  const handleCourseChange = (courseIdVal: string) => {
    worksheetRequest.current++;
    if (!courseIdVal) {
      setSelectedCourseId(null);
    } else {
      setSelectedCourseId(Number(courseIdVal));
    }
    setSelectedCsId('');
    setSelectedSessionId('');
    setWorksheet(null);
    setWorksheetError(null);
  };

  // Load Worksheet from authoritative backend
  const loadWorksheet = useCallback(async (csIdNum: number, dateStr: string, sessionId = selectedSessionId) => {
    // A read during row/bulk saves can replace already saved rows with an older snapshot.
    if (!csIdNum || !dateStr) return;
    if (worksheetMutations.current > 0) {
      worksheetRefreshPending.current = true;
      return;
    }
    const request = ++worksheetRequest.current;
    setLoadingWorksheet(true);
    setWorksheetError(null);
    try {
      const res = await getFacultyAttendanceWorksheetApi({ csId: csIdNum, date: dateStr, sessionId: sessionId ? Number(sessionId) : undefined });
      if (request === worksheetRequest.current) setWorksheet(res.worksheet);
    } catch (err) {
      if (request === worksheetRequest.current) {
        setWorksheet(null);
        setWorksheetError(err instanceof Error ? err.message : 'Unable to load attendance worksheet.');
      }
    } finally {
      if (request === worksheetRequest.current) setLoadingWorksheet(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    const csIdNum = parseInt(selectedCsId, 10);
    if (csIdNum > 0 && selectedDate) {
      loadWorksheet(csIdNum, selectedDate);
    } else {
      worksheetRequest.current++;
      setWorksheet(null);
      setWorksheetError(null);
      setLoadingWorksheet(false);
    }
  }, [selectedCsId, selectedDate, loadWorksheet, worksheetReload]);

  useEffect(() => {
    if (!selectedCsId || !worksheet?.pendingSessions?.length) return;
    const timer = setInterval(() => { if (worksheetMutations.current > 0) return; void loadWorksheet(Number(selectedCsId), selectedDate); }, 30000);
    return () => clearInterval(timer);
  }, [selectedCsId, selectedDate, worksheet?.pendingSessions?.length, loadWorksheet]);

  // Open Manual Override Modal (matches Secretary pattern)
  const handleOpenOverride = (item: FacultyAttendanceWorksheetRosterItem) => {
    if (worksheetIsReadOnly || worksheetMutations.current > 0 || loadingWorksheet) return;
    setCorrectionTarget(item);
    const validStatuses: SupportedStatus[] = ['present', 'late', 'absent', 'excused'];
    setTargetStatus((item.status && validStatuses.includes(item.status as SupportedStatus) ? item.status : 'present') as SupportedStatus);
    setCorrectionReason('');
    setCorrectionError(null);
    setIsCorrectionModalOpen(true);
  };

  // Record every student with no attendance yet as Present (existing records are never touched).
  const handleBulkMarkPresent = async () => {
    if (!worksheet) return;
    const targets = worksheet.roster.filter(r => r.status === null);
    setIsBulkConfirmOpen(false);
    if (targets.length === 0) return;
    setBulkMarking(true);
    const writeScope = beginWorksheetMutation();
    let saved = 0;
    const failed: string[] = [];
    for (const item of targets) {
      try {
        const res = await recordFacultyInitialAttendanceApi({
          csId: parseInt(selectedCsId, 10),
          enrollmentId: parseInt(item.enrollmentId, 10),
          sessionDate: selectedDate,
          sessionId: worksheet?.attendanceSession?.sessionId ? Number(worksheet.attendanceSession.sessionId) : undefined,
          status: 'present',
        });
        saved += 1;
        setWorksheet(prev => worksheetScope.current !== writeScope ? prev : prev ? {
          ...prev,
          roster: prev.roster.map(r => r.enrollmentId === item.enrollmentId
            ? { ...r, id: res.recordId || r.id, status: 'present', date: selectedDate }
            : r),
        } : prev);
      } catch {
        failed.push(item.studentName);
      }
    }
    setBulkMarking(false);
    finishWorksheetMutation(writeScope);
    setNotification(failed.length === 0
      ? { type: 'success', message: `Marked ${saved} student${saved === 1 ? '' : 's'} as present.` }
      : { type: 'error', message: `Marked ${saved} as present; could not record ${failed.join(', ')}.` });
  };

  // Submit Correction / Override (sends minimal payload { recordId/initial, status, reason })
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget || worksheetIsReadOnly || worksheetMutations.current > 0) return;

    // Rule 2: trimmed non-empty reason only
    const trimmedReason = correctionReason.trim();
    if (correctionTarget.status && targetStatus === correctionTarget.status) {
      setCorrectionError('Choose a different attendance status.');
      return;
    }
    if (correctionTarget.id && !trimmedReason) {
      setCorrectionError('A justification reason is required when overriding attendance.');
      return;
    }

    setSubmittingCorrection(true);
    const writeScope = beginWorksheetMutation();
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
          if (worksheetScope.current !== writeScope) return prev;
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
          sessionId: worksheet?.attendanceSession?.sessionId ? Number(worksheet.attendanceSession.sessionId) : undefined,
          status: targetStatus,
          reason: trimmedReason || undefined,
        });

        // Update local worksheet row
        setWorksheet(prev => {
          if (worksheetScope.current !== writeScope) return prev;
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
        message: correctionTarget.status
          ? `Attendance corrected for ${correctionTarget.studentName} (${targetStatus}).`
          : `Attendance updated for ${correctionTarget.studentName} (${targetStatus}).`,
      });
    } catch (err) {
      setCorrectionError(err instanceof Error ? err.message : 'Failed to save attendance change.');
    } finally {
      setSubmittingCorrection(false);
      finishWorksheetMutation(writeScope);
    }
  };

  // Submit Session Revocation (Revokes active session, preserves recorded attendance, blocks further submissions)
  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionActionTarget?.sessionId) return;

    setSubmittingRevocation(true);
    const writeScope = beginWorksheetMutation();
    setRevokeError(null);
    try {
      await revokeFacultyAttendanceSessionApi({
        sessionId: sessionActionTarget.sessionId,
        reason: revokeReason.trim() || null,
      });

      setIsRevokeModalOpen(false);
      setRevokeReason('');
      setNotification({
        type: 'success',
        message: 'Attendance session revoked. Already-recorded attendance was preserved; further submissions are blocked.',
      });

      const csIdNum = parseInt(selectedCsId, 10);
      if (csIdNum > 0 && worksheetScope.current === writeScope) {
        await loadWorksheet(csIdNum, selectedDate);
      }
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke attendance session.');
    } finally {
      setSubmittingRevocation(false);
      finishWorksheetMutation(writeScope);
    }
  };

  // End the session now: students without a record are resolved to Absent (ATT-003).
  const handleEndSession = async () => {
    if (!sessionActionTarget?.sessionId) return;
    setSubmittingEnd(true);
    const writeScope = beginWorksheetMutation();
    setEndError(null);
    try {
      await endFacultyAttendanceSessionApi({ sessionId: sessionActionTarget.sessionId });
      setIsEndModalOpen(false);
      setNotification({ type: 'success', message: 'Attendance session ended. Students without a record were marked Absent.' });
      const csIdNum = parseInt(selectedCsId, 10);
      if (csIdNum > 0 && worksheetScope.current === writeScope) {
        await loadWorksheet(csIdNum, selectedDate);
      }
    } catch (err) {
      setEndError(err instanceof Error ? err.message : 'Failed to end the attendance session.');
    } finally {
      setSubmittingEnd(false);
      finishWorksheetMutation(writeScope);
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
    if (loadingWorksheet) { setSessionError('Wait for the selected worksheet to finish loading.'); return; }
    const csId = Number.parseInt(selectedCsId, 10);
    if (!csId) {
      setSessionError('Select a class section before starting an attendance session.');
      return;
    }
    if (!sessionDate || sessionDate < manilaDateToday()) { setSessionError('Choose today or a future date (Asia/Manila).'); return; }
    if (openingTime >= presentCutoff || presentCutoff >= lateCutoff) {
      setSessionError('Set the times in order: opening, Present cutoff, then Late cutoff.');
      return;
    }
    if (!classEndTime || classEndTime < lateCutoff) {
      setSessionError('Set a class end time at or after the Late cutoff.');
      return;
    }
    if (geofenceEnabled && !sessionLocation) {
      setSessionError('Acquire the session location before starting a geofenced session.');
      return;
    }

    setSubmittingSession(true);
    const writeScope = beginWorksheetMutation();
    setSessionError(null);
    try {
      const payload = {
        sessionDate,
        room: sessionRoom.trim() || undefined,
        openingTime,
        presentCutoff,
        lateCutoff,
        classEndTime,
        biometricRequired,
        geofenceEnabled,
        geofenceRadiusMeters: geofenceEnabled ? geofenceRadius : undefined,
        geofenceLatitude: geofenceEnabled ? sessionLocation?.latitude : undefined,
        geofenceLongitude: geofenceEnabled ? sessionLocation?.longitude : undefined,
      };
      const response = editingSession
        ? await updateFacultyAttendanceSessionApi({ ...payload, sessionId: editingSession.sessionId })
        : await createFacultyAttendanceSessionApi({ ...payload, csId });
      setIsStartSessionOpen(false);
      setNotification({ type: 'success', message: editingSession ? 'Attendance session updated.' : response.session.status === 'scheduled' ? `Attendance session scheduled for ${sessionDate} at ${openingTime} (Asia/Manila).` : 'Attendance session started. The class roll call is now live.' });
      if (worksheetScope.current === writeScope) {
        setSelectedDate(sessionDate);
        setSelectedSessionId(response.session.sessionId);
        await loadWorksheet(csId, sessionDate, response.session.sessionId);
      }
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Unable to start the attendance session.');
    } finally {
      setSubmittingSession(false);
      finishWorksheetMutation(writeScope);
    }
  };

  const managedSessions: FacultyManagedAttendanceSession[] = worksheet?.managedSessions ?? Array.from(new Map([
    ...(worksheet?.pendingSessions ?? []), ...(worksheet?.attendanceSessions ?? []),
    ...(worksheet?.attendanceSession ? [worksheet.attendanceSession] : []),
  ].map(session => [session.sessionId, session])).values());
  const liveSession = managedSessions.find(session => session.status === 'active') ?? null;
  const upcomingSessions = managedSessions.filter(session => session.status === 'scheduled');
  const pastSessions = managedSessions.filter(session => session.status === 'ended' || session.status === 'revoked');
  const openSessionEdit = (session: FacultyManagedAttendanceSession) => {
    setEditingSession(session); setSessionError(null);
    setSessionDate(session.sessionDate || selectedDate); setSessionRoom(session.room || '');
    setOpeningTime(session.openingTime || '08:00'); setPresentCutoff(session.presentCutoff || '09:00');
    setLateCutoff(session.lateCutoff || '12:00'); setClassEndTime(session.classEndTime || '13:00');
    setBiometricRequired(session.biometricRequired ?? true); setGeofenceEnabled(session.geofenceEnabled ?? true);
    setGeofenceRadius(session.geofenceRadiusMeters ?? 100);
    setSessionLocation(session.geofenceLatitude != null && session.geofenceLongitude != null ? { latitude: session.geofenceLatitude, longitude: session.geofenceLongitude } : null);
    setIsStartSessionOpen(true);
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
          {selectedCsId && (
            <button
              type="button"
              onClick={() => {
                const csIdNum = parseInt(selectedCsId, 10);
                if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
              }}
              disabled={loadingWorksheet || attendanceWritePending}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">School year
              <select aria-label="Attendance school year" value={selectedSchoolYear} disabled={attendanceWritePending} onChange={event => {
                setSelectedSchoolYear(event.target.value);
                handleCourseChange('');
                setIsStartSessionOpen(false);
              }} className="mt-1.5 w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100">
                <option value="current">{currentSchoolYear ? `${currentSchoolYear} (Current)` : 'Current school year'}</option>
                <option value="all">All school years</option>
                {availableSchoolYears.filter(year => year !== currentSchoolYear).map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          {/* Step 1: Assigned Course */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              <span>Assigned Course</span>
            </label>
            <select
              aria-label="Assigned course"
              value={selectedCourseId !== null ? String(selectedCourseId) : ''}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={loadingClasses || assignedCourses.length === 0 || attendanceWritePending}
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
              aria-label="Class section" value={selectedCsId}
              onChange={(e) => { setWorksheet(null); setSelectedCsId(e.target.value); setSelectedSessionId(''); }}
              disabled={selectedCourseId === null || availableSections.length === 0 || attendanceWritePending}
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

        </div>

        {classesError && (
          <div className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{classesError}</span>
          </div>
        )}
      </Card>

      <div role="tablist" aria-label="Attendance Monitoring" className="flex flex-wrap gap-2">
        {(['sessions', 'rollcall', 'activity'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => switchTab(item)} className={tab === item ? 'rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white' : 'rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>{item === 'sessions' ? 'Sessions' : item === 'rollcall' ? 'Roll call' : 'Activity log'}</button>)}
      </div>
      <FacultyExcusedRequestsPanel onDecided={() => {
        const csIdNum = parseInt(selectedCsId, 10);
        if (csIdNum > 0) void loadWorksheet(csIdNum, selectedDate);
      }} />
      {tab === 'activity' && <ClassAttendanceActivity classIds={scopedClasses.filter(item => (!selectedCourseId || item.courseId === selectedCourseId) && (!selectedCsId || String(item.csId) === selectedCsId)).map(item => String(item.csId))} />}
      {tab === 'sessions' && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Sessions</h2>
          <button
            type="button"
            onClick={() => {
              setSessionError(null);
              setEditingSession(null);
              setSessionDate(manilaDateToday());
              setOpeningTime('08:00'); setPresentCutoff('09:00'); setLateCutoff('12:00'); setClassEndTime('13:00');
              setSessionRoom(''); setBiometricRequired(true); setGeofenceEnabled(true);
              setSessionLocation(null); setGeofenceRadius(100);
              setIsStartSessionOpen(true);
            }}
            disabled={!selectedCsId || selectedClassIsPast || loadingWorksheet || attendanceWritePending}
            title={selectedClassIsPast ? 'Past school-year classes are view-only.' : undefined}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-white" /> New attendance session
          </button>

        </div>
        {!selectedCsId ? <Card className="p-8 text-center text-xs text-slate-400">Please select an Assigned Course and Class Section to view the attendance worksheet.</Card> : loadingWorksheet ? <p className="text-xs text-slate-400">Loading authoritative attendance worksheet...</p> : worksheetError ? <p role="alert" className="text-xs text-rose-600">{worksheetError}</p> : <>
          <Card className="space-y-3 p-4"><h2 className="text-sm font-bold">Live session</h2>
          {/* Attendance Session Information / Revocation Control */}
          {liveSession && (
            liveSession.status === 'active' ? (
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10px] uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Live Attendance Session Active
                    </span>
                    <span className="font-mono text-slate-500 font-bold">
                      Code: {liveSession.sessionCode}
                    </span>
                    {liveSession.room && (
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {liveSession.room}
                      </span>
                    )}
                  </div>
                  {liveSession.openingTime && liveSession.presentCutoff && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-blue-500" />
                      <span>
                        Timing (Asia/Manila): Open {liveSession.openingTime} → Present Cutoff {liveSession.presentCutoff} → Late Cutoff {liveSession.lateCutoff || 'Late'}
                        {liveSession.classEndTime ? ` → Class ends ${liveSession.classEndTime}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  disabled={selectedClassIsPast}
                  onClick={() => {
                    setSessionActionTarget(liveSession);
                    setEndError(null);
                    setIsEndModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>End Session</span>
                </button>
                <button
                  type="button"
                  disabled={selectedClassIsPast}
                  onClick={() => {
                    setSessionActionTarget(liveSession);
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
              </div>
            ) : null
          )}


            {!liveSession && <p className="text-xs text-slate-400">No live session.</p>}
          </Card>
          <Card className="space-y-3 p-4"><h2 className="text-sm font-bold">Upcoming</h2><p className="text-xs text-slate-400">Scheduled sessions (Asia/Manila)</p>
            {upcomingSessions.length === 0 && <p className="text-xs text-slate-400">No upcoming sessions. Create one with New attendance session.</p>}
            {upcomingSessions.map(session => <div key={session.sessionId} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center">
              <p className="min-w-0 break-words text-xs">{formatSessionDate(session.sessionDate)} · {session.openingTime}–{session.classEndTime} · {session.sessionCode}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={selectedClassIsPast || attendanceWritePending} onClick={() => openSessionEdit(session)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700 disabled:opacity-50">Edit</button>
                <button type="button" disabled={selectedClassIsPast || attendanceWritePending} onClick={() => { setSessionActionTarget(session); setRevokeError(null); setRevokeReason(''); setIsRevokeModalOpen(true); }} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300 disabled:opacity-50">Revoke scheduled session</button>
              </div>
            </div>)}
          </Card>
          <Card className="space-y-3 p-4"><h2 className="text-sm font-bold">Past sessions</h2>
            {pastSessions.length === 0 && <p className="text-xs text-slate-400">No past sessions.</p>}
            {pastSessions.map(session => <div key={session.sessionId} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center">
              <p className="min-w-0 break-words text-xs">{formatSessionDate(session.sessionDate)} · {session.openingTime}–{session.classEndTime} · {session.sessionCode} · {session.status === 'revoked' ? 'Session Revoked' : 'Ended'}</p>
              <button type="button" disabled={attendanceWritePending} onClick={() => { setSelectedDate(session.sessionDate || selectedDate); setSelectedSessionId(session.sessionId); switchTab('rollcall'); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold dark:bg-slate-800">Open roll call</button>
            </div>)}
          </Card>
        </>}
      </div>}
      {tab === 'rollcall' && <>
        <Card className="space-y-3 p-4">
          {/* Step 3: Worksheet Date */}
          <div>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Worksheet Date</span>
            </label>
            <input
              type="date"
              aria-label="Worksheet date"
              value={selectedDate}
              disabled={attendanceWritePending}

              onChange={(e) => { setWorksheet(null); setSelectedDate(e.target.value); setSelectedSessionId(''); }}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          {<label className="block text-xs font-bold">Attendance session
            <select value={selectedSessionId || worksheet?.attendanceSession?.sessionId || ''} disabled={attendanceWritePending} onChange={event => setSelectedSessionId(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
              <option value="">Choose a session</option>
              {(worksheet?.attendanceSessions ?? []).map(session => <option key={String(session.sessionId)} value={String(session.sessionId)}>{String(session.openingTime ?? 'Unconfigured')}–{String(session.classEndTime ?? '')} · {String(session.sessionCode)} · {String(session.status)}</option>)}
            </select>
          </label>}

        </Card>
        <p className="text-xs text-slate-500 dark:text-slate-400">Students in this section and their attendance for the selected session.</p>
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
          {worksheetIsReadOnly && <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{selectedClassIsPast ? 'Past school-year attendance is view-only.' : selectedDate > manilaDateToday() || worksheet.attendanceSession?.status === 'scheduled' ? 'Scheduled session: attendance opens at its chosen date/time in Asia/Manila.' : 'Choose a session to manage its attendance.'}</p>}
          {worksheet.attendanceSession?.status === 'revoked' && (
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

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Status:</label>
              <select
                aria-label="Attendance status"
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
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(true)}
                disabled={worksheetIsReadOnly || bulkMarking || worksheet.roster.every(r => r.status !== null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkMarking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{bulkMarking ? 'Marking…' : 'Mark all unrecorded as Present'}</span>
              </button>
            </div>
          </div>

          {/* Roster Table: Bounded Scroll Container with Sticky Header */}
          <div className="max-h-[560px] overflow-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
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
                                : '—'}
                            </span>
                          </div>
                        </td>

                        {/* Column 3: VERIFICATION METHOD */}
                        <td className="py-4 px-6">
                          {item.status ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                              <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>{attendanceMethodLabel(item.verificationMethod, item.overrideReason)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Column 4: ATTENDANCE STATUS */}
                        <td className="py-4 px-6" data-testid="attendance-status">
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
                              <span>{STATUS_LABELS[item.status as SupportedStatus] ?? item.status}</span>
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
                            onClick={() => handleOpenOverride(item)}
                            disabled={worksheetIsReadOnly || isSaving || bulkMarking}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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


      </>}

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
          title={editingSession ? 'Edit attendance session' : 'New attendance session'}
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
              <p className="mt-0.5 text-[11px] text-slate-500">Session date: {sessionDate} · Asia/Manila</p>
            </div>

            <label className="block font-bold text-slate-700 dark:text-slate-300">Session date (Asia/Manila)
              <input type="date" required min={manilaDateToday()} value={sessionDate} onChange={event => setSessionDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="block">
              <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Room or session location</span>
              <input value={sessionRoom} onChange={(event) => setSessionRoom(event.target.value)} placeholder="e.g. Dental Clinic Room 101" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>

            <SessionTimingFields role="faculty" value={{ openingTime, presentCutoff, lateCutoff, classEndTime }} onChange={value => { setOpeningTime(value.openingTime); setPresentCutoff(value.presentCutoff); setLateCutoff(value.lateCutoff); setClassEndTime(value.classEndTime); }} />

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
                <div className="flex flex-col sm:flex-row items-stretch justify-between gap-3">
                  <label className="block flex-1"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Allowed radius (meters)</span><input type="number" min={50} max={2000} value={geofenceRadius} onChange={(event) => setGeofenceRadius(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
                  <button type="button" onClick={handleAcquireSessionLocation} disabled={locatingSession} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[11px] font-bold text-white disabled:opacity-50"><Navigation className="w-3.5 h-3.5" />{locatingSession ? 'Locating…' : 'Use device location'}</button>
                  <button type="button" onClick={() => setShowSessionMap(shown => !shown)} className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 px-3 py-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"><MapPin className="w-3.5 h-3.5" />{showSessionMap ? 'Hide map' : 'Pick on map'}</button>
                </div>
                {showSessionMap && (
                  <div className="mt-3">
                    <LocationPicker value={sessionLocation} radiusMeters={geofenceRadius} onChange={setSessionLocation} />
                  </div>
                )}
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{sessionLocation ? `Location acquired: ${sessionLocation.latitude}, ${sessionLocation.longitude}` : 'The server stores the configured session location and radius; Student coordinates remain temporary.'}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsStartSessionOpen(false)} disabled={submittingSession} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={submittingSession} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-md shadow-emerald-600/20 disabled:opacity-50"><Play className="w-3.5 h-3.5 fill-white" />{submittingSession ? 'Saving…' : editingSession ? 'Save changes' : sessionDate > manilaDateToday() ? 'Schedule Session' : 'Start Session'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk mark confirmation */}
      {isBulkConfirmOpen && worksheet && (
        <Modal
          isOpen={isBulkConfirmOpen}
          onClose={() => setIsBulkConfirmOpen(false)}
          title="Mark Unrecorded Students Present"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Record <strong>{worksheet.roster.filter(r => r.status === null).length}</strong> student(s) with no attendance for {selectedDate} as <strong>Present</strong>?
              Students who already have a status are not changed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleBulkMarkPresent(); }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
              >
                Mark Present
              </button>
            </div>
          </div>
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
          title="Manual Attendance Override"
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
              {correctionTarget.status && correctionTarget.status !== targetStatus && (
                <div className="flex justify-between items-center">
                  <span>Change:</span>
                  <span className="font-bold font-mono text-amber-700 dark:text-amber-300">
                    {correctionTarget.status.toUpperCase()} → {targetStatus.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                New Attendance Status <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {STATUS_ORDER.map(st => (
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
                {correctionTarget.id ? 'Correction Justification Reason (Required)' : 'Initial Entry Reason (Optional)'}
              </label>
              <textarea
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Enter justification for attendance override..."
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
                <span>Save Override</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Session End Confirmation */}
      {isEndModalOpen && sessionActionTarget && (
        <Modal
          isOpen={isEndModalOpen}
          onClose={() => {
            setIsEndModalOpen(false);
            setEndError(null);
          }}
          title="End Attendance Session"
        >
          <div className="space-y-4 text-xs">
            {endError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                {endError}
              </div>
            )}
            <p className="text-slate-700 dark:text-slate-300">
              End session <span className="font-mono font-bold">{sessionActionTarget.sessionCode}</span> now? Students without an attendance record will be marked Absent. Corrections remain possible afterwards.
            </p>
            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsEndModalOpen(false);
                  setEndError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingEnd}
                onClick={() => void handleEndSession()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold disabled:opacity-50 cursor-pointer"
              >
                {submittingEnd ? 'Ending…' : 'Confirm End Session'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Session Revocation Modal */}
      {isRevokeModalOpen && sessionActionTarget && (
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
                <li>A revoked session is treated as if it never happened: it does not count toward attendance rates or grades, and no student is marked Absent for it.</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="font-semibold">Session Code:</span>
                <span className="font-mono font-bold">{sessionActionTarget.sessionCode}</span>
              </div>
              {sessionActionTarget.room && (
                <div className="flex justify-between">
                  <span className="font-semibold">Room:</span>
                  <span>{sessionActionTarget.room}</span>
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
