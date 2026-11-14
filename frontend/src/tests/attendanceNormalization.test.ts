import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudentActiveSession,
  normalizeStudentAttendanceLogRecord,
  isCaptureWindowRejection,
  captureWindowNotice,
} from '../services/attendanceNormalization.ts';

test('Attendance log normalization accepts the nested backend row contract', () => {
  const normalized = normalizeStudentAttendanceLogRecord({
    recordId: 44,
    attendanceSessionId: 17,
    sessionDate: '2026-09-24',
    sessionCode: 'CLIN401-20260924-01',
    recordedAt: '2026-09-24T08:14:00Z',
    course: { code: 'CLIN401', name: 'Restorative Dentistry Lab' },
    classSection: { id: 8, name: 'Section A' },
    status: 'present',
    verificationMethod: 'biometric',
  });

  assert.equal(normalized.id, 44);
  assert.equal(normalized.sessionId, 17);
  assert.equal(normalized.sessionCode, 'CLIN401-20260924-01');
  assert.deepEqual(normalized.classSection, { id: '8', name: 'Section A' });
  assert.equal(normalized.courseCode, 'CLIN401');
  assert.equal(normalized.courseName, 'Restorative Dentistry Lab');
  assert.equal(normalized.date, '2026-09-24');
  assert.ok(normalized.time.length > 0);
  assert.equal(normalized.status, 'present');
  assert.equal(normalized.verificationMethod, 'biometric');
});

test('Active session normalization maps nested course and already-recorded status', () => {
  const normalized = normalizeStudentActiveSession({
    sessionId: 17,
    course: { code: 'CLIN401', name: 'Restorative Dentistry Lab' },
    captureOpen: true,
    alreadyRecordedStatus: 'late',
  });

  assert.equal(normalized.id, 17);
  assert.equal(normalized.courseCode, 'CLIN401');
  assert.equal(normalized.courseName, 'Restorative Dentistry Lab');
  assert.equal(normalized.isOpen, true);
  assert.equal(normalized.alreadyRecordedStatus, 'late');
});

test('Attendance log normalization preserves backend manual verification attribution', () => {
  const normalized = normalizeStudentAttendanceLogRecord({
    recordId: 45,
    status: 'present',
    verificationMethod: 'manual_faculty',
  });

  assert.equal(normalized.verificationMethod, 'faculty_manual');
});

test('Attendance log normalization preserves automatic system resolution attribution', () => {
  const normalized = normalizeStudentAttendanceLogRecord({
    recordId: 46,
    status: 'absent',
    verificationMethod: 'system_resolution',
  });

  assert.equal(normalized.verificationMethod, 'system_resolution');
});

test('Attendance log normalization does not invent missing provenance', () => {
  const normalized = normalizeStudentAttendanceLogRecord({
    recordId: 47,
    status: 'absent',
  });

  assert.equal(normalized.verificationMethod, 'unknown');
});

test('Active session normalization carries the closed capture window (ATT-003)', () => {
  const normalized = normalizeStudentActiveSession({
    sessionId: 7,
    course: { code: 'IT404', name: 'Information Technology 404' },
    captureOpen: false,
    captureStatus: 'attendance_capture_closed',
    openingTime: '12:45',
    presentCutoff: '13:15',
    lateCutoff: '13:30',
  });

  assert.equal(normalized.isOpen, false);
  assert.equal(normalized.captureStatus, 'attendance_capture_closed');
  assert.equal(normalized.lateCutoff, '13:30');
});

test('Capture-window rejection codes are classified as timing, never biometrics', () => {
  for (const code of ['attendance_not_open', 'attendance_capture_closed', 'session_timing_unconfigured', 'session_not_active', 'session_revoked']) {
    assert.equal(isCaptureWindowRejection(code), true, code);
  }
  for (const code of ['biometric_verification_failed', 'liveness_failed', 'quality_failed', 'biometric_service_unavailable', '', null, undefined]) {
    assert.equal(isCaptureWindowRejection(code), false, String(code));
  }
});

test('Closed capture window notice names the Late cutoff and directs to manual attendance', () => {
  const notice = captureWindowNotice('attendance_capture_closed', {
    captureStatus: 'attendance_capture_closed',
    openingTime: '12:45',
    presentCutoff: '13:15',
    lateCutoff: '13:30',
  });

  assert.ok(notice);
  assert.match(notice, /closed at 1:30 PM/);
  assert.match(notice, /Faculty or Class Secretary/);
  assert.match(notice, /manually/);
});

test('Not-open capture window notice names the opening time', () => {
  const notice = captureWindowNotice('attendance_not_open', {
    captureStatus: 'attendance_not_open',
    openingTime: '12:45',
    presentCutoff: '13:15',
    lateCutoff: '13:30',
  });

  assert.ok(notice);
  assert.match(notice, /opens at 12:45 PM/);
});

test('Capture-window notice stays silent for real biometric or service failures', () => {
  assert.equal(captureWindowNotice('biometric_verification_failed', { captureStatus: null }), null);
  assert.equal(captureWindowNotice('biometric_service_unavailable', { captureStatus: null }), null);
  assert.equal(captureWindowNotice(null, { captureStatus: null }), null);
});
