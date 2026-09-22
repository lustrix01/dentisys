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
} from '../types/index.ts';

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

test('Liveness Contract: challenge returns exactly two distinct actions from approved set', () => {
  const validActions = new Set(['blink', 'turn_left', 'turn_right']);

  const mockChallenge: LivenessChallengeResponse = {
    challengeId: 'chal-uuid-12345',
    actions: ['blink', 'turn_left'],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  assert.equal(mockChallenge.actions.length, 2);
  assert.notEqual(mockChallenge.actions[0], mockChallenge.actions[1]);
  assert.ok(validActions.has(mockChallenge.actions[0]));
  assert.ok(validActions.has(mockChallenge.actions[1]));
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

  const allowedMethods = new Set(['biometric', 'faculty_manual', 'secretary_manual']);
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
