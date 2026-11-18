import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTransmutationEnabled, effectiveAssessmentPercentage } from '../utils/gradeHelper.ts';
import { buildFacultyAcademicSummarySheet, buildFacultyAcademicSummaryTable } from '../utils/facultyAcademicSummaryExport.ts';

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

test('Faculty Reports academic export separates student identity and preserves summary values', () => {
  const table = buildFacultyAcademicSummaryTable(true, [{
    studentNumber: '12345',
    studentName: 'Santos, Ana',
    midtermLecture: '76.0%',
    midtermLaboratory: 'Incomplete',
    midterm: '76.0%',
    finalsLecture: '88.0%',
    finalsLaboratory: 'Incomplete',
    finals: '88.0%',
    grade: '2.6',
    remarks: 'REVIEW RETENTION',
  }]);
  assert.deepEqual(table.columns.map(column => column.header), [
    'Student No.', 'Student Name', 'Midterm Lecture', 'Midterm Laboratory', 'Midterm',
    'Finals Lecture', 'Finals Laboratory', 'Finals', 'Grade', 'Remarks',
  ]);
  assert.deepEqual(table.rows, [[
    '12345', 'Santos, Ana', '76.0%', 'Incomplete', '76.0%',
    '88.0%', 'Incomplete', '88.0%', '2.6', 'REVIEW RETENTION',
  ]]);
  assert.equal(table.columns[1].wrap, true);

  const lectureOnly = buildFacultyAcademicSummaryTable(false, [{
    studentNumber: '12345', studentName: 'Santos, Ana', midterm: '76.0%', finals: '88.0%', grade: '2.6', remarks: 'PASS',
  }]);
  assert.deepEqual(lectureOnly.columns.map(column => column.header), ['Student No.', 'Student Name', 'Midterm', 'Final', 'Grade', 'Remarks']);
  assert.deepEqual(lectureOnly.rows[0], ['12345', 'Santos, Ana', '76.0%', '88.0%', '2.6', 'PASS']);

  const sheet = buildFacultyAcademicSummarySheet({
    table, lectureLaboratory: true, courseLabel: 'DENT101 · Prosthodontics I', section: 'DENT101-4C',
    term: '1st Semester, S.Y. 2026-2027', by: 'Dr. Santos', generated: 'Nov 18, 2026, 4:53 PM',
  });
  assert.equal(sheet.sheet, 'Grade Ledger');
  assert.equal((sheet.data[9][2] as { value?: string; columnSpan?: number }).value, 'MIDTERM');
  assert.equal((sheet.data[9][2] as { columnSpan?: number }).columnSpan, 3);
  assert.equal(sheet.data[11][0], '12345');
  assert.equal(sheet.data[11][1], 'Santos, Ana');
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
