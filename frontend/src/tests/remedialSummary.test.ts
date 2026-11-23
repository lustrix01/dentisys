import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRemedialSummaryTable,
  enteredRemedial,
  filterRetentionListStudents,
  hasRetentionOrRemedialHistory,
  remedialStatusText,
} from '../utils/remedialSummary.ts';
import type { RemedialSummaryRow } from '../utils/remedialSummary.ts';
import type { FacultyRemedialProgression, FacultyRetentionRecord } from '../services/apiClient.ts';

const attempt = (attemptNumber: 1 | 2, outcome: 'pending' | 'passed' | 'failed', scheduledDate: string | null, percentage: number | null) =>
  ({ attemptNumber, outcome, scheduledDate, percentage, actorUserId: null, createdAt: '', updatedAt: '' });
const progression = (over: Partial<FacultyRemedialProgression>): FacultyRemedialProgression =>
  ({ stage: 'none', attempts: [], passedAttempt: null, legacyUnclassified: false, ...over });
const row = (over: Partial<RemedialSummaryRow>): RemedialSummaryRow =>
  ({ studentNumber: '2023-0001', studentName: 'CRUZ, Ben', courseCode: 'DM 116', section: 'DMD-3A', finalGrade: 3, state: 'remedial', progression: progression({}), ...over });

test('only enrollments that entered remedial are included, including passed and irregular ones', () => {
  assert.equal(enteredRemedial(row({ state: 'active', progression: progression({}) })), false);
  assert.equal(enteredRemedial(row({ state: 'active', progression: null })), false);
  assert.equal(enteredRemedial(row({ state: 'remedial' })), true);
  assert.equal(enteredRemedial(row({ state: 'irregular_reenrollment' })), true);
  assert.equal(enteredRemedial(row({ state: 'cleared', progression: progression({ stage: 'passed', passedAttempt: 1, attempts: [attempt(1, 'passed', '2026-11-10', 80)] }) })), true);
  assert.equal(enteredRemedial(row({ state: 'cleared', progression: progression({ stage: 'cost_recovery_passed', costRecovery: { finalGrade: 2, outcome: 'passed', recordedAt: '' } }) })), true);
});

test('Status wording follows the Remedial Record', () => {
  const status = (state: string, p: Partial<FacultyRemedialProgression>) => remedialStatusText(row({ state, progression: progression(p) }));
  assert.equal(status('remedial', {}), 'Not yet scheduled');
  assert.equal(status('remedial', { stage: 'attempt_2_available', attempts: [attempt(1, 'failed', '2026-11-10', 60)] }), 'Not yet scheduled');
  assert.equal(status('remedial', { stage: 'attempt_1_pending', attempts: [attempt(1, 'pending', '2026-11-10', null)] }), 'Attempt 1 pending');
  assert.equal(status('remedial', { stage: 'attempt_2_pending' }), 'Attempt 2 pending');
  assert.equal(status('cleared', { stage: 'passed', passedAttempt: 2 }), 'Passed');
  assert.equal(status('cleared', { stage: 'cost_recovery_passed' }), 'Passed');
  assert.equal(status('remedial', { stage: 'cost_recovery_required' }), 'Cost recovery required');
  assert.equal(status('remedial', { stage: 'cost_recovery_failed' }), 'Failed cost recovery');
  assert.equal(status('irregular_reenrollment', { stage: 'cost_recovery_failed' }), 'Irregular reenrollment');
});

test('columns, values, blanks and last-name order', () => {
  const table = buildRemedialSummaryTable({
    schoolYear: '2026-2027', filter: 'All classes',
    rows: [
      row({ studentName: 'REYES, Ana', studentNumber: '2023-0002', finalGrade: 5, state: 'irregular_reenrollment', progression: progression({
        stage: 'cost_recovery_failed',
        attempts: [attempt(1, 'failed', '2026-11-10', 60), attempt(2, 'failed', '2026-11-20', 65.5)],
        costRecovery: { finalGrade: 5, outcome: 'failed', recordedAt: '' },
      }) }),
      row({ state: 'active', studentName: 'ABAD, Zed', progression: progression({}) }),
      row({}),
    ],
  });
  assert.deepEqual(table.columns.map(c => c.header), [
    'Student No.', 'Student Name', 'Course Code', 'Class Section', 'Final Grade',
    'Attempt 1 Date', 'Attempt 1 %', 'Attempt 1 Result', 'Attempt 2 Date', 'Attempt 2 %', 'Attempt 2 Result',
    'Cost Recovery Grade', 'Cost Recovery Result', 'Status',
  ]);
  assert.equal(table.fileName, 'Remedial_Summary_2026-2027.xlsx');
  assert.equal(table.term, 'AY 2026-2027');
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], ['2023-0001', 'CRUZ, Ben', 'DM 116', 'DMD-3A', 3, null, null, null, null, null, null, null, null, 'Not yet scheduled']);
  const second = table.rows[1];
  assert.deepEqual(second.slice(0, 5), ['2023-0002', 'REYES, Ana', 'DM 116', 'DMD-3A', 5]);
  assert.ok(second[5] instanceof Date);
  assert.deepEqual([second[6], second[7], second[9], second[10], second[11], second[12], second[13]], [60, 'Failed', 65.5, 'Failed', 5, 'Failed', 'Irregular reenrollment']);
});

const retentionRecord = (over: Partial<FacultyRetentionRecord>): FacultyRetentionRecord => ({
  enrollmentId: '801',
  studentId: '701',
  studentNumber: 'DENT-007',
  studentName: 'Alice Reyes',
  classId: '1',
  className: 'CLIN401-A',
  subjectCode: 'CLIN401',
  schoolYear: '2026-2027',
  percentage: 75,
  gwa: 3.0,
  state: 'active',
  remedial: null,
  remedialProgression: progression({}),
  ...over,
});

test('hasRetentionOrRemedialHistory identifies current, cleared, and legacy retention/remedial records', () => {
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({ state: 'active', remedial: null, remedialProgression: progression({}) })), false);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({ state: 'remedial' })), true);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({ state: 'irregular_reenrollment' })), true);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({ state: 'cleared' })), true);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({
    state: 'active',
    remedialProgression: progression({ stage: 'passed', passedAttempt: 1, attempts: [attempt(1, 'passed', '2026-11-10', 80)] }),
  })), true);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({
    state: 'active',
    remedialProgression: progression({ costRecovery: { finalGrade: 2.25, outcome: 'passed', recordedAt: '2026-11-20' } }),
  })), true);
  assert.equal(hasRetentionOrRemedialHistory(retentionRecord({
    state: 'active',
    remedial: { status: 'Cleared', passedAt: '2026-11-10' },
  })), true);
});

test('filterRetentionListStudents excludes students without retention history and respects schoolYear and classId', () => {
  const students = [
    { id: '701', name: 'Alice Reyes' },
    { id: '702', name: 'Bea Santos' },
    { id: '703', name: 'Cara Lim' },
    { id: '704', name: 'Dan Cruz' },
    { id: '705', name: 'Eli Tan' },
    { id: '706', name: 'Fay Ong' },
  ];
  const records: FacultyRetentionRecord[] = [
    retentionRecord({ enrollmentId: '801', studentId: '701', state: 'remedial', remedialProgression: progression({ stage: 'attempt_1_pending' }) }),
    retentionRecord({ enrollmentId: '802', studentId: '702', state: 'cleared', remedialProgression: progression({ stage: 'passed', passedAttempt: 1, attempts: [attempt(1, 'passed', '2026-11-10', 80)] }) }),
    retentionRecord({ enrollmentId: '803', studentId: '703', state: 'active', remedial: null, remedialProgression: progression({}) }),
    // 704 has no retention record at all
    retentionRecord({ enrollmentId: '805', studentId: '705', state: 'irregular_reenrollment', schoolYear: '2025-2026' }),
    retentionRecord({ enrollmentId: '806', studentId: '706', state: 'active', classId: '2', remedial: { note: 'legacy' } }),
  ];

  assert.deepEqual(
    filterRetentionListStudents(students, records, '2026-2027', '1').map(s => s.id),
    ['701', '702'],
  );
  assert.deepEqual(
    filterRetentionListStudents(students, records, 'all', '1').map(s => s.id),
    ['701', '702', '705'],
  );
  assert.deepEqual(
    filterRetentionListStudents(students, records, '2026-2027', '2').map(s => s.id),
    ['706'],
  );
  assert.deepEqual(
    filterRetentionListStudents(students, records, '2026-2027').map(s => s.id),
    ['701', '702', '706'],
  );
});
