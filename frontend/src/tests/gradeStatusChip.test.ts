import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeStatusChip } from '../utils/gradeStatusChip.ts';

// GRD-004 (docs/contracts/grade-submission.md, "States of a class" and "Screens"): the class card chip.
const label = (gradeChangeStatus: string | null | undefined, gradeDeadlineStatus: string | null | undefined) =>
  gradeStatusChip({ gradeChangeStatus, gradeDeadlineStatus }).label;

test('GRD-004: each deadline status has its chip label', () => {
  assert.equal(label(null, 'not_submitted'), 'Not submitted');
  assert.equal(label(null, 'late'), 'Late');
  assert.equal(label(null, 'submitted'), 'Submitted');
  assert.equal(label(null, 'submitted_late'), 'Submitted late');
});

test('GRD-004: a class with no status at all reads Not submitted', () => {
  assert.equal(label(undefined, undefined), 'Not submitted');
  assert.equal(label(null, null), 'Not submitted');
});

test('GRD-004: an open grade change draft beats every deadline status', () => {
  for (const deadline of ['not_submitted', 'late', 'submitted', 'submitted_late']) {
    assert.equal(label('draft', deadline), 'Grade change draft');
  }
});

test('GRD-004: a pending grade change beats every deadline status', () => {
  for (const deadline of ['not_submitted', 'late', 'submitted', 'submitted_late']) {
    assert.equal(label('pending', deadline), 'Awaiting Dean approval');
  }
});

test('GRD-004: a rejected or otherwise closed batch does not change the deadline chip', () => {
  assert.equal(label('rejected', 'submitted'), 'Submitted');
  assert.equal(label('approved', 'submitted_late'), 'Submitted late');
});

test('GRD-004: chips carry a tone class so the states look different', () => {
  const tone = (change: string | null, deadline: string) =>
    gradeStatusChip({ gradeChangeStatus: change, gradeDeadlineStatus: deadline }).tone;
  assert.notEqual(tone(null, 'late'), tone(null, 'submitted'));
  assert.notEqual(tone('draft', 'submitted'), tone(null, 'submitted'));
  assert.equal(tone(null, 'submitted'), tone(null, 'submitted_late'));
});
