import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTransmutationEnabled, effectiveAssessmentPercentage } from '../utils/gradeHelper.ts';

test('transmutation uses fixed bounds and ignores legacy custom bounds', () => {
  const legacyAssessment = {
    transmutationEnabled: true,
    transmutationMinimumPercentage: 20,
    transmutationMaximumPercentage: 80,
  };
  assert.equal(effectiveAssessmentPercentage(0, 100, legacyAssessment, 'unlinked'), 50);
  assert.equal(effectiveAssessmentPercentage(50, 100, legacyAssessment, 'unlinked'), 75);
  assert.equal(effectiveAssessmentPercentage(100, 100, legacyAssessment, 'unlinked'), 100);
});

test('attendance and missing-score conditions keep the approved transmutation semantics', () => {
  const assessment = { transmutationEnabled: true };
  assert.equal(effectiveAssessmentPercentage(50, 100, assessment, 'present'), 75);
  assert.equal(effectiveAssessmentPercentage(50, 100, assessment, 'late'), 75);
  assert.equal(effectiveAssessmentPercentage(50, 100, assessment, 'excused'), 75);
  assert.equal(effectiveAssessmentPercentage(50, 100, assessment, 'absent'), 0);
  assert.equal(effectiveAssessmentPercentage(50, 100, assessment), null);
  assert.equal(effectiveAssessmentPercentage(50, 100, { transmutationEnabled: false }), 50);
  assert.equal(effectiveAssessmentPercentage(50, 0, assessment, 'present'), null);
});

test('Reports bundle and print output use effective percentages', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../pages/faculty/Reports.tsx', import.meta.url), 'utf8');
  assert.match(source, /effectivePercentages/);
  assert.match(source, /revokedAttendanceSessions/);
  assert.match(source, /revoked \? 'unlinked'/);
  // Categorised assessments: the effective (transmuted) value is the Transmuted column, in the workbook and in print.
  const workbook = fs.readFileSync(new URL('../utils/reportWorkbook.ts', import.meta.url), 'utf8');
  assert.match(workbook, /head\('Transmuted'\)/);
  assert.match(workbook, /transmuted: \(i: number\)[\s\S]*step\.effectivePercentage/);
  assert.match(workbook, /\{ value: value \/ 100, format: '0\.00%' \}/);
  assert.match(source, /Transmuted<\/th>/);
  assert.match(source, /server\.transmuted\(i\)/);
  assert.match(source, /printPercent\(transmuted\)/);
  // Outside a category there is no Transmuted column: the effective percentage stays in %.
  assert.match(source, /printPercent\(effective\)/);
  assert.doesNotMatch(source, /score \/ max, format: '0\.00%'/);
});

test('Admin and Faculty no longer edit legacy transmutation bounds', async () => {
  const fs = await import('node:fs');
  const currentDirectory = new URL('../pages/faculty/GradeComputation.tsx', import.meta.url);
  const faculty = fs.readFileSync(currentDirectory, 'utf8');
  const admin = fs.readFileSync(new URL('../pages/admin/Settings.tsx', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../services/apiClient.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(faculty, /Minimum Percentage|Maximum Percentage|transmutationMinimumPercentage\s*:/);
  assert.doesNotMatch(admin, /minimumPercentage|maximumPercentage/);
  assert.match(api, /key !== 'transmutationMinimumPercentage' && key !== 'transmutationMaximumPercentage'/);
});

test('a new assessment starts with transmutation on, except in the Attendance category', async () => {
  assert.equal(defaultTransmutationEnabled('Attendance'), false);
  assert.equal(defaultTransmutationEnabled('  attendance '), false);
  assert.equal(defaultTransmutationEnabled('Quiz'), true);
  assert.equal(defaultTransmutationEnabled('Attendance Bonus'), true);
  assert.equal(defaultTransmutationEnabled(null), true);
  const fs = await import('node:fs');
  const page = fs.readFileSync(new URL('../pages/faculty/GradeComputation.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(!editingAssessment\) setAssTransmutationEnabled\(defaultTransmutationEnabled\(/);
});
