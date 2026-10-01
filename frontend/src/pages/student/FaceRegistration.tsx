import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  RefreshCw,
  FileText,
  ArrowRight,
  AlertCircle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { canAccessAuthoritativeStudentBiometrics } from './studentGates';
import { StudentUnavailable } from './RealStudentSurfaces';
import {
  getStudentBiometricProfile,
  updateStudentBiometricConsent,
  createBiometricLivenessChallenge,
  requestBiometricLivenessGuidance,
  submitBiometricEnrollment,
  revokeStudentBiometricProfile,
  isTransportOrBiometricUnavailable,
} from '../../services/apiClient';
import {
  type StudentBiometricProfile,
  type LivenessChallengeResponse,
  type LivenessAction,
  isAuthoritativeActiveEnrolled,
} from '../../types';
import { developmentBiometricOutcome } from '../../services/developmentProviders';
import {
  describeCameraError,
  listCameraDevices,
  startCameraStream,
  type CameraDevice,
} from '../../utils/camera';
import {
  runGuidedCapture,
  type GuidanceIssue,
  type GuidedCapturePhase,
} from '../../utils/guidedCapture';
import { GuidedCaptureStatus } from '../../components/GuidedCaptureStatus';
import { playGuidanceSuccessTone, primeGuidanceAudio } from '../../utils/guidanceAudio';

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

interface PendingEnrollmentPayload {
  challengeId: string;
  challengeToken: string;
  idempotencyKey: string;
  frames: Blob[];
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
  const studentIdNum = user?.student?.student_number || currentStudent?.studentId || '—';

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
  const guidanceAbortRef = useRef<AbortController | null>(null);
  const captureRunRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const abortCaptureRef = useRef<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const selectedCameraIdRef = useRef('');
  const [livenessChallenge, setLivenessChallenge] = useState<LivenessChallengeResponse | null>(null);
  const [isProcessingEnrollment, setIsProcessingEnrollment] = useState(false);
  const [serverUsableCount, setServerUsableCount] = useState(0);

  // Guided Multi-Phase Capture & Retry State
  const [capturePhase, setCapturePhase] = useState<GuidedCapturePhase>('idle');
  const [capturedFrameCount, setCapturedFrameCount] = useState<number>(0);
  const [phaseInstruction, setPhaseInstruction] = useState<string>('');
  const [lastActionSuccess, setLastActionSuccess] = useState<string | null>(null);
  const [captureIssue, setCaptureIssue] = useState<GuidanceIssue | null>(null);
  const [pendingPayload, setPendingPayload] = useState<PendingEnrollmentPayload | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState<boolean>(false);

  // Revocation Modal
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // --- SIMULATION (MOCK) STATE ---
  const storageKey = `dentisys_face_registered_${currentStudent?.id || '1'}`;
  const timestampKey = `dentisys_face_registered_at_${currentStudent?.id || '1'}`;
  const [, setMockIsRegistered] = useState<boolean>(() => {
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

  // --- STOP CAMERA HELPER ---
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

  // Teardown camera and abort in-flight capture/upload on unmount
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

  // Release the hardware camera and abort capture when this screen is backgrounded or closed.
  useEffect(() => {
    const handleVisibilityOrPageHide = (): void => {
      if (document.visibilityState === 'hidden') {
        abortCaptureRef.current = true;
        captureRunRef.current += 1;
        guidanceAbortRef.current?.abort();
        guidanceAbortRef.current = null;
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        stopCamera();
        setCapturePhase('idle');
        setIsProcessingEnrollment(false);
        // Keep the in-memory payload and idempotency key while PHP/sidecar
        // work may still commit after the browser aborts. Raw frames never
        // enter persistent browser storage.
        setCanRetryUpload(Boolean(pendingPayload));
        setLivenessChallenge(null);
        setCameraLoading(false);
        setCameraError('Camera access and capture were paused because this tab is no longer active. Choose Retry Camera Access when you return.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
      window.removeEventListener('pagehide', handleVisibilityOrPageHide);
    };
  }, [pendingPayload, stopCamera]);

  // --- LOAD AUTHORITATIVE PROFILE ---
  const loadAuthoritativeProfile = useCallback(async () => {
    if (!isAuthoritative) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const data = await getStudentBiometricProfile();
      setProfile(data);
      if (isAuthoritativeActiveEnrolled(data.enrollmentStatus)) {
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
        disclosureVersion: 'v1.1-2026-09',
      });
      setAuthStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record biometric consent.';
      setAuthError(msg);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  // --- STEP 2: GUIDED MULTI-PHASE FRAME CAPTURE & SERVER ENROLLMENT ---
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

  const buildEnrollmentFormData = (payload: PendingEnrollmentPayload): FormData => {
    const formData = new FormData();
    formData.append('challengeId', payload.challengeId);
    formData.append('challenge_id', payload.challengeId);
    formData.append('challengeToken', payload.challengeToken);
    formData.append('challenge_token', payload.challengeToken);
    formData.append('idempotencyKey', payload.idempotencyKey);
    formData.append('idempotency_key', payload.idempotencyKey);
    payload.frames.forEach((blob, idx) => {
      formData.append('frames[]', blob, `sample_${idx}.jpg`);
    });
    return formData;
  };

  const uploadEnrollment = async (payload: PendingEnrollmentPayload) => {
    setIsProcessingEnrollment(true);
    setCapturePhase('uploading');
    setPhaseInstruction('Submitting candidate frames to server for verification…');
    setAuthError(null);

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    setPendingPayload(payload);

    try {
      const result = await submitBiometricEnrollment(buildEnrollmentFormData(payload), abortController.signal);

      setServerUsableCount(result.usableSampleCount);
      setPendingPayload(null);
      setCanRetryUpload(false);

      if (isAuthoritativeActiveEnrolled(result.enrollmentStatus)) {
        stopCamera();
        setProfile(prev => prev ? {
          ...prev,
          enrollmentStatus: 'active',
          enrolledAt: result.enrolledAt || new Date().toISOString(),
          expiresAt: result.expiresAt || null,
          usableSampleCount: result.usableSampleCount,
        } : null);
        setAuthStep(3);
      } else {
        setAuthError(result.message || 'Verification could not accept sufficient usable frames. Please adjust lighting and try again, or seek manual attendance check-in from your Secretary or Instructor.');
        setPendingPayload(null);
        setCanRetryUpload(false);
        void startCameraAndChallenge(undefined, true);
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        setCanRetryUpload(true);
        setAuthError('The browser stopped waiting, but the server may still be completing enrollment. Reconcile the profile before starting a fresh capture.');
        return;
      }
      if (isTransportOrBiometricUnavailable(err)) {
        // Transport, network, or 503 error: preserve payload & idempotency key for retry
        setPendingPayload(payload);
        setCanRetryUpload(true);
        const msg = err instanceof Error ? err.message : 'Network or biometric service is temporarily unavailable.';
        setAuthError(`${msg} Your captured frames and server challenge are preserved. Click "Retry Upload" to resubmit with the same idempotency key, or seek manual attendance from your Secretary or Instructor.`);
      } else {
        // Semantic failure or quality rejection: discard and request fresh challenge
        setPendingPayload(null);
        setCanRetryUpload(false);
        const msg = err instanceof Error ? err.message : 'Facial enrollment failed.';
        setAuthError(`${msg} Please adjust lighting, face the camera directly, and start a fresh capture, or contact your Course Instructor/Secretary for manual attendance.`);
        void startCameraAndChallenge(undefined, true);
      }
    } finally {
      uploadAbortRef.current = null;
      setIsProcessingEnrollment(false);
      setCapturePhase('idle');
    }
  };

  const handleStartGuidedCapture = async () => {
    if (!livenessChallenge || isProcessingEnrollment || capturePhase !== 'idle') return;

    if (livenessChallenge.expiresAt) {
      const expiryMs = new Date(livenessChallenge.expiresAt).getTime();
      if (Number.isFinite(expiryMs) && Date.now() >= expiryMs) {
        setAuthError('Liveness challenge has expired. Requesting a fresh challenge…');
        void startCameraAndChallenge(undefined, true);
        return;
      }
    }

    setPendingPayload(null);
    setCanRetryUpload(false);
    setAuthError(null);
    abortCaptureRef.current = false;
    const runId = captureRunRef.current + 1;
    captureRunRef.current = runId;
    guidanceAbortRef.current?.abort();
    const guidanceAbortController = new AbortController();
    guidanceAbortRef.current = guidanceAbortController;
    primeGuidanceAudio();
    setCapturedFrameCount(0);

    setLastActionSuccess(null);
    const isRunActive = (): boolean => captureRunRef.current === runId && !abortCaptureRef.current;
    try {
      setCaptureIssue(null);
      const result = await runGuidedCapture({
        actions: livenessChallenge.actions,
        targetFrames: 30,
        deadlineMs: livenessChallenge.expiresAt
          ? new Date(livenessChallenge.expiresAt).getTime() - 5000
          : undefined,
        onIssue: (issue) => {
          if (!isRunActive()) return;
          setCaptureIssue(issue);
        },
        captureFrame: captureSingleFrame,
        analyzeFrame: async (frame) => {
          const formData = new FormData();
          formData.append('purpose', 'enrollment');
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
        onActionSuccess: (_index, action) => {
          if (!isRunActive()) return;
          setLastActionSuccess(formatAction(action).title);
          playGuidanceSuccessTone();
        },
      });

      if (!isRunActive()) return;
      setCaptureIssue(null);
      if (result.status === 'cancelled') return;
      if (result.status === 'timeout') {
        if (result.reason === 'challenge_expired') {
          setAuthError('The time limit for this attempt was reached. A new attempt is ready — press Start when you are set.');
          setCapturePhase('idle');
          setPhaseInstruction('');
          void startCameraAndChallenge(undefined, true);
          return;
        }
        setAuthError(result.reason === 'face_not_detected'
          ? 'Your face was not detected in the camera frames. Center your face in the guide and retry the guided capture.'
          : result.reason === 'camera_frame_unavailable'
            ? 'The camera did not provide usable frames. Check camera access and retry the guided capture.'
            : result.reason === 'frames_not_usable'
              ? 'The camera image was too blurry or dark to use. Face a light source and retry the guided capture.'
              : `No ${formatAction(result.expectedAction).title.toLowerCase()} was observed. Follow the prompt and retry the guided capture.`);
        setCapturePhase('idle');
        setPhaseInstruction('');
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      await uploadEnrollment({
        challengeId: livenessChallenge.challengeId,
        challengeToken: livenessChallenge.challengeToken,
        idempotencyKey,
        frames: result.frames,
      });
    } catch (err) {
      if (!isRunActive()) return;
      const msg = err instanceof Error ? err.message : 'Live camera guidance is temporarily unavailable.';
      setAuthError(`${msg} Please retry the guided capture or use manual attendance assistance.`);
      setCapturePhase('idle');
      setPhaseInstruction('');
    } finally {
      if (captureRunRef.current === runId) {
        guidanceAbortRef.current = null;
      }
    }
  };

  const handleCancelCapture = () => {
    const submissionInFlight = Boolean(uploadAbortRef.current || pendingPayload);
    abortCaptureRef.current = true;
    captureRunRef.current += 1;
    guidanceAbortRef.current?.abort();
    guidanceAbortRef.current = null;
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setIsProcessingEnrollment(false);
    setCapturePhase('idle');
    setCapturedFrameCount(0);
    setLastActionSuccess(null);
    setCaptureIssue(null);
    if (submissionInFlight) {
      // Preserve the same in-memory operation because the server may have
      // committed before the browser observed the abort.
      setCanRetryUpload(true);
      setAuthError('Submission cancelled locally. The server may still be processing it; retry with the existing operation or return to reconcile it.');
      return;
    }
    setPendingPayload(null);
    setCanRetryUpload(false);
    setAuthError('Capture cancelled.');
    void startCameraAndChallenge(undefined, true);
  };

  const handleRetryUpload = () => {
    if (!pendingPayload) return;
    void uploadEnrollment(pendingPayload);
  };

  const reconcilePendingEnrollment = useCallback(async (): Promise<boolean> => {
    if (!pendingPayload) return false;
    setIsProcessingEnrollment(true);
    setCapturePhase('uploading');
    setPhaseInstruction('Checking the server for the preserved enrollment operation…');
    try {
      // Re-submit the same operation so the server can return its idempotent
      // result. A separate profile read cannot distinguish this operation
      // from an older active enrollment that was already on the account.
      const result = await submitBiometricEnrollment(buildEnrollmentFormData(pendingPayload));
      setServerUsableCount(result.usableSampleCount);
      if (isAuthoritativeActiveEnrolled(result.enrollmentStatus)) {
        setPendingPayload(null);
        setCanRetryUpload(false);
        setProfile(prev => prev ? {
          ...prev,
          enrollmentStatus: 'active',
          enrolledAt: result.enrolledAt || prev.enrolledAt,
          expiresAt: result.expiresAt || prev.expiresAt,
          usableSampleCount: result.usableSampleCount,
        } : prev);
        setAuthStep(3);
        stopCamera();
        return true;
      }
      setAuthError(result.message || 'The preserved enrollment operation did not complete. Retry the upload or start a fresh capture.');
    } catch {
      // Keep the operation payload so the user can retry with the same key.
    } finally {
      setIsProcessingEnrollment(false);
      setCapturePhase('idle');
    }
    return false;
  }, [pendingPayload, stopCamera]);

  useEffect(() => {
    const reconcileOnReturn = (): void => {
      if (document.visibilityState === 'visible' && pendingPayload) {
        void reconcilePendingEnrollment();
      }
    };
    document.addEventListener('visibilitychange', reconcileOnReturn);
    return () => document.removeEventListener('visibilitychange', reconcileOnReturn);
  }, [pendingPayload, reconcilePendingEnrollment]);

  const handleDiscardAndRecapture = async () => {
    if (await reconcilePendingEnrollment()) return;
    setPendingPayload(null);
    setCanRetryUpload(false);
    setCapturedFrameCount(0);
    setAuthError(null);
    void startCameraAndChallenge(undefined, true);
  };

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
  const captureDisabled = isProcessingEnrollment
    || mockScanning
    || capturePhase !== 'idle'
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

      {/* 3-Step Visual Progress Bar (hidden once registered) */}
      {currentStep !== 3 && (
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

        <div className="p-3 rounded-2xl border text-center transition-all bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 3</span>
          <span className="text-xs font-extrabold block mt-0.5">Registration Status</span>
        </div>
      </div>
      )}

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
                <strong>Attendance-only purpose:</strong> Your face is used only to confirm your own attendance in your enrolled classes (a one-to-one check against your own reference). It is never used for sign-in, identity checks, or searching for other people.
              </li>
              <li>
                <strong>What is processed:</strong> Short camera captures of your face taken during enrollment and attendance check-in, and the facial measurements derived from them.
              </li>
              <li>
                <strong>No raw images kept:</strong> Camera captures are processed temporarily and then discarded. Raw photos and video frames are never stored.
              </li>
              <li>
                <strong>Protected reference:</strong> An encrypted reference derived from your enrollment is kept so attendance can be checked. It expires every semester, and you must re-enroll to keep using face check-in.
              </li>
              <li>
                <strong>Revocation and deletion:</strong> You may revoke at any time on this page. Your reference is deleted when you revoke, when the Dean revokes your enrollment, when you re-enroll (the old reference is replaced), when it expires at the end of the semester, when your Student account becomes inactive, or when your account is deleted.
              </li>
              <li>
                <strong>Who can see your enrollment status:</strong> You, the Faculty of your classes, and the Dean can see whether you are enrolled. No one can see your reference or camera captures.
              </li>
              <li>
                <strong>Manual attendance alternative:</strong> Face check-in is voluntary. If you refuse, revoke, or cannot use it, authorized manual attendance by your Class Secretary or Faculty remains available, and it never affects your standing.
              </li>
              <li>
                <strong>Your attendance history stays:</strong> Revoking or deleting your reference does not erase attendance already recorded.
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

              {/* Video Element Viewport */}
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

                {/* Face Alignment Target Oval Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-52 h-64 rounded-[50%] border-2 transition-all ${isProcessingEnrollment || mockScanning || capturePhase !== 'idle'
                    ? 'border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.5)]'
                    : 'border-white/60 border-dashed'
                    }`} />
                </div>

                {/* Mock Scanning Overlay */}
                {!isAuthoritative && mockScanning && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-4 text-center text-white space-y-1.5">
                    <p className="text-xs font-bold animate-pulse flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Extracting Facial Feature Vector... {mockProgress}%
                    </p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${mockProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Capture progress and warnings sit below the preview so the face stays visible. */}
              {isAuthoritative && (
                <GuidedCaptureStatus
                  phase={capturePhase}
                  actions={livenessChallenge?.actions ?? null}
                  instruction={phaseInstruction}
                  lastActionSuccess={lastActionSuccess}
                  issue={captureIssue}
                  capturedCount={capturedFrameCount}
                  totalCount={30}
                  uploadingLabel="Submitting samples for verification"
                />
              )}

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
                    disabled={cameraLoading || isProcessingEnrollment || capturePhase !== 'idle'}
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

              {/* Preserved Retry Upload Card */}
              {isAuthoritative && canRetryUpload && pendingPayload && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Network or Biometric Service Disruption</strong>
                      <p className="mt-0.5 leading-relaxed">
                        Your captured candidate frames and server challenge session have been preserved. You can retry submission with the same idempotency key without re-capturing.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      onClick={handleDiscardAndRecapture}
                      disabled={isProcessingEnrollment}
                      className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                    >
                      Discard & Fresh Capture
                    </button>
                    <button
                      onClick={handleRetryUpload}
                      disabled={isProcessingEnrollment}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      {isProcessingEnrollment ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Retrying Upload…</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Upload</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ensure good lighting, look directly into the camera, and follow the paced liveness instructions.
                </p>

                <div className="flex items-center justify-center gap-3">
                  {isAuthoritative && capturePhase !== 'idle' && (
                    <button
                      onClick={handleCancelCapture}
                      className="px-5 py-3 rounded-xl font-bold text-xs border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                    >
                      Cancel Capture
                    </button>
                  )}

                  {!canRetryUpload && (
                    <button
                      onClick={isAuthoritative ? handleStartGuidedCapture : handleMockStartCapture}
                      disabled={captureDisabled}
                      className={`px-8 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 ${captureDisabled
                        ? 'bg-blue-400 text-white cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                        }`}
                    >
                      {isProcessingEnrollment ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying with Server…</span>
                        </>
                      ) : capturePhase !== 'idle' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Paced Capture Active…</span>
                        </>
                      ) : mockScanning ? (
                        <span>Scanning...</span>
                      ) : isAuthoritative ? (
                        <span>Start Guided Biometric Capture (up to 30 Frames)</span>
                      ) : (
                        <span>Capture & Submit Enrollment</span>
                      )}
                    </button>
                  )}
                </div>
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
                Registered
              </span>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                Your face is registered for attendance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                No further action is needed. To register again, revoke this registration first.
              </p>
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
                    onClick={() => setShowRevokeModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Revoke Registration
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
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Revoke Registration
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
                Revoke Face Registration?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to revoke your facial biometric registration? Your encrypted reference model will be permanently deleted from biometric storage.
            </p>

            <p className="text-xs text-slate-500 leading-relaxed">
              Past verified attendance records will remain preserved. After revoking you can register again from this page, or use Secretary/Faculty manual attendance for future sessions.
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
                  <span>Yes, Revoke Registration</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
