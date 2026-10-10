import React, { useState, useEffect, useRef } from 'react';
import { formatSessionDate } from '../../utils/sessionDate';
import { SecretarySessionForm } from './SecretarySessionForm';
import { Modal } from '../../components/Modal';
import { 
  Square, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  UserCheck,
  Loader2,
  X,
  Ban,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { DEVELOPMENT_LOCATION_FIXTURES } from '../../services/developmentProviders';
import {
  getSecretaryActiveAttendanceSessionApi,
  getSecretaryDashboardKpisApi,
  getSecretaryAttendanceApi,
  startSecretaryAttendanceSessionApi,
  updateSecretaryAttendanceSessionApi,
  endSecretaryAttendanceSessionApi,
  revokeSecretaryAttendanceSessionApi,
  type SecretaryAttendanceSession,
  type StartSecretaryAttendanceSessionPayload,
} from '../../services/apiClient';

const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

type SessionItem = NonNullable<Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['sessions']>[number];
export const StartSession: React.FC<{ embedded?: boolean; onOpenRollCall?: (sessionId: string) => void }> = ({ embedded = false, onOpenRollCall }) => {
  const config = useRuntimeConfig();
  const simulationEnabled = config.providers.location.active === 'development-mock' && config.features.browser_attendance_prototype;

  // Authoritative active session state from backend
  const [activeSession, setActiveSession] = useState<SecretaryAttendanceSession | null>(null);
  const [assignedClass, setAssignedClass] = useState<{
    classId: string;
    className: string;
    classroomName: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  // Form inputs for starting a new session with distinct timing cutoffs in Asia/Manila
  const [sessionDate, setSessionDate] = useState(() => manilaToday());
  const [queuedSessions, setQueuedSessions] = useState<NonNullable<Awaited<ReturnType<typeof getSecretaryAttendanceApi>>['sessions']>>([]);
  const [allSessions, setAllSessions] = useState<SessionItem[]>([]);
  const [filterDate, setFilterDate] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [editingSession, setEditingSession] = useState<SessionItem | null>(null);
  const [showConfiguration, setShowConfiguration] = useState(!embedded);
  const [queuedRevokeId, setQueuedRevokeId] = useState<string | null>(null);
  const [customRoom, setCustomRoom] = useState('');
  const [openingTimeStr, setOpeningTimeStr] = useState('08:00');
  const [presentCutoffStr, setPresentCutoffStr] = useState('08:30');
  const [lateCutoffStr, setLateCutoffStr] = useState('12:00');
  const [classEndTimeStr, setClassEndTimeStr] = useState('13:00');
  const [requireFace, setRequireFace] = useState(true);
  const [requireGeo, setRequireGeo] = useState(true);
  // Same default as the server and the Faculty form (100 m).
  const [geofenceRadius, setGeofenceRadius] = useState(100);

  // Secretary GPS state (kept as prototype location fixture)
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; address: string } | null>(simulationEnabled ? {
    lat: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436,
    lng: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438,
    address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)',
  } : null);
  const [isLocating, setIsLocating] = useState(false);
  const [showGpsMap, setShowGpsMap] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [liveAttendanceRecords, setLiveAttendanceRecords] = useState<Array<{ id: string; status: string; date: string; attendanceSessionId?: string | null }>>([]);

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'warning';
    message: string;
  } | null>(null);

  // Elapsed time tracker for active session
  const [elapsedText, setElapsedText] = useState('00:00:00');
  const sessionReadGeneration = useRef(0);
  const sessionMutationPending = useRef(false);

  const computeDurationMinutes = (start: string, end: string): number => {
    if (!start || !end) return 120;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startTotalMins = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);
    let endTotalMins = (isNaN(endH) ? 12 : endH) * 60 + (isNaN(endM) ? 0 : endM);
    if (endTotalMins <= startTotalMins) {
      endTotalMins += 24 * 60;
    }
    return endTotalMins - startTotalMins;
  };

  const dates = Array.from(new Set(allSessions.map(session => session.date))).sort().reverse();
  const subjects = Array.from(new Set(allSessions.map(session => session.subjectCode).filter(Boolean))).sort();
  const matchesSessionFilters = (session: SessionItem) => {
    if (filterDate && session.date !== filterDate) return false;
    if (filterSubject !== 'all' && session.subjectCode !== filterSubject) return false;
    const needle = filterQuery.trim().toLocaleLowerCase();
    return !needle || [session.subjectCode, session.className, session.sessionCode, session.room || ''].join(' ').toLocaleLowerCase().includes(needle);
  };
  const filteredUpcoming = queuedSessions.filter(matchesSessionFilters);
  const pastSessions = allSessions.filter(session => session.status === 'ended' || session.status === 'revoked');
  const filteredPast = pastSessions.filter(matchesSessionFilters);

  const calculatedMinutes = computeDurationMinutes(openingTimeStr, lateCutoffStr);
  const calculatedHours = Math.floor(calculatedMinutes / 60);
  const calculatedRemainingMins = calculatedMinutes % 60;
  const formattedDurationLabel = `${calculatedHours > 0 ? `${calculatedHours} hr${calculatedHours > 1 ? 's' : ''}` : ''} ${calculatedRemainingMins > 0 ? `${calculatedRemainingMins} min${calculatedRemainingMins > 1 ? 's' : ''}` : ''} (${calculatedMinutes} mins total)`.trim();

  // Load authoritative session and assignment from backend
  const loadInitialData = async () => {
    const generation = ++sessionReadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const [activeResult, kpisResult, attResult] = await Promise.all([
        getSecretaryActiveAttendanceSessionApi(),
        getSecretaryDashboardKpisApi(),
        getSecretaryAttendanceApi().catch(() => ({ records: [], sessions: [] })),
      ]);

      if (generation !== sessionReadGeneration.current) return;
      if (kpisResult?.assignedClass) {
        setAssignedClass(kpisResult.assignedClass);
        if (kpisResult.assignedClass.classroomName && !customRoom) {
          setCustomRoom(kpisResult.assignedClass.classroomName);
        }
      }

      if (activeResult.activeSession?.status === 'active') {
        const attendance = await getSecretaryAttendanceApi({ sessionId: activeResult.activeSession.sessionId });
        if (generation !== sessionReadGeneration.current) return;
        setLiveAttendanceRecords(attendance.records ?? []);
      } else setLiveAttendanceRecords([]);
      setAllSessions(attResult.sessions ?? []);
      setQueuedSessions((attResult.sessions ?? []).filter(session => session.status === 'scheduled'));

      if (activeResult?.activeSession && (activeResult.activeSession.status === 'active' || activeResult.activeSession.status === 'revoked')) {
        setActiveSession(activeResult.activeSession);
      } else {
        setActiveSession(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to resolve attendance session status.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (sessionMutationPending.current) return;
      const generation = ++sessionReadGeneration.current;
      void Promise.all([getSecretaryActiveAttendanceSessionApi(), getSecretaryAttendanceApi()]).then(async ([active, attendance]) => {
        const records = active.activeSession?.status === 'active' ? await getSecretaryAttendanceApi({ sessionId: active.activeSession.sessionId }) : { records: [] };
        if (generation !== sessionReadGeneration.current) return;
        setLiveAttendanceRecords(records.records ?? []);
        setActiveSession(active.activeSession);
        setAllSessions(attendance.sessions ?? []);
        setQueuedSessions((attendance.sessions ?? []).filter(session => session.status === 'scheduled'));
      }).catch(() => { /* Keep the last successful server state. */ });
    }, 30000);
    return () => { clearInterval(timer); ++sessionReadGeneration.current; };
  }, []);

  // Never retain the development fixture when the real location provider is active.
  useEffect(() => {
    if (simulationEnabled) {
      setGpsLocation((current) => current ?? {
        lat: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436,
        lng: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438,
        address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)',
      });
    } else {
      setGpsLocation(null);
    }
  }, [simulationEnabled]);

  // Update elapsed time every second while an active session exists
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') {
      setElapsedText('00:00:00');
      return;
    }

    const updateElapsed = () => {
      const startMs = new Date(activeSession.startedAt).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));

      const hrs = Math.floor(diffSec / 3600).toString().padStart(2, '0');
      const mins = Math.floor((diffSec % 3600) / 60).toString().padStart(2, '0');
      const secs = (diffSec % 60).toString().padStart(2, '0');

      setElapsedText(`${hrs}:${mins}:${secs}`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handleAcquireGps = () => {
    setIsLocating(true);
    setGpsError(null);

    if (simulationEnabled) {
      window.setTimeout(() => {
        setGpsLocation({
          lat: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436,
          lng: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438,
          address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)',
        });
        setIsLocating(false);
      }, 50);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = Number(position.coords.latitude.toFixed(6));
          const lng = Number(position.coords.longitude.toFixed(6));
          const accuracy = Math.round(position.coords.accuracy);
          setGpsLocation({
            lat,
            lng,
            address: `Device Coordinates Acquired (${lat}°, ${lng}°) ±${accuracy}m`,
          });
          setIsLocating(false);
        },
        (err) => {
          setGpsError(`Geolocation error: ${err.message}. Please allow location access in your browser.`);
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setGpsError('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  };

  const openCreate = () => {
    setEditingSession(null); setNotification(null); setGpsError(null);
    setSessionDate(manilaToday()); setCustomRoom(assignedClass?.classroomName || '');
    setOpeningTimeStr('08:00'); setPresentCutoffStr('08:30'); setLateCutoffStr('12:00'); setClassEndTimeStr('13:00');
    setRequireFace(true); setRequireGeo(true); setGeofenceRadius(100);
    setGpsLocation(simulationEnabled ? { lat: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436, lng: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438, address: 'Development room location' } : null);
    setShowConfiguration(true);
  };
  const openEdit = (session: SessionItem) => {
    setEditingSession(session); setNotification(null); setGpsError(null);
    setSessionDate(session.sessionDate || session.date); setCustomRoom(session.room || '');
    setOpeningTimeStr(session.openingTime || '08:00'); setPresentCutoffStr(session.presentCutoff || '08:30');
    setLateCutoffStr(session.lateCutoff || '12:00'); setClassEndTimeStr(session.classEndTime || '13:00');
    setRequireFace(session.biometricRequired ?? true); setRequireGeo(session.geofenceEnabled ?? true);
    setGeofenceRadius(session.geofenceRadiusMeters ?? 100);
    setGpsLocation(session.geofenceLatitude != null && session.geofenceLongitude != null ? { lat: session.geofenceLatitude, lng: session.geofenceLongitude, address: 'Saved session location' } : null);
    setShowConfiguration(true);
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assignedClass?.classId || parseInt(assignedClass.classId, 10) <= 0) {
      setNotification({
        type: 'warning',
        message: 'No assigned class section found for your Secretary account.',
      });
      return;
    }

    if (requireGeo && !gpsLocation) {
      setNotification({
        type: 'warning',
        message: 'Geofencing is enabled, but GPS coordinates have not been acquired. Please acquire device location before starting the session.',
      });
      return;
    }

    if (openingTimeStr >= presentCutoffStr) {
      setNotification({
        type: 'warning',
        message: 'Invalid timing: Opening time must be strictly before Present cutoff (Asia/Manila).',
      });
      return;
    }

    if (presentCutoffStr >= lateCutoffStr) {
      setNotification({
        type: 'warning',
        message: 'Invalid timing: Present cutoff must be strictly before Late cutoff (Asia/Manila).',
      });
      return;
    }

    if (!classEndTimeStr || classEndTimeStr < lateCutoffStr) {
      setNotification({
        type: 'warning',
        message: 'Invalid timing: Class end time must be at or after the Late cutoff (Asia/Manila).',
      });
      return;
    }

    if (!sessionDate || sessionDate < manilaToday()) { setNotification({ type: 'warning', message: 'Choose today or a future date (Asia/Manila).' }); return; }
    setSubmitting(true);
    sessionMutationPending.current = true;
    ++sessionReadGeneration.current;
    setNotification(null);

    try {
      const payload: StartSecretaryAttendanceSessionPayload = {
        csId: parseInt(assignedClass.classId, 10),
        sessionDate,
        room: customRoom.trim() || undefined,
        biometricRequired: requireFace,
        geofenceEnabled: requireGeo,
        geofenceRadiusMeters: requireGeo ? geofenceRadius : undefined,
        openingTime: openingTimeStr,
        presentCutoff: presentCutoffStr,
        lateCutoff: lateCutoffStr,
        classEndTime: classEndTimeStr,
        ...(requireGeo && gpsLocation
          ? {
              geofenceLatitude: gpsLocation.lat,
              geofenceLongitude: gpsLocation.lng,
              latitude: gpsLocation.lat,
              longitude: gpsLocation.lng,
            }
          : {}),
      };

      const { csId, latitude: _latitude, longitude: _longitude, ...settings } = payload;
      const res = editingSession
        ? await updateSecretaryAttendanceSessionApi({ ...settings, sessionId: editingSession.sessionId })
        : await startSecretaryAttendanceSessionApi({ ...payload, csId });
      if (embedded) setShowConfiguration(false);
      if (res.session.status === 'active') {
        setActiveSession(res.session);
        const current = await getSecretaryAttendanceApi({ sessionId: res.session.sessionId });
        setLiveAttendanceRecords(current.records ?? []);
      }
      const attendance = await getSecretaryAttendanceApi();
      setAllSessions(attendance.sessions ?? []);
      setQueuedSessions((attendance.sessions ?? []).filter(session => session.status === 'scheduled'));
      setNotification({
        type: 'success',
        message: editingSession ? 'Attendance session updated.' : res.session.status === 'scheduled' ? `Session scheduled for ${sessionDate} at ${openingTimeStr} (Asia/Manila). Session code: ${res.session.sessionCode}` : `Class session for ${res.session.courseCode || res.session.className} is now ACTIVE! Session code: ${res.session.sessionCode}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start session.';
      setNotification({
        type: 'warning',
        message: msg,
      });
    } finally {
      setSubmitting(false);
      sessionMutationPending.current = false;
      ++sessionReadGeneration.current;
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    setEnding(true);
    sessionMutationPending.current = true;
    ++sessionReadGeneration.current;

    try {
      const res = await endSecretaryAttendanceSessionApi({ sessionId: activeSession.sessionId });
      setActiveSession(null);
      setShowEndModal(false);
      const attendance = await getSecretaryAttendanceApi();
      setAllSessions(attendance.sessions ?? []);
      setQueuedSessions((attendance.sessions ?? []).filter(session => session.status === 'scheduled'));
      setNotification({
        type: 'info',
        message: `Class session for ${res.session.courseCode || res.session.className} has been successfully ENDED. Attendance register closed.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to end session.';
      setNotification({
        type: 'warning',
        message: msg,
      });
    } finally {
      setEnding(false);
      sessionMutationPending.current = false;
      ++sessionReadGeneration.current;
    }
  };

  const handleRevokeSession = async () => {
    if (!activeSession && !queuedRevokeId) return;
    setRevoking(true);
    sessionMutationPending.current = true;
    ++sessionReadGeneration.current;

    try {
      const res = await revokeSecretaryAttendanceSessionApi({
        sessionId: queuedRevokeId ?? activeSession!.sessionId,
        reason: revokeReason.trim() || null,
      });
      if (!queuedRevokeId) setActiveSession(res.session);
      const attendance = await getSecretaryAttendanceApi();
      setAllSessions(attendance.sessions ?? []);
      setQueuedSessions((attendance.sessions ?? []).filter(session => session.status === 'scheduled'));
      setQueuedRevokeId(null);
      setShowRevokeModal(false);
      setRevokeReason('');
      setNotification({
        type: 'info',
        message: `Class session for ${res.session.courseCode || res.session.className} has been REVOKED. Attendance already recorded is preserved; further submissions are blocked.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke session.';
      setNotification({
        type: 'warning',
        message: msg,
      });
    } finally {
      setRevoking(false);
      sessionMutationPending.current = false;
      ++sessionReadGeneration.current;
    }
  };

  const formatStartedTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
              Start Class Session & Attendance Control
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Acquire room GPS location, initialize live dentistry lab and clinical sessions, configure biometric/geofencing parameters, and open real-time student check-in access.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs text-slate-500 font-semibold">Resolving active attendance session status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
              Start Class Session & Attendance Control
            </h1>
          </div>
        </div>
        <div className="p-6 rounded-3xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <span>Unable to load attendance session</span>
          </div>
          <p className="text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadInitialData()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // Live session student metrics (preserves student attendance counts)
  const sessionRecords = activeSession 
    ? liveAttendanceRecords.filter(r => r.attendanceSessionId === activeSession.sessionId
      || (r.attendanceSessionId == null && r.date === activeSession.sessionDate))
    : [];
  const checkedInCount = sessionRecords.filter(r => r.status === 'present' || r.status === 'late').length;
  const totalEnrolled = sessionRecords.length;
  const attendanceRatePct = totalEnrolled > 0 ? Math.round((checkedInCount / totalEnrolled) * 100) : null;

  const configurationForm = (
    <SecretarySessionForm
      assignedClass={assignedClass}
      sessionDate={sessionDate}
      setSessionDate={setSessionDate}
      customRoom={customRoom}
      setCustomRoom={setCustomRoom}
      openingTimeStr={openingTimeStr}
      setOpeningTimeStr={setOpeningTimeStr}
      presentCutoffStr={presentCutoffStr}
      setPresentCutoffStr={setPresentCutoffStr}
      lateCutoffStr={lateCutoffStr}
      setLateCutoffStr={setLateCutoffStr}
      classEndTimeStr={classEndTimeStr}
      setClassEndTimeStr={setClassEndTimeStr}
      requireFace={requireFace}
      setRequireFace={setRequireFace}
      requireGeo={requireGeo}
      setRequireGeo={setRequireGeo}
      geofenceRadius={geofenceRadius}
      setGeofenceRadius={setGeofenceRadius}
      gpsLocation={gpsLocation}
      setGpsLocation={setGpsLocation}
      isLocating={isLocating}
      showGpsMap={showGpsMap}
      setShowGpsMap={setShowGpsMap}
      gpsError={gpsError}
      formattedDurationLabel={formattedDurationLabel}
      submitting={submitting}
      handleAcquireGps={handleAcquireGps}
      handleStartSession={handleStartSession}
      editing={Boolean(editingSession)}
      error={notification?.type === 'warning' ? notification.message : undefined} />
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">

      {/* 1. Top Page Header */}
      {!embedded && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Start Class Session & Attendance Control
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Acquire room GPS location, initialize live dentistry lab and clinical sessions, configure biometric/geofencing parameters, and open real-time student check-in access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeSession ? (
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              LIVE SESSION ACTIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              NO ACTIVE SESSION
            </span>
          )}
        </div>
      </div>

      }
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Sessions</h2><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void loadInitialData()} disabled={submitting || ending || revoking} aria-label="Refresh attendance" className="rounded-xl bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className="h-4 w-4" /></button><button type="button" disabled={submitting || ending || revoking} onClick={openCreate} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">New attendance session</button></div></div>

      {/* Alert Notification */}
      {notification && !(showConfiguration && notification.type === 'warning') && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold animate-fade-in ${
          notification.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
            : notification.type === 'info'
            ? 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20'
            : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      <h2 className="text-sm font-bold">Live session</h2>
      {embedded && activeSession?.status === 'active' && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-300">LIVE SESSION ACTIVE</p>}
      {embedded && !activeSession && <Card className="p-5 text-xs text-slate-400">NO ACTIVE SESSION</Card>}
      {/* 2. Sleek Active / Revoked Session Status Card */}
      {activeSession ? (
        activeSession.status === 'revoked' ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-rose-500/40 dark:border-rose-500/50 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 text-[10px] font-extrabold uppercase tracking-wider">
                  <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  Attendance Session Revoked
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
                  {activeSession.courseCode} — {activeSession.className}
                </h2>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                  Biometric capture is closed and further attendance submissions are blocked.
                </p>
                {activeSession.revocationReason && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-rose-50/70 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-200/80 dark:border-rose-900">
                    <span className="font-bold">Revocation Reason:</span> {activeSession.revocationReason}
                  </p>
                )}
                {activeSession.revokedAt && (
                  <p className="text-[11px] text-slate-400">
                    Revoked at: {formatStartedTime(activeSession.revokedAt)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSession(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                >
                  Dismiss & Configure New Session
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              ✓ <strong>Already-recorded attendance preserved:</strong> Any student attendance recorded prior to revocation remains intact in the attendance register. Unresolved students are not automatically marked Absent.
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-emerald-500/30 dark:border-emerald-500/40 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Active Attendance Register Open
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
                  {activeSession.courseCode} — {activeSession.className}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {activeSession.room || 'Assigned Room'}
                  </span>
                  <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                    <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Started at {formatStartedTime(activeSession.startedAt)} ({elapsedText} elapsed)
                  </span>
                  {activeSession.openingTime && activeSession.presentCutoff && (
                    <span className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl font-mono text-[11px]">
                      {activeSession.openingTime} (Open) → {activeSession.presentCutoff} (Present) → {activeSession.lateCutoff || 'Late'} (Late){activeSession.classEndTime ? ` → ${activeSession.classEndTime} (Class ends)` : ''} Asia/Manila
                    </span>
                  )}
                  {activeSession.instructorName && (
                    <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                      <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {activeSession.instructorName}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold">
                    Code: {activeSession.sessionCode}
                  </span>
                </div>
              </div>

              {/* End / Revoke Session Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
                <div className="text-center sm:text-right bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Check-In Rate</span>
                  <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {totalEnrolled > 0 ? `${checkedInCount} / ${totalEnrolled} (${attendanceRatePct}%)` : `${checkedInCount} Checked In`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEndModal(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>End Session</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setQueuedRevokeId(null); setRevokeReason(''); setShowRevokeModal(true); }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Revoke Session</span>
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}

      {/* End Session Confirmation Modal */}
      {showEndModal && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-base">
                <Square className="w-5 h-5 fill-rose-600 dark:fill-rose-400" />
                <span>End Attendance Session</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={ending}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to end the active attendance session for <strong className="text-slate-800 dark:text-slate-100">{activeSession.courseCode || activeSession.className}</strong>? Once ended, students will no longer be able to record attendance.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={ending}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndSession}
                disabled={ending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {ending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Ending...</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Confirm End Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Session Confirmation Modal */}
      {showRevokeModal && (activeSession || queuedRevokeId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-base">
                <Ban className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <span>Revoke Attendance Session</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRevokeModal(false);
                  setQueuedRevokeId(null);
                  setRevokeReason('');
                }}
                disabled={revoking}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
              <p className="font-bold">Important Session Revocation Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Revoking immediately closes biometric capture and blocks further student attendance submissions.</li>
                <li><strong>All attendance already recorded is strictly preserved.</strong></li>
                <li>Unresolved students are not automatically marked Absent.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Revocation Reason (Optional, max 500 characters)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. Schedule adjustment, instructor requested cancellation, or incorrect session parameters..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <span className="text-[10px] text-slate-400 text-right block">
                {revokeReason.length}/500
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowRevokeModal(false);
                  setQueuedRevokeId(null);
                  setRevokeReason('');
                }}
                disabled={revoking}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeSession}
                disabled={revoking}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {revoking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Confirm Revoke Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3" aria-label="Session filters">
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Subject
          <select aria-label="Subject" value={filterSubject} onChange={event => setFilterSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><option value="all">All subjects</option>{subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select>
        </label>
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Date
          <select aria-label="Date" value={filterDate} onChange={event => setFilterDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><option value="">All dates</option>{dates.map(date => <option key={date} value={date}>{formatSessionDate(date)}</option>)}</select>
        </label>
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Search
          <input value={filterQuery} onChange={event => setFilterQuery(event.target.value)} placeholder="Subject, section, session code or room..." className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
        </label>
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-bold">Upcoming</h2><h3 className="text-xs text-slate-400">Scheduled sessions (Asia/Manila)</h3>
        {filteredUpcoming.length === 0 && queuedSessions.length > 0 && <p className="text-xs text-slate-400">No sessions match this filter.</p>}
        {queuedSessions.length === 0 && <p className="text-xs text-slate-400">No upcoming sessions. Create one with New attendance session.</p>}
        {filteredUpcoming.map(session => <div key={session.sessionId} className="flex flex-col justify-between gap-3 text-xs sm:flex-row sm:items-center">
          <span className="min-w-0 break-words">{formatSessionDate(session.date)} · {session.openingTime ?? ''}–{session.classEndTime ?? ''} · {session.subjectCode} · {session.sessionCode}</span>
          <div className="flex flex-wrap gap-2">
            {session.createdByCurrentSecretary === true && <button type="button" disabled={submitting || ending || revoking} onClick={() => openEdit(session)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold dark:border-slate-700">Edit</button>}
            <button type="button" disabled={submitting || ending || revoking} onClick={() => { setQueuedRevokeId(session.sessionId); setRevokeReason(''); setShowRevokeModal(true); }} className="rounded-lg border border-rose-200 px-3 py-2 font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300">Revoke scheduled session</button>
          </div>
        </div>)}
      </Card>
      <Card className="space-y-3 p-5"><h2 className="text-sm font-bold">Past sessions</h2>
        {filteredPast.length === 0 && pastSessions.length > 0 && <p className="text-xs text-slate-400">No sessions match this filter.</p>}
        {pastSessions.length === 0 && <p className="text-xs text-slate-400">No past sessions.</p>}
        {filteredPast.map(session => <div key={session.sessionId} className="flex flex-col justify-between gap-3 text-xs sm:flex-row sm:items-center">
          <span className="min-w-0 break-words">{formatSessionDate(session.date)} · {session.openingTime}–{session.classEndTime} · {session.sessionCode} · {session.status}</span>
          {onOpenRollCall && <button type="button" onClick={() => onOpenRollCall(session.sessionId)} className="rounded-lg bg-slate-100 px-3 py-2 font-bold dark:bg-slate-800">Open roll call</button>}
        </div>)}
      </Card>

      {/* Session setup remains available while another session is open. */}
      {showConfiguration && (
        embedded ? <Modal isOpen={showConfiguration} onClose={() => { if (!submitting) setShowConfiguration(false); }} title={editingSession ? 'Edit attendance session' : 'New attendance session'}>{configurationForm}</Modal> : configurationForm
      )}

    </div>
  );
};
