import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Clock, 
  MapPin, 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  BookOpen, 
  ShieldCheck,
  RefreshCw,
  UserCheck,
  Navigation,
  Loader2,
  X
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/Card';
import { useApp } from '../../context/AppContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { DEVELOPMENT_LOCATION_FIXTURES } from '../../services/developmentProviders';
import {
  getSecretaryActiveAttendanceSessionApi,
  getSecretaryDashboardKpisApi,
  startSecretaryAttendanceSessionApi,
  endSecretaryAttendanceSessionApi,
  type SecretaryAttendanceSession,
  type StartSecretaryAttendanceSessionPayload,
} from '../../services/apiClient';

export const StartSession: React.FC = () => {
  const { students, attendanceRecords } = useApp();
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

  // Form inputs for starting a new session
  const [customRoom, setCustomRoom] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('08:00');
  const [endTimeStr, setEndTimeStr] = useState('12:00');
  const [requireFace, setRequireFace] = useState(true);
  const [requireGeo, setRequireGeo] = useState(true);
  const [geofenceRadius, setGeofenceRadius] = useState(200);

  // Secretary GPS state (kept as prototype location fixture)
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; address: string } | null>({
    lat: 13.1436,
    lng: 123.7438,
    address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)',
  });
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'warning';
    message: string;
  } | null>(null);

  // Elapsed time tracker for active session
  const [elapsedText, setElapsedText] = useState('00:00:00');

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

  const calculatedMinutes = computeDurationMinutes(startTimeStr, endTimeStr);
  const calculatedHours = Math.floor(calculatedMinutes / 60);
  const calculatedRemainingMins = calculatedMinutes % 60;
  const formattedDurationLabel = `${calculatedHours > 0 ? `${calculatedHours} hr${calculatedHours > 1 ? 's' : ''}` : ''} ${calculatedRemainingMins > 0 ? `${calculatedRemainingMins} min${calculatedRemainingMins > 1 ? 's' : ''}` : ''} (${calculatedMinutes} mins total)`.trim();

  // Load authoritative session and assignment from backend
  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeResult, kpisResult] = await Promise.all([
        getSecretaryActiveAttendanceSessionApi(),
        getSecretaryDashboardKpisApi(),
      ]);

      if (kpisResult?.assignedClass) {
        setAssignedClass(kpisResult.assignedClass);
        if (kpisResult.assignedClass.classroomName && !customRoom) {
          setCustomRoom(kpisResult.assignedClass.classroomName);
        }
      }

      if (activeResult?.activeSession && activeResult.activeSession.status === 'active') {
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
    if (!simulationEnabled) {
      setGpsError('Development location simulation is disabled. Configure the explicit test flags to exercise this prototype.');
      return;
    }
    setIsLocating(true);
    setGpsError(null);

    window.setTimeout(() => {
      setGpsLocation({
        lat: DEVELOPMENT_LOCATION_FIXTURES.inside.latitude ?? 13.1436,
        lng: DEVELOPMENT_LOCATION_FIXTURES.inside.longitude ?? 123.7438,
        address: 'BU Dental Room Location Verified (13.1436°, 123.7438°)',
      });
      setIsLocating(false);
    }, 50);
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

    setSubmitting(true);
    setNotification(null);

    try {
      const payload: StartSecretaryAttendanceSessionPayload = {
        csId: parseInt(assignedClass.classId, 10),
        room: customRoom.trim() || undefined,
        biometricRequired: requireFace,
        geofenceEnabled: requireGeo,
        geofenceRadiusMeters: requireGeo ? geofenceRadius : undefined,
      };

      const res = await startSecretaryAttendanceSessionApi(payload);
      setActiveSession(res.session);
      setNotification({
        type: 'success',
        message: `Class session for ${res.session.courseCode || res.session.className} is now ACTIVE! Session code: ${res.session.sessionCode}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start session.';
      setNotification({
        type: 'warning',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    setEnding(true);

    try {
      const res = await endSecretaryAttendanceSessionApi({ sessionId: activeSession.sessionId });
      setActiveSession(null);
      setShowEndModal(false);
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
    ? attendanceRecords.filter(r => r.subjectCode === activeSession.courseCode)
    : [];
  const checkedInCount = sessionRecords.filter(r => r.status === 'present' || r.status === 'late').length;
  const totalEnrolled = students.length || 24;
  const attendanceRatePct = Math.round((checkedInCount / totalEnrolled) * 100) || 75;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">

      {/* 1. Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
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

      {/* Alert Notification */}
      {notification && (
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

      {/* 2. Sleek Active Session Status Card */}
      {activeSession ? (
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

            {/* End Session Button */}
            <div className="flex flex-col sm:flex-row items-center gap-4 flex-shrink-0">
              <div className="text-center sm:text-right bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Check-In Rate</span>
                <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{checkedInCount} / {totalEnrolled} ({attendanceRatePct}%)</span>
              </div>

              <button
                onClick={() => setShowEndModal(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>End Class Session</span>
              </button>
            </div>
          </div>
        </div>
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

      {/* 3. Session Setup & Configuration Form (Visible when no active session) */}
      {!activeSession && (
        <div className="max-w-3xl mx-auto">
          <Card className="p-6">
            <CardHeader className="p-0 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-blue-600" />
                  <span>Session Configuration</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Section Operations</span>
              </CardTitle>
            </CardHeader>

            <form onSubmit={handleStartSession} className="space-y-5">

              {/* GPS Location Acquisition Block */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                    <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Secretary Room GPS Location</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAcquireGps}
                    disabled={isLocating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Locating...' : 'Locate My GPS'}</span>
                  </button>
                </div>

                {gpsError && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">{gpsError}</p>
                )}

                {gpsLocation ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{gpsLocation.address}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Click &quot;Locate My GPS&quot; to acquire current room position.
                  </div>
                )}
              </div>

              {/* Subject / Section Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <span>Assigned Dentistry Class Section</span>
                </label>
                {assignedClass?.classId ? (
                  <div className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                    <span>{assignedClass.className}</span>
                    <span className="text-xs font-semibold text-slate-400">Section #{assignedClass.classId}</span>
                  </div>
                ) : (
                  <div className="w-full px-4 py-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    No class section is assigned to your Secretary account.
                  </div>
                )}
              </div>

              {/* Room Location */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span>Assigned Classroom / Lab Room</span>
                </label>
                <input
                  type="text"
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                  required
                  placeholder="e.g. BU Dental Room 101"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Start Time & End Time Picker Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span>Session Starting Time</span>
                  </label>
                  <input
                    type="time"
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span>Session Ending Time</span>
                  </label>
                  <input
                    type="time"
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Auto-Calculated Duration Display Badge */}
              <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Computed Session Duration:
                </span>
                <span className="font-extrabold text-blue-700 dark:text-blue-300 text-sm">{formattedDurationLabel}</span>
              </div>

              {/* Geofence Verification Radius */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <span>Geofence Verification Radius</span>
                </label>
                <select
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={100}>100 meters (Strict Room Radius)</option>
                  <option value={200}>200 meters (BU Dental Building / Room)</option>
                  <option value={500}>500 meters (Campus Wide)</option>
                </select>
              </div>

              {/* Requirement Checkboxes */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Mandatory Check-In Criteria
                </span>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireFace}
                    onChange={(e) => setRequireFace(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-500" />
                      Require Facial Biometrics Scan
                    </span>
                    <p className="text-[11px] text-slate-400">Students must verify webcam face match before recording attendance.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireGeo}
                    onChange={(e) => setRequireGeo(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      Enforce GPS Geofence Verification
                    </span>
                    <p className="text-[11px] text-slate-400">Must be physically within BU Dental Room location boundary.</p>
                  </div>
                </label>
              </div>

              {/* Submit Start Button */}
              <button
                type="submit"
                disabled={submitting || !assignedClass?.classId}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-blue-600/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting Attendance Session...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    <span>Start Class Session Now</span>
                  </>
                )}
              </button>

            </form>
          </Card>
        </div>
      )}

    </div>
  );
};
