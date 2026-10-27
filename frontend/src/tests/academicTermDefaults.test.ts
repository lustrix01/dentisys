import test from 'node:test';
import assert from 'node:assert/strict';
import { newTermDefaults, semesterLabel } from '../utils/academicTermDefaults.ts';

test('add-term default is the first undefined semester, then the next year', () => {
  assert.deepEqual(newTermDefaults('2026-2027', []), { schoolYear: '2026-2027', semester: '1ST' });
  assert.deepEqual(newTermDefaults('2026-2027', ['1ST']), { schoolYear: '2026-2027', semester: '2ND' });
  assert.deepEqual(newTermDefaults('2026-2027', ['1ST', 'Summer']), { schoolYear: '2026-2027', semester: '2ND' });
  assert.deepEqual(newTermDefaults('2026-2027', ['1ST', '2ND', 'Summer']), { schoolYear: '2027-2028', semester: '1ST' });
});

test('semesterLabel', () => {
  assert.equal(semesterLabel('1ST'), '1st Semester');
  assert.equal(semesterLabel('2ND'), '2nd Semester');
  assert.equal(semesterLabel('Summer'), 'Summer');
});
