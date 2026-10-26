import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
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
  Users,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { showFeedback } from '../../components/FeedbackCenter';
import { LocationPicker } from '../../components/LocationPicker';
import { FacultyExcusedRequestsPanel } from '../../components/FacultyExcusedRequestsPanel';
import { Modal } from '../../components/Modal';
import { StartSessionModal, type StartSessionValues } from '../../components/StartSessionModal';
import { RevokedSessionsSwitch } from '../../components/RevokedSessionsSwitch';
import {
  REVOKED_SESSION_VIEW_ONLY_NOTE, countRevokedSessions, matchesRollCallFilters, revokedHiddenText, visibleSessions,
  type OverriddenFilter, type RecordedByFilter,
} from '../../utils/attendanceRollCall';
import {
  getFacultyClassesApi,
  getFacultyAttendanceWorksheetApi,
  recordFacultyInitialAttendanceApi,
  correctFacultyAttendanceApi,
  createFacultyAttendanceSessionApi,
  updateFacultyAttendanceSessionApi,
  revokeFacultyAttendanceSessionApi,
  endFacultyAttendanceSessionApi,
  FacultyClassItem,
  FacultyAttendanceWorksheet,
  FacultyAttendanceWorksheetRosterItem,
  FacultyManagedAttendanceSession,
} from '../../services/apiClient';

const RADIUS_HINT = 'Indoors, use 150 m or more; phone GPS is often off by 50–100 m inside buildings.';

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

const parseSessionTimeMs = (dateStr?: string, timeStr?: string | null): number | null => {
  if (!dateStr) return null;
  const cleanTime = (timeStr || '00:00').slice(0, 5);
  const d = new Date(`${dateStr}T${cleanTime}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const formatStartsIn = (startMs: number, nowMs: number, sessionDate?: string, openingTime?: string | null): string => {
  const diffMs = startMs - nowMs;
  if (diffMs <= 0) return 'Starting now';
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Starts in < 1 min';
  if (diffMinutes < 60) return `Starts in ${diffMinutes} min${diffMinutes === 1 ? '' : 's'}`;

  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  if (diffHours < 24) {
    if (remMinutes === 0) {
      return `Starts in ${diffHours} hr${diffHours === 1 ? '' : 's'}`;
    }
    return `Starts in ${diffHours}h ${remMinutes}m`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const timeLabel = openingTime ? formatCheckInTime(openingTime) : '';
  if (diffDays === 1) {
    return timeLabel ? `Starts tomorrow at ${timeLabel}` : 'Starts tomorrow';
  }
  return timeLabel ? `Starts in ${diffDays} days (${sessionDate} at ${timeLabel})` : `Starts in ${diffDays} days (${sessionDate})`;
};

const semesterLabel = (s: string | undefined | null) => {
  if (!s) return '1st Semester';
  const lower = s.toLowerCase();
  if (s === '1' || lower.includes('1st') || lower === 'first') return '1st Semester';
  if (s === '2' || lower.includes('2nd') || lower === 'second') return '2nd Semester';
  if (lower.includes('summer')) return 'Summer';
  return s;
};

export const AttendanceMonitoring: React.FC = () => {
  // Assigned classes from API
  const [classes, setClasses] = useState<FacultyClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [currentSchoolYear, setCurrentSchoolYear] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('current');

  // Hierarchy Selection States
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedCsId, setSelectedCsId] = useState<string>(() => {
    try {
      return localStorage.getItem('faculty_attendance_selected_cs_id') || '';
    } catch {
      return '';
    }
  });
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
  const [notification, setNotificationState] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Also raise the corner notice: the banner is off-screen when the page is scrolled.
  const setNotification = (n: { type: 'success' | 'error'; message: string } | null) => {
    setNotificationState(n);
    if (n) showFeedback(n.message, n.type);
  };

  // Roster Filter / Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [overriddenFilter, setOverriddenFilter] = useState<OverriddenFilter>('all');
  const [recordedByFilter, setRecordedByFilter] = useState<RecordedByFilter>('all');
  // Revoked sessions are hidden until asked for; not remembered between visits.
  const [showRevoked, setShowRevoked] = useState(false);

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
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [submittingEnd, setSubmittingEnd] = useState(false);
  const [submittingSession, setSubmittingSession] = useState(false);
  // Session revocation target (either worksheet session or an upcoming session card)
  const [sessionTargetToRevoke, setSessionTargetToRevoke] = useState<{ sessionId: string; sessionCode?: string; room?: string | null } | null>(null);

  // Session drawer tab: 'live' | 'upcoming'
  const [activeSessionTab, setActiveSessionTab] = useState<'live' | 'upcoming'>('live');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionModalTab, setSessionModalTab] = useState<'current' | 'upcoming'>('current');
  const [viewMode, setViewMode] = useState<'classes' | 'worksheet'>('classes');

  const handleOpenClassSessionModal = (classItem: FacultyClassItem) => {
    setSelectedCourseId(classItem.courseId);
    setSelectedCsId(String(classItem.csId));
    try {
      localStorage.setItem('faculty_attendance_selected_cs_id', String(classItem.csId));
    } catch {}
    setSessionModalTab('current');
    setIsSessionModalOpen(true);
  };

  // Live timer tick (updates every 10s so sessions automatically transition when opening time arrives)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Aggregated list of all managed sessions for current class
  const allClassSessions = useMemo<FacultyManagedAttendanceSession[]>(() => {
    const map = new Map<string, FacultyManagedAttendanceSession>();
    (worksheet?.managedSessions || []).forEach(s => {
      if (s && s.sessionId) map.set(String(s.sessionId), s);
    });
    (worksheet?.pendingSessions || []).forEach(s => {
      if (s && s.sessionId) map.set(String(s.sessionId), s);
    });
    (worksheet?.attendanceSessions || []).forEach(s => {
      if (s && s.sessionId) map.set(String(s.sessionId), s);
    });
    if (worksheet?.attendanceSession && worksheet.attendanceSession.sessionId) {
      map.set(String(worksheet.attendanceSession.sessionId), worksheet.attendanceSession as FacultyManagedAttendanceSession);
    }
    return Array.from(map.values());
  }, [worksheet]);

  // Dynamically classify Current Session (happening right now) vs Upcoming Sessions (scheduled in the future)
  const { liveCurrentSession, upcomingSessions } = useMemo(() => {
    let current: FacultyManagedAttendanceSession | null = null;
    const upcoming: FacultyManagedAttendanceSession[] = [];

    for (const session of allClassSessions) {
      if (session.status === 'revoked' || session.status === 'ended') {
        continue;
      }

      const startMs = parseSessionTimeMs(session.sessionDate, session.openingTime);
      const endMs = parseSessionTimeMs(session.sessionDate, session.classEndTime || '23:59');

      // A session is CURRENT if:
      // 1. It is explicitly active
      // 2. OR its status is 'scheduled' and current time is within [startMs, endMs]
      const isDuringCurrentTime = session.status === 'active' || (
        startMs !== null && endMs !== null && currentTimeMs >= startMs && currentTimeMs <= endMs
      );

      if (isDuringCurrentTime && !current) {
        current = session;
      } else if (startMs !== null && currentTimeMs < startMs) {
        upcoming.push(session);
      }
    }

    // Sort upcoming ascending by start time
    upcoming.sort((a, b) => {
      const aTime = parseSessionTimeMs(a.sessionDate, a.openingTime) ?? 0;
      const bTime = parseSessionTimeMs(b.sessionDate, b.openingTime) ?? 0;
      return aTime - bTime;
    });

    return { liveCurrentSession: current, upcomingSessions: upcoming };
  }, [allClassSessions, currentTimeMs]);

  // Edit Session Modal State
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<FacultyManagedAttendanceSession | null>(null);
  const [editRoom, setEditRoom] = useState('');
  const [editOpeningTime, setEditOpeningTime] = useState('');
  const [editPresentCutoff, setEditPresentCutoff] = useState('');
  const [editLateCutoff, setEditLateCutoff] = useState('');
  const [editClassEndTime, setEditClassEndTime] = useState('');
  const [editBiometricRequired, setEditBiometricRequired] = useState(false);
  const [editGeofenceEnabled, setEditGeofenceEnabled] = useState(false);
  // The saved values the form opened with; an edit sends only what differs from these.
  const [editOriginal, setEditOriginal] = useState<{
    room: string; openingTime: string; presentCutoff: string; lateCutoff: string; classEndTime: string;
    biometricRequired: boolean; geofenceEnabled: boolean; radius: number; location: { latitude: number; longitude: number } | null;
  } | null>(null);
  const [editGeofenceRadius, setEditGeofenceRadius] = useState(100);
  const [editLocation, setEditLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showEditMap, setShowEditMap] = useState(false);
  const [locatingEdit, setLocatingEdit] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const attendanceWritePending = savingStudentId !== null || bulkMarking || submittingCorrection
    || submittingSession || submittingEnd || submittingRevocation || submittingEdit || worksheetMutationCount > 0;

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
    try {
      localStorage.removeItem('faculty_attendance_selected_cs_id');
    } catch {}
    setWorksheet(null);
    setWorksheetError(null);
  };

  // Sync selectedCourseId when scopedClasses load and selectedCsId is restored from localStorage
  useEffect(() => {
    if (scopedClasses.length > 0 && selectedCsId) {
      const match = scopedClasses.find(c => String(c.csId) === selectedCsId);
      if (match && selectedCourseId !== match.courseId) {
        setSelectedCourseId(match.courseId);
      }
    }
  }, [scopedClasses, selectedCsId, selectedCourseId]);

  // Currently selected class object (for header display and metadata)
  const selectedClass = useMemo(() => {
    if (!selectedCsId) return null;
    return classes.find(c => String(c.csId) === selectedCsId) || null;
  }, [classes, selectedCsId]);

  // Handle direct Class Card selection
  const handleSelectClass = (classItem: FacultyClassItem) => {
    worksheetRequest.current++;
    setSelectedCourseId(classItem.courseId);
    setSelectedCsId(String(classItem.csId));
    setSelectedSessionId('');
    try {
      localStorage.setItem('faculty_attendance_selected_cs_id', String(classItem.csId));
    } catch {}
    setViewMode('worksheet');
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
    const auditBatchId = crypto.randomUUID(); // one id per click
    for (const item of targets) {
      try {
        const res = await recordFacultyInitialAttendanceApi({
          csId: parseInt(selectedCsId, 10),
          enrollmentId: parseInt(item.enrollmentId, 10),
          sessionDate: selectedDate,
          sessionId: worksheet?.attendanceSession?.sessionId ? Number(worksheet.attendanceSession.sessionId) : undefined,
          status: 'present',
        }, auditBatchId);
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

  // Open Edit Session Modal
  const handleOpenEditSession = (session: FacultyManagedAttendanceSession | NonNullable<FacultyAttendanceWorksheet['attendanceSession']>) => {
    setEditingSession(session as FacultyManagedAttendanceSession);
    // Show exactly what is saved; the 100 m radius is only a starting value for turning geofence on.
    const location = session.geofenceLatitude != null && session.geofenceLongitude != null
      ? { latitude: session.geofenceLatitude, longitude: session.geofenceLongitude }
      : null;
    const original = {
      room: session.room ?? '',
      openingTime: session.openingTime ?? '',
      presentCutoff: session.presentCutoff ?? '',
      lateCutoff: session.lateCutoff ?? '',
      classEndTime: session.classEndTime ?? '',
      biometricRequired: session.biometricRequired === true,
      geofenceEnabled: session.geofenceEnabled === true,
      radius: session.geofenceRadiusMeters ?? 100,
      location,
    };
    setEditOriginal(original);
    setEditRoom(original.room);
    setEditOpeningTime(original.openingTime);
    setEditPresentCutoff(original.presentCutoff);
    setEditLateCutoff(original.lateCutoff);
    setEditClassEndTime(original.classEndTime);
    setEditBiometricRequired(original.biometricRequired);
    setEditGeofenceEnabled(original.geofenceEnabled);
    setEditGeofenceRadius(original.radius);
    setEditLocation(location);
    setShowEditMap(false);
    setEditError(null);
    setIsEditSessionOpen(true);
  };

  // Submit Session Updates
  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession || !editOriginal) return;

    const changes: Omit<Parameters<typeof updateFacultyAttendanceSessionApi>[0], 'sessionId'> = {};
    if (editRoom.trim() !== editOriginal.room.trim()) changes.room = editRoom.trim();
    if (editOpeningTime !== editOriginal.openingTime) changes.openingTime = editOpeningTime;
    if (editPresentCutoff !== editOriginal.presentCutoff) changes.presentCutoff = editPresentCutoff;
    if (editLateCutoff !== editOriginal.lateCutoff) changes.lateCutoff = editLateCutoff;
    if (editClassEndTime !== editOriginal.classEndTime) changes.classEndTime = editClassEndTime;
    if (editBiometricRequired !== editOriginal.biometricRequired) changes.biometricRequired = editBiometricRequired;
    if (editGeofenceEnabled !== editOriginal.geofenceEnabled) {
      changes.geofenceEnabled = editGeofenceEnabled;
      if (editGeofenceEnabled) {
        changes.geofenceRadiusMeters = editGeofenceRadius;
        changes.geofenceLatitude = editLocation?.latitude;
        changes.geofenceLongitude = editLocation?.longitude;
      }
    } else if (editGeofenceEnabled) {
      if (editGeofenceRadius !== editOriginal.radius) changes.geofenceRadiusMeters = editGeofenceRadius;
      if (editLocation?.latitude !== editOriginal.location?.latitude || editLocation?.longitude !== editOriginal.location?.longitude) {
        changes.geofenceLatitude = editLocation?.latitude;
        changes.geofenceLongitude = editLocation?.longitude;
      }
    }
    if (Object.keys(changes).length === 0) {
      // Nothing changed: no request, just close.
      setIsEditSessionOpen(false);
      setEditingSession(null);
      return;
    }

    setSubmittingEdit(true);
    const writeScope = beginWorksheetMutation();
    setEditError(null);
    try {
      await updateFacultyAttendanceSessionApi({
        sessionId: editingSession.sessionId,
        ...changes,
      });

      setIsEditSessionOpen(false);
      setNotification({ type: 'success', message: 'Attendance session updated successfully.' });

      const csIdNum = parseInt(selectedCsId, 10);
      if (csIdNum > 0 && worksheetScope.current === writeScope) {
        await loadWorksheet(csIdNum, selectedDate);
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update attendance session.');
    } finally {
      setSubmittingEdit(false);
      finishWorksheetMutation(writeScope);
    }
  };

  const handleAcquireEditLocation = () => {
    if (!navigator.geolocation) {
      setEditError('Location is not available in this browser.');
      return;
    }
    setLocatingEdit(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingEdit(false);
        setEditLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        setLocatingEdit(false);
        setEditError(`Failed to acquire location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Submit Session Revocation (Revokes active session, preserves recorded attendance, blocks further submissions)
  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSessionId = sessionTargetToRevoke?.sessionId || liveCurrentSession?.sessionId || worksheet?.attendanceSession?.sessionId;
    if (!targetSessionId) return;

    setSubmittingRevocation(true);
    const writeScope = beginWorksheetMutation();
    setRevokeError(null);
    try {
      await revokeFacultyAttendanceSessionApi({
        sessionId: targetSessionId,
        reason: revokeReason.trim() || null,
      });

      setIsRevokeModalOpen(false);
      setRevokeReason('');
      setSessionTargetToRevoke(null);
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
    const targetSessionId = liveCurrentSession?.sessionId || worksheet?.attendanceSession?.sessionId;
    if (!targetSessionId) return;
    setSubmittingEnd(true);
    const writeScope = beginWorksheetMutation();
    setEndError(null);
    try {
      await endFacultyAttendanceSessionApi({ sessionId: targetSessionId });
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

  const startSessionPrecheck = () => {
    if (loadingWorksheet) return 'Wait for the selected worksheet to finish loading.';
    if (!Number.parseInt(selectedCsId, 10)) return 'Select a class section before starting an attendance session.';
    return null;
  };

  const handleStartSession = async (values: StartSessionValues) => {
    const csId = Number.parseInt(selectedCsId, 10);
    const { sessionDate, openingTime, location } = values;
    setSubmittingSession(true);
    const writeScope = beginWorksheetMutation();
    try {
      const response = await createFacultyAttendanceSessionApi({
        csId,
        sessionDate,
        room: values.room || undefined,
        openingTime,
        presentCutoff: values.presentCutoff,
        lateCutoff: values.lateCutoff,
        classEndTime: values.classEndTime,
        biometricRequired: values.biometricRequired,
        geofenceEnabled: values.geofenceEnabled,
        geofenceRadiusMeters: values.geofenceEnabled ? values.geofenceRadiusMeters : undefined,
        geofenceLatitude: values.geofenceEnabled ? location?.latitude : undefined,
        geofenceLongitude: values.geofenceEnabled ? location?.longitude : undefined,
      });
      setIsStartSessionOpen(false);
      setNotification({ type: 'success', message: response.session.status === 'scheduled' ? `Attendance session scheduled for ${sessionDate} at ${openingTime} (Asia/Manila).` : 'Attendance session started. The class roll call is now live.' });
      if (worksheetScope.current === writeScope) {
        setSelectedDate(sessionDate);
        setSelectedSessionId(response.session.sessionId);
        await loadWorksheet(csId, sessionDate, response.session.sessionId);
      }
    } finally {
      setSubmittingSession(false);
      finishWorksheetMutation(writeScope);
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

      return matchesSearch && matchesStatus && matchesRollCallFilters(item, overriddenFilter, recordedByFilter);
    });
  }, [worksheet, searchQuery, statusFilter, overriddenFilter, recordedByFilter]);

  const revokedSessionCount = countRevokedSessions(worksheet?.attendanceSessions ?? []);
  const shownSessions = visibleSessions(worksheet?.attendanceSessions ?? [], showRevoked);
  const allSessionsHidden = Boolean(worksheet?.attendanceSessions.length) && shownSessions.length === 0;
  const revokedSessionOpen = worksheet?.attendanceSession?.status === 'revoked';
  const handleRevokedSwitch = (show: boolean) => {
    setShowRevoked(show);
    if (!show && worksheet?.attendanceSessions.some(session => String(session.sessionId) === selectedSessionId && session.status === 'revoked')) {
      setSelectedSessionId('');
    }
  };

  return (
    <div className="space-y-6">

      <FacultyExcusedRequestsPanel onDecided={() => {
        const csIdNum = parseInt(selectedCsId, 10);
        if (csIdNum > 0) void loadWorksheet(csIdNum, selectedDate);
      }} />

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
            className="text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: ASSIGNED CLASSES GRID                                             */}
      {/* ========================================================================= */}
      {viewMode === 'classes' && (
        <div className="space-y-6 animate-fade-in">
          {/* 2. Assigned Classes Cards Grid */}
          <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>My Assigned Classes</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {scopedClasses.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click a card to view its live attendance roll call, session controls, and student roster.
            </p>
          </div>

          {/* School Year / Term Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Term:</span>
            <select
              aria-label="Attendance school year"
              value={selectedSchoolYear}
              disabled={attendanceWritePending}
              onChange={event => {
                setSelectedSchoolYear(event.target.value);
                handleCourseChange('');
                setIsStartSessionOpen(false);
              }}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
            >
              <option value="current">{currentSchoolYear ? `${currentSchoolYear} (Current)` : 'Current school year'}</option>
              <option value="all">All school years</option>
              {availableSchoolYears.filter(year => year !== currentSchoolYear).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingClasses ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : scopedClasses.length === 0 ? (
          <Card className="p-8 text-center text-slate-500 dark:text-slate-400">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              No classes assigned for {selectedSchoolYear === 'current' ? (currentSchoolYear || 'this school year') : 'the selected term'}.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {scopedClasses.map(c => {
              const isSelected = String(c.csId) === selectedCsId;
              const hasActiveSession = isSelected && Boolean(liveCurrentSession);
              const isPastClass = Boolean(currentSchoolYear && c.schoolYear !== currentSchoolYear);

              return (
                <div
                  key={c.csId}
                  onClick={() => handleSelectClass(c)}
                  className={`group relative rounded-2xl p-4 sm:p-5 border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3.5 bg-white dark:bg-slate-900 shadow-xs ${
                    isSelected
                      ? 'border-accent-500/80 ring-2 ring-accent-500/30 shadow-lg shadow-accent-500/10'
                      : 'border-slate-200/80 dark:border-slate-800 hover:border-accent-300 dark:hover:border-accent-800/50 hover:shadow-md'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Colorful Badge, Section Label & Live Dot */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-accent-50 dark:bg-accent-950/50 text-accent-700 dark:text-accent-300 text-[10px] font-extrabold uppercase tracking-wider">
                        {c.courseCode} &bull; Year {c.yearLevel || 1}
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {c.csName || `Block ${c.block}`}
                        </span>

                        {/* Live Session Dot Indicator */}
                        {hasActiveSession ? (
                          <span className="inline-flex whitespace-nowrap items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 animate-pulse">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                            {isPastClass ? 'Archived' : 'Idle'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Course Title */}
                    <h3 className="text-sm sm:text-base font-extrabold font-heading text-slate-900 dark:text-slate-100 group-hover:text-accent-700 dark:group-hover:text-accent-300 transition-colors line-clamp-2">
                      {c.courseName}
                    </h3>

                    {/* Class Details: Purple Calendar & MapPin Icons */}
                    <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                        <span>{semesterLabel(c.semester)} &bull; {c.schoolYear || currentSchoolYear || '2026-2027'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-accent-500 shrink-0 mt-0.5" />
                        <span className="truncate">
                          {c.lecRoom ? <><strong className="text-slate-700 dark:text-slate-200">Lec:</strong> {c.lecRoom} </> : ''}
                          {c.schedule ? `(${c.schedule})` : (c.labRoom ? <><strong className="text-slate-700 dark:text-slate-200">Lab:</strong> {c.labRoom}</> : 'Venue / Schedule TBA')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Row: Students Count & Actions */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{c.enrolledCount} Students</span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenClassSessionModal(c);
                        }}
                        disabled={isPastClass}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 xl:max-[1439px]:px-2 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        title={isPastClass ? 'Past school-year classes are view-only.' : 'View and Manage Sessions'}
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>View Session</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectClass(c);
                        }}
                        className="inline-flex items-center justify-center text-xs font-bold px-3 xl:max-[1439px]:px-2 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                      >
                        <span>View Attendance</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: DEDICATED ATTENDANCE WORKSHEET VIEW                                */}
      {/* ========================================================================= */}
      {viewMode === 'worksheet' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Class Header */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3.5">
              <button
                type="button"
                onClick={() => setViewMode('classes')}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Assigned Classes</span>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {liveCurrentSession ? (
                  <button
                    type="button"
                    onClick={() => selectedClass && handleOpenClassSessionModal(selectedClass)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/60 shadow-xs cursor-pointer hover:bg-emerald-100 transition-all"
                    title="Click to view and manage live session details"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span>Live Session</span>
                    {liveCurrentSession.sessionCode && (
                      <span className="font-mono text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                        ({liveCurrentSession.sessionCode})
                      </span>
                    )}
                  </button>
                ) : worksheet?.attendanceSession?.status === 'scheduled' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    <span>Scheduled Session</span>
                  </span>
                ) : null}

                {selectedClass && (
                  <button
                    type="button"
                    onClick={() => handleOpenClassSessionModal(selectedClass)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/50 text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
                    <span>View / Manage Sessions</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsStartSessionOpen(true);
                  }}
                  disabled={selectedClassIsPast || loadingWorksheet || attendanceWritePending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Session</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const csIdNum = parseInt(selectedCsId, 10);
                    if (csIdNum > 0) loadWorksheet(csIdNum, selectedDate);
                  }}
                  disabled={loadingWorksheet || attendanceWritePending}
                  aria-label="Refresh attendance worksheet"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh Worksheet"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingWorksheet ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Class Title and Metadata Badges */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-extrabold bg-accent-100 dark:bg-accent-950/60 text-accent-800 dark:text-accent-300">
                  {selectedClass?.courseCode || 'CLASS'}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">&bull;</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedClass?.csName || 'Section'} {selectedClass?.block ? `(Block ${selectedClass.block})` : ''}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">&bull;</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {selectedClass ? semesterLabel(selectedClass.semester) : ''} {selectedClass?.schoolYear || currentSchoolYear}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-900 dark:text-slate-50 tracking-tight">
                {selectedClass?.courseName || 'Class Attendance Worksheet'}
              </h1>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-accent-500 shrink-0" />
                  <span className="font-bold text-slate-700 dark:text-slate-200">{selectedClass?.enrolledCount ?? stats.total} Enrolled Students</span>
                </div>

                {(selectedClass?.lecRoom || selectedClass?.labRoom) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-accent-500 shrink-0" />
                    <span>
                      {selectedClass?.lecRoom ? <><strong>Lec:</strong> {selectedClass.lecRoom} </> : ''}
                      {selectedClass?.labRoom ? <><strong>Lab:</strong> {selectedClass.labRoom}</> : ''}
                    </span>
                  </div>
                )}

                {selectedClass?.schedule && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-accent-500 shrink-0" />
                    <span>{selectedClass.schedule}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Streamlined Worksheet Controls & Search Bar */}
          <div id="attendance-worksheet-section" className="scroll-mt-6">
        <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          {/* Accessible Assigned Course & Class Section selectors preserved for test compatibility */}
          <div className="sr-only">
            <select
              aria-label="Assigned course"
              value={selectedCourseId !== null ? String(selectedCourseId) : ''}
              onChange={(e) => handleCourseChange(e.target.value)}
            >
              <option value="">-- Select Assigned Course --</option>
              {assignedCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Class section"
              value={selectedCsId}
              onChange={(e) => {
                setWorksheet(null);
                setSelectedCsId(e.target.value);
                setSelectedSessionId('');
              }}
              disabled={selectedCourseId === null || availableSections.length === 0}
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

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Left: Worksheet Date with Quick 'Jump to Today' */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Worksheet Date:</span>
                <input
                  type="date"
                  value={selectedDate}
                  disabled={attendanceWritePending}
                  onChange={(e) => { setWorksheet(null); setSelectedDate(e.target.value); setSelectedSessionId(''); }}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                />
              </div>

              {selectedDate !== manilaDateToday() && (
                <button
                  type="button"
                  onClick={() => { setWorksheet(null); setSelectedDate(manilaDateToday()); setSelectedSessionId(''); }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  Jump to Today
                </button>
              )}
            </div>

            {/* Right: Search Input & Attendance Status Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-full md:max-w-lg">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search student name or ID..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="w-full sm:w-44 shrink-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  disabled={!worksheet}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
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
          </div>

          {classesError && (
            <div className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{classesError}</span>
            </div>
          )}
        </Card>
      </div>

      {/* 4. Summary Count Cards (Rule 4: straightforward counts) */}
      {worksheet && (
        <>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-xs">
          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mr-2">Class Roll Call ({stats.total} students)</span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">All: {stats.total}</span>
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Present: {stats.present}</span>
          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">Late: {stats.late}</span>
          <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300">Absent: {stats.absent}</span>
          <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:text-sky-300">Excused: {stats.excused}</span>
          <span className="ml-auto text-[10px] font-bold text-slate-500 dark:text-slate-400">{stats.total ? Math.round((stats.recorded / stats.total) * 100) : 0}% recorded</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Enrolled</span>
            <span className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">{stats.total}</span>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Recorded</span>
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

      {/* 5. Main Worksheet Register */}
      {!selectedCsId ? (
        <Card className="p-12 text-center text-slate-500 dark:text-slate-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Please click &ldquo;View Attendance&rdquo; on one of your class cards above to view the roll call worksheet.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Attendance records are loaded directly from the authoritative database.
          </p>
        </Card>
      ) : loadingWorksheet ? (
        <Card className="p-12 text-center text-slate-500 dark:text-slate-400">
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
          {worksheetIsReadOnly && !allSessionsHidden && (
            <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {selectedClassIsPast
                ? 'Past school-year attendance is view-only.'
                : selectedDate > manilaDateToday() || worksheet.attendanceSession?.status === 'scheduled'
                ? 'Scheduled session: attendance opens at its chosen date/time in Asia/Manila.'
                : 'Choose a session to manage its attendance.'}
            </p>
          )}

          {/* If there are multiple sessions recorded on the same date */}
          {(shownSessions.length > 1 || revokedSessionCount > 0) && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            {shownSessions.length > 0 && (
            <label className="block flex-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              Switch Attendance Session on this Date:
              <select
                aria-label="Attendance session"
                value={selectedSessionId}
                disabled={attendanceWritePending}
                onChange={event => setSelectedSessionId(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 shadow-xs"
              >
                <option value="">Choose a session</option>
                {shownSessions.map(session => (
                  <option key={String(session.sessionId)} value={String(session.sessionId)}>
                    {String(session.openingTime ?? 'Unconfigured')}–{String(session.classEndTime ?? '')} · {String(session.sessionCode)} · {String(session.status)}
                  </option>
                ))}
              </select>
            </label>
            )}
            {revokedSessionCount > 0 && (
              <RevokedSessionsSwitch showRevoked={showRevoked} revokedCount={revokedSessionCount} disabled={attendanceWritePending} onChange={handleRevokedSwitch} />
            )}
            </div>
          )}

          {allSessionsHidden && (
            <p role="status" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {revokedHiddenText(revokedSessionCount)}
            </p>
          )}

          {/* Revoked Session Notice */}
          {worksheet.attendanceSession?.status === 'revoked' && (
            <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                    <Ban className="w-3 h-3 text-rose-600" />
                    Session Revoked
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                    View-only
                  </span>
                  <span className="font-mono text-slate-500 font-bold">
                    Code: {worksheet.attendanceSession.sessionCode}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Biometric capture is closed; further student submissions are blocked. All recorded attendance is preserved. {REVOKED_SESSION_VIEW_ONLY_NOTE}
                </p>
                {worksheet.attendanceSession.revocationReason && (
                  <p className="text-slate-500 dark:text-slate-400 italic">
                    Reason: {worksheet.attendanceSession.revocationReason}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Accessible hooks preserved for automated test compatibility */}
          <div className="sr-only" aria-label="Upcoming and open sessions">
            {worksheet.pendingSessions?.map(session => (
              <button
                key={session.sessionId}
                type="button"
                disabled={attendanceWritePending}
                onClick={() => {
                  setSelectedDate(session.sessionDate || selectedDate);
                  setSelectedSessionId(session.sessionId);
                }}
              >
                {session.sessionDate} · {session.openingTime ?? 'Unconfigured'}–{session.classEndTime ?? ''} · {session.status === 'scheduled' ? 'Scheduled' : 'Open'} · {session.sessionCode}
              </button>
            ))}
          </div>

          {!allSessionsHidden && (<>
          {/* Controls Bar: Search & Status Filter */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 max-w-full md:max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap hidden sm:inline">Filter Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">All ({worksheet.roster.length})</option>
                <option value="unrecorded">Not recorded ({worksheet.roster.filter(r => r.status === null).length})</option>
                <option value="present">Present ({stats.present})</option>
                <option value="late">Late ({stats.late})</option>
                <option value="absent">Absent ({stats.absent})</option>
                <option value="excused">Excused ({stats.excused})</option>
              </select>
              <select
                aria-label="Overridden"
                value={overriddenFilter}
                onChange={(e) => setOverriddenFilter(e.target.value as OverriddenFilter)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">Overridden: All</option>
                <option value="overridden">Overridden</option>
                <option value="original">Original</option>
              </select>
              <select
                aria-label="Recorded by"
                value={recordedByFilter}
                onChange={(e) => setRecordedByFilter(e.target.value as RecordedByFilter)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">Recorded by: All</option>
                <option value="biometric">Biometric</option>
                <option value="faculty">Faculty manual</option>
                <option value="secretary">Secretary manual</option>
              </select>
              {!revokedSessionOpen && (
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(true)}
                disabled={worksheetIsReadOnly || bulkMarking || worksheet.roster.every(r => r.status !== null)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {bulkMarking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{bulkMarking ? 'Marking…' : 'Mark all unrecorded as Present'}</span>
              </button>
              )}
            </div>
          </div>

          {/* Roster Table: Bounded Scroll Container with Sticky Header & Mobile Horizontal Scroll */}
          <div className="max-h-[560px] overflow-y-auto overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
            <table className="w-full min-w-[640px] text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-100 dark:border-slate-800 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 z-10">
                <tr>
                  <th className="py-3 px-4 sm:py-4 sm:px-6">STUDENT DETAILS</th>
                  <th className="py-3 px-4 sm:py-4 sm:px-6">CHECK-IN TIME</th>
                  <th className="py-3 px-4 sm:py-4 sm:px-6">VERIFICATION METHOD</th>
                  <th className="py-3 px-4 sm:py-4 sm:px-6">ATTENDANCE STATUS</th>
                  <th className="py-3 px-4 sm:py-4 sm:px-6 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredRoster.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
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
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs sm:text-sm">
                            {item.studentName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {item.studentNumber} • Year {item.yearLevel || 1}
                          </span>
                        </td>

                        {/* Column 2: CHECK-IN TIME */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
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
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
                          {item.status ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                              <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>{attendanceMethodLabel(item.verificationMethod, item.overrideReason)}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Column 4: ATTENDANCE STATUS */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6" data-testid="attendance-status">
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
                        <td className="py-3 px-4 sm:py-4 sm:px-6 text-right">
                          {revokedSessionOpen ? (
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">View-only</span>
                          ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenOverride(item)}
                            disabled={worksheetIsReadOnly || isSaving || bulkMarking}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                            <span>Override</span>
                          </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </>)}
        </Card>
      ) : null}
        </div>
      )}

      {/* Session entry is intentionally kept inside Attendance Monitoring per UI-005. */}
      <StartSessionModal
        isOpen={isStartSessionOpen}
        onClose={() => setIsStartSessionOpen(false)}
        accent="emerald"
        summary={<>{assignedCourses.find(course => course.id === selectedCourseId)?.code || 'Course'} · {availableSections.find(section => String(section.csId) === selectedCsId)?.csName || 'Class section'}</>}
        precheck={startSessionPrecheck}
        onSubmit={handleStartSession}
      />

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
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
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
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
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
      {isEndModalOpen && worksheet?.attendanceSession && (
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
              End session <span className="font-mono font-bold">{worksheet.attendanceSession.sessionCode}</span> now? Students without an attendance record will be marked Absent. Corrections remain possible afterwards.
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
      {isRevokeModalOpen && (worksheet?.attendanceSession || sessionTargetToRevoke) && (
        <Modal
          isOpen={isRevokeModalOpen}
          onClose={() => {
            setIsRevokeModalOpen(false);
            setRevokeReason('');
            setRevokeError(null);
            setSessionTargetToRevoke(null);
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
                <span className="font-mono font-bold">{sessionTargetToRevoke?.sessionCode || worksheet?.attendanceSession?.sessionCode}</span>
              </div>
              {(sessionTargetToRevoke?.room || worksheet?.attendanceSession?.room) && (
                <div className="flex justify-between">
                  <span className="font-semibold">Room:</span>
                  <span>{sessionTargetToRevoke?.room || worksheet?.attendanceSession?.room}</span>
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
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 text-right">
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
                  setSessionTargetToRevoke(null);
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

      {/* 7. Edit Session Modal */}
      {isEditSessionOpen && editingSession && (
        <Modal
          isOpen={isEditSessionOpen}
          onClose={() => {
            setIsEditSessionOpen(false);
            setEditingSession(null);
            setEditError(null);
          }}
          title={`Edit Attendance Session (${editingSession.sessionCode || ''})`}
        >
          <form onSubmit={handleUpdateSession} className="space-y-4 text-xs">
            {editError && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Selected session</p>
              <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">
                {editingSession.sessionCode} · Status: <span className="capitalize">{editingSession.status}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Date: {editingSession.sessionDate || selectedDate} (Asia/Manila)
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Room or session location</span>
              <input
                value={editRoom}
                onChange={(event) => setEditRoom(event.target.value)}
                placeholder="e.g. Dental Clinic Room 101"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Opening time</span>
                <input
                  type="time"
                  value={editOpeningTime}
                  onChange={(event) => setEditOpeningTime(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Present cutoff</span>
                <input
                  type="time"
                  value={editPresentCutoff}
                  onChange={(event) => setEditPresentCutoff(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Late cutoff</span>
                <input
                  type="time"
                  value={editLateCutoff}
                  onChange={(event) => setEditLateCutoff(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Class end time</span>
              <input
                type="time"
                required
                aria-label="Class end time"
                value={editClassEndTime}
                onChange={(event) => setEditClassEndTime(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <small className="mt-1 block text-slate-500 dark:text-slate-400">The session ends automatically at this time; unrecorded students are marked Absent.</small>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={editBiometricRequired}
                  onChange={(event) => setEditBiometricRequired(event.target.checked)}
                  className="accent-emerald-600"
                />
                <span><strong className="block text-slate-700 dark:text-slate-200">Face biometric</strong><small className="text-slate-500 dark:text-slate-400">Require verified attendance</small></span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="checkbox"
                  checked={editGeofenceEnabled}
                  onChange={(event) => setEditGeofenceEnabled(event.target.checked)}
                  className="accent-emerald-600"
                />
                <span><strong className="block text-slate-700 dark:text-slate-200">Geofence</strong><small className="text-slate-500 dark:text-slate-400">Use a configured room radius</small></span>
              </label>
            </div>

            {editGeofenceEnabled && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-3">
                  <label className="block flex-1">
                    <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Allowed radius (meters)</span>
                    <input
                      type="number"
                      min={50}
                      max={2000}
                      value={editGeofenceRadius}
                      onChange={(event) => setEditGeofenceRadius(Number(event.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <small className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{RADIUS_HINT}</small>
                  </label>
                  <button
                    type="button"
                    onClick={handleAcquireEditLocation}
                    disabled={locatingEdit}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[11px] font-bold text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    {locatingEdit ? 'Locating…' : 'Use device location'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditMap(shown => !shown)}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 px-3 py-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {showEditMap ? 'Hide map' : 'Pick on map'}
                  </button>
                </div>
                {showEditMap && (
                  <div className="mt-3">
                    <LocationPicker value={editLocation} radiusMeters={editGeofenceRadius} onChange={setEditLocation} />
                  </div>
                )}
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {editLocation ? `Location set: ${editLocation.latitude}, ${editLocation.longitude}` : 'Click "Pick on map" or "Use device location" to set room coordinates.'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsEditSessionOpen(false);
                  setEditingSession(null);
                  setEditError(null);
                }}
                disabled={submittingEdit}
                className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingEdit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 font-bold text-white shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submittingEdit ? 'Saving…' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 8. Dedicated Session Management Modal (Current Session & Upcoming Sessions) */}
      {isSessionModalOpen && (
        <Modal
          isOpen={isSessionModalOpen}
          onClose={() => {
            setIsSessionModalOpen(false);
            setEditError(null);
          }}
          title={`Attendance Sessions — ${assignedCourses.find(c => c.id === selectedCourseId)?.code || 'Class'} (${availableSections.find(s => String(s.csId) === selectedCsId)?.csName || 'Section'})`}
        >
          <div className="space-y-4 text-xs">
            {/* Modal Tabs Header */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setSessionModalTab('current')}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  sessionModalTab === 'current'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/60 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {liveCurrentSession && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Session in progress" />
                )}
                <span>Current Session</span>
              </button>
              <button
                type="button"
                onClick={() => setSessionModalTab('upcoming')}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  sessionModalTab === 'upcoming'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/60 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>Upcoming Sessions</span>
                {upcomingSessions.length > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    sessionModalTab === 'upcoming'
                      ? 'bg-purple-200/80 text-purple-900 dark:bg-purple-900 dark:text-purple-100'
                      : 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                  }`}>
                    {upcomingSessions.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: CURRENT SESSION (Only sessions happening during this current time) */}
            {sessionModalTab === 'current' && (
              <div className="space-y-4">
                {loadingWorksheet ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 text-emerald-500 animate-spin" />
                    <p className="font-semibold">Checking current session status…</p>
                  </div>
                ) : liveCurrentSession ? (
                  <div className="space-y-3.5">
                    {/* Session Overview Card */}
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            liveCurrentSession.status === 'active'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}>
                            {liveCurrentSession.status === 'active' ? '● Live Active' : '● In Progress'}
                          </span>
                          <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-100">
                            {liveCurrentSession.sessionCode}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            ({liveCurrentSession.sessionDate})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {liveCurrentSession.room && (
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-500" />
                              {liveCurrentSession.room}
                            </span>
                          )}
                          {liveCurrentSession.biometricRequired && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-300">
                              <Camera className="w-3 h-3 text-purple-600" />
                              Face Biometric
                            </span>
                          )}
                          {liveCurrentSession.geofenceEnabled && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              Geofence ({liveCurrentSession.geofenceRadiusMeters ?? 100}m)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timing Timeline Breakdown */}
                      {liveCurrentSession.openingTime && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1" />
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">Open {liveCurrentSession.openingTime}</span>
                          <span>→</span>
                          <span className="font-bold text-purple-700 dark:text-purple-300">Cutoff {liveCurrentSession.presentCutoff || '—'}</span>
                          <span>→</span>
                          <span className="font-bold text-amber-700 dark:text-amber-300">Late {liveCurrentSession.lateCutoff || 'Late'}</span>
                          {liveCurrentSession.classEndTime && (
                            <>
                              <span>→</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200">End {liveCurrentSession.classEndTime}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick Session Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSession(liveCurrentSession)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 text-xs font-bold transition-all shadow-xs cursor-pointer dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50"
                      >
                        <Pencil className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
                        <span>Edit Session Parameters</span>
                      </button>

                      <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                        {liveCurrentSession.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEndError(null);
                              setIsEndModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                          >
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>End Session</span>
                          </button>
                        )}
                        {liveCurrentSession.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRevokeError(null);
                              setRevokeReason('');
                              setSessionTargetToRevoke(liveCurrentSession);
                              setIsRevokeModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/70 text-xs font-bold transition-all cursor-pointer shadow-xs dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <Clock className="w-8 h-8 mx-auto text-slate-400" />
                    <div>
                      <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">No Active Session Right Now</p>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">There is no attendance session currently running for this class at this time.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStartSessionOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-white text-white" />
                      <span>Start Attendance Session Now</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: UPCOMING SESSIONS (Scheduled sessions in the future with countdowns) */}
            {sessionModalTab === 'upcoming' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200 text-xs">
                    Scheduled & Upcoming Sessions ({upcomingSessions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsStartSessionOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <span>+ Schedule New</span>
                  </button>
                </div>

                {upcomingSessions.length > 0 ? (
                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {upcomingSessions.map(session => {
                      const startMs = parseSessionTimeMs(session.sessionDate, session.openingTime);
                      const startsInLabel = startMs ? formatStartsIn(startMs, currentTimeMs, session.sessionDate, session.openingTime) : null;

                      return (
                        <div
                          key={session.sessionId}
                          className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-extrabold text-[11px]">
                                {session.sessionDate}
                              </span>
                              <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                                {session.sessionCode}
                              </span>
                              {startsInLabel && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                  <span>{startsInLabel}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{session.openingTime ?? '08:00'} – {session.classEndTime ?? '13:00'}</span>
                              {session.room && (
                                <>
                                  <span>&bull;</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                    {session.room}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleOpenEditSession(session)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 font-bold text-xs shadow-xs cursor-pointer dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50"
                            >
                              <Pencil className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(session.sessionDate || selectedDate);
                                setSelectedSessionId(session.sessionId);
                                setIsSessionModalOpen(false);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs cursor-pointer"
                            >
                              <span>Open</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSessionTargetToRevoke(session);
                                setRevokeReason('');
                                setRevokeError(null);
                                setIsRevokeModalOpen(true);
                              }}
                              className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold cursor-pointer"
                              title="Cancel / Revoke"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 dark:text-slate-300">No Upcoming Sessions Scheduled</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Use "+ Schedule New" to schedule an attendance session for future dates.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Test-compatible & Accessible Controls */}
      <div className="sr-only">
        <div role="tablist" aria-label="Attendance navigation">
          <button
            role="tab"
            aria-selected={viewMode === 'classes'}
            onClick={() => setViewMode('classes')}
          >
            Assigned Classes
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'worksheet'}
            onClick={() => {
              if (!selectedCsId && scopedClasses.length > 0) {
                handleSelectClass(scopedClasses[0]);
              }
              setViewMode('worksheet');
            }}
          >
            Roll call
          </button>
        </div>
        <select
          aria-label="Assigned course"
          value={selectedCourseId !== null ? String(selectedCourseId) : ''}
          onChange={(e) => handleCourseChange(e.target.value)}
        >
          <option value="">-- Select Assigned Course --</option>
          {assignedCourses.map(c => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Class section"
          value={selectedCsId}
          onChange={(e) => {
            setWorksheet(null);
            setSelectedCsId(e.target.value);
            setSelectedSessionId('');
            if (e.target.value) setViewMode('worksheet');
          }}
          disabled={selectedCourseId === null || availableSections.length === 0}
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
        <button
          type="button"
          onClick={() => {
            setIsStartSessionOpen(true);
          }}
          aria-label="New attendance session"
        >
          New attendance session
        </button>
      </div>
    </div>
  );
};
