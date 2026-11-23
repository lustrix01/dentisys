import test from 'node:test';
import assert from 'node:assert/strict';
import type { AttendanceRecord, StudentAttendanceLogRecord } from '../types/index.ts';
import {
  ATTENDANCE_LOG_EXPORT_HEADER,
  attendanceLogExportRow,
  attendanceLogFileName,
  attendanceLogFilterLabel,
  attendanceStatusLabel,
  verificationMethodLabel,
} from '../pages/student/attendanceLogExport.ts';

const real = (over: Partial<StudentAttendanceLogRecord> = {}): StudentAttendanceLogRecord => ({
  id: 1,
  courseCode: 'DENT101',
  courseName: 'Oral Anatomy',
  room: 'Room 101',
  instructorName: 'Dr. Reyes',
  date: '2026-11-15',
  time: '8:05 AM',
  status: 'present',
  verificationMethod: 'biometric',
  ...over,
});

test('header has the six contract columns in order', () => {
  assert.deepEqual(ATTENDANCE_LOG_EXPORT_HEADER, ['Date', 'Class Subject', 'Check-In Time', 'Verification Method', 'Session Location', 'Attendance Status']);
});

test('attendanceStatusLabel capitalises and maps unresolved to Pending', () => {
  assert.equal(attendanceStatusLabel('present'), 'Present');
  assert.equal(attendanceStatusLabel('late'), 'Late');
  assert.equal(attendanceStatusLabel('excused'), 'Excused');
  assert.equal(attendanceStatusLabel('absent'), 'Absent');
  assert.equal(attendanceStatusLabel('unresolved'), 'Pending');
});

test('verificationMethodLabel covers every method and falls back to Manual Entry', () => {
  assert.equal(verificationMethodLabel('biometric'), 'Biometric 1:1 Verification');
  assert.equal(verificationMethodLabel('faculty_manual'), 'Faculty Manual Entry');
  assert.equal(verificationMethodLabel('secretary_manual'), 'Secretary Manual Entry');
  assert.equal(verificationMethodLabel('secretary_approved'), 'Secretary (approved by Faculty)');
  assert.equal(verificationMethodLabel('system_resolution'), 'Automatic System Resolution');
  assert.equal(verificationMethodLabel('unknown'), 'Verification Method Unavailable');
  assert.equal(verificationMethodLabel('something_else' as never), 'Manual Entry');
});

test('real record row matches the table text', () => {
  assert.deepEqual(attendanceLogExportRow(real()), [
    'Nov 15, 2026',
    'DENT101 · Oral Anatomy',
    '8:05 AM',
    'Biometric 1:1 Verification · By Dr. Reyes',
    'Room 101',
    'Present',
  ]);
});

test('real record without instructor, room or time uses the plain method and dashes', () => {
  const row = attendanceLogExportRow(real({ instructorName: undefined, room: undefined, time: '', status: 'unresolved', verificationMethod: 'system_resolution' }));
  assert.deepEqual(row, ['Nov 15, 2026', 'DENT101 · Oral Anatomy', '—', 'Automatic System Resolution', '—', 'Pending']);
});

test('prototype record row uses subject code, mock method label and location', () => {
  const mock: AttendanceRecord = {
    id: 'a1', studentId: '1', date: '2026-11-16', subjectCode: 'DENT202', status: 'late',
    verificationType: 'facial_geofence', verifiedLocationName: 'Dental Clinic Lab 1', verifiedAt: '2026-11-16T01:30:00Z',
  };
  assert.deepEqual(attendanceLogExportRow(mock), [
    'Nov 16, 2026', 'DENT202', '9:30 AM', 'Facial & geofence verified', 'Dental Clinic Lab 1', 'Late',
  ]);
});

test('prototype record without method, time or location shows dashes', () => {
  const mock: AttendanceRecord = { id: 'a2', studentId: '1', date: '2026-11-17', subjectCode: 'DENT202', status: 'present' };
  assert.deepEqual(attendanceLogExportRow(mock), ['Nov 17, 2026', 'DENT202', '—', '—', '—', 'Present']);
});

test('prototype manual override and standard methods have their own labels', () => {
  const base: AttendanceRecord = { id: 'a3', studentId: '1', date: '2026-11-17', subjectCode: 'X', status: 'present' };
  assert.equal(attendanceLogExportRow({ ...base, verificationType: 'manual_override' })[3], 'Manual override');
  assert.equal(attendanceLogExportRow({ ...base, verificationType: 'standard' })[3], 'Standard verification');
});

test('attendanceLogFilterLabel lists course and status, and the trimmed search only when set', () => {
  assert.equal(attendanceLogFilterLabel('', 'all', 'all'), 'All courses · All statuses');
  assert.equal(attendanceLogFilterLabel('   ', 'all', 'all'), 'All courses · All statuses');
  assert.equal(attendanceLogFilterLabel(' anat ', 'DENT101', 'late'), 'DENT101 · Late · Search "anat"');
  assert.equal(attendanceLogFilterLabel('', 'all', 'unresolved'), 'All courses · Pending resolution');
});

test('attendanceLogFileName uses the Manila date', () => {
  assert.equal(attendanceLogFileName('2021-0001', new Date('2026-11-24T10:00:00Z')), 'Attendance_Log_2021-0001_2026-11-24.xlsx');
  // 17:00 UTC is already midnight of the next day in Manila (UTC+8).
  assert.equal(attendanceLogFileName('2021-0001', new Date('2026-11-24T17:00:00Z')), 'Attendance_Log_2021-0001_2026-11-25.xlsx');
  assert.equal(attendanceLogFileName('2021-0001', new Date('2026-11-24T15:59:59Z')), 'Attendance_Log_2021-0001_2026-11-24.xlsx');
});

test('attendanceLogFileName strips unsafe characters and falls back to Student', () => {
  assert.equal(attendanceLogFileName('20/21 0001', new Date('2026-11-24T00:00:00Z')), 'Attendance_Log_20210001_2026-11-24.xlsx');
  assert.equal(attendanceLogFileName('—', new Date('2026-11-24T00:00:00Z')), 'Attendance_Log_Student_2026-11-24.xlsx');
});
