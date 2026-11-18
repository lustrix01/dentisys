import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCountLine, exportEnrollmentRows } from '../pages/admin/exportGrade.ts';

const student = {
  id: 's1',
  className: 'DMD 1-A',
  overallGWA: 2.25,
  enrolledSubjects: [
    { code: 'DENT 202', className: 'DMD 1-B', grade: 3.0 },
    { code: 'DENT 101', className: 'DMD 1-A', grade: 1.5 },
  ],
};

test('13.3 bug 2: no class filter gives one row per course enrollment', () => {
  const rows = exportEnrollmentRows([student]);
  assert.deepEqual(rows.map(r => [r.courseCode, r.className, r.grade]), [
    ['DENT 101', 'DMD 1-A', 1.5],
    ['DENT 202', 'DMD 1-B', 3.0],
  ]);
});

test('a class name keeps only that class enrollments', () => {
  const rows = exportEnrollmentRows([student], 'DMD 1-B');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].courseCode, 'DENT 202');
  assert.equal(rows[0].grade, 3.0);
});

test('a student with no enrollments still gets one row with no grade', () => {
  const rows = exportEnrollmentRows([{ id: 's2', className: 'DMD 1-A', overallGWA: 2.0, enrolledSubjects: [] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].courseCode, '—');
  assert.equal(rows[0].grade, null);
});

test('count line counts distinct students and enrollments', () => {
  assert.equal(exportCountLine(exportEnrollmentRows([student])), '1 student · 2 course enrollments');
});
