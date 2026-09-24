import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStudentActiveSession,
  normalizeStudentAttendanceLogRecord,
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
