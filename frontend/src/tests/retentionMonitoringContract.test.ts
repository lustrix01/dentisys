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

test('Midterm watchlist visibility and risk remain server-owned', () => {
  const eligible = retentionPage.match(/const eligibleMidtermRecords = useMemo\(\(\) => filteredRecords\.filter\(record =>([\s\S]*?)\), \[filteredRecords\]\)/)?.[1];
  assert.ok(eligible);
  const visible = new Function('record', 'isFiniteNumber', `return (${eligible});`);
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  for (const [record, expected] of [
    [{ midtermComplete: true, gwa: null }, true],
    [{ midtermComplete: false, watchlistUnlocked: true }, true],
    [{ midtermComplete: false, watchlistUnlocked: false }, true],
    [{ midtermComplete: true, gwa: 2.49 }, false],
    [{ watchlistUnlocked: true, gwa: 3 }, false],
  ] as const) assert.equal(visible(record, finite), expected);
  assert.match(retentionPage, /record\.risk\?\.level === 'High' \|\| record\.risk\?\.level === 'At Risk'/);
  assert.doesNotMatch(retentionPage, /isMidtermAtRisk|record\.risk \?\? \{/);
  assert.match(retentionPage, /Unlocked .* Assessments incomplete/);
  assert.match(retentionPage, /handleComputeMidtermRisk/);
  assert.match(retentionPage, /handleComputeClassRisk/);
  assert.match(retentionPage, /await unlockFacultyWatchlistApi/);
});

test('Midterm risk is visible only after completion or unlock, with the same at-risk count and filter', () => {
  const visibility = retentionPage.match(/const isMidtermRiskVisible = \(record: FacultyRetentionRecord\): boolean => \(([\s\S]*?)\n\);/)?.[1];
  const atRisk = retentionPage.match(/const hasVisibleMidtermRisk = \(record: FacultyRetentionRecord\): boolean => \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(visibility);
  assert.ok(atRisk);
  const isVisible = new Function('record', `return (${visibility});`);
  const isAtRisk = new Function('record', 'isMidtermRiskVisible', `return (${atRisk});`);
  for (const midtermComplete of [true, false, undefined]) {
    for (const watchlistUnlocked of [true, false, undefined]) {
      for (const level of ['High', 'At Risk', 'Low', null]) {
        const record = { midtermComplete, watchlistUnlocked, risk: level ? { level } : null };
        const visible = midtermComplete === true || watchlistUnlocked === true;
        assert.equal(isVisible(record), visible);
        assert.equal(isAtRisk(record, isVisible), visible && (level === 'High' || level === 'At Risk'));
      }
    }
  }
  assert.match(retentionPage, /const atRiskMidtermCount = useMemo\(\(\) => eligibleMidtermRecords\.filter\(hasVisibleMidtermRisk\)\.length/);
  assert.match(retentionPage, /if \(!showAtRiskOnly\) return eligibleMidtermRecords;/);
  assert.match(retentionPage, /return eligibleMidtermRecords\.filter\(hasVisibleMidtermRisk\);/);
  assert.match(retentionPage, /isMidtermRiskVisible\(record\) \? <RiskBadge risk=\{record\.risk\} \/> : <span[^>]*>Locked<\/span>/);
  assert.match(retentionPage, /if \(!risk\) return <span[^>]*>Not enough data<\/span>/);
});

test('Retention phone cards share table rows and actions, with readable fields and touch targets', () => {
  assert.equal((retentionPage.match(/className=\{`\$\{RETENTION_TABLE_LAYOUT\}/g) ?? []).length, 3);
  assert.match(retentionPage, /max-sm:\[&_tr\]:grid-cols-1/);
  assert.match(retentionPage, /max-sm:\[&_td\]:whitespace-normal/);
  assert.match(retentionPage, /max-sm:\[&_button\]:min-h-10/);
  assert.match(retentionPage, /max-sm:\[&_td>div\]:flex-wrap/);
  for (const label of ['Midterm Grade', 'Risk Standing', 'Status', 'Course Grade', 'Actions', 'Attempts', 'Current stage']) {
    assert.ok(retentionPage.includes(`<PhoneFieldLabel>${label}</PhoneFieldLabel>`));
  }
  assert.doesNotMatch(retentionPage, /Final Midterm Grade/);
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
