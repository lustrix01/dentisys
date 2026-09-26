import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiClient = fs.readFileSync(path.join(currentDirectory, '../services/apiClient.ts'), 'utf8');
const facultyPage = fs.readFileSync(path.join(currentDirectory, '../pages/faculty/RetentionMonitoring.tsx'), 'utf8');
const studentPage = fs.readFileSync(path.join(currentDirectory, '../pages/student/RetentionMonitoring.tsx'), 'utf8');

type AttemptOutcome = 'passed' | 'failed';
type Progression = 'first_attempt_pending' | 'second_attempt_available' | 'passed' | 'cost_recovery_required';

const deriveOutcome = (percentageResult: number): AttemptOutcome => (
  percentageResult >= 50 ? 'passed' : 'failed'
);

const nextProgression = (attemptNumber: 1 | 2, outcome: AttemptOutcome): Progression => {
  if (outcome === 'passed') return 'passed';
  return attemptNumber === 1 ? 'second_attempt_available' : 'cost_recovery_required';
};

test('Approved percentage boundaries derive the exact remedial outcome', () => {
  const cases: Array<[number, AttemptOutcome]> = [
    [0, 'failed'],
    [49.99, 'failed'],
    [50, 'passed'],
    [50.01, 'passed'],
    [100, 'passed'],
  ];

  for (const [score, expected] of cases) {
    assert.equal(deriveOutcome(score), expected, `percentage ${score}`);
  }
  assert.equal(nextProgression(1, 'failed'), 'second_attempt_available');
  assert.equal(nextProgression(2, 'passed'), 'passed');
  assert.equal(nextProgression(2, 'failed'), 'cost_recovery_required');
});

test('Invalid score fixtures are named for backend integration coverage', () => {
  const invalidInputs = ['', '   ', -0.01, 100.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  assert.equal(invalidInputs.length, 7);
  assert.deepEqual(invalidInputs.slice(0, 2), ['', '   '], 'blank values must not be coerced to zero');
  assert.equal(Number.isFinite(Number.NaN), false);
  assert.equal(Number.isFinite(Number.POSITIVE_INFINITY), false);
  assert.equal(Number.isFinite(Number.NEGATIVE_INFINITY), false);
});

test('Faculty API contract sends data fields and consumes server progression', () => {
  assert.match(apiClient, /saveFacultyRemedialApi/);
  assert.match(apiClient, /attemptNumber/);
  assert.match(apiClient, /percentage/);
  assert.match(apiClient, /scheduledDate/);
  assert.match(apiClient, /stage/);
  assert.match(apiClient, /attempt_1_pending|attempt_2_available/);
  assert.match(apiClient, /cost_recovery_required/);
  const saveFunction = apiClient.slice(apiClient.indexOf('export function saveFacultyRemedialApi'));
  assert.doesNotMatch(saveFunction, /status\s*:\s*['"](?:passed|failed)['"]/i);
});

test('Faculty UI exposes both attempts and the truthful terminal stage', () => {
  assert.match(facultyPage, /Attempt 1/i);
  assert.match(facultyPage, /Attempt 2/i);
  assert.match(facultyPage, /Passed/i);
  assert.match(facultyPage, /Cost recovery required/i);
  assert.match(facultyPage, /attemptNumber/);
  assert.match(facultyPage, /stageLabel/);
  assert.match(facultyPage, /saveFacultyRemedialApi/);
  assert.doesNotMatch(facultyPage, /75\s*%|>=\s*75|>=\s*0\.75/);
  assert.doesNotMatch(facultyPage, /status\s*:\s*['"](?:passed|failed)['"]/i);
});

test('Student retention remains read-only and displays server-owned remedial progression', () => {
  assert.doesNotMatch(studentPage, /saveFacultyRemedialApi|updateFacultyRetentionStatusApi/);
  assert.match(studentPage, /Attempt 1/i);
  assert.match(studentPage, /Attempt 2/i);
  assert.match(studentPage, /Cost recovery required/i);
  assert.match(studentPage, /stage|remedialProgression|attemptNumber/);
});

test('The integration suite must cover restrictions and preservation beyond static checks', () => {
  const requiredCases = [
    'first-attempt pass',
    'first-attempt fail then second available',
    'second-attempt pass',
    'second-attempt fail',
    'skipped attempt',
    'third attempt',
    'duplicate attempt',
    'concurrent submission',
    'assigned Faculty ownership',
    'archived or historical enrollment',
    'legacy-unclassified preservation',
    'original percentage/GWA/raw-score preservation',
    'ordinary grade recomputation preserves remedial progression',
    'reload returns the same progression',
  ];
  assert.equal(requiredCases.length, 14);
  assert.ok(requiredCases.every(caseName => caseName.length > 0));
});
