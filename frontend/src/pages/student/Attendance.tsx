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
  Play,
  ArrowLeft,
  Square,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { BiometricRadialScanner } from '../../components/BiometricRadialScanner';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { StudentUnavailable } from './RealStudentSurfaces';
import {
  getStudentBiometricProfile,
  getStudentActiveAttendanceSessions,
  createBiometricLivenessChallenge,
  submitBiometricAttendance,
} from '../../services/apiClient';
import type {
  StudentBiometricProfile,
  StudentActiveSession,
  LivenessChallengeResponse,
  LivenessAction,
  BiometricAttendanceResponse,
} from '../../types';
import { DEVELOPMENT_LOCATION_FIXTURES, developmentBiometricOutcome } from '../../services/developmentProviders';
import {
  describeCameraError,
  listCameraDevices,
  startCameraStream,
  type CameraDevice,
} from '../../utils/camera';
import {
  analyzeFaceFrame,
  captureVideoFrameBlob,
  verifyFaceInVideo,
} from '../../utils/faceDetection';

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

  const studentIdNum = user?.student?.student_number || currentStudent?.studentId || '2023-BU-0142';

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

  // Step-by-step Gated Biometric Capture State
  const [activeActionStep, setActiveActionStep] = useState<1 | 2 | 3 | 4>(1);
  const [centerFrames, setCenterFrames] = useState<Blob[]>([]);
  const [action1Frames, setAction1Frames] = useState<Blob[]>([]);
  const [action2Frames, setAction2Frames] = useState<Blob[]>([]);
  const [isRecordingStep, setIsRecordingStep] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingStepLabel, setRecordingStepLabel] = useState('');
  const captureAbortRef = useRef<AbortController | null>(null);
  const isScanning = isRecordingStep || checkInStage === 'verifying';

  // Automated Real-Time Scanning State
  const [scanPrompt, setScanPrompt] = useState('Position your face inside the oval looking directly at the camera.');
  const [stepVerified, setStepVerified] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);

  const baselineEyeRef = useRef(0.12);
  const isCapturingRef = useRef(false);
  const activeStepRef = useRef(activeActionStep);
  activeStepRef.current = activeActionStep;

  // Reset steps helper
  const handleResetSteps = useCallback(() => {
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    isCapturingRef.current = false;
    setCenterFrames([]);
    setAction1Frames([]);
    setAction2Frames([]);
    setActiveActionStep(1);
    setStepVerified(false);
    setHoldProgress(0);
    setIsRecordingStep(false);
    setRecordingProgress(0);
    setRecordingStepLabel('');
    setScanPrompt('Position your face in the circle looking straight ahead.');
  }, []);

  // Retake step helper
  const handleRetakeStep = useCallback((step: 1 | 2 | 3) => {
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    isCapturingRef.current = false;
    setIsRecordingStep(false);
    setRecordingProgress(0);
    setRecordingStepLabel('');
    setStepVerified(false);
    setHoldProgress(0);
    if (step === 1) {
      setCenterFrames([]);
      setAction1Frames([]);
      setAction2Frames([]);
      setActiveActionStep(1);
      setScanPrompt('Position your face in the circle looking straight ahead.');
    } else if (step === 2) {
      setAction1Frames([]);
      setAction2Frames([]);
      setActiveActionStep(2);
    } else if (step === 3) {
      setAction2Frames([]);
      setActiveActionStep(3);
    }
  }, []);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    cameraAbortRef.current?.abort();
    cameraAbortRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsRecordingStep(false);
    setRecordingProgress(0);
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
    handleResetSteps();
    setCheckInStage('camera');
  };

  const startCameraAndChallenge = useCallback(async (requestedCameraId?: string) => {
    if (!currentSelectedSession) return;
    setCameraLoading(true);
    setCameraError(null);
    setFailureNotice(null);
    handleResetSteps();
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

  const recordStepFrames = async (
    targetCount: number,
    durationMs: number,
    label: string
  ): Promise<Blob[]> => {
    captureAbortRef.current?.abort();
    const abortController = new AbortController();
    captureAbortRef.current = abortController;
    const { signal } = abortController;

    setIsRecordingStep(true);
    setRecordingStepLabel(label);
    setRecordingProgress(0);

    const stepBlobs: Blob[] = [];
    const intervalMs = Math.floor(durationMs / targetCount);
    const startTime = Date.now();

    try {
      for (let i = 0; i < targetCount; i++) {
        if (signal.aborted) throw new Error('Recording cancelled');
        const blob = await captureSingleFrame();
        if (blob) {
          stepBlobs.push(blob);
        }
        setRecordingProgress(Math.min(100, Math.round(((i + 1) / targetCount) * 100)));
        const nextTargetTime = startTime + (i + 1) * intervalMs;
        const waitMs = Math.max(25, nextTargetTime - Date.now());
        await new Promise(r => setTimeout(r, waitMs));
      }
      return stepBlobs;
    } finally {
      if (captureAbortRef.current === abortController) {
        setIsRecordingStep(false);
        setRecordingProgress(0);
        setRecordingStepLabel('');
      }
    }
  };

  // --- AUTOMATED REAL-TIME SCANNER LOOP FOR ATTENDANCE (PHONE FACE ID ACCUMULATOR) ---
  useEffect(() => {
    if (checkInStage !== 'camera' || !livenessChallenge) {
      return;
    }

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
        return;
      }

      if (isCapturingRef.current) return;

      const analysis = analyzeFaceFrame(video, baselineEyeRef.current);
      setIsFaceDetected(analysis.detected);

      if (!analysis.detected) {
        setScanPrompt(analysis.reason || 'Position your face in the circle');
        setStepVerified(false);
        return;
      }

      // Step 1: Center Face (collect 6 frames)
      if (activeStepRef.current === 1) {
        if (analysis.isCentered && (analysis.detectedAction === 'center' || analysis.detectedAction === 'none')) {
          baselineEyeRef.current = Math.max(0.05, analysis.eyeDarkRatio);
          setScanPrompt('Looking straight… hold steady');

          isCapturingRef.current = true;
          try {
            const blob = await captureVideoFrameBlob(video);
            if (blob) {
              setCenterFrames(prev => {
                if (prev.length >= 6) return prev;
                const next = [...prev, blob];
                if (next.length === 6) {
                  setStepVerified(true);
                  setScanPrompt('✓ Center face captured!');
                  setTimeout(() => {
                    setActiveActionStep(2);
                    setStepVerified(false);
                  }, 400);
                }
                return next;
              });
            }
          } finally {
            isCapturingRef.current = false;
          }
        } else {
          setScanPrompt('Look directly into the center of the circle');
        }
      }
      // Step 2: Action 1 (collect 5 frames)
      else if (activeStepRef.current === 2) {
        const targetAction = livenessChallenge.actions[0];
        const isMatched = analysis.detectedAction === targetAction;

        if (isMatched) {
          setStepVerified(true);
          setScanPrompt(`✓ ${formatAction(targetAction).title} detected!`);

          isCapturingRef.current = true;
          try {
            const blob = await captureVideoFrameBlob(video);
            if (blob) {
              setAction1Frames(prev => {
                if (prev.length >= 5) return prev;
                const next = [...prev, blob];
                if (next.length === 5) {
                  setStepVerified(true);
                  setScanPrompt(`✓ ${formatAction(targetAction).title} completed!`);
                  setTimeout(() => {
                    setActiveActionStep(3);
                    setStepVerified(false);
                  }, 400);
                }
                return next;
              });
            }
          } finally {
            isCapturingRef.current = false;
          }
        } else {
          setStepVerified(false);
          setScanPrompt(formatAction(targetAction).instruction);
        }
      }
      // Step 3: Action 2 (collect 5 frames)
      else if (activeStepRef.current === 3) {
        const targetAction = livenessChallenge.actions[1];
        const isMatched = analysis.detectedAction === targetAction;

        if (isMatched) {
          setStepVerified(true);
          setScanPrompt(`✓ ${formatAction(targetAction).title} detected!`);

          isCapturingRef.current = true;
          try {
            const blob = await captureVideoFrameBlob(video);
            if (blob) {
              setAction2Frames(prev => {
                if (prev.length >= 5) return prev;
                const next = [...prev, blob];
                if (next.length === 5) {
                  setStepVerified(true);
                  setScanPrompt('✓ All 16 samples verified! Ready to submit.');
                  setTimeout(() => {
                    setActiveActionStep(4);
                    setStepVerified(false);
                  }, 400);
                }
                return next;
              });
            }
          } finally {
            isCapturingRef.current = false;
          }
        } else {
          setStepVerified(false);
          setScanPrompt(formatAction(targetAction).instruction);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [checkInStage, livenessChallenge]);


  const handleSubmitAttendance = async () => {
    if (
      !currentSelectedSession
      || !livenessChallenge
      || isRecordingStep
      || centerFrames.length === 0
      || action1Frames.length === 0
      || action2Frames.length === 0
    ) {
      return;
    }

    const allFrames = [...centerFrames, ...action1Frames, ...action2Frames];
    if (allFrames.length === 0) return;

    setCheckInStage('verifying');
    setFailureNotice(null);
    setAuthError(null);

    try {
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

      allFrames.forEach((blob, idx) => {
        formData.append('frames[]', blob, `frame_${idx}.jpg`);
      });

      // Submit to backend
      const result = await submitBiometricAttendance(formData);
      stopCamera();
      setVerificationResult(result);
      setCheckInStage('result');
      void loadAuthoritativeData();
    } catch (err) {
      stopCamera();
      const msg = err instanceof Error ? err.message : 'Biometric verification failed.';
      setFailureNotice(`${msg} Your attendance was not recorded. Please report to your Class Secretary or Course Instructor for authorized manual check-in.`);
      setCheckInStage('idle');
    }
  };

  // Backward compatibility alias for guided scan
  const handleSubmitAuthoritativeVerification = handleSubmitAttendance;

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
        profile?.enrollmentStatus !== 'enrolled' && (
          <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-4 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>
                {profile?.enrollmentStatus === 'expired'
                  ? 'Your biometric enrollment expired for this semester. Face re-registration is required.'
                  : 'Face registration required before taking automated session attendance.'}
              </span>
            </div>
            <button
              onClick={() => navigate('/student/face-registration')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <span>{profile?.enrollmentStatus === 'expired' ? 'Re-Enroll' : 'Register Face'}</span>
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

                  {/* Liveness instructions with gated progression */}
                  {livenessChallenge && (() => {
                    const act1 = formatAction(livenessChallenge.actions[0]);
                    const act2 = formatAction(livenessChallenge.actions[1]);
                    const totalStored = centerFrames.length + action1Frames.length + action2Frames.length;

                    return (
                      <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" />
                            Gated Liveness Check-in (Stored: {totalStored} / 16 Samples)
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {activeActionStep === 1
                              ? 'Step 1 of 3: Center Face'
                              : activeActionStep === 2
                                ? `Step 2 of 3: ${act1.title}`
                                : activeActionStep === 3
                                  ? `Step 3 of 3: ${act2.title}`
                                  : 'Ready to Submit'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {/* Phase 1: Center Face */}
                          <div className={`p-2.5 rounded-xl border text-xs transition-all ${
                            centerFrames.length > 0
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              : activeActionStep === 1
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-400/30'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            <div className="flex items-center justify-between gap-1.5 font-bold">
                              <div className="flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5" />
                                <span>1. Center Face</span>
                              </div>
                              {centerFrames.length > 0 ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">✓ Done ({centerFrames.length})</span>
                              ) : activeActionStep === 1 ? (
                                <span className="text-[10px] font-extrabold text-white animate-pulse">Current</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Pending</span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-[10px] ${activeActionStep === 1 && centerFrames.length === 0 ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                              {centerFrames.length > 0 ? `${centerFrames.length} samples stored` : 'Neutral frontal look'}
                            </p>
                          </div>

                          {/* Phase 2: Action 1 */}
                          <div className={`p-2.5 rounded-xl border text-xs transition-all ${
                            action1Frames.length > 0
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              : activeActionStep === 2
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm ring-2 ring-amber-400/30'
                                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                          }`}>
                            <div className="flex items-center justify-between gap-1.5 font-bold">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {livenessChallenge.actions[0] === 'blink' ? <Eye className="w-3.5 h-3.5 flex-shrink-0" /> : <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />}
                                <span className="truncate">2. {act1.title}</span>
                              </div>
                              {action1Frames.length > 0 ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓ Done ({action1Frames.length})</span>
                              ) : activeActionStep === 2 ? (
                                <span className="text-[10px] font-extrabold text-white animate-pulse flex-shrink-0">Current</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>Locked</span>
                                </span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-[10px] truncate ${activeActionStep === 2 && action1Frames.length === 0 ? 'text-amber-100' : centerFrames.length === 0 ? 'text-slate-400 italic' : 'text-slate-500 dark:text-slate-400'}`}>
                              {centerFrames.length === 0 ? 'Pending Step 1' : action1Frames.length > 0 ? `${action1Frames.length} samples stored` : act1.instruction}
                            </p>
                          </div>

                          {/* Phase 3: Action 2 */}
                          <div className={`p-2.5 rounded-xl border text-xs transition-all ${
                            action2Frames.length > 0
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                              : activeActionStep === 3
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-400/30'
                                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                          }`}>
                            <div className="flex items-center justify-between gap-1.5 font-bold">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {livenessChallenge.actions[1] === 'blink' ? <Eye className="w-3.5 h-3.5 flex-shrink-0" /> : <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />}
                                <span className="truncate">3. {act2.title}</span>
                              </div>
                              {action2Frames.length > 0 ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓ Done ({action2Frames.length})</span>
                              ) : activeActionStep === 3 ? (
                                <span className="text-[10px] font-extrabold text-white animate-pulse flex-shrink-0">Current</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>Locked</span>
                                </span>
                              )}
                            </div>
                            <p className={`mt-0.5 text-[10px] truncate ${activeActionStep === 3 && action2Frames.length === 0 ? 'text-emerald-100' : action1Frames.length === 0 ? 'text-slate-400 italic' : 'text-slate-500 dark:text-slate-400'}`}>
                              {action1Frames.length === 0 ? 'Pending Step 2' : action2Frames.length > 0 ? `${action2Frames.length} samples stored` : act2.instruction}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Phone Face ID Radial Scanner Viewport */}
                  <div className="relative flex flex-col items-center justify-center">
                    <BiometricRadialScanner
                      videoRef={videoRef}
                      totalTicks={16}
                      capturedCount={centerFrames.length + action1Frames.length + action2Frames.length}
                      currentStep={activeActionStep as 1 | 2 | 3 | 4}
                      currentActionType={
                        activeActionStep === 1
                          ? 'center'
                          : activeActionStep === 2
                            ? (livenessChallenge?.actions[0] || 'center')
                            : activeActionStep === 3
                              ? (livenessChallenge?.actions[1] || 'center')
                              : 'complete'
                      }
                      instruction={scanPrompt}
                      isFaceDetected={isFaceDetected}
                      stepVerified={stepVerified}
                    />

                    {cameraLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 text-white rounded-full z-20">
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                        <span className="text-xs font-semibold">Starting camera…</span>
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
                        disabled={cameraLoading || isScanning || isRecordingStep}
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

                  {/* In-Card Error / Notice Banner */}
                  {(failureNotice || authError) && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5 max-w-md mx-auto animate-fade-in text-left">
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-bold">Face Verification Required</strong>
                        <p className="mt-0.5 leading-relaxed">{failureNotice || authError}</p>
                      </div>
                    </div>
                  )}

                  <div className="text-center space-y-3">
                    {livenessChallenge ? (
                      activeActionStep < 4 ? (
                        <div className="space-y-3">
                          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 max-w-md mx-auto flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 animate-pulse" />
                            <div className="text-left">
                              <strong className="block font-bold">Face ID Radial Scanner Active</strong>
                              <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                                Follow the on-screen prompt. Move your head smoothly as the green ticks fill up the circle!
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={handleResetSteps}
                              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restart Scan</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs max-w-md mx-auto flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                            <div className="text-left">
                              <strong className="block font-bold">All 16 Biometric Samples Verified!</strong>
                              <p className="mt-0.5 text-emerald-700 dark:text-emerald-300">
                                Center face (6), {formatAction(livenessChallenge.actions[0]).title} (5), and {formatAction(livenessChallenge.actions[1]).title} (5) captured successfully.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                              onClick={handleSubmitAttendance}
                              className="px-8 py-3.5 rounded-xl font-bold text-xs shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 active:scale-[0.99] cursor-pointer flex items-center gap-2"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Submit Attendance Check-In (16 Samples)</span>
                            </button>
                            <button
                              onClick={handleResetSteps}
                              className="px-4 py-3.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restart Scan</span>
                            </button>
                          </div>
                        </div>
                      )
                    ) : null}
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
                    disabled={profile?.enrollmentStatus !== 'enrolled'}
                    className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 flex-shrink-0 ${profile?.enrollmentStatus === 'enrolled'
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
