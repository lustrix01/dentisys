import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  assert.match(retentionPage, /GWA unavailable/);
  assert.match(retentionPage, /Student number unavailable/);
});

test('Unsupported remedial deletion is explicitly unavailable', () => {
  assert.match(retentionPage, /Removal unavailable/);
  assert.match(retentionPage, /no approved authoritative delete contract exists/i);
  assert.doesNotMatch(retentionPage, /Trash2/);
});

test('Subject-level risk rules do not fabricate client-derived decisions', () => {
  assert.match(retentionPage, /authoritative retention endpoint does not expose the attendance components/i);
  assert.match(retentionPage, /No client-derived risk results are shown/);
  assert.doesNotMatch(retentionPage, /riskRuleResults/);
  assert.doesNotMatch(retentionPage, /computeSubjectGrade/);
});
