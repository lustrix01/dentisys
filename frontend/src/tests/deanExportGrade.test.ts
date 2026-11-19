import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCountLine, exportEnrollmentRows } from '../pages/admin/exportGrade.ts';

const student = {
  id: 's1',
  className: 'DMD 1-A',
  status: 'remedial',
  overallGWA: 2.25,
  enrolledSubjects: [
    { code: 'DENT 202', classId: '20', className: 'DMD 1-B', grade: 3.0, retentionState: 'remedial' },
    { code: 'DENT 101', classId: '10', className: 'DMD 1-A', grade: 1.5, retentionState: 'active' },
  ],
};

test('13.3 bug 2: no class filter gives one row per course enrollment', () => {
  const rows = exportEnrollmentRows([student]);
  assert.deepEqual(rows.map(r => [r.courseCode, r.className, r.grade]), [
    ['DENT 101', 'DMD 1-A', 1.5],
    ['DENT 202', 'DMD 1-B', 3.0],
  ]);
});

test('a class id keeps only that class enrollments', () => {
  const rows = exportEnrollmentRows([student], '20');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].courseCode, 'DENT 202');
  assert.equal(rows[0].grade, 3.0);
});

test('each row carries the standing of its own enrollment, not the student worst state', () => {
  const rows = exportEnrollmentRows([student]);
  assert.deepEqual(rows.map(r => [r.courseCode, r.standing]), [['DENT 101', 'active'], ['DENT 202', 'remedial']]);
});

test('a student with no enrollments still gets one row with no grade', () => {
  const rows = exportEnrollmentRows([{ id: 's2', className: 'DMD 1-A', status: 'noGrade', overallGWA: 2.0, enrolledSubjects: [] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].courseCode, '—');
  assert.equal(rows[0].grade, null);
  assert.equal(rows[0].standing, 'noGrade');
});

test('count line counts distinct students and enrollments', () => {
  assert.equal(exportCountLine(exportEnrollmentRows([student])), '1 student · 2 course enrollments');
});

test('count line does not count the placeholder row of a student with no enrollments', () => {
  const empty = { id: 's2', status: 'noGrade', enrolledSubjects: [] };
  const other = { id: 's3', status: 'active', enrolledSubjects: [{ code: 'DENT 101', classId: '10', className: 'DMD 1-A', grade: 1.5, retentionState: 'active' }] };
  assert.equal(exportCountLine(exportEnrollmentRows([student, empty, other])), '3 students · 3 course enrollments');
});

test('13.3 follow-up: each course row counts only that course pending remedials', () => {
  const withRemedial = { ...student, remedialExams: [{ subjectCode: 'DENT 202', status: 'pending' }, { subjectCode: 'DENT 202', status: 'passed' }] };
  const rows = exportEnrollmentRows([withRemedial]);
  assert.deepEqual(rows.map(r => [r.courseCode, r.pendingRemedials]), [['DENT 101', 0], ['DENT 202', 1]]);
});
