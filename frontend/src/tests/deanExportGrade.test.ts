import test from 'node:test';
import assert from 'node:assert/strict';
import { exportGradeOf } from '../pages/admin/exportGrade.ts';

const student = {
  overallGWA: 2.25,
  enrolledSubjects: [
    { code: 'DENT 101', grade: 1.5 },
    { code: 'DENT 202', grade: 3.0 },
  ],
};

test('control: with a class selected the export shows that class course grade', () => {
  assert.equal(exportGradeOf(student, 'DENT 202'), '3.0');
});

// 13.3 bug 2: awaiting Owner decision on the fix. With no class filter the export
// has one "Grade" per student and shows only the first course (1.5); the 3.0
// course is silently dropped. Expected: every enrollment row carries its own
// course grade, so the student's second course must not be omitted.
test.skip('13.3 bug 2: no class filter must not collapse two courses into one grade', () => {
  const shown = exportGradeOf(student, undefined);
  assert.ok(shown.includes('1.5') && shown.includes('3.0'),`Grade column shows ${shown}, which omits a course`);
});
