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
  getStudentAttendanceLogs,
  createBiometricLivenessChallenge,
  requestBiometricLivenessGuidance,
  submitBiometricAttendance,
  isTransportOrBiometricUnavailable,
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
import {
  runGuidedCapture,
  type GuidedCapturePhase,
} from '../../utils/guidedCapture';
import { playGuidanceSuccessTone, primeGuidanceAudio } from '../../utils/guidanceAudio';

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

  // Guided Multi-Phase Capture & Retry State
  const [capturePhase, setCapturePhase] = useState<GuidedCapturePhase>('idle');
  const [capturedFrameCount, setCapturedFrameCount] = useState<number>(0);
  const [phaseInstruction, setPhaseInstruction] = useState<string>('');
  const [lastActionSuccess, setLastActionSuccess] = useState<string | null>(null);
  const [pendingAttendancePayload, setPendingAttendancePayload] = useState<{
    attendanceSessionId: number;
    challengeId: string;
    challengeToken: string;
    idempotencyKey: string;
    frames: Blob[];
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  } | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState<boolean>(false);

  // Camera & Abort Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const guidanceAbortRef = useRef<AbortController | null>(null);
  const captureRunRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const abortCaptureRef = useRef<boolean>(false);
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

  // Teardown camera and abort in-flight operations on unmount
  useEffect(() => {
    return () => {
      abortCaptureRef.current = true;
      captureRunRef.current += 1;
      guidanceAbortRef.current?.abort();
      guidanceAbortRef.current = null;
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = null;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (checkInStage !== 'camera') {
      stopCamera();
    }
  }, [checkInStage, stopCamera]);

  // Release the hardware camera when this screen is backgrounded or closed.
  useEffect(() => {
    const releaseCameraWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
        abortCaptureRef.current = true;
        captureRunRef.current += 1;
        guidanceAbortRef.current?.abort();
        guidanceAbortRef.current = null;
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        stopCamera();
        setCapturePhase('idle');
        // Keep a captured operation in memory while the server may still
        // commit after a browser abort. The idempotency key is never written
        // to persistent storage and can be retried or reconciled on return.
        setCanRetryUpload(Boolean(pendingAttendancePayload));
        setLivenessChallenge(null);
        setCameraLoading(false);
        if (checkInStage === 'camera' || checkInStage === 'verifying') {
          setCheckInStage('idle');
          setFailureNotice('Attendance capture was paused because this tab is no longer active.');
        }
      }
    };

    document.addEventListener('visibilitychange', releaseCameraWhenHidden);
    window.addEventListener('pagehide', releaseCameraWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', releaseCameraWhenHidden);
      window.removeEventListener('pagehide', releaseCameraWhenHidden);
    };
  }, [checkInStage, pendingAttendancePayload, stopCamera]);

  // Load Authoritative Sessions and Profile
  const loadAuthoritativeData = useCallback(async () => {
    if (!isAuthoritative) return;
    setInitialLoading(true);
    setAuthError(null);
    const [profileResult, sessionsResult] = await Promise.allSettled([
      getStudentBiometricProfile(),
      getStudentActiveAttendanceSessions(),
    ]);
    const errors: string[] = [];
    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value);
    } else {
      setProfile(null);
      errors.push(profileResult.reason instanceof Error ? profileResult.reason.message : 'Biometric profile is unavailable.');
    }
    if (sessionsResult.status === 'fulfilled') {
      const sessions = sessionsResult.value.sessions;
      setActiveSessions(sessions);
      setSelectedSessionId(sessions[0]?.id ?? null);
    } else {
      setActiveSessions([]);
      setSelectedSessionId(null);
      errors.push(sessionsResult.reason instanceof Error ? sessionsResult.reason.message : 'Attendance sessions are unavailable.');
    }
    setAuthError(errors.length > 0
      ? `${errors.join(' ')} Automated attendance is unavailable until the data can be loaded. Please use the authorized Secretary or Faculty manual attendance path.`
      : null);
    setInitialLoading(false);
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

  // Capture single frame from video element
  const captureSingleFrame = async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
  };

  // Submit Biometric Attendance to Server with Retry Preservation
  const uploadAttendance = async (payload: {
    attendanceSessionId: number;
    challengeId: string;
    challengeToken: string;
    idempotencyKey: string;
    frames: Blob[];
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  }) => {
    setCheckInStage('verifying');
    setFailureNotice(null);
    setAuthError(null);

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    setPendingAttendancePayload(payload);

    try {
      const formData = new FormData();
      formData.append('attendanceSessionId', String(payload.attendanceSessionId));
      formData.append('attendance_session_id', String(payload.attendanceSessionId));
      formData.append('challengeId', payload.challengeId);
      formData.append('challenge_id', payload.challengeId);
      formData.append('challengeToken', payload.challengeToken);
      formData.append('challenge_token', payload.challengeToken);
      formData.append('idempotencyKey', payload.idempotencyKey);
      formData.append('idempotency_key', payload.idempotencyKey);

      if (payload.latitude !== undefined && payload.longitude !== undefined) {
        formData.append('latitude', String(payload.latitude));
        formData.append('longitude', String(payload.longitude));
        if (payload.accuracy !== undefined) {
          formData.append('accuracy', String(payload.accuracy));
        }
      }

      payload.frames.forEach((blob, idx) => {
        formData.append('frames[]', blob, `frame_${idx}.jpg`);
      });

      const result = await submitBiometricAttendance(formData, abortController.signal);
      stopCamera();
      setPendingAttendancePayload(null);
      setCanRetryUpload(false);
      setVerificationResult(result);
      setCheckInStage('result');
      void loadAuthoritativeData();
    } catch (err) {
      if (abortController.signal.aborted) {
        setCanRetryUpload(true);
        setFailureNotice('The browser stopped waiting, but the server may still be completing attendance. Retry with the same operation key after reconciling the attendance log.');
        return;
      }
      if (isTransportOrBiometricUnavailable(err)) {
        // Transport/network/503: preserve challenge, idempotencyKey, and candidate frames
        setPendingAttendancePayload(payload);
        setCanRetryUpload(true);
        const msg = err instanceof Error ? err.message : 'Biometric service or network connection is temporarily unavailable.';
        setFailureNotice(`${msg} Your 30 verification frames and server challenge have been preserved. You can click "Retry Submission" to resubmit with the existing idempotency key, or report to your Class Secretary or Course Instructor for authorized manual check-in.`);
        setCheckInStage('camera');
      } else {
        // Semantic rejection: consume challenge and return to idle
        stopCamera();
        setPendingAttendancePayload(null);
        setCanRetryUpload(false);
        const msg = err instanceof Error ? err.message : 'Biometric verification failed.';
        setFailureNotice(`${msg} Your attendance was not recorded. Please report to your Class Secretary or Course Instructor for authorized manual check-in.`);
        setCheckInStage('idle');
      }
    } finally {
      uploadAbortRef.current = null;
      setCapturePhase('idle');
    }
  };

  // Guided check-in: prompts advance only after the sidecar observes each action.
  const handleStartGuidedCheckIn = async () => {
    if (!currentSelectedSession || !livenessChallenge || capturePhase !== 'idle') return;

    if (livenessChallenge.expiresAt) {
      const expiryMs = new Date(livenessChallenge.expiresAt).getTime();
      if (Number.isFinite(expiryMs) && Date.now() >= expiryMs) {
        setFailureNotice('Liveness challenge has expired. Requesting a fresh challenge…');
        void startCameraAndChallenge();
        return;
      }
    }

    setPendingAttendancePayload(null);
    setCanRetryUpload(false);
    setFailureNotice(null);
    abortCaptureRef.current = false;
    const runId = captureRunRef.current + 1;
    captureRunRef.current = runId;
    guidanceAbortRef.current?.abort();
    const guidanceAbortController = new AbortController();
    guidanceAbortRef.current = guidanceAbortController;
    primeGuidanceAudio();
    setActiveActionIndex(0);
    setCapturedFrameCount(0);
    setLastActionSuccess(null);
    const isRunActive = (): boolean => captureRunRef.current === runId && !abortCaptureRef.current;
    try {
      const result = await runGuidedCapture({
        actions: livenessChallenge.actions,
        targetFrames: 30,
        captureFrame: captureSingleFrame,
        analyzeFrame: async (frame) => {
          const formData = new FormData();
          formData.append('purpose', 'attendance');
          formData.append('attendanceSessionId', String(currentSelectedSession.id));
          formData.append('challengeId', livenessChallenge.challengeId);
          formData.append('challengeToken', livenessChallenge.challengeToken);
          formData.append('frames[]', frame, 'guidance.jpg');
          return requestBiometricLivenessGuidance(formData, guidanceAbortController.signal);
        },
        isCancelled: () => !isRunActive(),
        onPhase: (phase: GuidedCapturePhase, instruction: string) => {
          if (!isRunActive()) return;
          setCapturePhase(phase);
          setPhaseInstruction(instruction);
          if (phase === 'phase1_neutral') setLastActionSuccess(null);
        },
        onFrameCount: setCapturedFrameCount,
        onActionSuccess: (index, action) => {
          if (!isRunActive()) return;
          setActiveActionIndex(index);
          setLastActionSuccess(formatAction(action).title);
          playGuidanceSuccessTone();
        },
      });

      if (!isRunActive()) return;
      if (result.status === 'cancelled') return;
      if (result.status === 'timeout') {
        setFailureNotice(result.reason === 'face_not_detected'
          ? 'Your face was not detected in the camera frames. Center your face in the guide and retry the guided check-in.'
          : result.reason === 'camera_frame_unavailable'
            ? 'The camera did not provide usable frames. Check camera access and retry the guided check-in.'
            : `No ${formatAction(result.expectedAction).title.toLowerCase()} was observed. Follow the prompt and retry the guided check-in.`);
        setCapturePhase('idle');
        setPhaseInstruction('');
        return;
      }

      await uploadAttendance({
        attendanceSessionId: currentSelectedSession.id,
        challengeId: livenessChallenge.challengeId,
        challengeToken: livenessChallenge.challengeToken,
        idempotencyKey: crypto.randomUUID(),
        frames: result.frames,
        latitude: locationCoords?.latitude,
        longitude: locationCoords?.longitude,
        accuracy: locationCoords?.accuracy,
      });
    } catch (err) {
      if (!isRunActive()) return;
      const msg = err instanceof Error ? err.message : 'Live camera guidance is temporarily unavailable.';
      setFailureNotice(`${msg} Please retry the guided check-in or use authorized manual attendance.`);
      setCapturePhase('idle');
      setPhaseInstruction('');
    } finally {
      if (captureRunRef.current === runId) {
        guidanceAbortRef.current = null;
      }
    }
  };

  const handleCancelAttendance = () => {
    const submissionInFlight = Boolean(uploadAbortRef.current || pendingAttendancePayload);
    abortCaptureRef.current = true;
    captureRunRef.current += 1;
    guidanceAbortRef.current?.abort();
    guidanceAbortRef.current = null;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    stopCamera();
    setCapturePhase('idle');
    setCapturedFrameCount(0);
    setLastActionSuccess(null);
    setLivenessChallenge(null);
    setCheckInStage('idle');
    if (submissionInFlight) {
      // An abort can race with a committed server write. Keep the same
      // in-memory operation available for retry/reconciliation.
      setCanRetryUpload(true);
      setFailureNotice('Submission cancelled locally. The server may still be processing it; retry with the existing operation or return to reconcile it.');
      return;
    }
    setPendingAttendancePayload(null);
    setCanRetryUpload(false);
    setFailureNotice(null);
  };

  const handleRetryAttendanceUpload = () => {
    if (!pendingAttendancePayload) return;
    void uploadAttendance(pendingAttendancePayload);
  };

  const reconcilePendingAttendance = useCallback(async (): Promise<boolean> => {
    const payload = pendingAttendancePayload;
    if (!payload) return false;
    try {
      const logs = await getStudentAttendanceLogs();
      const existing = logs.records.find(record => record.sessionId === payload.attendanceSessionId);
      if (!existing) return false;
      setPendingAttendancePayload(null);
      setCanRetryUpload(false);
      setVerificationResult({
        status: 'already_recorded',
        message: 'Attendance was already recorded for this session.',
        recordedAt: undefined,
      });
      setCheckInStage('result');
      void loadAuthoritativeData();
      return true;
    } catch {
      return false;
    }
  }, [loadAuthoritativeData, pendingAttendancePayload]);

  useEffect(() => {
    const reconcileOnReturn = (): void => {
      if (document.visibilityState === 'visible' && pendingAttendancePayload) {
        void reconcilePendingAttendance();
      }
    };
    document.addEventListener('visibilitychange', reconcileOnReturn);
    return () => document.removeEventListener('visibilitychange', reconcileOnReturn);
  }, [pendingAttendancePayload, reconcilePendingAttendance]);

  const handleDiscardAndRestart = async () => {
    if (await reconcilePendingAttendance()) return;
    setPendingAttendancePayload(null);
    setCanRetryUpload(false);
    setCapturedFrameCount(0);
    setFailureNotice(null);
    stopCamera();
    setLivenessChallenge(null);
    setCameraError(null);
    setCameraLoading(false);
    setCapturePhase('idle');
    setActiveActionIndex(0);
    setCheckInStage('camera');
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
          <div className="space-y-2">
            <p className="leading-relaxed">{authError}</p>
            <button
              type="button"
              onClick={() => { void loadAuthoritativeData(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry data load
            </button>
          </div>
        </div>
      )}

      {isAuthoritative && (
        <div className="grid grid-cols-3 gap-3" aria-label="Attendance check-in progress">
          {[
            { number: '1', label: 'Select Session', active: checkInStage === 'idle' && !currentSelectedSession?.alreadyRecordedStatus },
            { number: '2', label: 'Location Check', active: checkInStage === 'location' },
            { number: '3', label: 'Liveness & Submit', active: checkInStage === 'camera' || checkInStage === 'verifying' || checkInStage === 'result' },
          ].map((step) => (
            <div
              key={step.number}
              className={`p-3 rounded-2xl border text-center transition-all ${step.active
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block">Step {step.number}</span>
              <span className="text-xs font-extrabold block mt-0.5">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUTHORITATIVE FLOW */}
      {/* ========================================================================= */}
      {isAuthoritative && (
        <div className="space-y-6">

          {canRetryUpload && pendingAttendancePayload && checkInStage !== 'result' && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Network or Biometric Service Interruption</strong>
                  <p className="mt-0.5 leading-relaxed">
                    Your captured frames and attendance challenge have been preserved. You can retry submission with the same idempotency key without re-capturing.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  onClick={handleDiscardAndRestart}
                  className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  Discard & Fresh Challenge
                </button>
                <button
                  onClick={handleRetryAttendanceUpload}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Submission</span>
                </button>
              </div>
            </div>
          )}

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
                              {sess.alreadyRecordedStatus && (
                                <p className="text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                                  ✓ Already recorded as {sess.alreadyRecordedStatus}
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
                      onClick={handleCancelAttendance}
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
                      <div className={`w-52 h-64 rounded-[50%] border-2 transition-all ${capturePhase !== 'idle'
                        ? 'border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.5)]'
                        : 'border-white/60 border-dashed'
                        }`} />
                    </div>

                    {/* Active Guided Capture Phase Overlay */}
                    {capturePhase !== 'idle' && (
                      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-slate-950/90 via-slate-950/75 to-transparent p-4 text-center text-white space-y-2 z-10 animate-fade-in">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/90 text-white font-extrabold text-[11px] shadow-sm uppercase tracking-wider">
                          {capturePhase === 'phase1_neutral' && 'Phase 1 of 3: Frontal / Neutral Face'}
                          {capturePhase === 'phase2_action1' && `Phase 2 of 3: Action 1 (${livenessChallenge ? formatAction(livenessChallenge.actions[0]).title : ''})`}
                          {capturePhase === 'phase3_action2' && `Phase 3 of 3: Action 2 (${livenessChallenge ? formatAction(livenessChallenge.actions[1]).title : ''})`}
                          {capturePhase === 'complete' && 'Liveness actions complete'}
                          {capturePhase === 'uploading' && 'Transmitting Verification'}
                        </div>
                        {lastActionSuccess && capturePhase !== 'uploading' && (
                          <p className="text-xs font-extrabold text-emerald-300" role="status">
                            ✓ {lastActionSuccess} detected. Good.
                          </p>
                        )}
                        <p className="text-xs font-semibold text-blue-200">
                          {phaseInstruction}
                        </p>
                        <div className="w-56 mx-auto bg-slate-800/80 h-2 rounded-full overflow-hidden border border-slate-700">
                          <div
                            className="bg-blue-500 h-full transition-all duration-150"
                            style={{ width: `${Math.min(100, Math.round((capturedFrameCount / 30) * 100))}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-300 font-mono block">
                          {capturedFrameCount} / 30 verification frames captured
                        </span>
                      </div>
                    )}
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
                        disabled={cameraLoading || capturePhase !== 'idle'}
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
                      Look directly into the camera, follow the paced liveness actions, and complete verification.
                    </p>

                    <div className="flex items-center justify-center gap-3">
                      {capturePhase !== 'idle' && (
                        <button
                          onClick={handleCancelAttendance}
                          className="px-5 py-3 rounded-xl font-bold text-xs border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                        >
                          Cancel Capture
                        </button>
                      )}

                      {!canRetryUpload && (
                        <button
                          onClick={() => { void handleStartGuidedCheckIn(); }}
                          disabled={cameraLoading || Boolean(cameraError) || !livenessChallenge || capturePhase !== 'idle'}
                          className={`px-8 py-3 rounded-xl text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 mx-auto ${cameraLoading || cameraError || !livenessChallenge || capturePhase !== 'idle'
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer'
                            }`}
                        >
                          {capturePhase !== 'idle' ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Paced Capture Active…</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-4 h-4" />
                              <span>Start Guided Biometric Check-in (up to 30 Frames)</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
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
                    disabled={!isAuthoritativeActiveEnrolled(profile?.enrollmentStatus) || Boolean(currentSelectedSession.alreadyRecordedStatus)}
                    className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 flex-shrink-0 ${isAuthoritativeActiveEnrolled(profile?.enrollmentStatus) && !currentSelectedSession.alreadyRecordedStatus
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>{currentSelectedSession.alreadyRecordedStatus ? 'Attendance Already Recorded' : 'Begin Attendance Check-In'}</span>
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
