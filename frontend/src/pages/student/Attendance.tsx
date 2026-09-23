import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  MapPin,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  History,
  Clock,
  Building,
  User,
  ArrowRight,
  ShieldCheck,
  Eye,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { StudentUnavailable } from './RealStudentSurfaces';
import {
  getStudentBiometricProfile,
  getStudentActiveAttendanceSessions,
  createBiometricLivenessChallenge,
  submitBiometricAttendance,
} from '../../services/apiClient';
import {
  type StudentBiometricProfile,
  type StudentActiveSession,
  type LivenessChallengeResponse,
  type LivenessAction,
  type BiometricAttendanceResponse,
  isAuthoritativeActiveEnrolled,
} from '../../types';
import { DEVELOPMENT_LOCATION_FIXTURES, developmentBiometricOutcome } from '../../services/developmentProviders';
import {
  describeCameraError,
  listCameraDevices,
  startCameraStream,
  type CameraDevice,
} from '../../utils/camera';

// Mock Geofence center for simulation only
const BU_DENTAL_CLINIC_COORDS = {
  lat: 13.1436,
  lng: 123.7438,
  maxDistanceKm: 0.2,
};

interface ClassSessionInfo {
  code: string;
  name: string;
  room: string;
  schedule: string;
  instructor: string;
  status: 'active' | 'no_session' | 'ended';
  statusMessage: string;
}

const MOCK_CLASS_SESSIONS: Record<string, ClassSessionInfo> = {
  CLIN401: {
    code: 'CLIN401',
    name: 'Restorative Dentistry Lab',
    room: 'BU Dental Clinic — Room 101',
    schedule: '08:00 AM - 12:00 PM (Today)',
    instructor: 'Dr. Roberto Santos, DMD',
    status: 'active',
    statusMessage: 'Session is currently ACTIVE and open for attendance check-in.',
  },
  PROS402: {
    code: 'PROS402',
    name: 'Prosthodontics Clinical Practicum',
    room: 'BU Dental Clinic — Lab Room 204',
    schedule: '01:00 PM - 05:00 PM (Today)',
    instructor: 'Dr. Fernando Cruz, DMD',
    status: 'no_session',
    statusMessage: 'No active session right now. Scheduled for 01:00 PM today.',
  },
  ORAL301: {
    code: 'ORAL301',
    name: 'Oral Surgery Clinic',
    room: 'BU Dental Clinic — Operating Room B',
    schedule: '07:00 AM - 09:00 AM (Today)',
    instructor: 'Dr. Angela Reyes, DMD',
    status: 'ended',
    statusMessage: 'Session ENDED at 09:00 AM. Check-in window is now closed.',
  },
};

function formatAction(action: LivenessAction): { title: string; instruction: string } {
  switch (action) {
    case 'blink':
      return { title: 'Blink Naturally', instruction: 'Blink your eyes naturally looking at the camera.' };
    case 'turn_left':
      return { title: 'Turn Head Left', instruction: 'Slowly turn your head slightly to the left, then return.' };
    case 'turn_right':
      return { title: 'Turn Head Right', instruction: 'Slowly turn your head slightly to the right, then return.' };
    default:
      return { title: 'Look Directly', instruction: 'Look directly into the camera frame.' };
  }
}

export const Attendance: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, addAttendanceRecord } = useApp();
  const runtimeConfig = useRuntimeConfig();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);
  const simulationEnabled = !isAuthoritative
    && user?.authentication_source === 'development_mock'
    && runtimeConfig.providers.identity.development_mock.enabled
    && runtimeConfig.providers.biometrics.active === 'development-mock'
    && runtimeConfig.providers.location.active === 'development-mock'
    && runtimeConfig.features.browser_attendance_prototype;

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentIdNum = user?.student?.student_number || currentStudent?.studentId || '—';

  // --- AUTHORITATIVE STATE ---
  const [initialLoading, setInitialLoading] = useState(isAuthoritative);
  const [profile, setProfile] = useState<StudentBiometricProfile | null>(null);
  const [activeSessions, setActiveSessions] = useState<StudentActiveSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check-in Process State
  const [checkInStage, setCheckInStage] = useState<'idle' | 'location' | 'camera' | 'verifying' | 'result'>('idle');
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [livenessChallenge, setLivenessChallenge] = useState<LivenessChallengeResponse | null>(null);
  const [activeActionIndex, setActiveActionIndex] = useState<0 | 1>(0);
  const [verificationResult, setVerificationResult] = useState<BiometricAttendanceResponse | null>(null);
  const [failureNotice, setFailureNotice] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const selectedCameraIdRef = useRef('');

  // Stop camera helper
  const stopCamera = useCallback(() => {
    cameraAbortRef.current?.abort();
    cameraAbortRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (checkInStage !== 'camera') {
      stopCamera();
    }
  }, [checkInStage, stopCamera]);

  // Release the hardware camera when this screen is backgrounded or closed.
  // Returning to the flow requires a fresh camera start and liveness challenge.
  useEffect(() => {
    const releaseCameraWhenHidden = (): void => {
      if (document.visibilityState === 'hidden' && checkInStage === 'camera') {
        stopCamera();
        setLivenessChallenge(null);
        setCameraLoading(false);
        setCameraError('Camera access was paused because this tab is no longer active. Choose Retry Camera Access when you return.');
      }
    };

    document.addEventListener('visibilitychange', releaseCameraWhenHidden);
    window.addEventListener('pagehide', stopCamera);
    return () => {
      document.removeEventListener('visibilitychange', releaseCameraWhenHidden);
      window.removeEventListener('pagehide', stopCamera);
    };
  }, [checkInStage, stopCamera]);

  // Load Authoritative Sessions and Profile
  const loadAuthoritativeData = useCallback(async () => {
    if (!isAuthoritative) return;
    setInitialLoading(true);
    setAuthError(null);
    try {
      const [profileData, sessionsData] = await Promise.all([
        getStudentBiometricProfile().catch(() => null),
        getStudentActiveAttendanceSessions().catch(() => ({ sessions: [] })),
      ]);
      setProfile(profileData);
      setActiveSessions(sessionsData.sessions);
      if (sessionsData.sessions.length > 0) {
        setSelectedSessionId(sessionsData.sessions[0].id);
      } else {
        setSelectedSessionId(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load attendance session data.';
      setAuthError(msg);
    } finally {
      setInitialLoading(false);
    }
  }, [isAuthoritative]);

  useEffect(() => {
    if (isAuthoritative) {
      void loadAuthoritativeData();
    }
  }, [isAuthoritative, loadAuthoritativeData]);

  // Selected Authoritative Session Object
  const currentSelectedSession = activeSessions.find(s => s.id === selectedSessionId) || activeSessions[0] || null;

  // --- AUTHORITATIVE ATTENDANCE PROCESS ---
  const handleStartAuthoritativeCheckIn = async () => {
    if (!currentSelectedSession) return;
    setFailureNotice(null);
    setAuthError(null);
    setLocationStatus(null);
    setVerificationResult(null);

    const requiresGeofence = Boolean(currentSelectedSession.geofenceRequired ?? currentSelectedSession.geofenceEnabled);

    // 1. Location acquisition if session requires geofencing
    if (requiresGeofence) {
      setCheckInStage('location');
      setLocationStatus('Obtaining temporary GPS coordinates for session geofence check…');

      if (!('geolocation' in navigator)) {
        setFailureNotice('Geolocation is not supported by your browser. Please contact your Class Secretary or Faculty for manual attendance.');
        setCheckInStage('idle');
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });

        setLocationCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationStatus('Temporary location acquired. Proceeding to liveness challenge…');
      } catch {
        setFailureNotice('Location access was denied or timed out. This session requires geofencing. Please enable location or report to your Class Secretary or Course Instructor for manual attendance.');
        setCheckInStage('idle');
        return;
      }
    } else {
      setLocationCoords(null);
    }

    // 2. Render the camera stage. The effect below starts the camera only after
    // the video element exists; starting it in this function races the render.
    setLivenessChallenge(null);
    setCameraError(null);
    setCameraLoading(false);
    setActiveActionIndex(0);
    setCheckInStage('camera');
  };

  const startCameraAndChallenge = useCallback(async (requestedCameraId?: string) => {
    if (!currentSelectedSession) return;
    setCameraLoading(true);
    setCameraError(null);
    setFailureNotice(null);
    stopCamera();
    const abortController = new AbortController();

    try {
      cameraAbortRef.current = abortController;
      const video = videoRef.current;
      if (!video) {
        throw new Error('The camera preview is not ready. Choose Retry Camera Access.');
      }

      const stream = await startCameraStream(
        video,
        requestedCameraId || selectedCameraIdRef.current || undefined,
        abortController.signal,
      );
      if (abortController.signal.aborted || cameraAbortRef.current !== abortController) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const devices = await listCameraDevices();
      setCameraDevices(devices);
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || '';
      if (activeDeviceId && !selectedCameraIdRef.current) {
        selectedCameraIdRef.current = activeDeviceId;
        setSelectedCameraId(activeDeviceId);
      }

      const challenge = await createBiometricLivenessChallenge({
        purpose: 'attendance',
        attendanceSessionId: currentSelectedSession.id,
      });
      if (abortController.signal.aborted || cameraAbortRef.current !== abortController) {
        return;
      }
      setLivenessChallenge(challenge);
    } catch (err) {
      if (cameraAbortRef.current === abortController && !abortController.signal.aborted) {
        stopCamera();
        setCameraError(describeCameraError(err));
        setCameraLoading(false);
      }
    } finally {
      if (cameraAbortRef.current === abortController) {
        setCameraLoading(false);
      }
    }
  }, [currentSelectedSession, stopCamera]);

  useEffect(() => {
    if (
      isAuthoritative
      && checkInStage === 'camera'
      && currentSelectedSession
      && !livenessChallenge
      && !cameraLoading
      && !cameraError
    ) {
      void startCameraAndChallenge();
    }
  }, [cameraError, cameraLoading, checkInStage, currentSelectedSession, isAuthoritative, livenessChallenge, startCameraAndChallenge]);

  // Capture frames from video element
  const captureFrames = async (count: number): Promise<Blob[]> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return [];

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const blobs: Blob[] = [];
    for (let i = 0; i < count; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });
      if (blob) blobs.push(blob);
      await new Promise(r => setTimeout(r, 60));
    }
    return blobs;
  };

  // Submit Biometric Attendance to Server
  const handleSubmitAuthoritativeVerification = async () => {
    if (!currentSelectedSession || !livenessChallenge) return;

    if (livenessChallenge.expiresAt) {
      const expiryMs = new Date(livenessChallenge.expiresAt).getTime();
      if (Number.isFinite(expiryMs) && Date.now() >= expiryMs) {
        setFailureNotice('Liveness challenge has expired. Requesting a fresh challenge…');
        void startCameraAndChallenge();
        return;
      }
    }

    setCheckInStage('verifying');
    setFailureNotice(null);

    try {
      // Capture 5 verification frames
      const frames = await captureFrames(5);
      stopCamera();

      if (frames.length === 0) {
        throw new Error('Could not capture frames from video feed.');
      }

      const formData = new FormData();
      formData.append('attendanceSessionId', String(currentSelectedSession.id));
      formData.append('attendance_session_id', String(currentSelectedSession.id));
      formData.append('challengeId', livenessChallenge.challengeId);
      formData.append('challenge_id', livenessChallenge.challengeId);
      if (livenessChallenge.challengeToken) {
        formData.append('challengeToken', livenessChallenge.challengeToken);
        formData.append('challenge_token', livenessChallenge.challengeToken);
      }

      const idempotencyKey = crypto.randomUUID();
      formData.append('idempotencyKey', idempotencyKey);
      formData.append('idempotency_key', idempotencyKey);

      if (locationCoords) {
        formData.append('latitude', String(locationCoords.latitude));
        formData.append('longitude', String(locationCoords.longitude));
        formData.append('accuracy', String(locationCoords.accuracy));
      }

      frames.forEach((blob, idx) => {
        formData.append('frames[]', blob, `frame_${idx}.jpg`);
      });

      // Submit to backend
      const result = await submitBiometricAttendance(formData);
      setVerificationResult(result);
      setCheckInStage('result');
      // Refresh active sessions list
      void loadAuthoritativeData();
    } catch (err) {
      stopCamera();
      const msg = err instanceof Error ? err.message : 'Biometric verification failed.';
      setFailureNotice(`${msg} Your attendance was not recorded. Please report to your Class Secretary or Course Instructor for authorized manual check-in.`);
      setCheckInStage('idle');
    }
  };

  // --- MOCK SIMULATION STATE ---
  const [selectedMockCourseCode, setSelectedMockCourseCode] = useState<string>('CLIN401');
  const activeMockSessionInfo: ClassSessionInfo = MOCK_CLASS_SESSIONS[selectedMockCourseCode] || {
    code: selectedMockCourseCode,
    name: 'Clinical Dentistry',
    room: 'BU Dental Clinic',
    schedule: '08:00 AM - 12:00 PM',
    instructor: 'Clinical Faculty',
    status: 'active',
    statusMessage: 'Session open for attendance.',
  };
  const mockStorageKey = `dentisys_face_registered_${currentStudent?.id || '1'}`;
  const isMockFaceRegistered = localStorage.getItem(mockStorageKey) === 'true';
  const [overrideGeofence, setOverrideGeofence] = useState(false);
  const [mockGpsData, setMockGpsData] = useState({
    lat: 13.1436,
    lng: 123.7438,
    distanceMeters: 12,
    inGeofence: true,
    locationName: 'BU Dental Clinic (Zone A)',
  });
  const [mockVerifying, setMockVerifying] = useState(false);
  const [mockOutcome, setMockOutcome] = useState<{
    success: boolean;
    message: string;
    time?: string;
    status?: 'present' | 'late';
  } | null>(null);

  const refreshMockGps = useCallback(() => {
    if (runtimeConfig.providers.location.active === 'development-mock') {
      const fixture = DEVELOPMENT_LOCATION_FIXTURES.inside;
      setMockGpsData({
        lat: fixture.latitude ?? BU_DENTAL_CLINIC_COORDS.lat,
        lng: fixture.longitude ?? BU_DENTAL_CLINIC_COORDS.lng,
        distanceMeters: 12,
        inGeofence: true,
        locationName: 'Development location fixture: BU Dental Clinic (not authoritative)',
      });
    }
  }, [runtimeConfig.providers.location.active]);

  useEffect(() => {
    if (simulationEnabled) {
      refreshMockGps();
    }
  }, [simulationEnabled, overrideGeofence, refreshMockGps]);

  const handleMockTakeAttendance = () => {
    if (!simulationEnabled || !isMockFaceRegistered || activeMockSessionInfo.status !== 'active') return;
    setMockVerifying(true);
    setMockOutcome(null);

    setTimeout(() => {
      setMockVerifying(false);
      const biometricOutcome = developmentBiometricOutcome('matched');
      if (!mockGpsData.inGeofence && !overrideGeofence) {
        setMockOutcome({
          success: false,
          message: `Step 3 Geofence Failed: Outside clinic area (${mockGpsData.distanceMeters}m away).`,
        });
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isLate = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 30);
      const statusVal = isLate ? 'late' : 'present';

      addAttendanceRecord({
        studentId: currentStudent?.id || '1',
        date: new Date().toISOString().split('T')[0],
        subjectCode: selectedMockCourseCode,
        status: statusVal,
        verificationType: 'facial_geofence',
        faceVerified: true,
        locationVerified: true,
        verifiedLocationName: mockGpsData.locationName,
        verifiedAt: `${new Date().toISOString().split('T')[0]} ${timeStr}`,
      });
      void biometricOutcome;

      setMockOutcome({
        success: true,
        message: `Attendance recorded successfully for ${selectedMockCourseCode}!`,
        time: timeStr,
        status: statusVal,
      });
    }, 1500);
  };

  // --- ACCESS GATING CHECK ---
  if (!isAuthoritative && !simulationEnabled) {
    return <StudentUnavailable title="Daily Attendance unavailable" />;
  }

  // --- LOADING STATE ---
  if (isAuthoritative && initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Loading active attendance sessions…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">

      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Daily Class Check-In
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {isAuthoritative
              ? 'Select your active class session, verify liveness, and submit your attendance.'
              : 'Verify session status, check geofence location, and scan face to submit attendance.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentIdNum}</span>
          </div>

          <button
            onClick={() => navigate('/student/attendance-logs')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Attendance Logs</span>
          </button>
        </div>
      </div>

      {/* 2. FACE REGISTRATION WARNING / ENROLLMENT CHECK */}
      {isAuthoritative ? (
        !isAuthoritativeActiveEnrolled(profile?.enrollmentStatus) && (
          <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-4 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>
                {profile?.enrollmentStatus === 'expired'
                  ? 'Your biometric enrollment expired for this semester. Face re-registration is required.'
                  : profile?.enrollmentStatus === 'revoked'
                  ? 'Your biometric profile was revoked. Please consent and re-register.'
                  : 'Face registration required before taking automated session attendance.'}
              </span>
            </div>
            <button
              onClick={() => navigate('/student/face-registration')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <span>{profile?.enrollmentStatus === 'expired' || profile?.enrollmentStatus === 'revoked' ? 'Re-Enroll' : 'Register Face'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      ) : (
        !isMockFaceRegistered && (
          <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-4 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Face registration required before taking session attendance.</span>
            </div>
            <button
              onClick={() => navigate('/student/face-registration')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <span>Register Face</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      )}

      {/* General Error or Failure Notice */}
      {failureNotice && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block font-bold">Biometric Attendance Notice</strong>
            <p className="leading-relaxed">{failureNotice}</p>
          </div>
        </div>
      )}

      {authError && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">{authError}</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHORITATIVE FLOW */}
      {/* ========================================================================= */}
      {isAuthoritative && (
        <div className="space-y-6">

          {/* SUCCESS RESULT VIEW */}
          {checkInStage === 'result' && verificationResult && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-6 animate-fade-in">
              <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">
                    Attendance Recorded
                  </span>
                  <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                    {verificationResult.message || 'Attendance verified successfully!'}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Course</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                    {currentSelectedSession?.courseCode} — {currentSelectedSession?.courseName}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recorded Status</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${verificationResult.status === 'present'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : verificationResult.status === 'late'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                    }`}>
                    {verificationResult.status}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Verification Method</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Biometric 1:1 Verification
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  onClick={() => setCheckInStage('idle')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Check In Another Session
                </button>
                <button
                  onClick={() => navigate('/student/attendance-logs')}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>View All Attendance Logs</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE SESSIONS & CHECK-IN FORM */}
          {checkInStage !== 'result' && (
            <>
              {/* Active Sessions List or Dropdown */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-600" />
                    Select Active Class Session
                  </h3>
                  <button
                    onClick={() => { void loadAuthoritativeData(); }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Sessions</span>
                  </button>
                </div>

                {activeSessions.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                    <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      No Active Attendance Sessions Open
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      There are no active attendance sessions open for your enrolled courses right now. Your Course Instructor or Class Secretary must open a session before check-in begins.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {activeSessions.map((sess) => {
                        const isSelected = sess.id === selectedSessionId;
                        const requiresGeofence = Boolean(sess.geofenceRequired ?? sess.geofenceEnabled);
                        return (
                          <div
                            key={sess.id}
                            onClick={() => {
                              if (checkInStage === 'idle') {
                                setSelectedSessionId(sess.id);
                              }
                            }}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${isSelected
                              ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                              : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-xs font-extrabold text-blue-600 dark:text-blue-400">
                                {sess.courseCode}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Session Active
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
                              {sess.courseName}
                            </h4>
                            <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                              {sess.instructorName && (
                                <p className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5" />
                                  <span>{sess.instructorName}</span>
                                </p>
                              )}
                              {sess.room && (
                                <p className="flex items-center gap-1.5">
                                  <Building className="w-3.5 h-3.5" />
                                  <span>{sess.room}</span>
                                </p>
                              )}
                              <p className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                <span>{requiresGeofence ? 'Geofence Verification Required' : 'No Geofence Required'}</span>
                              </p>
                              {sess.attendedStatus && (
                                <p className="text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                                  ✓ Already recorded as {sess.attendedStatus}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* CAMERA / LIVENESS SCANNER STAGE */}
              {checkInStage === 'camera' && currentSelectedSession && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                          Step 2 of 2
                        </span>
                        <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                          Active Liveness & Face Verification
                        </h2>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        stopCamera();
                        setLivenessChallenge(null);
                        setCameraError(null);
                        setCheckInStage('idle');
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Liveness instructions */}
                  {livenessChallenge && (
                    <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" />
                          Follow Server Liveness Instructions
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Step {activeActionIndex + 1} of 2
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {livenessChallenge.actions.map((act, idx) => {
                          const details = formatAction(act);
                          const isActive = activeActionIndex === idx;
                          return (
                            <div
                              key={idx}
                              onClick={() => setActiveActionIndex(idx as 0 | 1)}
                              className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${isActive
                                ? 'bg-white dark:bg-slate-900 border-blue-500 shadow-xs'
                                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
                                }`}
                            >
                              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                                {act === 'blink' ? <Eye className="w-4 h-4 text-blue-600" /> : <RotateCcw className="w-4 h-4 text-blue-600" />}
                                <span>Action {idx + 1}: {details.title}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {details.instruction}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Video Viewport */}
                  <div className="relative w-full max-w-md mx-auto aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />

                    {cameraLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 text-white">
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                        <span className="text-xs font-semibold">Starting camera…</span>
                      </div>
                    )}

                    {/* Target Frame Oval Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-52 h-64 rounded-[50%] border-2 border-white/60 border-dashed" />
                    </div>
                  </div>

                  {cameraError && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-bold">Camera Access Required</strong>
                        <p className="mt-0.5 leading-relaxed">{cameraError}</p>
                        <button
                          onClick={() => { void startCameraAndChallenge(selectedCameraIdRef.current || undefined); }}
                          className="mt-2.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold text-[11px] hover:bg-amber-700 cursor-pointer"
                        >
                          Retry Camera Access
                        </button>
                      </div>
                    </div>
                  )}

                  {cameraDevices.length > 1 && (
                    <label className="flex flex-col gap-1 max-w-md mx-auto text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>Camera source</span>
                      <select
                        value={selectedCameraId}
                        onChange={event => {
                          const deviceId = event.target.value;
                          selectedCameraIdRef.current = deviceId;
                          setSelectedCameraId(deviceId);
                          void startCameraAndChallenge(deviceId);
                        }}
                        disabled={cameraLoading}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      >
                        {cameraDevices.map(device => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="text-center space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Look directly into the camera, follow the liveness actions, and submit verification.
                    </p>

                    <button
                      onClick={() => { void handleSubmitAuthoritativeVerification(); }}
                      disabled={cameraLoading || Boolean(cameraError) || !livenessChallenge}
                      className={`px-8 py-3 rounded-xl text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 mx-auto ${cameraLoading || cameraError || !livenessChallenge
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer'
                        }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>Verify & Submit Attendance</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ACQUIRING LOCATION OVERLAY */}
              {checkInStage === 'location' && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4 animate-fade-in">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Acquiring Location…
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    {locationStatus || 'Obtaining temporary GPS coordinates for session geofence check…'}
                  </p>
                </div>
              )}

              {/* VERIFYING WITH SERVER OVERLAY */}
              {checkInStage === 'verifying' && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4 animate-fade-in">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Authoritative Verification in Progress…
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Evaluating liveness challenge, 1:1 facial verification, and session parameters. Please do not close the browser.
                  </p>
                </div>
              )}

              {/* IDLE: ACTION BUTTON */}
              {checkInStage === 'idle' && currentSelectedSession && (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-0.5 text-center sm:text-left">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Ready to check in for {currentSelectedSession.courseCode}?
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ensure your camera is enabled and you are within the designated area if geofencing is required.
                    </p>
                  </div>

                  <button
                    onClick={() => { void handleStartAuthoritativeCheckIn(); }}
                    disabled={!isAuthoritativeActiveEnrolled(profile?.enrollmentStatus)}
                    className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 flex-shrink-0 ${isAuthoritativeActiveEnrolled(profile?.enrollmentStatus)
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Begin Attendance Check-In</span>
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* SIMULATION (DEVELOPMENT MOCK) FLOW */}
      {/* ========================================================================= */}
      {simulationEnabled && (
        <div className="space-y-6">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 font-mono">
            [DEVELOPMENT MOCK MODE: Using browser fixture attendance and simulated biometrics]
          </div>

          {/* Step 1: Dropdown Course Selection */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Step 1: Select Enrolled Subject
            </h3>
            <select
              value={selectedMockCourseCode}
              onChange={(e) => setSelectedMockCourseCode(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-sm font-bold text-slate-800 dark:text-slate-100"
            >
              {Object.keys(MOCK_CLASS_SESSIONS).map((code) => (
                <option key={code} value={code}>
                  {code} — {MOCK_CLASS_SESSIONS[code].name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Geofence Live Location & Override */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Step 2: Geofence Status</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideGeofence}
                  onChange={(e) => setOverrideGeofence(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Override Geofence (Dev)</span>
              </label>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Location: {mockGpsData.locationName} ({mockGpsData.distanceMeters}m from clinic center).
            </p>
          </div>

          {/* Step 3: Simulation Outcome / Take Attendance */}
          {mockOutcome && (
            <div className={`p-4 rounded-2xl border text-xs ${mockOutcome.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-900 dark:text-rose-200'
              }`}>
              <strong>{mockOutcome.message}</strong>
              {mockOutcome.time && <p className="mt-1">Recorded at {mockOutcome.time} as {mockOutcome.status}.</p>}
            </div>
          )}

          <button
            onClick={handleMockTakeAttendance}
            disabled={mockVerifying || !isMockFaceRegistered}
            className={`w-full py-3.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${mockVerifying || !isMockFaceRegistered
              ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 cursor-pointer'
              }`}
          >
            <Camera className="w-4 h-4" />
            <span>{mockVerifying ? 'Verifying Simulation…' : 'Take Attendance (Simulated)'}</span>
          </button>
        </div>
      )}

    </div>
  );
};
