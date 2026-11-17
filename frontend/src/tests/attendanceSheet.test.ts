import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceSheetTable } from '../utils/attendanceSheet.ts';
import type { AttendanceSheetData } from '../services/apiClient.ts';

const cls = { csId: '7', courseCode: 'DM 116', courseName: 'Oral Anatomy', sectionName: 'DMD-3A', schoolYear: '2026-2027', semester: '1st Semester' };
const student = (enrollmentId: string, lastName: string, firstName: string, middleName: string | null = null) =>
  ({ enrollmentId, studentNumber: `2023-${enrollmentId}`, lastName, firstName, middleName });
const data = (over: Partial<AttendanceSheetData>): AttendanceSheetData => ({ class: cls, sessions: [], students: [], records: [], ...over });

test('rows are numbered, LAST, First Middle, in last-name order; headers are dates', () => {
  const table = buildAttendanceSheetTable(data({
    sessions: [{ id: '1', date: '2026-11-08', openingTime: '08:00' }, { id: '2', date: '2026-11-15', openingTime: '08:00' }],
    students: [student('2', 'Reyes', 'Ana', 'Lim'), student('1', 'Cruz', 'Ben')],
  }));
  assert.deepEqual(table.columns.map(c => c.header), ['No.', 'Student Name', 'Nov 8', 'Nov 15', 'Present', 'Late', 'Absent', 'Excused', 'Attendance rate']);
  assert.deepEqual(table.rows.map(r => [r[0], r[1]]), [[1, 'CRUZ, Ben'], [2, 'REYES, Ana Lim']]);
  assert.equal(table.fileName, 'DM116_DMD-3A_Attendance_Sheet_2026-2027_1st.xlsx');
  assert.equal(table.term, '1ST SEMESTER, AY 2026-2027');
});

test('the opening time is added to the header only when a date has more than one session', () => {
  const table = buildAttendanceSheetTable(data({
    sessions: [
      { id: '1', date: '2026-11-08', openingTime: '08:00' },
      { id: '2', date: '2026-11-15', openingTime: '08:00' },
      { id: '3', date: '2026-11-15', openingTime: '13:30' },
    ],
  }));
  assert.deepEqual(table.columns.slice(2, 5).map(c => c.header), ['Nov 8', 'Nov 15 8:00 AM', 'Nov 15 1:30 PM']);
});

test('cells are P/L/A/E or blank, with totals and a whole-percent rate', () => {
  const table = buildAttendanceSheetTable(data({
    sessions: ['1', '2', '3', '4', '5'].map((id, i) => ({ id, date: `2026-11-0${i + 1}`, openingTime: null })),
    students: [student('1', 'Cruz', 'Ben')],
    records: [
      { enrollmentId: '1', sessionId: '1', status: 'present' },
      { enrollmentId: '1', sessionId: '2', status: 'late' },
      { enrollmentId: '1', sessionId: '3', status: 'absent' },
      { enrollmentId: '1', sessionId: '4', status: 'excused' },
    ],
  }));
  // Session 5 has no record: blank, not counted. (1 + 1 + 1) / 4 = 75%.
  assert.deepEqual(table.rows[0], [1, 'CRUZ, Ben', 'P', 'L', 'A', 'E', '', 1, 1, 1, 1, '75%']);
});

test('the rate is blank when nothing is resolved, and 0% when only absences are', () => {
  const table = buildAttendanceSheetTable(data({
    sessions: [{ id: '1', date: '2026-11-08', openingTime: null }],
    students: [student('1', 'Cruz', 'Ben'), student('2', 'Dela Cruz', 'Eli')],
    records: [{ enrollmentId: '2', sessionId: '1', status: 'absent' }],
  }));
  assert.deepEqual(table.rows[0].slice(-5), [0, 0, 0, 0, null]);
  assert.deepEqual(table.rows[1].slice(-5), [0, 0, 1, 0, '0%']);
});

test('a class with no sessions still lists its students with a blank rate', () => {
  const table = buildAttendanceSheetTable(data({ students: [student('1', 'Cruz', 'Ben')] }));
  assert.deepEqual(table.rows, [[1, 'CRUZ, Ben', 0, 0, 0, 0, null]]);
});
