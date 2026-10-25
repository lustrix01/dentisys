import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  BookOpen,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  Clock3,
  History,
  Layers,
  MapPin,
  Pencil,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { showFeedback } from '../../components/FeedbackCenter';
import { Modal } from '../../components/Modal';
import { StartSessionModal, type StartSessionValues } from '../../components/StartSessionModal';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { DEVELOPMENT_LOCATION_FIXTURES } from '../../services/developmentProviders';
import { RevokedSessionsSwitch } from '../../components/RevokedSessionsSwitch';
import {
  REVOKED_SESSION_VIEW_ONLY_NOTE, countRevokedSessions, matchesRollCallFilters, revokedHiddenText, visibleSessions,
  type OverriddenFilter, type RecordedByFilter,
} from '../../utils/attendanceRollCall';
import {
  getSecretaryAttendanceApi,
  getSecretaryProfileApi,
  getSecretaryDashboardKpisApi,
  getSecretaryActiveAttendanceSessionApi,
  startSecretaryAttendanceSessionApi,
  overrideSecretaryAttendanceApi,
  createSecretaryExcusedRequestApi,
  endSecretaryAttendanceSessionApi,
  revokeSecretaryAttendanceSessionApi,
} from '../../services/apiClient';

type AttendanceItem = Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['records'][number];
type SessionItem = NonNullable<Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['sessions']>[number];

const statusClass: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  absent: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  excused: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
};

const sessionStatusClass: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  scheduled: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  ended: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  revoked: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

const formatSessionTime = (value?: string | null) => {
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

export const AttendanceList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const config = useRuntimeConfig();
  const simulationEnabled = config.providers.location.active === 'development-mock' && config.features.browser_attendance_prototype;

  // Navigation mode: 'classes' (Grid) or 'worksheet' (Detailed roll call worksheet)
  const [viewMode, setViewMode] = useState<'classes' | 'worksheet'>(() => {
    return searchParams.get('view') === 'worksheet' ? 'worksheet' : 'classes';
  });

  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [className, setClassName] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [query, setQuery] = useState(() => searchParams.get('student') ?? '');
  const [date, setDate] = useState(() => searchParams.get('date') ?? manilaDateToday());
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [sessionId, setSessionId] = useState(() => searchParams.get('sessionId') ?? searchParams.get('session') ?? '');
  const [sessionRecords, setSessionRecords] = useState<AttendanceItem[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const sessionRequest = useRef(0);
  const loadRequest = useRef(0);
  const saving = useRef(false);
  const [status, setStatus] = useState('all');
  const [overriddenFilter, setOverriddenFilter] = useState<OverriddenFilter>('all');
  const [recordedByFilter, setRecordedByFilter] = useState<RecordedByFilter>('all');
  // Revoked sessions are hidden until asked for; not remembered between visits.
  const [showRevoked, setShowRevoked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Manual Override modal state
  const [selectedRecord, setSelectedRecord] = useState<AttendanceItem | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'present' | 'late' | 'absent' | 'excused'>('present');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedbackState] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Also raise the corner notice: the banner is off-screen when the page is scrolled.
  const setFeedback = (f: { type: 'success' | 'error'; text: string } | null) => {
    setFeedbackState(f);
    if (f) showFeedback(f.text, f.type);
  };

  // Dedicated Session Management Modal (Current Session & Upcoming Sessions tabs)
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionModalTab, setSessionModalTab] = useState<'current' | 'upcoming'>('current');

  // End Session confirmation modal
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [sessionTargetToEnd, setSessionTargetToEnd] = useState<SessionItem | null>(null);
  const [submittingEnd, setSubmittingEnd] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // Revoke Session modal
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [sessionTargetToRevoke, setSessionTargetToRevoke] = useState<SessionItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Live timer tick (updates every 10s so sessions automatically transition when opening time arrives)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Start Session pop-up: current-school-year sections only (REG-006); a past-year section can never start a session.
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [startSections, setStartSections] = useState<Array<{ classId: string; className: string; classroomName: string; courseCode?: string }>>([]);
  const [startCsId, setStartCsId] = useState('');
  const [otherLiveName, setOtherLiveName] = useState<string | null>(null);
  const startCsIdRef = useRef('');
  startCsIdRef.current = startCsId;
  const startLocation = useMemo(() => (simulationEnabled
    ? { latitude: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436, longitude: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438 }
    : null), [simulationEnabled]);

  const readOtherLive = async (csId: string, list: Array<{ classId: string; className: string }>) => {
    const others = await Promise.all(list.filter(sec => sec.classId !== csId).map(async sec => (
      (await getSecretaryActiveAttendanceSessionApi(Number(sec.classId)).catch(() => null))?.activeSession?.status === 'active' ? sec.className : null
    )));
    return others.find(name => name !== null) ?? null;
  };

  const openStartSession = async () => {
    setIsStartOpen(true);
    try {
      const kpis = await getSecretaryDashboardKpisApi('current');
      const fromServer = kpis?.assignedClasses?.length ? kpis.assignedClasses : kpis?.assignedClass?.classId ? [kpis.assignedClass] : [];
      const list = fromServer.map(sec => ({ classId: sec.classId, className: sec.className, classroomName: sec.classroomName ?? '', courseCode: 'courseCode' in sec ? sec.courseCode : undefined }));
      const chosen = list.find(sec => sec.classId === (startCsIdRef.current || String(kpis?.assignedClass?.classId ?? ''))) ?? list[0] ?? null;
      setStartSections(list);
      setStartCsId(chosen?.classId ?? '');
      setOtherLiveName(chosen ? await readOtherLive(chosen.classId, list) : null);
    } catch { /* The pop-up reports a missing section when it is submitted. */ }
  };

  const selectStartSection = async (classId: string) => {
    setStartCsId(classId);
    setOtherLiveName(await readOtherLive(classId, startSections).catch(() => null));
  };

  const handleStartSession = async (values: StartSessionValues) => {
    const csId = parseInt(startCsId, 10);
    const { location } = values;
    const res = await startSecretaryAttendanceSessionApi({
      csId,
      sessionDate: values.sessionDate,
      room: values.room || undefined,
      biometricRequired: values.biometricRequired,
      geofenceEnabled: values.geofenceEnabled,
      geofenceRadiusMeters: values.geofenceEnabled ? values.geofenceRadiusMeters : undefined,
      openingTime: values.openingTime,
      presentCutoff: values.presentCutoff,
      lateCutoff: values.lateCutoff,
      classEndTime: values.classEndTime,
      ...(values.geofenceEnabled && location
        ? { geofenceLatitude: location.latitude, geofenceLongitude: location.longitude, latitude: location.latitude, longitude: location.longitude }
        : {}),
    });
    setIsStartOpen(false);
    setFeedback({
      type: 'success',
      text: res.session.status === 'scheduled'
        ? `Session scheduled for ${values.sessionDate} at ${values.openingTime} (Asia/Manila). Session code: ${res.session.sessionCode}`
        : `Attendance session started. The class roll call is now live. Session code: ${res.session.sessionCode}`,
    });
    setRefreshVersion(version => version + 1);
    void load();
  };

  useEffect(() => {
    if (searchParams.get('startSession') !== '1') return;
    void openStartSession();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('startSession');
      return next;
    }, { replace: true });
  }, [searchParams]);

  // quiet = background refresh: no spinner, keeps the last good data on failure, and a later load/End/Revoke/override makes it stale.
  const load = async (quiet = false) => {
    if (saving.current) return;
    const requestId = quiet ? loadRequest.current : ++loadRequest.current;
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const [attendance, profile, dashboard] = await Promise.all([
        getSecretaryAttendanceApi(),
        getSecretaryProfileApi(),
        getSecretaryDashboardKpisApi().catch(() => null),
      ]);
      if (loadRequest.current !== requestId) return;
      setRecords(attendance.records || []);
      setSessions(attendance.sessions || []);
      setClassName(profile.profile.assignedClassName || dashboard?.assignedClass?.className || '');
      setClassroomName(profile.profile.classroomName || dashboard?.assignedClass?.classroomName || '');
    } catch (requestError) {
      if (loadRequest.current !== requestId || quiet) return;
      setRecords([]);
      setSessions([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance.');
    } finally {
      if (!quiet && loadRequest.current === requestId) setLoading(false);
    }
  };

  const handleOpenOverride = (record: AttendanceItem) => {
    if (saving.current || loading || sessionLoading) return;
    setSelectedRecord(record);
    const validStatuses = ['present', 'late', 'absent', 'excused'];
    setOverrideStatus((validStatuses.includes(record.status) ? record.status : 'present') as 'present' | 'late' | 'absent' | 'excused');
    setReason('');
    setFeedback(null);
  };

  const handleSaveOverride = async () => {
    if (!selectedRecord || saving.current || loading || sessionLoading) return;
    const trimmedReason = reason.trim().replace(/\s+/g, ' ');
    if (trimmedReason.length < 8 || trimmedReason.length > (overrideStatus === 'excused' ? 500 : 240)) {
      setFeedback({ type: 'error', text: `Provide a new reason of 8–${overrideStatus === 'excused' ? 500 : 240} characters.` });
      return;
    }
    if (overrideStatus === selectedRecord.status) {
      setFeedback({ type: 'error', text: 'Choose a different attendance status.' });
      return;
    }

    saving.current = true;
    ++loadRequest.current;
    ++sessionRequest.current;
    setSubmitting(true);
    setFeedback(null);
    try {
      const targetSessionId = selectedRecord.attendanceSessionId ? Number(selectedRecord.attendanceSessionId) : undefined;
      if (overrideStatus === 'excused') {
        const response = await createSecretaryExcusedRequestApi({
          studentId: selectedRecord.studentId,
          recordId: selectedRecord.id || undefined,
          sessionId: targetSessionId,
          reason: trimmedReason,
        });
        setFeedback({ type: 'success', text: response.message || 'Excused request sent to Faculty for approval.' });
        setSelectedRecord(null);
        setReason('');
        setRefreshVersion(version => version + 1);
        return;
      }

      const response = await overrideSecretaryAttendanceApi({
        studentId: selectedRecord.studentId,
        recordId: selectedRecord.id,
        sessionId: targetSessionId,
        date: selectedRecord.date,
        status: overrideStatus,
        reason: trimmedReason,
      });

      const updateRecords = (current: AttendanceItem[]) =>
        current.map((r) =>
          (r.id && r.id === selectedRecord.id) || (!r.id && r.studentId === selectedRecord.studentId && r.attendanceSessionId === selectedRecord.attendanceSessionId)
            ? {
                ...r,
                id: response.record?.id ?? r.id,
                status: overrideStatus,
                overrideReason: trimmedReason,
                overrideAt: response.record?.overrideAt ?? r.overrideAt,
                verificationMethod: r.id ? r.verificationMethod : 'manual_secretary',
              }
            : r
        )
      ;
      setRecords(current => {
        const updated = updateRecords(current);
        if (!selectedRecord.id && response.record?.id && !current.some(record => record.id === response.record?.id)) {
          return [...updated, {
            ...selectedRecord,
            id: response.record.id,
            status: overrideStatus,
            overrideReason: trimmedReason,
            overrideAt: response.record.overrideAt,
            verificationMethod: 'manual_secretary',
          }];
        }
        return updated;
      });
      setSessionRecords(updateRecords);

      setFeedback({ type: 'success', text: response.message || 'Attendance override applied successfully.' });
      setSelectedRecord(null);
      setReason('');
      setRefreshVersion(version => version + 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Attendance override was rejected.',
      });
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionTargetToEnd) return;
    ++loadRequest.current;
    ++sessionRequest.current;
    setSubmittingEnd(true);
    setEndError(null);
    try {
      await endSecretaryAttendanceSessionApi({ sessionId: sessionTargetToEnd.sessionId });
      setIsEndModalOpen(false);
      setSessionTargetToEnd(null);
      setIsSessionModalOpen(false);
      setFeedback({ type: 'success', text: `Session ${sessionTargetToEnd.sessionCode} ended successfully.` });
      setRefreshVersion(version => version + 1);
      void load();
    } catch (err) {
      setEndError(err instanceof Error ? err.message : 'Unable to end session.');
    } finally {
      setSubmittingEnd(false);
    }
  };

  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTargetToRevoke) return;
    ++loadRequest.current;
    ++sessionRequest.current;
    setSubmittingRevoke(true);
    setRevokeError(null);
    try {
      await revokeSecretaryAttendanceSessionApi({
        sessionId: sessionTargetToRevoke.sessionId,
        reason: revokeReason.trim() || null,
      });
      setIsRevokeModalOpen(false);
      setSessionTargetToRevoke(null);
      setRevokeReason('');
      setIsSessionModalOpen(false);
      setFeedback({ type: 'success', text: `Session ${sessionTargetToRevoke.sessionCode} revoked successfully.` });
      setRefreshVersion(version => version + 1);
      void load();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Unable to revoke session.');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { ++loadRequest.current; };
  }, []);

  // Live refresh (as Faculty): while an active or scheduled session exists, reload every 30 s unless a write is in flight.
  const writeInFlight = useRef(false);
  writeInFlight.current = submitting || submittingEnd || submittingRevoke;
  const hasOpenSession = sessions.some(s => s.status === 'active' || s.status === 'scheduled');
  useEffect(() => {
    if (!hasOpenSession) return;
    const timer = setInterval(() => {
      if (saving.current || writeInFlight.current) return;
      void load(true);
      if (!sessionId) return;
      const requestId = sessionRequest.current;
      getSecretaryAttendanceApi({ sessionId })
        .then(response => { if (sessionRequest.current === requestId) setSessionRecords(response.records); })
        .catch(() => { /* Keep the last successful roster. */ });
    }, 30000);
    return () => clearInterval(timer);
  }, [hasOpenSession, sessionId]);

  useEffect(() => {
    const requestId = ++sessionRequest.current;
    setSessionRecords([]);
    setSelectedRecord(null);
    if (!sessionId) { setSessionLoading(false); return; }
    setSessionLoading(true);
    setError('');
    getSecretaryAttendanceApi({ sessionId })
      .then(response => { if (sessionRequest.current === requestId) setSessionRecords(response.records); })
      .catch(err => { if (sessionRequest.current === requestId) setError(err instanceof Error ? err.message : 'Unable to load session roster.'); })
      .finally(() => { if (sessionRequest.current === requestId) setSessionLoading(false); });
    return () => { ++sessionRequest.current; };
  }, [sessionId, refreshVersion]);

  // Once per date, open that date's active session; otherwise the user chooses one.
  const autoSelectedDate = useRef<string | null>(null);
  useEffect(() => {
    if (loading || autoSelectedDate.current === date) return;
    autoSelectedDate.current = date;
    if (sessionId) return;
    const active = sessions.find(s => s.status === 'active' && (!date || (s.sessionDate || s.date) === date));
    if (active) setSessionId(active.sessionId);
  }, [loading, date, sessions, sessionId]);

  // Dynamically classify Current Session (happening right now) vs Upcoming Sessions (scheduled in the future)
  const { liveCurrentSession, upcomingSessions } = useMemo(() => {
    let current: SessionItem | null = null;
    const upcoming: SessionItem[] = [];

    for (const session of sessions) {
      if (session.status === 'revoked' || session.status === 'ended') {
        continue;
      }

      const sDate = session.sessionDate || session.date;
      const startMs = parseSessionTimeMs(sDate, session.openingTime);
      const endMs = parseSessionTimeMs(sDate, session.classEndTime || '23:59');

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

    upcoming.sort((a, b) => {
      const aTime = parseSessionTimeMs(a.sessionDate || a.date, a.openingTime) ?? 0;
      const bTime = parseSessionTimeMs(b.sessionDate || b.date, b.openingTime) ?? 0;
      return aTime - bTime;
    });

    return { liveCurrentSession: current, upcomingSessions: upcoming };
  }, [sessions, currentTimeMs]);

  const dates = useMemo(() => Array.from(new Set([...records.map(record => record.date), ...sessions.map(session => session.date)])).sort().reverse(), [records, sessions]);
  const subjects = useMemo(() => Array.from(new Set([...records.map(record => record.subjectCode), ...sessions.map(session => session.subjectCode)].filter(Boolean))).sort(), [records, sessions]);

  // Derive Assigned Class Cards for View 1 (My Assigned Classes Grid)
  const assignedClassCards = useMemo(() => {
    if (subjects.length > 0) {
      return subjects.map((sub) => {
        const subRecords = records.filter(r => r.subjectCode === sub);
        const subSessions = sessions.filter(s => s.subjectCode === sub);
        const count = new Set(subRecords.map(r => r.studentId)).size || subRecords.length;
        const currentActive = subSessions.some(s => s.sessionId === liveCurrentSession?.sessionId);
        const room = subSessions.find(s => s.room)?.room || classroomName || 'Room 101';
        return {
          id: sub,
          subjectCode: sub,
          className: className || 'Section A',
          courseTitle: `${sub} — Dental Medicine`,
          enrolledCount: count || records.length || 0,
          room,
          semester: '1st Semester',
          schoolYear: '2026-2027',
          schedule: 'Regular Class Schedule',
          hasLiveSession: currentActive,
          yearLevel: subRecords[0]?.yearLevel || 1,
        };
      });
    }

    const count = new Set(records.map(r => r.studentId)).size || records.length;
    return [{
      id: className || 'class-section',
      subjectCode: className || 'DMD 1-A',
      className: className || 'Section A',
      courseTitle: `Doctor of Dental Medicine — ${className || 'Section A'}`,
      enrolledCount: count,
      room: classroomName || 'Room 101',
      semester: '1st Semester',
      schoolYear: '2026-2027',
      schedule: 'Regular Class Schedule',
      hasLiveSession: Boolean(liveCurrentSession),
      yearLevel: records[0]?.yearLevel || 1,
    }];
  }, [subjects, records, sessions, className, classroomName, liveCurrentSession]);

  // Filtered Roster for Worksheet View
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (sessionId ? sessionRecords : []).filter((record) => {
      if (date && record.date !== date) return false;
      if (!matchesRollCallFilters(record, overriddenFilter, recordedByFilter)) return false;
      if (selectedSubject !== 'all' && record.subjectCode !== selectedSubject) return false;
      if (status !== 'all') {
        if (status === 'unrecorded') {
          if (record.status && record.status !== 'not_recorded') return false;
        } else if (record.status !== status) {
          return false;
        }
      }
      if (!needle) return true;
      return record.studentName.toLocaleLowerCase().includes(needle) || record.studentNumber.toLocaleLowerCase().includes(needle) || record.subjectCode.toLocaleLowerCase().includes(needle);
    });
  }, [date, query, sessionRecords, sessionId, status, selectedSubject, overriddenFilter, recordedByFilter]);

  const dateSessions = useMemo(() => sessions.filter(s => !date || (s.sessionDate || s.date) === date), [sessions, date]);
  const revokedSessionCount = countRevokedSessions(dateSessions);
  const shownSessions = visibleSessions(dateSessions, showRevoked);
  const allSessionsHidden = dateSessions.length > 0 && shownSessions.length === 0;
  const openSession = sessions.find(s => s.sessionId === sessionId);
  const revokedSessionOpen = openSession?.status === 'revoked';
  const handleRevokedSwitch = (show: boolean) => {
    setShowRevoked(show);
    if (!show && revokedSessionOpen) setSessionId('');
  };

  // Attendance rate & straightforward counts (strictly adheres to backend contract tests)
  const attended = filtered.filter((record) => record.status === 'present' || record.status === 'late' || record.status === 'excused').length;
  const present = filtered.filter((record) => record.status === 'present').length;
  const late = filtered.filter((record) => record.status === 'late').length;
  const absent = filtered.filter((record) => record.status === 'absent').length;
  const excused = filtered.filter((record) => record.status === 'excused').length;
  const recorded = filtered.filter((record) => record.status && record.status !== 'not_recorded').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Attendance Monitoring
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Select an assigned class below to manage its roll call, monitor active check-ins, and schedule attendance sessions.
          </p>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setRefreshVersion(version => version + 1);
              void load();
            }}
            className="font-bold underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: ASSIGNED CLASSES GRID (100% Mirrors Faculty Layout & Interactions) */}
      {/* ========================================================================= */}
      {viewMode === 'classes' && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>My Assigned Classes</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {assignedClassCards.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click a card to view its live attendance roll call, session controls, and student roster.
                </p>
              </div>

              {/* Term Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Term:</span>
                <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs">
                  2026-2027 (Current)
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 animate-pulse space-y-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : assignedClassCards.length === 0 ? (
              <Card className="p-8 text-center text-slate-500 dark:text-slate-400">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  No classes assigned to this workspace.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {assignedClassCards.map((c) => {
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedSubject(c.subjectCode || 'all');
                        setViewMode('worksheet');
                      }}
                      className="group relative rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800/50 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3.5 bg-white dark:bg-slate-900 shadow-xs"
                    >
                      <div className="space-y-2.5">
                        {/* Top Row: Secretary Blue Badge, Section Label & Live Dot */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider">
                            {c.subjectCode} &bull; Year {c.yearLevel}
                          </span>

                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-xs font-bold text-blue-600 dark:text-blue-400">
                              {c.className}
                            </span>

                            {/* Live Session Dot Indicator */}
                            {c.hasLiveSession ? (
                              <span className="inline-flex whitespace-nowrap items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 animate-pulse">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                Live
                              </span>
                            ) : (
                              <span className="inline-flex whitespace-nowrap items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                Idle
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Course Title */}
                        <h3 className="text-sm sm:text-base font-extrabold font-heading text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors line-clamp-2">
                          {c.courseTitle}
                        </h3>

                        {/* Class Details: Blue Calendar & MapPin Icons */}
                        <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{c.semester} &bull; {c.schoolYear}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <span className="truncate">
                              <strong className="text-slate-700 dark:text-slate-200">Room:</strong> {c.room} ({c.schedule})
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
                          {/* View Session button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSessionModalTab(c.hasLiveSession ? 'current' : 'upcoming');
                              setIsSessionModalOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 xl:max-[1439px]:px-2 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 transition-all cursor-pointer whitespace-nowrap"
                          >
                            <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                            <span>View Session</span>
                          </button>

                          {/* View Attendance button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubject(c.subjectCode || 'all');
                              setViewMode('worksheet');
                            }}
                            className="inline-flex items-center justify-center text-xs font-bold px-3 xl:max-[1439px]:px-2 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-all cursor-pointer whitespace-nowrap"
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
      {/* VIEW 2: DEDICATED ATTENDANCE WORKSHEET VIEW (100% Mirrors Faculty Layout)  */}
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
                {/* Live Session Badge */}
                {liveCurrentSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setSessionModalTab('current');
                      setIsSessionModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-300/80 dark:border-blue-700/60 shadow-xs cursor-pointer hover:bg-blue-100 transition-all"
                    title="Click to view and manage live session details"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span>Live Session</span>
                    {liveCurrentSession.sessionCode && (
                      <span className="font-mono text-[11px] font-bold text-blue-800 dark:text-blue-200">
                        ({liveCurrentSession.sessionCode})
                      </span>
                    )}
                  </button>
                )}

                {/* View / Manage Sessions button */}
                <button
                  type="button"
                  onClick={() => {
                    setSessionModalTab(liveCurrentSession ? 'current' : 'upcoming');
                    setIsSessionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/50 text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                  <span>View / Manage Sessions</span>
                </button>

                {/* Start Session CTA */}
                <button
                  type="button"
                  onClick={() => void openStartSession()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Session</span>
                </button>

                {/* Refresh button */}
                <button
                  type="button"
                  onClick={() => {
                    setRefreshVersion(version => version + 1);
                    void load();
                  }}
                  disabled={loading || submitting || sessionLoading}
                  aria-label="Refresh attendance worksheet"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh Worksheet"
                >
                  <RefreshCw className={`w-4 h-4 ${loading || sessionLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Class Title and Metadata Badges */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-extrabold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                  {selectedSubject !== 'all' ? selectedSubject : (className || 'SECTION')}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">&bull;</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {className || 'Class Section'}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">&bull;</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  1st Semester 2026-2027
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-900 dark:text-slate-50 tracking-tight">
                {selectedSubject !== 'all' ? `${selectedSubject} Attendance Worksheet` : `${className || 'Class'} Attendance Worksheet`}
              </h1>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="font-bold text-slate-700 dark:text-slate-200">{filtered.length} Enrolled Students</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    <strong>Room:</strong> {classroomName || sessions.find(s => s.room)?.room || 'Room 101'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Regular Class Schedule</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Streamlined Worksheet Controls & Search Bar */}
          <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Left: Worksheet Date with Quick 'Jump to Today' */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Worksheet Date:</span>
                  <input
                    type="date"
                    value={date}
                    disabled={submitting}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSessionId('');
                    }}
                    className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                </div>

                {date !== manilaDateToday() && (
                  <button
                    type="button"
                    onClick={() => {
                      setDate(manilaDateToday());
                      setSessionId('');
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    Jump to Today
                  </button>
                )}

                {date && (
                  <button
                    type="button"
                    onClick={() => {
                      setDate('');
                      setSessionId('');
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    Clear Date
                  </button>
                )}
              </div>

              {/* Right: Search Input & Attendance Status Filter */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-full md:max-w-lg">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search student name or ID..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="w-full sm:w-44 shrink-0">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="all">All statuses ({filtered.length})</option>
                    <option value="present">Present ({present})</option>
                    <option value="late">Late ({late})</option>
                    <option value="absent">Absent ({absent})</option>
                    <option value="excused">Excused ({excused})</option>
                    <option value="unrecorded">Unresolved ({filtered.length - recorded})</option>
                  </select>
                </div>

                <div className="w-full sm:w-44 shrink-0">
                  <select
                    aria-label="Overridden"
                    value={overriddenFilter}
                    onChange={(e) => setOverriddenFilter(e.target.value as OverriddenFilter)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="all">Overridden: All</option>
                    <option value="overridden">Overridden</option>
                    <option value="original">Original</option>
                  </select>
                </div>

                <div className="w-full sm:w-44 shrink-0">
                  <select
                    aria-label="Recorded by"
                    value={recordedByFilter}
                    onChange={(e) => setRecordedByFilter(e.target.value as RecordedByFilter)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="all">Recorded by: All</option>
                    <option value="biometric">Biometric</option>
                    <option value="faculty">Faculty manual</option>
                    <option value="secretary">Secretary manual</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Optional Sessions Switcher */}
            {dateSessions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                {shownSessions.length > 0 && (
                <label className="flex items-center gap-2 font-bold text-slate-600 dark:text-slate-300">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Switch Session:</span>
                  <select
                    value={sessionId}
                    disabled={submitting}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">Choose a session</option>
                    {shownSessions.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.subjectCode} · {s.date} · {s.sessionCode} ({s.status})
                      </option>
                    ))}
                  </select>
                </label>
                )}
                {revokedSessionCount > 0 && (
                  <RevokedSessionsSwitch showRevoked={showRevoked} revokedCount={revokedSessionCount} disabled={submitting} onChange={handleRevokedSwitch} />
                )}
              </div>
            )}
          </Card>

          {revokedSessionOpen && openSession && (
            <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-1 text-xs shadow-xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                  <Ban className="w-3 h-3 text-rose-600" />
                  Session Revoked
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
                  View-only
                </span>
                <span className="font-mono text-slate-500 font-bold">Code: {openSession.sessionCode}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Biometric capture is closed; further student submissions are blocked. All recorded attendance is preserved. {REVOKED_SESSION_VIEW_ONLY_NOTE}
              </p>
            </div>
          )}

          {/* 3. Summary Count Cards (Straightforward counts) */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-xs">
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mr-2">
              Class Roll Call ({filtered.length} students)
            </span>
            <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
              All: {filtered.length}
            </span>
            <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              Present: {present}
            </span>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              Late: {late}
            </span>
            <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300">
              Absent: {absent}
            </span>
            <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:text-sky-300">
              Excused: {excused}
            </span>
            <span className="ml-auto text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {filtered.length ? Math.round((attended / filtered.length) * 100) : 0}% attended
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Enrolled</span>
              <span className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">{filtered.length}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Recorded</span>
              <span className="text-xl font-extrabold font-heading text-slate-700 dark:text-slate-300">{recorded}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">Present</span>
              <span className="text-xl font-extrabold font-heading text-emerald-600 dark:text-emerald-300">{present}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">Late</span>
              <span className="text-xl font-extrabold font-heading text-amber-600 dark:text-amber-300">{late}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">Absent</span>
              <span className="text-xl font-extrabold font-heading text-rose-600 dark:text-rose-300">{absent}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 shadow-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 block">Excused</span>
              <span className="text-xl font-extrabold font-heading text-sky-600 dark:text-sky-300">{excused}</span>
            </div>
          </div>

          {/* 4. Main Worksheet Register */}
          {allSessionsHidden || !sessionId ? (
            <Card className="p-6 text-center">
              <p role="status" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {allSessionsHidden ? revokedHiddenText(revokedSessionCount) : 'Choose a session to manage its attendance.'}
              </p>
            </Card>
          ) : (
          <Card className="p-0 overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="max-h-[560px] overflow-y-auto overflow-x-auto">
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
                  {loading || sessionLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        <RefreshCw className="w-6 h-6 mx-auto mb-2 text-blue-500 animate-spin" />
                        <span>Loading persisted attendance…</span>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        No attendance records match this filter.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((record) => (
                      <tr
                        key={record.id || `${record.studentId}-${record.attendanceSessionId}`}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Column 1: STUDENT DETAILS */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
                          <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs sm:text-sm">
                            {record.studentName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {record.studentNumber} • Year {record.yearLevel || 1}
                          </span>
                        </td>

                        {/* Column 2: CHECK-IN TIME */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm">
                            <Clock className="w-4 h-4 text-slate-400 stroke-[2.2]" />
                            <span>{formatCheckInTime(record.timeRecorded)}</span>
                          </div>
                        </td>

                        {/* Column 3: VERIFICATION METHOD */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-blue-200/80 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                            <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                            <span>{attendanceMethodLabel(record.verificationMethod, record.overrideReason)}</span>
                          </span>
                        </td>

                        {/* Column 4: ATTENDANCE STATUS */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6" data-testid="attendance-status">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              record.status === 'present'
                                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : record.status === 'late'
                                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                : record.status === 'absent'
                                ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                : record.status === 'excused'
                                ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <span className="text-sm leading-none">•</span>
                            <span className="capitalize">{record.status && record.status !== 'not_recorded' ? record.status : 'Not recorded'}</span>
                          </span>
                        </td>

                        {/* Column 5: ACTIONS */}
                        <td className="py-3 px-4 sm:py-4 sm:px-6 text-right">
                          {revokedSessionOpen ? (
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">View-only</span>
                          ) : record.excusedApprovedByFaculty ? (
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Approved by Faculty</span>
                          ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenOverride(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                            <span>Override</span>
                          </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. Dedicated Session Management Modal (Current Session & Upcoming)         */}
      {/* ========================================================================= */}
      {isSessionModalOpen && (
        <Modal
          isOpen={isSessionModalOpen}
          onClose={() => setIsSessionModalOpen(false)}
          title={`Attendance Sessions — ${className || 'Class Section'}`}
        >
          <div className="space-y-4 text-xs">
            {/* Modal Tabs Header with Secretary Blue Accent */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setSessionModalTab('current')}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  sessionModalTab === 'current'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800/60 shadow-xs'
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
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800/60 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>Upcoming Sessions</span>
                {upcomingSessions.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      sessionModalTab === 'upcoming'
                        ? 'bg-blue-200/80 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                    }`}
                  >
                    {upcomingSessions.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: CURRENT SESSION */}
            {sessionModalTab === 'current' && (
              <div className="space-y-4">
                {liveCurrentSession ? (
                  <div className="space-y-3.5">
                    {/* Session Overview Card */}
                    <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-blue-700 dark:text-blue-300">
                            {liveCurrentSession.sessionCode}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {liveCurrentSession.status}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {liveCurrentSession.sessionDate || liveCurrentSession.date}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 text-slate-700 dark:text-slate-300">
                        {liveCurrentSession.subjectCode && (
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Subject: </span>
                            <span className="font-bold">{liveCurrentSession.subjectCode}</span>
                          </div>
                        )}
                        {liveCurrentSession.room && (
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Room: </span>
                            <span className="font-bold">{liveCurrentSession.room}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-500 dark:text-slate-400">Time window: </span>
                          <span>
                            {liveCurrentSession.openingTime ? formatSessionTime(liveCurrentSession.openingTime) : '—'} – {liveCurrentSession.classEndTime ? formatSessionTime(liveCurrentSession.classEndTime) : '—'}
                          </span>
                        </div>
                        {liveCurrentSession.presentCutoff && (
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Present cutoff: </span>
                            <span>{formatSessionTime(liveCurrentSession.presentCutoff)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {liveCurrentSession.biometricRequired !== false ? 'Face Biometric Required' : 'Biometric Optional'}
                        </span>
                        {liveCurrentSession.geofenceEnabled && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Geofence: {liveCurrentSession.geofenceRadiusMeters ?? 100}m
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Session Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setSessionId(liveCurrentSession.sessionId);
                          setDate(liveCurrentSession.sessionDate || liveCurrentSession.date || '');
                          setViewMode('worksheet');
                          setIsSessionModalOpen(false);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                      >
                        View Roll Call for this Session
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSessionTargetToEnd(liveCurrentSession);
                            setIsEndModalOpen(true);
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                        >
                          End Session
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSessionTargetToRevoke(liveCurrentSession);
                            setRevokeReason('');
                            setRevokeError(null);
                            setIsRevokeModalOpen(true);
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 transition-all cursor-pointer"
                        >
                          Revoke Session
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 space-y-2">
                    <Clock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      No active attendance session is running right now.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      When a scheduled session arrives at its opening time, it will automatically appear here.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => { setIsSessionModalOpen(false); void openStartSession(); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-600/20 hover:bg-blue-700 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Start Session Now</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: UPCOMING SESSIONS */}
            {sessionModalTab === 'upcoming' && (
              <div className="space-y-3">
                {upcomingSessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 space-y-2">
                    <Calendar className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      No upcoming sessions scheduled.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      You can schedule future sessions in the Start Attendance Session screen.
                    </p>
                  </div>
                ) : (
                  upcomingSessions.map((s) => {
                    const sDate = s.sessionDate || s.date;
                    const startMs = parseSessionTimeMs(sDate, s.openingTime);
                    const countdown = startMs !== null ? formatStartsIn(startMs, currentTimeMs, sDate, s.openingTime) : 'Upcoming';

                    return (
                      <div
                        key={s.sessionId}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-100">{s.subjectCode || 'Class Session'}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              {countdown}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">({s.sessionCode})</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                            <span>Date: {sDate}</span>
                            <span>Time: {formatSessionTime(s.openingTime)} – {formatSessionTime(s.classEndTime)}</span>
                            {s.room && <span>Room: {s.room}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSessionId(s.sessionId);
                              setDate(sDate);
                              setViewMode('worksheet');
                              setIsSessionModalOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSessionTargetToRevoke(s);
                              setRevokeReason('');
                              setRevokeError(null);
                              setIsRevokeModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* 6. End Session Confirmation Modal */}
      {isEndModalOpen && sessionTargetToEnd && (
        <Modal
          isOpen={isEndModalOpen}
          onClose={() => {
            if (!submittingEnd) {
              setIsEndModalOpen(false);
              setSessionTargetToEnd(null);
              setEndError(null);
            }
          }}
          title="End Attendance Session"
        >
          <div className="space-y-4 text-xs">
            {endError && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{endError}</span>
              </div>
            )}

            <p className="text-slate-600 dark:text-slate-300">
              Are you sure you want to end active attendance session <strong className="font-mono">{sessionTargetToEnd.sessionCode}</strong>?
            </p>
            <p className="text-slate-500 text-[11px]">
              Ending this session will finalize student check-ins and unrecorded students can be resolved as absent.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsEndModalOpen(false);
                  setSessionTargetToEnd(null);
                  setEndError(null);
                }}
                disabled={submittingEnd}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEndSession()}
                disabled={submittingEnd}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md"
              >
                {submittingEnd && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm End Session</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 7. Revoke Session Modal */}
      {isRevokeModalOpen && sessionTargetToRevoke && (
        <Modal
          isOpen={isRevokeModalOpen}
          onClose={() => {
            if (!submittingRevoke) {
              setIsRevokeModalOpen(false);
              setSessionTargetToRevoke(null);
              setRevokeReason('');
              setRevokeError(null);
            }
          }}
          title="Revoke Attendance Session"
        >
          <form onSubmit={(e) => void handleRevokeSession(e)} className="space-y-4 text-xs">
            {revokeError && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{revokeError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-1.5 text-rose-800 dark:text-rose-300">
              <p className="font-bold">Important Session Revocation Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Revoking immediately closes capture and blocks student check-ins.</li>
                <li><strong>All attendance already recorded is strictly preserved.</strong></li>
                <li>A revoked session does not count against attendance grades or absence counts.</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="font-semibold">Session Code:</span>
                <span className="font-mono font-bold">{sessionTargetToRevoke.sessionCode}</span>
              </div>
              {sessionTargetToRevoke.room && (
                <div className="flex justify-between">
                  <span className="font-semibold">Room:</span>
                  <span>{sessionTargetToRevoke.room}</span>
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
                placeholder="e.g. Schedule cancellation, room change, or incorrect session parameters..."
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
                disabled={submittingRevoke}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingRevoke}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingRevoke && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <Ban className="w-3.5 h-3.5" />
                <span>Confirm Revoke Session</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 8. Manual Override Modal */}
      {selectedRecord && (
        <Modal
          isOpen={Boolean(selectedRecord)}
          onClose={() => {
            if (!submitting) {
              setSelectedRecord(null);
              setFeedback(null);
            }
          }}
          title="Manual Attendance Override"
        >
          <div className="space-y-5">
            {/* Student info header */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {selectedRecord.studentName}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedRecord.studentNumber} · {selectedRecord.subjectCode} · {selectedRecord.date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current:</span>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold capitalize ${statusClass[selectedRecord.status] || 'bg-slate-100 text-slate-600'}`}>
                    {selectedRecord.status || 'Not recorded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Target Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { key: 'present', label: 'Present' },
                    { key: 'late', label: 'Late' },
                    { key: 'absent', label: 'Absent' },
                    { key: 'excused', label: 'Request Excused' },
                  ] as const
                ).map((opt) => {
                  const isSelected = overrideStatus === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setOverrideStatus(opt.key)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold transition-all cursor-pointer ${
                        isSelected
                          ? opt.key === 'present'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : opt.key === 'late'
                            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                            : opt.key === 'absent'
                            ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                            : 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {overrideStatus === 'excused' && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                <p className="font-semibold">Excused needs Faculty approval</p>
                <p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                  Submitting will create an excused absence request for the assigned faculty to review.
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Required Correction Reason
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the reason for this attendance override (e.g., Medical certificate verified, technical camera delay, authorized official business)..."
                rows={3}
                maxLength={overrideStatus === 'excused' ? 500 : 240}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:bg-slate-800"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1 text-right">
                {reason.length}/{overrideStatus === 'excused' ? 500 : 240}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedRecord(null);
                  setFeedback(null);
                }}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveOverride()}
                disabled={submitting || reason.trim().length < 8 || overrideStatus === selectedRecord.status}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Saving…' : overrideStatus === 'excused' ? 'Send request' : 'Confirm override'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <StartSessionModal
        isOpen={isStartOpen}
        onClose={() => setIsStartOpen(false)}
        accent="blue"
        summary={(() => { const sec = startSections.find(s => s.classId === startCsId); return sec ? [sec.courseCode, sec.className].filter(Boolean).join(' · ') : 'Class section'; })()}
        precheck={() => (parseInt(startCsId, 10) > 0 ? null : 'No assigned class section found for your Secretary account.')}
        onSubmit={handleStartSession}
        sections={startSections.map(sec => ({ id: sec.classId, name: sec.className }))}
        selectedSectionId={startCsId}
        onSelectSection={id => void selectStartSection(id)}
        initialRoom={startSections.find(sec => sec.classId === startCsId)?.classroomName ?? ''}
        initialLocation={startLocation}
        note={otherLiveName ? <p className="text-xs text-slate-500 dark:text-slate-500">{otherLiveName} has a live session.</p> : null}
      />
    </div>
  );
};
