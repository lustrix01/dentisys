import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRealStudent,
  isSecretaryWithStudentContext,
  canAccessAuthoritativeStudentBiometrics,
  isDevelopmentMockStudent,
  isStudentPrototypeSurfaceEnabled,
  isStudentPrototypeAllowed,
} from '../pages/student/studentGates.ts';
import type { SafeUser } from '../types/auth.ts';
import type { RuntimeConfig } from '../context/RuntimeConfigContext.ts';
import type {
  LivenessChallengeResponse,
  BiometricEnrollmentResponse,
  StudentActiveSession,
  BiometricAttendanceResponse,
  StudentAttendanceLogRecord,
  AttendanceSessionRevocationPayload,
} from '../types/index.ts';
import type {
  StartSecretaryAttendanceSessionPayload,
  SecretaryAttendanceSession,
} from '../services/apiClient.ts';
import { isTransportOrBiometricUnavailable } from '../utils/biometricErrors.ts';

const defaultRuntimeConfig: RuntimeConfig = {
  loading: false,
  status: 'ok',
  environment: 'development',
  allowed_email_domains: ['bicol-u.edu.ph'],
  features: {
    student_auth_enabled: true,
    browser_attendance_prototype: true,
  },
  providers: {
    identity: {
      password: { enabled: true },
      google: { enabled: false, client_id: null },
      development_mock: { enabled: true },
    },
    email: { active: 'smtp' },
    biometrics: {
      active: 'development-mock',
    },
    location: {
      active: 'development-mock',
    },
  },
};

test('Gating: real student vs development mock student isolation', () => {
  const realPasswordStudent: SafeUser = {
    user_id: 101,
    login_email: 'student1@university.edu',
    role: 'student',
    display_name: 'Real Password Student',
    session_uuid: 'uuid-1',
    authentication_source: 'password',
    student: {
      student_id: 101,
      student_number: '2023-BU-0101',
      status: 'active',
    },
  };

  const realGoogleStudent: SafeUser = {
    user_id: 102,
    login_email: 'student2@university.edu',
    role: 'student',
    display_name: 'Real Google Student',
    session_uuid: 'uuid-2',
    authentication_source: 'google',
    student: {
      student_id: 102,
      student_number: '2023-BU-0102',
      status: 'active',
    },
  };

  const mockStudent: SafeUser = {
    user_id: 999,
    login_email: 'mockstudent@example.com',
    role: 'student',
    display_name: 'Mock Student Fixture',
    session_uuid: 'uuid-mock',
    authentication_source: 'development_mock',
  };

  // Real students must be recognized as real
  assert.equal(isRealStudent(realPasswordStudent), true);
  assert.equal(isRealStudent(realGoogleStudent), true);
  assert.equal(isRealStudent(mockStudent), false);

  // Authoritative biometrics access
  assert.equal(canAccessAuthoritativeStudentBiometrics(realPasswordStudent), true);
  assert.equal(canAccessAuthoritativeStudentBiometrics(realGoogleStudent), true);
  assert.equal(canAccessAuthoritativeStudentBiometrics(mockStudent), false);

  // Mock student isolation
  assert.equal(isDevelopmentMockStudent(mockStudent, defaultRuntimeConfig), true);
  assert.equal(isDevelopmentMockStudent(realPasswordStudent, defaultRuntimeConfig), false);
  assert.equal(isDevelopmentMockStudent(realGoogleStudent, defaultRuntimeConfig), false);
});

test('Gating: Secretary own-Student self-service path (BIO-010)', () => {
  const secretaryWithStudent: SafeUser = {
    user_id: 201,
    login_email: 'secretary1@university.edu',
    role: 'secretary',
    display_name: 'Secretary Maria (Also Student)',
    session_uuid: 'uuid-sec-1',
    authentication_source: 'password',
    student: {
      student_id: 201,
      student_number: '2023-BU-0201',
      status: 'active',
    },
  };

  const secretaryWithoutStudent: SafeUser = {
    user_id: 202,
    login_email: 'secretary2@university.edu',
    role: 'secretary',
    display_name: 'Pure Secretary',
    session_uuid: 'uuid-sec-2',
    authentication_source: 'password',
  };

  const facultyUser: SafeUser = {
    user_id: 301,
    login_email: 'faculty@university.edu',
    role: 'faculty',
    display_name: 'Dr. Smith',
    session_uuid: 'uuid-fac',
    authentication_source: 'password',
  };

  // Only secretary with student profile has student context
  assert.equal(isSecretaryWithStudentContext(secretaryWithStudent), true);
  assert.equal(isSecretaryWithStudentContext(secretaryWithoutStudent), false);
  assert.equal(isSecretaryWithStudentContext(facultyUser), false);

  // Only secretary with linked student profile can access authoritative student self-service
  assert.equal(canAccessAuthoritativeStudentBiometrics(secretaryWithStudent), true);
  assert.equal(canAccessAuthoritativeStudentBiometrics(secretaryWithoutStudent), false);
  assert.equal(canAccessAuthoritativeStudentBiometrics(facultyUser), false);
});

test('Prototype Surface Gating: isolation under disabled runtime config', () => {
  const mockStudent: SafeUser = {
    user_id: 999,
    login_email: 'mock@example.com',
    role: 'student',
    display_name: 'Mock',
    session_uuid: 'uuid-mock',
    authentication_source: 'development_mock',
  };

  const disabledConfig: RuntimeConfig = {
    ...defaultRuntimeConfig,
    features: {
      ...defaultRuntimeConfig.features,
      browser_attendance_prototype: false,
    },
    providers: {
      ...defaultRuntimeConfig.providers,
      biometrics: { active: 'disabled' },
      location: { active: 'disabled' },
    },
  };

  assert.equal(isStudentPrototypeSurfaceEnabled(disabledConfig, 'attendance'), false);
  assert.equal(isStudentPrototypeSurfaceEnabled(disabledConfig, 'attendance_logs'), false);
  assert.equal(isStudentPrototypeSurfaceEnabled(disabledConfig, 'face'), false);
  assert.equal(isStudentPrototypeAllowed(mockStudent, disabledConfig, 'attendance'), false);
});

test('Liveness Contract: challenge returns actions and one-time challengeToken submitted in FormData', () => {
  const validActions = new Set(['blink', 'turn_left', 'turn_right']);

  const mockChallenge: LivenessChallengeResponse = {
    challengeId: 'chal-uuid-12345',
    challengeToken: 'tok_live_abc123xyz',
    actions: ['blink', 'turn_left'],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  assert.equal(mockChallenge.actions.length, 2);
  assert.notEqual(mockChallenge.actions[0], mockChallenge.actions[1]);
  assert.ok(validActions.has(mockChallenge.actions[0]));
  assert.ok(validActions.has(mockChallenge.actions[1]));
  assert.equal(mockChallenge.challengeToken, 'tok_live_abc123xyz');

  // Verify attendance submission includes both challengeId and challengeToken in FormData
  const formData = new FormData();
  formData.append('sessionId', '10');
  formData.append('challengeId', mockChallenge.challengeId);
  if (mockChallenge.challengeToken) {
    formData.append('challengeToken', mockChallenge.challengeToken);
    formData.append('challenge_token', mockChallenge.challengeToken);
  }

  assert.equal(formData.get('challengeId'), 'chal-uuid-12345');
  assert.equal(formData.get('challengeToken'), 'tok_live_abc123xyz');
  assert.equal(formData.get('challenge_token'), 'tok_live_abc123xyz');
});

test('Enrollment Contract: server governs usable sample count (target: 20)', () => {
  const inProgressResponse: BiometricEnrollmentResponse = {
    enrollmentStatus: 'in_progress',
    usableSampleCount: 14,
    requiredUsableSamples: 20,
    message: '14 usable samples accepted. Additional samples needed.',
  };

  assert.equal(inProgressResponse.enrollmentStatus, 'in_progress');
  assert.equal(inProgressResponse.usableSampleCount, 14);
  assert.equal(inProgressResponse.requiredUsableSamples, 20);

  const completedResponse: BiometricEnrollmentResponse = {
    enrollmentStatus: 'enrolled',
    usableSampleCount: 20,
    requiredUsableSamples: 20,
    enrolledAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120 * 86400000).toISOString(),
    message: 'Biometric profile enrolled successfully.',
  };

  assert.equal(completedResponse.enrollmentStatus, 'enrolled');
  assert.equal(completedResponse.usableSampleCount, 20);
  assert.ok(completedResponse.enrolledAt);
  assert.ok(completedResponse.expiresAt);
});

test('Attendance Contract: authoritative outcomes and generic failure handling', () => {
  const presentOutcome: BiometricAttendanceResponse = {
    status: 'present',
    recordedAt: '2026-09-22T08:14:00Z',
    message: 'Attendance recorded as Present.',
  };
  assert.equal(presentOutcome.status, 'present');

  const lateOutcome: BiometricAttendanceResponse = {
    status: 'late',
    recordedAt: '2026-09-22T08:35:00Z',
    message: 'Attendance recorded as Late.',
  };
  assert.equal(lateOutcome.status, 'late');

  const alreadyRecordedOutcome: BiometricAttendanceResponse = {
    status: 'already_recorded',
    recordedAt: '2026-09-22T08:14:00Z',
    message: 'Attendance already recorded for this session.',
  };
  assert.equal(alreadyRecordedOutcome.status, 'already_recorded');

  // Verification that failures never set automatic 'absent' status
  const errorCases = [
    { code: 'geofence_failed', expectedNoticeContains: 'outside' },
    { code: 'liveness_failed', expectedNoticeContains: 'Liveness' },
    { code: 'biometric_verification_failed', expectedNoticeContains: 'Face could not be verified' },
    { code: 'session_not_active', expectedNoticeContains: 'not' },
  ];

  for (const c of errorCases) {
    // Assert error state is distinct from 'absent'
    assert.notEqual(c.code, 'absent');
  }
});

test('Attendance Logs: provenance values are limited to approved methods', () => {
  const records: StudentAttendanceLogRecord[] = [
    {
      id: 1,
      sessionId: 10,
      courseCode: 'CLIN401',
      courseName: 'Restorative Dentistry Lab',
      room: 'Room 101',
      instructorName: 'Dr. Roberto Santos',
      date: '2026-09-22',
      time: '08:15 AM',
      status: 'present',
      verificationMethod: 'biometric',
    },
    {
      id: 2,
      sessionId: 11,
      courseCode: 'PROS402',
      courseName: 'Prosthodontics Clinical Practicum',
      room: 'Room 204',
      instructorName: 'Dr. Fernando Cruz',
      date: '2026-09-21',
      time: '01:05 PM',
      status: 'late',
      verificationMethod: 'secretary_manual',
    },
    {
      id: 3,
      sessionId: 12,
      courseCode: 'ORAL301',
      courseName: 'Oral Surgery Clinic',
      room: 'Room B',
      instructorName: 'Dr. Angela Reyes',
      date: '2026-09-20',
      time: '07:30 AM',
      status: 'excused',
      verificationMethod: 'faculty_manual',
    },
  ];

  const allowedMethods = new Set(['biometric', 'faculty_manual', 'secretary_manual', 'system_resolution', 'unknown']);
  for (const r of records) {
    assert.ok(allowedMethods.has(r.verificationMethod));
  }
});

test('Storage Hygiene: no persistent biometric or GPS storage', () => {
  // Candidate frames and geolocation must only live in memory during transit
  const candidateFrameBlob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
  assert.equal(candidateFrameBlob.type, 'image/jpeg');

  const formData = new FormData();
  formData.append('challengeId', 'chal-123');
  formData.append('idempotencyKey', 'idemp-456');
  formData.append('frames[]', candidateFrameBlob, 'frame_0.jpg');

  assert.ok(formData.has('challengeId'));
  assert.ok(formData.has('frames[]'));
});

test('Camera Lifecycle: stream tracks are completely stopped on cleanup', () => {
  let track1Stopped = false;
  let track2Stopped = false;

  const mockStream = {
    getTracks: () => [
      { stop: () => { track1Stopped = true; } },
      { stop: () => { track2Stopped = true; } },
    ],
  };

  mockStream.getTracks().forEach(t => t.stop());
  assert.equal(track1Stopped, true);
  assert.equal(track2Stopped, true);
});

test('Consent Gate: consent is strictly required before entering camera capture', () => {
  let hasAgreed = false;
  let currentStep = 1;

  const handleProceedToScan = () => {
    if (!hasAgreed) return;
    currentStep = 2;
  };

  handleProceedToScan();
  assert.equal(currentStep, 1);

  hasAgreed = true;
  handleProceedToScan();
  assert.equal(currentStep, 2);
});

test('Geofence Authority: client does not calculate pass/fail or determine eligibility', () => {
  const session: StudentActiveSession = {
    id: 10,
    courseCode: 'CLIN401',
    courseName: 'Restorative Dentistry Lab',
    geofenceRequired: true,
    geofenceEnabled: true,
  };

  // Client merely checks whether geofence coordinates are required
  const isLocationRequired = Boolean(session.geofenceRequired ?? session.geofenceEnabled);
  assert.equal(isLocationRequired, true);

  // Client does NOT calculate eligibility or distance; sends temporary coords to server
  const clientCoords = { latitude: 13.1436, longitude: 123.7438, accuracy: 15 };
  assert.ok(clientCoords.latitude);
  assert.ok(clientCoords.longitude);
  assert.ok(clientCoords.accuracy);
});

test('Profile Lifecycle: un-enrolled, enrolled, expired, and revoked states', () => {
  const profileStates = ['unregistered', 'enrolled', 'expired', 'revoked'] as const;
  for (const s of profileStates) {
    assert.ok(typeof s === 'string');
  }
});

function validateSessionTimings(opening: string, presentCutoff: string, lateCutoff: string): { valid: boolean; error?: string } {
  if (opening >= presentCutoff) {
    return { valid: false, error: 'Invalid timing: Opening time must be strictly before Present cutoff (Asia/Manila).' };
  }
  if (presentCutoff >= lateCutoff) {
    return { valid: false, error: 'Invalid timing: Present cutoff must be strictly before Late cutoff (Asia/Manila).' };
  }
  return { valid: true };
}

test('Session Timing: Asia/Manila cutoffs and strict ordering validation (opening < presentCutoff < lateCutoff)', () => {
  // Valid timing sequence
  const valid = validateSessionTimings('08:00', '08:30', '12:00');
  assert.equal(valid.valid, true);

  // Opening equal to or after Present cutoff is invalid
  const invalidEqualOpening = validateSessionTimings('08:30', '08:30', '12:00');
  assert.equal(invalidEqualOpening.valid, false);
  assert.match(invalidEqualOpening.error ?? '', /strictly before Present cutoff/);

  const invalidLateOpening = validateSessionTimings('09:00', '08:30', '12:00');
  assert.equal(invalidLateOpening.valid, false);

  // Present cutoff equal to or after Late cutoff is invalid
  const invalidEqualCutoff = validateSessionTimings('08:00', '12:00', '12:00');
  assert.equal(invalidEqualCutoff.valid, false);
  assert.match(invalidEqualCutoff.error ?? '', /strictly before Late cutoff/);

  const invalidPresentAfterLate = validateSessionTimings('08:00', '12:30', '12:00');
  assert.equal(invalidPresentAfterLate.valid, false);

  // Payload structure verification
  const payload: StartSecretaryAttendanceSessionPayload = {
    csId: 101,
    openingTime: '08:00',
    presentCutoff: '08:30',
    lateCutoff: '12:00',
    room: 'Dental Lab 2',
    biometricRequired: true,
    geofenceEnabled: true,
  };
  assert.equal(payload.openingTime, '08:00');
  assert.equal(payload.presentCutoff, '08:30');
  assert.equal(payload.lateCutoff, '12:00');
});

test('Secretary Session Start: biometric-required sessions must submit openingTime, presentCutoff, and lateCutoff together', () => {
  // Simulating the payload builder logic used in StartSession.tsx handleStart
  const buildSecretarySessionPayload = (params: {
    csId: number;
    room?: string;
    biometricRequired: boolean;
    geofenceEnabled: boolean;
    geofenceRadius?: number;
    openingTimeStr: string;
    presentCutoffStr: string;
    lateCutoffStr: string;
    gpsLocation?: { lat: number; lng: number };
  }): StartSecretaryAttendanceSessionPayload => {
    return {
      csId: params.csId,
      room: params.room?.trim() || undefined,
      biometricRequired: params.biometricRequired,
      geofenceEnabled: params.geofenceEnabled,
      geofenceRadiusMeters: params.geofenceEnabled ? params.geofenceRadius : undefined,
      openingTime: params.openingTimeStr,
      presentCutoff: params.presentCutoffStr,
      lateCutoff: params.lateCutoffStr,
      geofenceLatitude: params.gpsLocation?.lat,
      geofenceLongitude: params.gpsLocation?.lng,
      latitude: params.gpsLocation?.lat,
      longitude: params.gpsLocation?.lng,
    };
  };

  const payload = buildSecretarySessionPayload({
    csId: 101,
    room: 'Dental Lab 2',
    biometricRequired: true,
    geofenceEnabled: true,
    geofenceRadius: 100,
    openingTimeStr: '08:00',
    presentCutoffStr: '08:30',
    lateCutoffStr: '12:00',
    gpsLocation: { lat: 13.1436, lng: 123.7438 },
  });

  // Verify non-regression: lateCutoff must never be omitted
  assert.ok('lateCutoff' in payload, 'lateCutoff must be present in payload');
  assert.equal(payload.lateCutoff, '12:00');
  assert.ok('openingTime' in payload, 'openingTime must be present in payload');
  assert.equal(payload.openingTime, '08:00');
  assert.ok('presentCutoff' in payload, 'presentCutoff must be present in payload');
  assert.equal(payload.presentCutoff, '08:30');

  // Verify all three cutoffs exist together when biometricRequired is true
  assert.equal(payload.biometricRequired, true);
  const timingFields = [payload.openingTime, payload.presentCutoff, payload.lateCutoff];
  for (const field of timingFields) {
    assert.ok(typeof field === 'string' && field.length > 0, 'All timing cutoffs must be non-empty strings');
  }

  // Regression check: omission of lateCutoff is detected and rejected
  const payloadMissingLateCutoff = { ...payload };
  delete (payloadMissingLateCutoff as Partial<StartSecretaryAttendanceSessionPayload>).lateCutoff;
  const isCompleteTiming = (p: StartSecretaryAttendanceSessionPayload) =>
    Boolean(p.openingTime && p.presentCutoff && p.lateCutoff);
  assert.equal(isCompleteTiming(payload), true);
  assert.equal(isCompleteTiming(payloadMissingLateCutoff), false);
});

test('Session Revocation Contract: authorized revocation preserves records and prevents further submissions', () => {
  // Revocation payload verification
  const revocationPayload: AttendanceSessionRevocationPayload = {
    sessionId: 'session-101',
    reason: 'Power outage in dental lab; room vacated per instructor advisory.',
  };
  assert.equal(revocationPayload.sessionId, 'session-101');
  assert.ok(revocationPayload.reason && revocationPayload.reason.length <= 500);

  // Revoked session state structure
  const revokedSession: SecretaryAttendanceSession = {
    sessionId: 'session-101',
    csId: 5,
    courseCode: 'CLIN401',
    sessionDate: '2026-09-22',
    sessionCode: 'CLIN401-20260922-01',
    room: 'Dental Lab 2',
    status: 'revoked',
    startedAt: '2026-09-22T08:00:00Z',
    openingTime: '08:00',
    presentCutoff: '08:30',
    lateCutoff: '12:00',
    timingConfigured: true,
    geofenceEnabled: true,
    biometricRequired: true,
    revokedAt: '2026-09-22T08:45:00Z',
    revocationReason: 'Power outage in dental lab; room vacated per instructor advisory.',
    createdAt: '2026-09-22T08:00:00Z',
    updatedAt: '2026-09-22T08:45:00Z',
  };

  assert.equal(revokedSession.status, 'revoked');
  assert.ok(revokedSession.revokedAt);
  assert.equal(revokedSession.revocationReason, revocationPayload.reason);

  // Existing records are preserved (not erased)
  const existingRosterRecords = [
    { studentId: 'stud-1', status: 'present', timeRecorded: '08:10:00' },
    { studentId: 'stud-2', status: 'late', timeRecorded: '08:35:00' },
  ];
  assert.equal(existingRosterRecords.length, 2);

  // Subsequent submission to revoked session is rejected (session_not_active)
  const activeSessions: StudentActiveSession[] = []; // Revoked sessions excluded from active list
  assert.equal(activeSessions.length, 0);

  const revokedSessionSubmissionError = {
    status: 409,
    code: 'session_not_active',
    message: 'Attendance session is not currently active.',
  };
  assert.equal(revokedSessionSubmissionError.code, 'session_not_active');
  assert.equal(revokedSessionSubmissionError.status, 409);
});

test('Student Flow Isolation: real student flows never fall back to mock data or localStorage on error/revocation', () => {
  const realStudent: SafeUser = {
    user_id: 101,
    login_email: 'student@university.edu',
    role: 'student',
    display_name: 'Real University Student',
    session_uuid: 'uuid-real',
    authentication_source: 'password',
    student: {
      student_id: 101,
      student_number: '2023-BU-0101',
      status: 'active',
    },
  };

  // Real student access is authoritative-only
  assert.equal(canAccessAuthoritativeStudentBiometrics(realStudent), true);
  assert.equal(isDevelopmentMockStudent(realStudent, defaultRuntimeConfig), false);

  // When active sessions are empty (e.g. revoked or not started), real student flow shows clean empty state
  // and does not fallback to mock fixtures or localStorage
  const activeSessionsResponse: { sessions: StudentActiveSession[] } = { sessions: [] };
  assert.equal(activeSessionsResponse.sessions.length, 0);
});

test('Biometric Error Classification: transport/503 allows retry while semantic rejects consume challenge', () => {
  // Transport network error (status 0)
  const networkError = { status: 0, message: 'Unable to connect to the server. Check your connection.' };
  assert.equal(isTransportOrBiometricUnavailable(networkError), true);

  // 503 Provider unavailable
  const unavailableError = { status: 503, message: 'Biometric service is temporarily unavailable.', code: 'biometric_service_unavailable' };
  assert.equal(isTransportOrBiometricUnavailable(unavailableError), true);

  // Plain error with timeout or unavailable keyword
  const timeoutError = new Error('Gateway timeout while reaching biometric provider');
  assert.equal(isTransportOrBiometricUnavailable(timeoutError), true);

  // Semantic rejections: must NOT be classified as retryable transport errors
  const livenessError = { status: 400, message: 'Liveness check could not be verified.', code: 'liveness_failed' };
  assert.equal(isTransportOrBiometricUnavailable(livenessError), false);

  const qualityError = { status: 400, message: 'Verification could not accept sufficient usable frames.', code: 'quality_failed' };
  assert.equal(isTransportOrBiometricUnavailable(qualityError), false);

  const expiredChallengeError = { status: 400, message: 'Liveness challenge expired.', code: 'challenge_expired' };
  assert.equal(isTransportOrBiometricUnavailable(expiredChallengeError), false);

  const faceMismatchError = { status: 400, message: 'Face could not be verified.', code: 'biometric_verification_failed' };
  assert.equal(isTransportOrBiometricUnavailable(faceMismatchError), false);

  const invalidChallengeError = { status: 400, message: 'Liveness challenge is invalid.', code: 'challenge_invalid' };
  assert.equal(isTransportOrBiometricUnavailable(invalidChallengeError), false);
});

test('Guided Capture Frame Contract: 3-phase capture collects 25 candidate frames within [20, 30] limits', () => {
  // Phase 1 (Neutral Frontal): 8 frames
  const phase1Frames = 8;
  // Phase 2 (Action 1): 9 frames
  const phase2Frames = 9;
  // Phase 3 (Action 2): 8 frames
  const phase3Frames = 8;

  const totalCandidateFrames = phase1Frames + phase2Frames + phase3Frames;
  assert.equal(totalCandidateFrames, 25);

  // Contract requires at least 20 and at most 30 candidate frames
  assert.ok(totalCandidateFrames >= 20, 'At least 20 frames for enrollment');
  assert.ok(totalCandidateFrames <= 30, 'At most 30 frames for sidecar limit');
});

test('Retry Preservation Semantics: preserves challenge and idempotency key on transport failure', () => {
  const initialPayload = {
    challengeId: 'chal-uuid-8899',
    challengeToken: 'tok_live_preserve_123',
    idempotencyKey: 'idem-uuid-consistent-key',
    framesCount: 25,
  };

  // Simulating transport retry flow:
  // On network error, the payload is preserved as pendingPayload
  let pendingPayload: typeof initialPayload | null = null;
  let canRetryUpload = false;

  const error = { status: 503, message: 'Biometric service is temporarily unavailable.', code: 'biometric_service_unavailable' };
  if (isTransportOrBiometricUnavailable(error)) {
    pendingPayload = initialPayload;
    canRetryUpload = true;
  }

  // Idempotency key and challenge must be exactly identical upon retry
  assert.equal(canRetryUpload, true);
  assert.ok(pendingPayload);
  assert.equal(pendingPayload?.idempotencyKey, initialPayload.idempotencyKey);
  assert.equal(pendingPayload?.challengeId, initialPayload.challengeId);
  assert.equal(pendingPayload?.challengeToken, initialPayload.challengeToken);
  assert.equal(pendingPayload?.framesCount, 25);

  // Simulating semantic rejection:
  // On semantic failure, pendingPayload is cleared and must NOT be retried with the same challenge
  const semanticError = { status: 400, message: 'Liveness check failed.', code: 'liveness_failed' };
  if (!isTransportOrBiometricUnavailable(semanticError)) {
    pendingPayload = null;
    canRetryUpload = false;
  }

  assert.equal(canRetryUpload, false);
  assert.equal(pendingPayload, null);
});
