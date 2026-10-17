import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { percentageToGWAExact } from '../utils/gradeHelper.ts';

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
  assert.match(retentionPage, /const refreshed = await refreshRetention\(\);/);
  assert.doesNotMatch(retentionPage, /addRemedialExam/);
  assert.doesNotMatch(retentionPage, /updateRemedialExam/);
  assert.doesNotMatch(retentionPage, /overrideRetentionStatus/);
  // Retention is computed only: no manual override in the page or the API client.
  assert.doesNotMatch(retentionPage, /updateFacultyRetentionStatusApi|openOverride|canOverrideRecord|manualOverride|Override Retention Status|>Manual</);
  assert.doesNotMatch(apiClient, /updateFacultyRetentionStatusApi|\/faculty\/retention\/status|manualOverride/);
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

test('Midterm Watchlist uses the server rule and shows At Risk with no levels', () => {
  // Rule A is decided on the server (midtermAtRisk); the client only reads it.
  assert.match(retentionPage, /const isMidtermAtRisk = \(record: FacultyRetentionRecord\): boolean => record\.midtermAtRisk === true;/);
  assert.match(apiClient, /midtermAtRisk\?: boolean;/);
  // BUCDM boundary the server rule relies on: 84% is 2.5 (flagged), 85% is 2.4.
  assert.equal(percentageToGWAExact(84.9, 'Midterm'), 2.5);
  assert.equal(percentageToGWAExact(85, 'Midterm'), 2.4);
  // The list, the count, and the At-Risk filter share the same rule; non-flagged complete midterms stay listed with the filter off.
  assert.match(retentionPage, /filteredRecords\.filter\(isMidtermAtRisk\)\.length/);
  assert.match(retentionPage, /if \(!showAtRiskOnly\) return computedRecords;/);
  assert.match(retentionPage, /return computedRecords\.filter\(isMidtermAtRisk\);/);
  assert.match(retentionPage, /&& readRemedialProgression\(record\)\.stage === 'none'/);
  assert.match(retentionPage, /isMidtermAtRisk\(record\) && \(/);
  // Names and wording.
  assert.match(retentionPage, /<span>Midterm Watchlist<\/span>/);
  assert.match(retentionPage, /Students whose midterm is fully graded and whose weighted midterm grade is 2\.5 or worse \(84% or below on the BUCDM table\)\. Students with a final course grade move to Retention Watchlist\./);
  assert.doesNotMatch(retentionPage, /Midterm Risk|Midterm Standing & Risk Evaluation/);
  // No levels, no projection badge, no Risk column on the Retention Watchlist.
  assert.doesNotMatch(retentionPage, /RiskBadge|record\.risk|'High'|Not enough data|assumedAssessments/);
  assert.doesNotMatch(retentionPage, /<th className="py-3 px-4">Risk<\/th>/);
  assert.match(retentionPage, /Final grades and computed retention status\./);
  // Retired retention states.
  assert.doesNotMatch(retentionPage, /'warning'|'critical'/);
  assert.doesNotMatch(apiClient, /'active' \| 'warning'/);
  // Lock/unlock was removed on purpose (owhie8 UI, Owner-approved).
  assert.doesNotMatch(retentionPage, /unlockFacultyWatchlistApi|watchlistUnlocked|isMidtermRiskVisible/);
});

test('Student Midterm Advisory reads the server flag and waits for ungraded midterms', () => {
  const studentPage = fs.readFileSync(path.join(currentDirectory, '../pages/student/RetentionMonitoring.tsx'), 'utf8');
  const types = fs.readFileSync(path.join(currentDirectory, '../types/index.ts'), 'utf8');
  assert.match(studentPage, /<span>Midterm Advisory<\/span>/);
  assert.match(studentPage, /Boolean\(r\.midtermEvaluation\?\.isAtRisk\)/);
  assert.match(studentPage, /Waiting for all midterm scores in \{record\.courseCode\} \(\{record\.midtermEvaluation\?\.gradedCount \?\? 0\} of \{record\.midtermEvaluation\?\.totalCount \?\? 0\} graded\)\./);
  assert.match(studentPage, /At Risk · Midterm/);
  assert.match(studentPage, /Advisory Reminder:/);
  assert.doesNotMatch(studentPage, /projection|Advisory Pending|Midterm Risk|midtermEvaluation\?\.risk/);
  assert.match(types, /gradedCount: number;/);
  assert.match(types, /totalCount: number;/);
  assert.doesNotMatch(types, /'warning' \| 'critical'|level: 'High'/);
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

test('Reports and dashboards show computed retention only, with At Risk and no levels', () => {
  const reports = fs.readFileSync(path.join(currentDirectory, '../pages/faculty/Reports.tsx'), 'utf8');
  const adminDashboard = fs.readFileSync(path.join(currentDirectory, '../pages/admin/Dashboard.tsx'), 'utf8');
  assert.match(reports, /record !== null && record\.state === 'remedial'/);
  assert.match(reports, /Standing GWA,At-Risk Courses,Risk Level,Remedial Status/);
  assert.match(reports, /atRiskCourses && atRiskCourses > 0 \? 'At Risk' : ''/);
  assert.match(reports, />At-Risk Courses<\/th>/);
  assert.match(reports, /Proportion of students by computed retention status/);
  assert.match(reports, /No retention distribution data available\./);
  assert.doesNotMatch(reports, /HIGH RISK|LOW RISK|Warning Count|Warning Status|Critical Watch|Warnings`/);
  assert.doesNotMatch(adminDashboard, /statusCounts\?\.(warning|critical)/);
});
