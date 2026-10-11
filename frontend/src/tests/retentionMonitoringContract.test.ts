import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { percentageToGWA } from '../utils/gradeHelper.ts';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const retentionPage = fs.readFileSync(path.join(currentDirectory, '../pages/faculty/RetentionMonitoring.tsx'), 'utf8');
const apiClient = fs.readFileSync(path.join(currentDirectory, '../services/apiClient.ts'), 'utf8');

test('Retention API contract: reads use the existing authoritative GET endpoint', () => {
  assert.match(apiClient, /export function getFacultyRetentionApi\(\)/);
  assert.match(apiClient, /return request\('GET', '\/faculty\/retention'\)/);
  assert.match(apiClient, /enrollmentId: string;/);
  assert.match(apiClient, /studentId: string;/);
  assert.match(apiClient, /classId: string;/);
  assert.match(apiClient, /studentNumber: string \| null;/);
  assert.match(apiClient, /subjectCode: string \| null;/);
  assert.match(apiClient, /'archived'/);
});

test('Retention mutations are backend-first and do not use local mutation fallbacks', () => {
  assert.match(retentionPage, /await saveFacultyRemedialApi\(/);
  assert.match(retentionPage, /await updateFacultyRetentionStatusApi\(/);
  assert.match(retentionPage, /const refreshed = await refreshRetention\(\);/);
  assert.doesNotMatch(retentionPage, /addRemedialExam/);
  assert.doesNotMatch(retentionPage, /updateRemedialExam/);
  assert.doesNotMatch(retentionPage, /overrideRetentionStatus/);
  assert.doesNotMatch(retentionPage, /deleteRemedialExam/);
  assert.doesNotMatch(retentionPage, /scheduled locally/i);
  assert.doesNotMatch(retentionPage, /updated locally/i);
});

test('Retention actions never submit synthetic identifiers or fabricated academic values', () => {
  assert.match(retentionPage, /enrollmentId: selectedScheduleRecord\.enrollmentId/);
  assert.match(retentionPage, /studentId: selectedScheduleRecord\.studentId/);
  assert.match(retentionPage, /classId: selectedScheduleRecord\.classId/);
  assert.match(retentionPage, /studentId: selectedResolveRecord\.studentId/);
  assert.match(retentionPage, /classId: selectedResolveRecord\.classId/);
  assert.match(retentionPage, /studentId: selectedOverrideRecord\.studentId/);
  assert.match(retentionPage, /classId: selectedOverrideRecord\.classId/);
  assert.doesNotMatch(retentionPage, /cls-1/);
  assert.doesNotMatch(retentionPage, /enr-\$\{Date\.now/);
  assert.doesNotMatch(retentionPage, /Date\.now\(\)/);
  assert.doesNotMatch(retentionPage, /Unknown Student/);
  assert.doesNotMatch(retentionPage, /2024-000/);
  assert.doesNotMatch(retentionPage, /CLIN401|CLIN402/);
  assert.doesNotMatch(retentionPage, /yearLevel/);
  assert.doesNotMatch(retentionPage, /originalGrade: [^\n]*(\|\||\?\?)/);
  assert.match(retentionPage, /Grade unavailable/);
  assert.match(retentionPage, /Student number unavailable/);
  assert.match(retentionPage, /record\.state !== 'archived'/);
  assert.match(retentionPage, /pendingExams/);
  assert.match(retentionPage, /Outcome unavailable/);
  assert.match(retentionPage, /hasRemedialShape/);
  assert.match(retentionPage, /row\.remedial\.status === 'pending'/);
  assert.match(retentionPage, /existing\.examDate\.trim\(\)\.length > 0/);
  assert.match(retentionPage, /existing\.dueDate\.trim\(\)\.length > 0/);
});

test('Unsupported remedial deletion is explicitly unavailable', () => {
  assert.match(retentionPage, /Removal unavailable/);
  assert.match(retentionPage, /no approved authoritative delete contract exists/i);
  assert.doesNotMatch(retentionPage, /Trash2/);
});

test('Subject-level risk rules do not fabricate client-derived decisions', () => {
  // The obsolete "Midterm Evaluation Rules" placeholder tab was removed (Owner decision 2026-09-29).
  assert.doesNotMatch(retentionPage, /Midterm Evaluation Rules/);
  assert.doesNotMatch(retentionPage, /riskRuleResults/);
  assert.doesNotMatch(retentionPage, /computeSubjectGrade/);
});

test('Midterm watchlist lists completed midterms without a final grade, at 2.50 or worse, and keeps server risk', () => {
  const body = retentionPage.match(/const isMidtermAtRisk = \(record: FacultyRetentionRecord\): boolean => \{([\s\S]*?)\r?\n\};/)?.[1];
  assert.ok(body);
  const isAtRisk = new Function('record', 'isFiniteNumber', 'percentageToGWA', body);
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  for (const [record, expected] of [
    [{ midtermComplete: true, midtermPercentage: 70, gwa: null }, true],
    [{ midtermComplete: true, midtermPercentage: 80, gwa: null }, true],
    [{ midtermComplete: true, midtermPercentage: 90, gwa: null }, false],
    [{ midtermComplete: true, midtermPercentage: 70, gwa: 2.75 }, false],
    [{ midtermComplete: true, midtermPercentage: null, gwa: null }, false],
    [{ midtermComplete: false, midtermPercentage: 70, gwa: null }, false],
  ] as const) assert.equal(isAtRisk(record, finite, percentageToGWA), expected);
  // The list, the count, and the At-Risk filter share the same rule; the badge prefers the server record.
  assert.match(retentionPage, /filteredRecords\.filter\(isMidtermAtRisk\)\.length/);
  assert.match(retentionPage, /if \(!showAtRiskOnly\) return computedRecords;/);
  assert.match(retentionPage, /return computedRecords\.filter\(isMidtermAtRisk\);/);
  assert.match(retentionPage, /record\.risk \?\? \{/);
  assert.match(retentionPage, /percentageToGWA\(record\.midtermPercentage\) >= 3\.0 \? 'High' : 'At Risk'/);
  assert.match(retentionPage, /if \(!risk\) return <span[^>]*>Not enough data<\/span>/);
  // Lock/unlock was removed on purpose (owhie8 UI, Owner-approved).
  assert.doesNotMatch(retentionPage, /unlockFacultyWatchlistApi|watchlistUnlocked|isMidtermRiskVisible/);
});

test('Remedial outcomes preserve entered scores and report partial success truthfully', () => {
  const selector = retentionPage.match(/const handleSelectOutcome[\s\S]*?\n  };/)?.[0];
  assert.ok(selector);
  assert.doesNotMatch(selector, /setRemedialScore/);
  assert.match(retentionPage, /if \(outcomeContradictsScore\)/);
  assert.match(retentionPage, /percentage: score/);
  assert.match(retentionPage, /notification\?\.created === true/);
  assert.match(retentionPage, /Attempt 1 was saved but Attempt 2 could not be scheduled/);
  const dashboard = fs.readFileSync(path.join(currentDirectory, '../pages/faculty/Dashboard.tsx'), 'utf8');
  assert.match(dashboard, /if \(outcomeContradictsScore\)/);
  assert.match(dashboard, /notification\?\.created === true/);
  assert.match(dashboard, /Attempt 1 was saved but Attempt 2 could not be scheduled/);
});
