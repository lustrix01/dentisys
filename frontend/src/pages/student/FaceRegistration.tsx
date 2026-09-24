import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  RefreshCw,
  FileText,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Trash2,
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
  updateStudentBiometricConsent,
  createBiometricLivenessChallenge,
  submitBiometricEnrollment,
  revokeStudentBiometricProfile,
} from '../../services/apiClient';
import type {
  StudentBiometricProfile,
  LivenessChallengeResponse,
  LivenessAction,
} from '../../types';
import { developmentBiometricOutcome } from '../../services/developmentProviders';
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

function formatAction(action: LivenessAction): { title: string; instruction: string } {
  switch (action) {
    case 'blink':
      return { title: 'Blink Naturally', instruction: 'Blink your eyes naturally while looking at the camera.' };
    case 'turn_left':
      return { title: 'Turn Head Left', instruction: 'Slowly turn your head slightly to the left, then back.' };
    case 'turn_right':
      return { title: 'Turn Head Right', instruction: 'Slowly turn your head slightly to the right, then back.' };
    default:
      return { title: 'Look Forward', instruction: 'Look directly into the camera frame.' };
  }
}

export const FaceRegistration: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students } = useApp();
  const runtimeConfig = useRuntimeConfig();

  const isAuthoritative = canAccessAuthoritativeStudentBiometrics(user);
  const simulationEnabled = !isAuthoritative
    && user?.authentication_source === 'development_mock'
    && runtimeConfig.providers.identity.development_mock.enabled
    && runtimeConfig.providers.biometrics.active === 'development-mock';

  // Current display data
  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentName = user?.display_name || currentStudent?.name || 'Dental Student';
  const studentIdNum = user?.student?.student_number || currentStudent?.studentId || '2023-BU-0142';

  // --- AUTHORITATIVE STATE ---
  const [authLoading, setAuthLoading] = useState<boolean>(isAuthoritative);
  const [profile, setProfile] = useState<StudentBiometricProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<1 | 2 | 3>(1);

  // Step 1: Consent
  const [hasAgreed, setHasAgreed] = useState(false);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);

  // Step 2: Liveness & Capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const selectedCameraIdRef = useRef('');
  const [livenessChallenge, setLivenessChallenge] = useState<LivenessChallengeResponse | null>(null);
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);
  const [serverUsableCount, setServerUsableCount] = useState(0);

  // Step-by-step Gated Biometric Capture State
  const [activeActionStep, setActiveActionStep] = useState<1 | 2 | 3 | 4>(1);
  const [centerFrames, setCenterFrames] = useState<Blob[]>([]);
  const [action1Frames, setAction1Frames] = useState<Blob[]>([]);
  const [action2Frames, setAction2Frames] = useState<Blob[]>([]);
  const [isRecordingStep, setIsRecordingStep] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingStepLabel, setRecordingStepLabel] = useState('');
  const captureAbortRef = useRef<AbortController | null>(null);

  // Automated Real-Time Scanning State
  const [scanPrompt, setScanPrompt] = useState('Position your face inside the oval looking directly at the camera.');
  const [stepVerified, setStepVerified] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);

  const baselineEyeRef = useRef(0.12);
  const isCapturingRef = useRef(false);
  const activeStepRef = useRef(activeActionStep);
  activeStepRef.current = activeActionStep;

  // Revocation Modal
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // --- SIMULATION (MOCK) STATE ---
  const storageKey = `dentisys_face_registered_${currentStudent?.id || '1'}`;
  const timestampKey = `dentisys_face_registered_at_${currentStudent?.id || '1'}`;
  const [mockIsRegistered, setMockIsRegistered] = useState<boolean>(() => {
    return localStorage.getItem(storageKey) === 'true';
  });
  const [mockRegisteredAt, setMockRegisteredAt] = useState<string>(() => {
    return localStorage.getItem(timestampKey) || '';
  });
  const [mockStep, setMockStep] = useState<1 | 2 | 3>(() => {
    return localStorage.getItem(storageKey) === 'true' ? 3 : 1;
  });
  const [mockScanning, setMockScanning] = useState(false);
  const [mockProgress, setMockProgress] = useState(0);

  // --- RESET STEPS HELPER ---
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

  // --- RETAKE STEP HELPER ---
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

  // --- STOP CAMERA HELPER ---
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

  // Teardown camera on unmount or when step changes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Release the hardware camera when this screen is backgrounded or closed.
  // A hidden tab must not retain an active biometric capture stream.
  useEffect(() => {
    const releaseCameraWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') {
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
  }, [stopCamera]);

  // --- LOAD AUTHORITATIVE PROFILE ---
  const loadAuthoritativeProfile = useCallback(async () => {
    if (!isAuthoritative) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const data = await getStudentBiometricProfile();
      setProfile(data);
      if (data.enrollmentStatus === 'enrolled') {
        setAuthStep(3);
        setServerUsableCount(data.usableSampleCount ?? data.requiredUsableSamples ?? 20);
      } else {
        setAuthStep(1);
        setHasAgreed(data.consentGranted);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load biometric profile.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, [isAuthoritative]);

  useEffect(() => {
    if (isAuthoritative) {
      void loadAuthoritativeProfile();
    }
  }, [isAuthoritative, loadAuthoritativeProfile]);

  // --- START CAMERA & CHALLENGE FOR STEP 2 ---
  const startCameraAndChallenge = useCallback(async (requestedCameraId?: string, preserveMessage = false) => {
    setCameraLoading(true);
    setCameraError(null);
    if (!preserveMessage) {
      setAuthError(null);
    }
    handleResetSteps();
    setLivenessChallenge(null);
    stopCamera();
    const abortController = new AbortController();
    cameraAbortRef.current = abortController;
    try {
      // Keep the video element mounted while the asynchronous camera request runs.
      // This prevents a successful stream from being lost during the loading render.
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

      // Request the server challenge only after a usable video source is ready.
      const challenge = await createBiometricLivenessChallenge({ purpose: 'enrollment' });
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
  }, [stopCamera]);

  // Trigger camera setup when entering step 2 in authoritative mode
  useEffect(() => {
    if (isAuthoritative && authStep === 2) {
      void startCameraAndChallenge();
    } else {
      stopCamera();
    }
  }, [isAuthoritative, authStep, startCameraAndChallenge, stopCamera]);

  // --- STEP 1: CONSENT SUBMISSION ---
  const handleProceedToScanAuth = async () => {
    if (!hasAgreed) return;
    setIsSubmittingConsent(true);
    setAuthError(null);
    try {
      await updateStudentBiometricConsent({
        granted: true,
        disclosureVersion: 'v1.0-2026',
      });
      setAuthStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record biometric consent.';
      setAuthError(msg);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  // --- STEP 2: GUIDED FRAME CAPTURE & SERVER ENROLLMENT ---
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

  // --- AUTOMATED REAL-TIME SCANNER LOOP (PHONE FACE ID ACCUMULATOR) ---
  useEffect(() => {
    if (!isAuthoritative || authStep !== 2 || !livenessChallenge || isProcessingEnrollment) {
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

      // Step 1: Center Face (collect 10 frames)
      if (activeStepRef.current === 1) {
        if (analysis.isCentered && (analysis.detectedAction === 'center' || analysis.detectedAction === 'none')) {
          baselineEyeRef.current = Math.max(0.05, analysis.eyeDarkRatio);
          setScanPrompt('Looking straight… hold steady');

          isCapturingRef.current = true;
          try {
            const blob = await captureVideoFrameBlob(video);
            if (blob) {
              setCenterFrames(prev => {
                if (prev.length >= 10) return prev;
                const next = [...prev, blob];
                if (next.length === 10) {
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
      // Step 2: Action 1 (collect 9 frames)
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
                if (prev.length >= 9) return prev;
                const next = [...prev, blob];
                if (next.length === 9) {
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
      // Step 3: Action 2 (collect 9 frames)
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
                if (prev.length >= 9) return prev;
                const next = [...prev, blob];
                if (next.length === 9) {
                  setStepVerified(true);
                  setScanPrompt('✓ All 28 samples verified! Ready to submit.');
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
  }, [isAuthoritative, authStep, livenessChallenge, isProcessingEnrollment]);


  const handleSubmitEnrollment = async () => {
    if (
      !livenessChallenge
      || isProcessingEnrollment
      || isRecordingStep
      || centerFrames.length === 0
      || action1Frames.length === 0
      || action2Frames.length === 0
    ) {
      return;
    }

    const allFrames = [...centerFrames, ...action1Frames, ...action2Frames];
    if (allFrames.length < 20) {
      setAuthError('Not enough frames stored. Please retake the steps.');
      return;
    }

    setIsProcessingEnrollment(true);
    setAuthError(null);

    try {
      const formData = new FormData();
      formData.append('challengeId', livenessChallenge.challengeId);
      formData.append('challenge_id', livenessChallenge.challengeId);
      if (livenessChallenge.challengeToken) {
        formData.append('challengeToken', livenessChallenge.challengeToken);
        formData.append('challenge_token', livenessChallenge.challengeToken);
      }
      const idempotencyKey = crypto.randomUUID();
      formData.append('idempotencyKey', idempotencyKey);
      formData.append('idempotency_key', idempotencyKey);

      allFrames.forEach((blob, idx) => {
        formData.append('frames[]', blob, `sample_${idx}.jpg`);
      });

      const result = await submitBiometricEnrollment(formData);
      setServerUsableCount(result.usableSampleCount);

      if (result.enrollmentStatus === 'enrolled') {
        stopCamera();
        setProfile(prev => prev ? {
          ...prev,
          enrollmentStatus: 'enrolled',
          enrolledAt: result.enrolledAt || new Date().toISOString(),
          expiresAt: result.expiresAt || null,
          usableSampleCount: result.usableSampleCount,
        } : null);
        setAuthStep(3);
      } else {
        setAuthError(result.message || 'Verification could not accept sufficient usable frames. Please retake steps with clear lighting.');
        void startCameraAndChallenge(undefined, true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Facial enrollment failed. Please try again.';
      setAuthError(msg);
      void startCameraAndChallenge(undefined, true);
    } finally {
      setIsProcessingEnrollment(false);
    }
  };

  // Backward compatibility aliases
  const handleCaptureAndEnroll = handleSubmitEnrollment;

  // --- REVOCATION ---
  const handleConfirmRevocation = async () => {
    setIsRevoking(true);
    setAuthError(null);
    try {
      await revokeStudentBiometricProfile();
      setShowRevokeModal(false);
      setProfile(prev => prev ? {
        ...prev,
        enrollmentStatus: 'revoked',
        enrolledAt: null,
        expiresAt: null,
      } : null);
      setAuthStep(1);
      setHasAgreed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke biometric profile.';
      setAuthError(msg);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleStartReEnrollment = () => {
    setAuthStep(1);
    setHasAgreed(false);
    setAuthError(null);
  };

  // --- MOCK PROTOTYPE HANDLERS ---
  const handleMockProceedToScan = () => {
    if (!simulationEnabled || !hasAgreed) return;
    setMockStep(2);
  };

  const handleMockStartCapture = () => {
    if (!simulationEnabled) return;
    setMockScanning(true);
    setMockProgress(0);

    const interval = setInterval(() => {
      setMockProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setMockScanning(false);
          const outcome = developmentBiometricOutcome('enrolled');
          const nowStr = 'Development fixture enrollment';
          localStorage.setItem(storageKey, 'true');
          localStorage.setItem(timestampKey, nowStr);
          setMockIsRegistered(true);
          setMockRegisteredAt(nowStr);
          setMockStep(3);
          void outcome;
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  const handleMockReRegister = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(timestampKey);
    setMockIsRegistered(false);
    setMockRegisteredAt('');
    setHasAgreed(false);
    setMockProgress(0);
    setMockStep(1);
  };

  // --- ACCESS GATING CHECK ---
  if (!isAuthoritative && !simulationEnabled) {
    return <StudentUnavailable title="Face Registration unavailable" />;
  }

  // --- LOADING SCREEN ---
  if (isAuthoritative && authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Loading biometric enrollment status…
        </p>
      </div>
    );
  }

  // Active step for current mode
  const currentStep = isAuthoritative ? authStep : mockStep;
  const isScanning = isRecordingStep || isProcessingEnrollment;
  const captureDisabled = isProcessingEnrollment
    || isRecordingStep
    || mockScanning
    || (isAuthoritative && (cameraLoading || Boolean(cameraError) || !livenessChallenge));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Facial Recognition Registration
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {isAuthoritative
              ? 'Authoritative facial biometric verification for automated clinical attendance check-in.'
              : 'Register your facial biometric model for automated, location-verified attendance check-in.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentIdNum}</span>
          </div>

          {isAuthoritative ? (
            profile?.enrollmentStatus === 'enrolled' && currentStep === 3 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartReEnrollment}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Re-Enroll</span>
                </button>
                <button
                  onClick={() => setShowRevokeModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-xs transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Revoke</span>
                </button>
              </div>
            )
          ) : (
            mockIsRegistered && currentStep === 3 && (
              <button
                onClick={handleMockReRegister}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
              >
                <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Re-Register Face</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Error Banner */}
      {authError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Registration Message</strong>
            <p className="mt-0.5 leading-relaxed">{authError}</p>
          </div>
        </div>
      )}

      {/* Expired Status Banner */}
      {isAuthoritative && profile?.enrollmentStatus === 'expired' && currentStep === 1 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Enrollment Expired for Current Semester</strong>
            <p className="mt-0.5 leading-relaxed">
              Biometric enrollment expires at the end of each semester per institutional policy. Please complete consent and re-enroll your facial reference below.
            </p>
          </div>
        </div>
      )}

      {/* 3-Step Visual Progress Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-3 rounded-2xl border text-center transition-all ${currentStep === 1
          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
          : currentStep > 1
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
          }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 1</span>
          <span className="text-xs font-extrabold block mt-0.5">Privacy Agreement</span>
        </div>

        <div className={`p-3 rounded-2xl border text-center transition-all ${currentStep === 2
          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
          : currentStep > 2
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
          }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 2</span>
          <span className="text-xs font-extrabold block mt-0.5">Liveness & Capture</span>
        </div>

        <div className={`p-3 rounded-2xl border text-center transition-all ${currentStep === 3
          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
          : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
          }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 3</span>
          <span className="text-xs font-extrabold block mt-0.5">Registration Status</span>
        </div>
      </div>

      {/* STEP 1: PRIVACY & DATA CONSENT AGREEMENT */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                Step 1 of 3
              </span>
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                Data Privacy & Facial Biometrics Consent
              </h2>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-800 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>
              In accordance with the <strong className="text-slate-800 dark:text-slate-100">Data Privacy Act of 2012 (Republic Act No. 10173)</strong> and DentiSys institutional policies, please review the statutory consent disclosure below:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-1">
              <li>
                <strong>Strict Attendance-Only Purpose (BIO-001):</strong> Your facial biometric reference is processed solely for 1:1 automated attendance verification in enrolled clinical classes. It is never used for login, identity proofing, or 1:N population discovery.
              </li>
              <li>
                <strong>Protected Reference & Ephemeral Images (BIO-003):</strong> Temporary camera captures are processed in memory to generate an encrypted template and are immediately discarded. Raw facial photographs and video frames are never retained in permanent storage or database backups.
              </li>
              <li>
                <strong>Security at Rest (BIO-004):</strong> Protected references are stored in dedicated storage encrypted using server-controlled AES-256-GCM.
              </li>
              <li>
                <strong>Semester Expiration & Revocation (BIO-005):</strong> Biometric enrollment automatically expires every semester, requiring seasonal re-enrollment. You retain the right to revoke your biometric enrollment at any time from this portal.
              </li>
              <li>
                <strong>Authorized Manual Attendance Guarantee (BIO-002):</strong> Participation is voluntary. Refusal or revocation will never penalize academic standing or attendance credit; authorized manual attendance (Secretary-assisted or Faculty) remains available at all times.
              </li>
            </ul>
          </div>

          {/* Mandatory Agreement Checkbox */}
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex items-start gap-3">
            <input
              type="checkbox"
              id="privacy-consent-checkbox"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <label htmlFor="privacy-consent-checkbox" className="text-xs text-slate-700 dark:text-slate-200 font-medium cursor-pointer leading-snug">
              I have read, understood, and voluntarily agree to the <strong className="text-blue-700 dark:text-blue-300">Facial Recognition and Data Privacy Disclosure</strong>. I consent to enrolling my protected facial reference for automated session attendance check-in.
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={isAuthoritative ? handleProceedToScanAuth : handleMockProceedToScan}
              disabled={!hasAgreed || isSubmittingConsent}
              className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 ${hasAgreed && !isSubmittingConsent
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
            >
              {isSubmittingConsent ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recording Consent…</span>
                </>
              ) : (
                <>
                  <span>Continue to Camera Scan</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CAMERA CAPTURE & LIVENESS */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                  Step 2 of 3
                </span>
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                  Facial Alignment & Active Liveness
                </h2>
              </div>
            </div>

            <button
              onClick={() => {
                stopCamera();
                if (isAuthoritative) setAuthStep(1);
                else setMockStep(1);
              }}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Back to Terms
            </button>
          </div>

          <div className="space-y-4">
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

              {cameraLoading && (
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>Requesting camera access and preparing the liveness challenge…</span>
                </div>
              )}

              {/* Server Liveness Instructions (Authoritative) */}
              {isAuthoritative && livenessChallenge && (() => {
                const act1 = formatAction(livenessChallenge.actions[0]);
                const act2 = formatAction(livenessChallenge.actions[1]);
                const totalStored = centerFrames.length + action1Frames.length + action2Frames.length;

                return (
                  <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        Gated Liveness Sequence (Stored: {totalStored} / 30 Samples)
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
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
                      {/* Phase 1 Pill */}
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

                      {/* Phase 2 Pill */}
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

                      {/* Phase 3 Pill */}
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
                  totalTicks={28}
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

              {/* Server Usable Sample Progress Notice */}
              {isAuthoritative && serverUsableCount > 0 && (
                <div className="text-center text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Server confirmed usable samples: {serverUsableCount} / 20
                </div>
              )}

              {isAuthoritative && cameraDevices.length > 1 && (
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
                    disabled={cameraLoading || isProcessingEnrollment || isRecordingStep}
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

              {/* In-Card Error Notice */}
              {authError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5 max-w-md mx-auto animate-fade-in text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Face Detection Required</strong>
                    <p className="mt-0.5 leading-relaxed">{authError}</p>
                  </div>
                </div>
              )}

              <div className="text-center space-y-3">
                {isAuthoritative && livenessChallenge ? (
                  isProcessingEnrollment ? (
                    <button
                      disabled
                      className="px-8 py-3 rounded-xl font-bold text-xs bg-blue-500 text-white shadow-md flex items-center gap-2 mx-auto cursor-wait opacity-80"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting 28 biometric samples to server…</span>
                    </button>
                  ) : activeActionStep < 4 ? (
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
                          <strong className="block font-bold">All 28 Biometric Samples Verified!</strong>
                          <p className="mt-0.5 text-emerald-700 dark:text-emerald-300">
                            Center face (10), {formatAction(livenessChallenge.actions[0]).title} (9), and {formatAction(livenessChallenge.actions[1]).title} (9) captured successfully.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          onClick={handleSubmitEnrollment}
                          disabled={captureDisabled}
                          className="px-8 py-3.5 rounded-xl font-bold text-xs shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 active:scale-[0.99] cursor-pointer flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submit Facial Enrollment (28 Samples)</span>
                        </button>
                        <button
                          onClick={handleResetSteps}
                          disabled={captureDisabled}
                          className="px-4 py-3.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restart Scan</span>
                        </button>
                      </div>
                    </div>
                  )
                ) : !isAuthoritative ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ensure good lighting, look directly into the camera, and follow the liveness prompt above.
                    </p>
                    <button
                      onClick={handleMockStartCapture}
                      disabled={captureDisabled}
                      className={`px-8 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 mx-auto ${
                        captureDisabled
                          ? 'bg-blue-400 text-white cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                      }`}
                    >
                      {mockScanning ? <span>Scanning...</span> : <span>Capture & Submit Enrollment</span>}
                    </button>
                  </div>
                ) : null}
              </div>
          </div>
        </div>
      )}

      {/* STEP 3: SUCCESSFUL REGISTRATION NOTIFICATION & AUDIT */}
      {currentStep === 3 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">
                Biometric Registration Active
              </span>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                Facial Biometric Reference Enrolled & Active
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student Name</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">{studentName}</span>
              <span className="text-xs text-slate-500 font-mono">ID: {studentIdNum}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registration Date</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                {isAuthoritative
                  ? (profile?.enrolledAt ? new Date(profile.enrolledAt).toLocaleDateString() : 'Active')
                  : (mockRegisteredAt || 'Active Session')}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Status: Active ✓</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Semester Expiration</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                {isAuthoritative
                  ? (profile?.expiresAt ? new Date(profile.expiresAt).toLocaleDateString() : 'End of Semester')
                  : 'End of Semester'}
              </span>
              <span className="text-[10px] text-slate-400">Expires seasonally</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-0.5 text-center sm:text-left">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Ready for Daily Session Check-In
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You can now submit attendance for active clinical sessions using facial verification and location check.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isAuthoritative ? (
                <>
                  <button
                    onClick={handleStartReEnrollment}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
                  >
                    Re-Enroll
                  </button>
                  <button
                    onClick={() => navigate('/student/attendance')}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                  >
                    <span>Go to Daily Attendance</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleMockReRegister}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
                  >
                    Re-Register Face
                  </button>
                  <button
                    onClick={() => navigate('/student/attendance')}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                  >
                    <span>Go to Daily Attendance</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REVOCATION CONFIRMATION MODAL */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                Revoke Biometric Enrollment?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to revoke your facial biometric registration? Your encrypted reference model will be permanently deleted from biometric storage.
            </p>

            <p className="text-xs text-slate-500 leading-relaxed">
              Past verified attendance records will remain preserved. You will need to re-enroll or use Secretary/Faculty manual attendance for future sessions.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowRevokeModal(false)}
                disabled={isRevoking}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleConfirmRevocation(); }}
                disabled={isRevoking}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer"
              >
                {isRevoking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking…</span>
                  </>
                ) : (
                  <span>Yes, Revoke Enrollment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
