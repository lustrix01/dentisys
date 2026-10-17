import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDefaultPeriodDraft,
  buildDefaultLectureLaboratoryCategories,
  validateDateRanges,
  normalizeDateRangesForPayload,
  formatPeriodIncompleteReason,
  buildRowCompositeKey,
  extractPeriodEvaluation,
  generateGradeSummaryCSV,
  isValidCalendarDate,
} from '../utils/periodGradingHelper.ts';
import { percentageToGWAExact, matchesActivityFilters, saveStatusBadge } from '../utils/gradeHelper.ts';
import type { FacultyLegacyComputedResult, FacultyPeriodModeComputedResult, FacultyPeriodModeIncompleteResult } from '../services/apiClient.ts';

test('Grade Weights banner shows the current schema and the saved or unsaved badges', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const start = source.indexOf('<span>BU Dental Medicine {loadedConfig');
  assert.ok(start >= 0);
  const banner = source.slice(start, source.indexOf('</span>', start) + '</span>'.length);
  const compiled = ts.transpileModule(`return (${banner});`, {
    fileName: 'banner.tsx',
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = (loadedConfig: object | null, midterm: string, final: string) => renderToStaticMarkup(
    new Function('React', 'loadedConfig', 'componentWeights', 'termRatio', compiled)(
      React, loadedConfig, { lecture: '60', laboratory: '40' }, { midterm, final }
    )
  );
  assert.equal(render({ version: 1 }, '35', '65'), '<span>BU Dental Medicine Schema Active: Lecture 60% / Lab 40% • Midterm 35% / Final 65%</span>');
  assert.equal(render(null, '35', '65'), '<span>BU Dental Medicine Default Grade Weights: Lecture 60% / Lab 40% • Midterm 35% / Final 65%</span>');
  // Unsaved edits replace the banner; saved versus unsaved presets are badges.
  assert.match(source, /\{isDirty \? \(/);
  assert.match(source, /You have unsaved changes\. Adjust weights or categories directly below, then click Save Grade Weights\./);
  assert.match(source, /Version \{loadedConfig\.version\}/);
  assert.match(source, /Suggested starting preset — unsaved/);
  assert.match(source, /activePeriodEditorTab === 'Midterm' \? 'Midterm' : 'Finals'\} • \{activeComponentEditorTab\} Categories/);
});

test('Score panels keep one manual Save per view, show the clear count, and warn before leaving with unsaved scores', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  assert.equal((source.match(/onClick=\{handleManualSaveScores\}/g) ?? []).length, 1);
  assert.equal((source.match(/onClick=\{handleSaveMatrixScores\}/g) ?? []).length, 1);
  assert.match(source, /`Save Scores Sheet\$\{singlePendingClears\.size > 0 \? ` \(\$\{singlePendingClears\.size\} to clear\)` : ''\}`/);
  assert.match(source, /`Save All Matrix Scores\$\{matrixPendingClears\.size > 0 \? ` \(\$\{matrixPendingClears\.size\} to clear\)` : ''\}`/);
  // Save buttons are never disabled while a save runs; the next save is queued instead.
  const saveButtons = [...source.matchAll(/<button\s+onClick=\{(?:handleManualSaveScores|handleSaveMatrixScores)\}[^>]*>/g)];
  assert.equal(saveButtons.length, 2);
  for (const [button] of saveButtons) assert.doesNotMatch(button, /disabled=\{/);
  // Auto-save toggle exists in Single view only; the matrix always auto-saves.
  assert.match(source, /checked=\{autoSaveEnabled\}/);
  assert.match(source, /Auto-save on/);
  assert.match(source, /addEventListener\('beforeunload', warnUnsaved\)/);
  assert.match(source, /if \(!singleDirtyRef\.current && !matrixDirtyRef\.current\r?\n\s+&& !singleDebounceTimerRef\.current && !matrixDebounceTimerRef\.current\) return;/);
  assert.match(source, /removeEventListener\('beforeunload', warnUnsaved\)/);
});

test('Matrix keeps its sticky header and arrow-key input navigation', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  assert.match(matrix, /<thead className="sticky top-0 z-10/);
  assert.match(matrix, /const inputId = `matrix-score-\$\{studentIndex\}-\$\{assessment\.id\}`/);
  assert.match(matrix, /matrix-score-\$\{studentIndex \+ 1\}-\$\{assessment\.id\}/);
  assert.match(matrix, /matrix-score-\$\{studentIndex - 1\}-\$\{assessment\.id\}/);
  assert.match(matrix, /e\.key === 'Enter' \|\| e\.key === 'ArrowDown'/);
  assert.match(matrix, /e\.key === 'ArrowUp'/);
  assert.match(matrix, /pendingClearKeys\?\.has\(`\$\{student\.id\}\|\$\{assessment\.id\}`\)/);
  assert.match(matrix, /border-amber-400 bg-amber-50/);
  // The phone switch was removed on purpose (owhie8 UI, Owner-approved).
  assert.doesNotMatch(matrix, /isPhone|onSingleActivityView|matchMedia/);
});

test('Matrix renders exactly one identity header and matching ID and name body cells', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  assert.equal((matrix.match(/>Student Info<\/th>/g) ?? []).length, 1);
  const render = (jsx: string, periodMode: boolean) => {
    const compiled = ts.transpileModule(`return (<table>${jsx}</table>);`, {
      fileName: 'identity.tsx', compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return renderToStaticMarkup(new Function('React', 'periodMode', 'th', 'student', 'pinId', 'pinName', 'pinHead', 'pinBody', 'pinBoth', compiled)(
      React, periodMode, '', { name: 'Alice Reyes', studentId: 'DENT-001' }, '', '', '', '', false
    ));
  };
  const line = (text: string) => matrix.split('\n').find(row => row.includes(text))!.trim();
  const group = render(`<thead><tr>${line('>Student Info</th>')}</tr></thead>`, true);
  assert.match(group, /colSpan="2"/i);
  for (const periodMode of [false, true]) {
    const headers = render(`<thead><tr>${line('>ID Number</th>')}${line('>Full Name</th>')}</tr></thead>`, periodMode);
    assert.equal((headers.match(/<th /g) ?? []).length, 2);
    assert.match(headers, new RegExp(`rowSpan="${periodMode ? 3 : 1}"`, 'i'));
    const body = render(`<tbody><tr>${line('{student.studentId}</td>')}${line('{student.name}</td>')}</tr></tbody>`, periodMode);
    assert.equal((body.match(/<td /g) ?? []).length, 2);
    assert.equal((body.match(/DENT-001/g) ?? []).length, 1);
    assert.equal((body.match(/Alice Reyes/g) ?? []).length, 1);
  }
});

test('Gradebook matrix component values and weight labels use only saved server data', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  // Owner-approved: unsaved/unconfigured offerings show the 60/40 syllabus default; saved weights win.
  assert.match(matrix, /const lectureWeight = config\.componentWeights\?\.lecture \?\? 60;/);
  assert.match(matrix, /const labWeight = config\.componentWeights\?\.laboratory \?\? 40;/);
  assert.match(matrix, /comp\.weight !== undefined \? `\(\$\{comp\.weight\}%\)` : ''/);
  assert.match(matrix, /Calculated columns use the server's grade computation of the saved scores/);
  const source = matrix.slice(matrix.indexOf('  const componentPercentage ='), matrix.indexOf('  const getVisibleComponents ='));
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const percentage = (breakdown: unknown, componentKey = 'lecture', categoryIds: number[] = [1]) => new Function('periodBreakdown', 'format', 'comp', compiled + 'return componentPercentage("student", "midterm", comp);')(
    () => breakdown,
    (value: number) => Number.isFinite(value) ? value.toFixed(2) : '—',
    { componentKey, categories: categoryIds.map(id => ({ category: { id } })) }
  );
  assert.equal(percentage(undefined), '—');
  assert.equal(percentage({ categories: [] }), '—');
  // The server component percentage wins when present, including 0.
  assert.equal(percentage({ components: { lecture: { percentage: 0 } }, categories: [{ categoryId: 1, contribution: 85 }] }), '0.00');
  assert.equal(percentage({ components: { lecture: { percentage: 81.25 } } }), '81.25');
  assert.equal(percentage({ components: { laboratory: { percentage: 92.5 } } }, 'laboratory'), '92.50');
  // Legacy grids without a server component total sum the contributions of this component's categories only.
  assert.equal(percentage({ categories: [{ categoryId: 1, contribution: 85 }] }), '85.00');
  assert.equal(percentage({ components: { lecture: { percentage: null } }, categories: [{ categoryId: 1, contribution: 50 }, { categoryId: 2, contribution: 30.5 }, { categoryId: 3, contribution: 99 }] }, 'lecture', [1, 2]), '80.50');
  assert.equal(percentage({ categories: [{ categoryId: 9, contribution: 85 }] }), '—', 'categories outside the component are ignored');
  assert.equal(percentage({ categories: [{ categoryId: 1 }] }), '—', 'no contribution means no value');
});

test('Faculty grade views use the inclusive authoritative retention boundary', () => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const gradeComputation = fs.readFileSync(
    path.join(currentDirectory, '../pages/faculty/GradeComputation.tsx'),
    'utf8'
  );
  assert.doesNotMatch(gradeComputation, /(?:overallGwa|subj\.grade)\s*>=?\s*settings\.retentionThreshold/);
  const retentionRules = [...gradeComputation.matchAll(/const isFailsRetention = ([\s\S]*?);/g)];
  assert.equal(retentionRules.length, 4, 'table and print views cover both period and legacy grades');
  for (const [, expression] of retentionRules) {
    assert.match(expression, /retentionState === 'remedial'/);
    assert.match(expression, /percentageToGWAExact\(evalResult\.overallPercentage\) >= settings\.retentionThreshold/);
    const failsRetention = new Function('subj', 'evalResult', 'percentageToGWAExact', 'settings', `return (${expression});`);
    for (const [percentage, retentionState, expected] of [
      [85, 'active', false],
      [84, 'remedial', true],
      [84.99, 'remedial', true],
      [81, 'remedial', true],
      [85, undefined, false],
      [84, undefined, true],
      [84.99, undefined, true],
      [null, undefined, false],
      [Number.NaN, undefined, false],
    ] as const) {
      assert.equal(failsRetention(
        { isClinical: true },
        { overallGwa: 2.5, overallPercentage: percentage, retentionState },
        percentageToGWAExact,
        { retentionThreshold: 2.5 },
      ), expected, `percentage ${percentage}, server state ${retentionState}`);
    }
  }
});

test('Period Draft: buildDefaultPeriodDraft produces the mandatory Lecture/Laboratory defaults', () => {
  const draft = buildDefaultPeriodDraft();
  assert.deepEqual(draft.componentWeights, { lecture: '60', laboratory: '40' });
  assert.equal(draft.termRatio.midterm, '30');
  assert.equal(draft.termRatio.final, '70');
  for (const categories of [draft.midtermCategories, draft.finalCategories]) {
    assert.equal(categories.length, 8);
    const lecture = categories.filter(category => category.component === 'Lecture');
    const laboratory = categories.filter(category => category.component === 'Laboratory');
    assert.deepEqual(
      lecture.map(({ name, weight }) => ({ name, weight })),
      [
        { name: 'Term Exam', weight: '50' },
        { name: 'Quiz', weight: '20' },
        { name: 'Outputs', weight: '20' },
        { name: 'Participation', weight: '10' },
      ]
    );
    assert.deepEqual(
      laboratory.map(({ name, weight }) => ({ name, weight })),
      [
        { name: 'Practical Exam', weight: '50' },
        { name: 'Laboratory Exercises', weight: '30' },
        { name: 'Quiz', weight: '10' },
        { name: 'Recitation', weight: '10' },
      ]
    );
    assert.equal(lecture.reduce((total, category) => total + Number(category.weight), 0), 100);
    assert.equal(laboratory.reduce((total, category) => total + Number(category.weight), 0), 100);
    assert.ok(categories.every(category => category.sourceKind === 'assessment'));
  }
  assert.deepEqual(
    draft.midtermCategories.map(({ name, component }) => [name, component]),
    draft.finalCategories.map(({ name, component }) => [name, component])
  );

  // Date ranges are blank by default
  assert.equal(draft.attendanceDateRanges.midterm.startDate, '');
  assert.equal(draft.attendanceDateRanges.midterm.endDate, '');
  assert.equal(draft.attendanceDateRanges.final.startDate, '');
  assert.equal(draft.attendanceDateRanges.final.endDate, '');
});

test('Composite Row Keying: generates distinct keys for categories across periods', () => {
  // Legacy category ID 10 can appear in both Midterm and Finals without collision
  const mKey = buildRowCompositeKey('Midterm', 10);
  const fKey = buildRowCompositeKey('Final', 10);
  assert.equal(mKey, 'Midterm:10');
  assert.equal(fKey, 'Final:10');
  assert.notEqual(mKey, fKey);

  const newKey = buildRowCompositeKey('Midterm', null, 'temp-99');
  assert.equal(newKey, 'Midterm:temp-99');
});

test('Default Lecture/Laboratory categories keep repeated names distinct by component', () => {
  for (const period of ['Midterm', 'Final'] as const) {
    const categories = buildDefaultLectureLaboratoryCategories(period);
    const lecture = categories.filter(category => category.component === 'Lecture');
    const laboratory = categories.filter(category => category.component === 'Laboratory');
    const sum = (rows: typeof categories) => rows.reduce((total, row) => total + Number(row.weight), 0);

    assert.equal(lecture.length, 4);
    assert.equal(laboratory.length, 4);
    assert.equal(sum(lecture), 100);
    assert.equal(sum(laboratory), 100);
    assert.equal(lecture.find(category => category.name === 'Quiz')?.weight, '20');
    assert.equal(laboratory.find(category => category.name === 'Quiz')?.weight, '10');
    assert.notEqual(lecture.find(category => category.name === 'Quiz')?.compositeKey, laboratory.find(category => category.name === 'Quiz')?.compositeKey);
    assert.ok(categories.every(category => category.gradingPeriod === period && category.sourceKind === 'assessment'));
    assert.equal(categories.filter(category => category.sourceKind === 'attendance').length, 0);
  }
});

test('Date Ranges Validation: accepts valid non-overlapping ranges and allowed gaps', () => {
  const valid = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-15' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' }, // gap between Oct 15 and Oct 20
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.error, undefined);
});

test('Date Ranges Validation: accepts blank dates for save', () => {
  const blank = validateDateRanges({
    midterm: { startDate: '', endDate: '' },
    final: { startDate: '', endDate: '' },
  });
  assert.equal(blank.valid, true);
});

test('Date Ranges Validation: rejects reversed start/end dates', () => {
  const reversed = validateDateRanges({
    midterm: { startDate: '2026-10-15', endDate: '2026-08-01' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(reversed.valid, false);
  assert.match(reversed.error || '', /Midterm start date must be on or before end date/);
});

test('Date Ranges Validation: rejects Midterm ending on or after Finals starts', () => {
  // Overlapping
  const overlap = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-25' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(overlap.valid, false);
  assert.match(overlap.error || '', /Midterm attendance must end before Finals attendance starts/);

  // Same-day boundary
  const sameDay = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-20' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(sameDay.valid, false);
  assert.match(sameDay.error || '', /Midterm attendance must end before Finals attendance starts/);
});

test('Calendar Date Validation: isValidCalendarDate strictly validates real calendar dates', () => {
  // Impossible days for February
  assert.equal(isValidCalendarDate('2026-02-31'), false);
  assert.equal(isValidCalendarDate('2026-02-30'), false);
  assert.equal(isValidCalendarDate('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(isValidCalendarDate('2024-02-29'), true);  // 2024 is a leap year

  // 30-day months cannot have day 31
  assert.equal(isValidCalendarDate('2026-04-31'), false); // April
  assert.equal(isValidCalendarDate('2026-06-31'), false); // June
  assert.equal(isValidCalendarDate('2026-09-31'), false); // September
  assert.equal(isValidCalendarDate('2026-11-31'), false); // November

  // Valid dates
  assert.equal(isValidCalendarDate('2026-04-30'), true);
  assert.equal(isValidCalendarDate('2026-08-01'), true);
  assert.equal(isValidCalendarDate('2026-12-31'), true);

  // Invalid formats and out-of-range components
  assert.equal(isValidCalendarDate('2026-00-15'), false);
  assert.equal(isValidCalendarDate('2026-13-01'), false);
  assert.equal(isValidCalendarDate('2026-05-00'), false);
  assert.equal(isValidCalendarDate('2026-05-32'), false);
  assert.equal(isValidCalendarDate('invalid-date'), false);
});

test('Date Ranges Validation: rejects impossible calendar dates such as February 31', () => {
  const feb31Midterm = validateDateRanges({
    midterm: { startDate: '2026-02-31', endDate: '2026-03-15' },
    final: { startDate: '2026-03-16', endDate: '2026-05-15' },
  });
  assert.equal(feb31Midterm.valid, false);
  assert.equal(feb31Midterm.error, 'Midterm start date must be a valid calendar date in YYYY-MM-DD format.');

  const april31Final = validateDateRanges({
    midterm: { startDate: '2026-01-15', endDate: '2026-03-15' },
    final: { startDate: '2026-03-16', endDate: '2026-04-31' },
  });
  assert.equal(april31Final.valid, false);
  assert.equal(april31Final.error, 'Finals end date must be a valid calendar date in YYYY-MM-DD format.');
});

test('Date Ranges Normalization: serializes blank strings to null', () => {
  const normalized = normalizeDateRangesForPayload({
    midterm: { startDate: '  ', endDate: '2026-10-15' },
    final: { startDate: '', endDate: '' },
  });
  assert.deepEqual(normalized, {
    midterm: { startDate: null, endDate: '2026-10-15' },
    final: { startDate: null, endDate: null },
  });
});

test('Period Incomplete Reasons: formats server reasons to human-readable strings', () => {
  assert.equal(formatPeriodIncompleteReason('missing_date_range'), 'Missing Date Range');
  assert.equal(formatPeriodIncompleteReason('no_sessions'), 'No Sessions');
  assert.equal(formatPeriodIncompleteReason('unresolved_attendance'), 'Unresolved Attendance');
  assert.equal(formatPeriodIncompleteReason('no_assessment_results'), 'No Assessment Results');
  assert.equal(formatPeriodIncompleteReason('missing_assessment_score'), 'Missing Assessment Score');
  assert.equal(formatPeriodIncompleteReason('unresolved_assessment_attendance'), 'Unresolved Transmuted Attendance');
  assert.equal(formatPeriodIncompleteReason('duplicate_attendance_sources'), 'Duplicate Attendance');
});

test('Evaluation Extraction: handles complete period computed results', () => {
  const computedResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '101',
    studentId: '201',
    percentage: 89.5,
    gwa: 1.8,
    retentionState: 'active',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'computed',
        percentage: 88.75,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 90.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'computed',
          percentage: 88.75,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 90.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
  };

  const evaluation = extractPeriodEvaluation(null, computedResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, 88.75);
  assert.equal(evaluation.finalPercentage, 90.0);
  assert.equal(evaluation.overallGwa, 1.8);
  assert.equal(evaluation.statusText, 'PASS');
  assert.equal(evaluation.retentionState, 'active');
  const boundaryResult = { ...computedResult, percentage: 85, gwa: 2.4, retentionState: 'active' };
  const boundaryEvaluation = extractPeriodEvaluation(null, boundaryResult);
  assert.equal(boundaryEvaluation.overallGwa, 2.4);
  assert.equal(boundaryEvaluation.overallPercentage, 85);
  assert.equal(boundaryEvaluation.retentionState, 'active');

});

test('Evaluation Extraction: handles incomplete period with zero-weight without blocking overall', () => {
  // A zero-weight Midterm is incomplete due to missing date range, but overall is computed from 100% Final!
  const zeroWeightResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '102',
    studentId: '202',
    percentage: 90.0,
    gwa: 1.8,
    retentionState: 'active',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'missing_date_range' }],
        attendanceDateRange: { startDate: null, endDate: null },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 90.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 0, final: 100 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'missing_date_range' }],
          attendanceDateRange: { startDate: null, endDate: null },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 90.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
  };

  const evaluation = extractPeriodEvaluation(null, zeroWeightResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, null);
  assert.deepEqual(evaluation.midtermReasons, ['Missing Date Range']);
  assert.equal(evaluation.finalPercentage, 90.0);
  assert.equal(evaluation.overallGwa, 1.8);
  assert.equal(evaluation.statusText, 'PASS');
});

test('Evaluation Extraction: preserves prior persisted grade when recomputation is incomplete', () => {
  const incompleteResult: FacultyPeriodModeIncompleteResult = {
    status: 'incomplete_period',
    enrollmentId: '103',
    studentId: '203',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'unresolved_attendance' }],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 85.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'unresolved_attendance' }],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 85.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
    previouslyPersisted: true,
    previousPercentage: 78.5,
    previousGwa: 2.25,
  };

  const evaluation = extractPeriodEvaluation(null, incompleteResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, null);
  assert.deepEqual(evaluation.midtermReasons, ['Unresolved Attendance']);
  assert.equal(evaluation.overallGwa, null);
  assert.equal(evaluation.historicalGwa, 2.25);
  assert.equal(evaluation.isIncomplete, true);
  assert.equal(evaluation.statusText, 'INCOMPLETE');
});

test('Evaluation Extraction: uncomputed period mode shows pending state and hides legacy grade', () => {
  // Legacy enrolled subject with grade 1.8
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 1.8,
    isClinical: true,
    hasRemedial: false,
    components: {
      quizzes: 85,
      exams: 88,
      practicum: 90,
      attendance: 95,
    },
  };

  // When configured in period mode without compute result
  const evaluation = extractPeriodEvaluation(legacySubj as any, null, 'periods');
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermStatus, 'pending');
  assert.equal(evaluation.midtermPercentage, null);
  assert.equal(evaluation.finalStatus, 'pending');
  assert.equal(evaluation.finalPercentage, null);
  assert.equal(evaluation.overallGwa, null);
  assert.equal(evaluation.historicalGwa, null);
  assert.equal(evaluation.isIncomplete, true);
  assert.equal(evaluation.statusText, 'PENDING');
});

test('Evaluation Extraction: a saved overall-category grade remains historical while period grading is pending', () => {
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 1.8,
    components: {
      calculationMode: 'authoritative_categories',
      categories: [{ categoryId: 10, name: 'Quizzes', contribution: 22.5 }],
    },
  };

  const evaluation = extractPeriodEvaluation(legacySubj as any, null, 'periods');
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermStatus, 'pending');
  assert.equal(evaluation.finalStatus, 'pending');
  assert.equal(evaluation.overallGwa, null);
  assert.equal(evaluation.historicalGwa, 1.8);
  assert.equal(evaluation.statusText, 'PENDING');
});

test('Evaluation Extraction: incomplete result without confirmed persisted grade does NOT fall back to subj.grade', () => {
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 2.00,
    isClinical: true,
    hasRemedial: false,
    components: {
      quizzes: 80,
      exams: 80,
      practicum: 80,
      attendance: 80,
    },
  };

  const incompleteResult: FacultyPeriodModeIncompleteResult = {
    status: 'incomplete_period',
    enrollmentId: '104',
    studentId: '204',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'unresolved_attendance' }],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 85.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'unresolved_attendance' }],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 85.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
    previouslyPersisted: false,
    previousPercentage: null,
    previousGwa: null,
  };

  const evalResult = extractPeriodEvaluation(legacySubj as any, incompleteResult);
  assert.equal(evalResult.isPeriodMode, true);
  assert.equal(evalResult.overallGwa, null);
  // Must NOT fall back to subj.grade (2.00) because previouslyPersisted is false!
  assert.equal(evalResult.historicalGwa, null);
  assert.equal(evalResult.statusText, 'INCOMPLETE');
});

test('CSV Generation: exports distinct period percentages without copying overall grades', () => {
  const dummyStudents = [
    {
      id: 's1',
      studentId: 'DENT-001',
      name: 'Alice Reyes',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 1.8,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            periods: {
              midterm: { period: 'Midterm', status: 'computed', percentage: 88.75, categories: [], incomplete: [] },
              final: { period: 'Final', status: 'computed', percentage: 90.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 1.8,
      remedialExams: [],
      classSections: [],
    },
    {
      id: 's2',
      studentId: 'DENT-002',
      name: 'Bob Santos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 0,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'missing_date_range' }] },
              final: { period: 'Final', status: 'computed', percentage: 90.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 0,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');

  assert.equal(lines[0], 'Student Number,Student Name,Midterm %,Final %,Overall GWA,Status');
  // Student 1: distinct Midterm 88.75%, Final 90.00%, Overall GWA 1.8
  assert.equal(lines[1], '"DENT-001","Alice Reyes","88.75%","90.00%","1.8","PASS"');
  // Student 2: Midterm Incomplete (Missing Date Range), Final 90.00%, Overall GWA Incomplete
  assert.equal(lines[2], '"DENT-002","Bob Santos","Incomplete (Missing Date Range)","90.00%","Incomplete","INCOMPLETE"');
});

test('CSV Generation: combined period row with a comma in the midterm reason still has exactly 6 columns', () => {
  const dummyStudents = [
    {
      id: 's9',
      studentId: 'DENT-009',
      name: 'Reyes, Alice',
      enrolledSubjects: [
        {
          code: 'CLIN401',
          grade: 0,
          components: {
            calculationMode: 'authoritative_periods',
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'missing_quiz,_exam' }] },
              final: { period: 'Final', status: 'computed', percentage: 90.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
    },
  ] as any;
  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const row = csv.split('\n')[1];
  const cells = Array.from(row.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), m => m[1]);
  assert.equal(cells.length, 6);
  assert.equal(cells[1], 'Reyes, Alice');
  assert.equal(cells[2], 'Incomplete (missing quiz, exam)');
});

test('CSV Generation: incomplete recomputation with prior GWA marks status INCOMPLETE and records prior grade only when server confirmed', () => {
  const dummyStudents = [
    {
      id: 's3',
      studentId: 'DENT-003',
      name: 'Clara Santos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 2.00,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            previouslyPersisted: true,
            previousGwa: 2.00,
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'unresolved_attendance' }] },
              final: { period: 'Final', status: 'computed', percentage: 85.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 2.00,
      remedialExams: [],
      classSections: [],
    },
    {
      id: 's4',
      studentId: 'DENT-004',
      name: 'Danilo Cruz',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 2.50,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            previouslyPersisted: false,
            previousGwa: null,
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'unresolved_attendance' }] },
              final: { period: 'Final', status: 'computed', percentage: 85.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 2.50,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');
  // Student 3 has previouslyPersisted: true -> Prior: 2.0 (Historical)
  assert.equal(lines[1], '"DENT-003","Clara Santos","Incomplete (Unresolved Attendance)","85.00%","Prior: 2.0 (Historical)","INCOMPLETE"');
  // Student 4 has previouslyPersisted: false -> Incomplete (no fallback to subj.grade 2.50)
  assert.equal(lines[2], '"DENT-004","Danilo Cruz","Incomplete (Unresolved Attendance)","85.00%","Incomplete","INCOMPLETE"');
});

test('CSV Generation: uncomputed period mode outputs Pending and PENDING', () => {
  const dummyStudents = [
    {
      id: 's5',
      studentId: 'DENT-005',
      name: 'Elena Ramos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 1.8, // Legacy grade from earlier semester
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 85,
            exams: 85,
            practicum: 85,
            attendance: 90,
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 1.8,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student Number,Student Name,Midterm %,Final %,Overall GWA,Status');
  assert.equal(lines[1], '"DENT-005","Elena Ramos","Pending","Pending","Pending","PENDING"');
});

test('CSV Generation: legacy mode exports accurately labeled overall columns without duplicating overall grade', () => {
  const dummyStudents = [
    {
      id: 's4',
      studentId: 'DENT-004',
      name: 'David Lim',
      email: '',
      yearLevel: 3 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'ANAT101',
          name: 'General Anatomy',
          units: 3,
          grade: 1.5,
          isClinical: false,
          hasRemedial: false,
          components: {
            quizzes: 85.0,
            practicum: 90.0,
            exams: 88.0,
            attendance: 95.0,
          },
        },
      ],
      clinicHoursCompleted: 0,
      overallGWA: 1.5,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'ANAT101', false);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student Number,Student Name,Quizzes,Practicum,Exams,Attendance,Overall GWA,Remarks');
  assert.equal(lines[1], '"DENT-004","David Lim","85.0%","90.0%","88.0%","95.0%","1.5","PASS"');
});

test('Lecture/Laboratory evaluation exposes all four period components and grouped CSV headers', () => {
  const component = (name: 'Lecture' | 'Laboratory', percentage: number) => ({
    component: name,
    status: 'computed' as const,
    percentage,
    categories: [],
    incomplete: [],
  });
  const period = (name: 'Midterm' | 'Final', percentage: number, lecture: number, laboratory: number) => ({
    period: name,
    status: 'computed' as const,
    percentage,
    categories: [],
    incomplete: [],
    attendanceDateRange: { startDate: null, endDate: null },
    components: { lecture: component('Lecture', lecture), laboratory: component('Laboratory', laboratory) },
  });
  const groupedResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '801',
    studentId: '701',
    percentage: 88.4,
    gwa: 1.7,
    retentionState: 'active',
    periods: {
      midterm: period('Midterm', 87, 81, 91),
      final: period('Final', 89, 93, 83),
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 30, final: 70 },
      periods: {
        midterm: period('Midterm', 87, 81, 91),
        final: period('Final', 89, 93, 83),
      },
      retentionThreshold: 2.5,
    },
  };
  const student = {
    id: 'student-701',
    studentId: '=DENT-007',
    name: 'Alice Reyes',
    email: '',
    yearLevel: 2 as const,
    status: 'active' as const,
    enrolledSubjects: [{
      code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, enrollmentId: '801',
      grade: 1.7, isClinical: false, hasRemedial: false,
    }],
    clinicHoursCompleted: 0,
    overallGWA: 1.7,
    remedialExams: [],
    classSections: [],
  };

  const evaluation = extractPeriodEvaluation(student.enrolledSubjects[0] as any, groupedResult);
  assert.equal(evaluation.midtermComponents?.lecture.percentage, 81);
  assert.equal(evaluation.midtermComponents?.laboratory.percentage, 91);
  assert.equal(evaluation.finalComponents?.lecture.percentage, 93);
  assert.equal(evaluation.finalComponents?.laboratory.percentage, 83);

  const csv = generateGradeSummaryCSV([student] as any, 'CLIN401', true, new Map([['801', groupedResult]]), 'lecture_laboratory');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student Number,Student Name,Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %,Overall GWA,Status');
  assert.equal(lines[1], "\"'=DENT-007\",\"Alice Reyes\",\"81.00%\",\"91.00%\",\"87.00%\",\"93.00%\",\"83.00%\",\"89.00%\",\"1.7\",\"PASS\"");

  const groupedResultWithoutComponents: FacultyPeriodModeComputedResult = {
    ...groupedResult,
    periods: {
      midterm: { ...groupedResult.periods.midterm, components: undefined },
      final: { ...groupedResult.periods.final, components: undefined },
    },
  };
  const missingComponentCsv = generateGradeSummaryCSV(
    [student] as unknown as Parameters<typeof generateGradeSummaryCSV>[0],
    'CLIN401',
    true,
    new Map([['801', groupedResultWithoutComponents]]),
    'lecture_laboratory'
  );
  const missingComponentRow = missingComponentCsv.trim().split('\n')[1];
  assert.equal(
    missingComponentRow,
    '"\'=DENT-007","Alice Reyes","Unavailable (recompute required)","Unavailable (recompute required)","87.00%","Unavailable (recompute required)","Unavailable (recompute required)","89.00%","1.7","PASS"'
  );
});

test('Lecture/Laboratory CSV quotes embedded text and neutralizes formula-leading cells', () => {
  const incompleteResult: FacultyPeriodModeIncompleteResult = {
    status: 'incomplete_period',
    enrollmentId: '802',
    studentId: '702',
    periods: {
      midterm: {
        period: 'Midterm', status: 'incomplete', percentage: null, categories: [],
        incomplete: [{ reason: 'missing_assessment_score' }],
        attendanceDateRange: { startDate: null, endDate: null },
        components: {
          lecture: { component: 'Lecture', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'missing "lab", score\nplease' as 'missing_assessment_score' }] },
          laboratory: { component: 'Laboratory', status: 'incomplete', percentage: null, categories: [], incomplete: [] },
        },
      },
      final: {
        period: 'Final', status: 'computed', percentage: 95, categories: [], incomplete: [],
        attendanceDateRange: { startDate: null, endDate: null },
        components: {
          lecture: { component: 'Lecture', status: 'computed', percentage: 93, categories: [], incomplete: [] },
          laboratory: { component: 'Laboratory', status: 'computed', percentage: 83, categories: [], incomplete: [] },
        },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods', termRatio: { midterm: 30, final: 70 },
      periods: {
        midterm: {
          period: 'Midterm', status: 'incomplete', percentage: null, categories: [],
          incomplete: [{ reason: 'missing_assessment_score' }],
          attendanceDateRange: { startDate: null, endDate: null },
          components: {
            lecture: { component: 'Lecture', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'missing "lab", score\nplease' as 'missing_assessment_score' }] },
            laboratory: { component: 'Laboratory', status: 'incomplete', percentage: null, categories: [], incomplete: [] },
          },
        },
        final: {
          period: 'Final', status: 'computed', percentage: 95, categories: [], incomplete: [],
          attendanceDateRange: { startDate: null, endDate: null },
          components: {
            lecture: { component: 'Lecture', status: 'computed', percentage: 93, categories: [], incomplete: [] },
            laboratory: { component: 'Laboratory', status: 'computed', percentage: 83, categories: [], incomplete: [] },
          },
        },
      },
      retentionThreshold: 2.5,
    },
    previouslyPersisted: true,
    previousPercentage: 88,
    previousGwa: 2,
  };
  const student = {
    id: 'student-702',
    studentId: '@DENT-008',
    name: '=Dana, "Quoted"\nStudent',
    email: '',
    yearLevel: 2 as const,
    status: 'active' as const,
    enrolledSubjects: [{
      code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, enrollmentId: '802',
      grade: 2, isClinical: false, hasRemedial: false,
    }],
    clinicHoursCompleted: 0,
    overallGWA: 2,
    remedialExams: [],
    classSections: [],
  };

  const csv = generateGradeSummaryCSV([student] as any, 'CLIN401', true, new Map([['802', incompleteResult]]), 'lecture_laboratory');
  assert.equal(csv, [
    'Student Number,Student Name,Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %,Overall GWA,Status',
    '"\'@DENT-008","\'=Dana, ""Quoted""\nStudent","Incomplete (missing ""lab"", score\nplease)","Incomplete","Incomplete (Missing Assessment Score)","93.00%","83.00%","95.00%","Prior: 2.0 (Historical)","INCOMPLETE"',
  ].join('\n'));
});

// Exercise the actual score handlers with controlled API promises and fake timers.
function scoreSaveHarness(mode: 'single' | 'matrix' = 'single', autoSaveEnabled = true) {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const handlers = mode === 'single'
    ? source.slice(source.indexOf('  const performSaveSingleScores'), source.indexOf('  // View Mode:'))
    : source.slice(source.indexOf('  const performSaveMatrixScores'), source.indexOf('  // Helper stats'));
  const calls: Array<Array<{ studentId: string; score: number | null }>> = [];
  const statuses: string[] = [];
  const feedback: string[] = [];
  const prompts: string[][] = [];
  const filters: string[][] = [];
  let confirmAnswer = true;
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  let save: () => Promise<unknown> = async () => {};
  const notices: unknown[] = [];
  let singleState: Record<string, { score: string; remarks: string }> = { student: { score: '10', remarks: '' }, other: { score: '', remarks: '' } };
  let matrixState: Record<string, Record<string, string>> = { student: { assessment: '10' } };
  const context = {
    autoSaveEnabled,
    AUTO_SAVE_IDLE_MS: 10_000,
    selectedAssessmentIdRef: { current: 'assessment' },
    selectedClassId: 'class',
    availableClasses: [],
    activeAssessments: [{ id: 'assessment', maxScore: 100 }],
    activeStudents: [{ id: 'student' }, { id: 'other' }],
    assessmentScores: [{ assessmentId: 'assessment', studentId: 'student', score: 10, remarks: '' }],
    matrixSavingRef: { current: false },
    matrixQueuedRef: { current: null as { manual: boolean } | null },
    matrixDirtyRef: { current: false },
    matrixDebounceTimerRef: { current: null as unknown },
    matrixPendingClearRef: { current: new Set<string>() },
    matrixScoresRef: { current: matrixState },
    saveMatrixRef: { current: async (_manual?: boolean) => {} },
    setMatrixSaveStatus: (status: string) => statuses.push(status),
    setMatrixScoresState: (update: (previous: typeof matrixState) => typeof matrixState) => { matrixState = update(matrixState); },
    setMatrixRefreshKey: () => {},
    setIsMatrixSavedAlert: () => {},
    saveFacultyScoreBatchesApi: async (batches: Array<{ scores: Array<{ studentId: string; score: number | null }> }>) => { calls.push(batches.flatMap(batch => batch.scores)); return save(); },
    selectedAssessmentId: 'assessment',
    activeAssessment: { classId: 'class', maxScore: 100, title: 'Quiz', type: 'Quiz', gradingPeriod: 'Midterm' },
    matchesActivityFilters,
    activityFilterSearch: '',
    setActivityFilterPeriod: (value: string) => filters.push(['period', value]),
    setActivityFilterType: (value: string) => filters.push(['type', value]),
    singleSavingRef: { current: false },
    singleQueuedRef: { current: null as { manual: boolean } | null },
    singleDirtyRef: { current: false },
    singleDebounceTimerRef: { current: null as unknown },
    singlePendingClearRef: { current: { assessmentId: 'assessment', ids: new Set<string>() } },
    singleScoresRef: { current: singleState },
    saveSingleRef: { current: async (_manual?: boolean) => {} },
    setSingleSaveStatus: (status: string) => statuses.push(status),
    hasStoredScore: (_assessmentId: string, studentId: string) => studentId === 'student',
    validateSingleScore: (scoreStr: string, maxScore: number) => { if (!scoreStr) return true; const n = parseFloat(scoreStr); return !isNaN(n) && n >= 0 && n <= maxScore; },
    setScoresInputState: (update: (previous: typeof singleState) => typeof singleState) => { singleState = update(singleState); },
    saveFacultyAssessmentScoresApi: async (_id: string, scores: Array<{ studentId: string; score: number | null }>) => { calls.push(scores); return save(); },
    saveAssessmentScores: () => {},
    showRecomputeNotice: (response: unknown) => { notices.push(response); },
    setIsScoresSavedAlert: () => {},
    showFeedback: (message: string) => feedback.push(message),
    requestConfirmation: async (message: string, title: string) => { prompts.push([title, message]); return confirmAnswer; },
    setTimeout: (fn: () => void, ms: number) => { const timer = { fn, ms, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout: (timer: { cancelled: boolean } | null) => { if (timer) timer.cancelled = true; },
  };
  const compiled = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const exposed = mode === 'single' ? 'return { handleScoreChange, flush: flushSingleAutoSave, handleManualSaveScores, confirmDiscardUnsavedScores, changeActivityFilter, hasUnsavedSingleScores };'
    : 'return { handleCellChange: (student, value) => handleMatrixScoreChange(student, "assessment", value), handleScoreChange: (_student, value) => handleMatrixScoreChange(_student, "assessment", value), flush: flushMatrixAutoSave, handleManualSaveScores: handleSaveMatrixScores };';
  const actions = new Function(...Object.keys(context), compiled + exposed)(...Object.values(context));
  // Saves run unawaited from the handlers, so let the async work finish before asserting.
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const fire = (ms: number) => { for (const timer of timers.splice(0)) if (timer.ms === ms && !timer.cancelled) timer.fn(); };
  const pending = (ms: number) => timers.filter(timer => timer.ms === ms && !timer.cancelled).length;
  return { actions, context, calls, notices, statuses, feedback, prompts, filters, answer: (value: boolean) => { confirmAnswer = value; }, settle, fire, pending, setSave: (next: () => Promise<unknown>) => { save = next; } };
}

test('Switching assessment, class or course asks first only when scores are unsaved', async () => {
  const clean = scoreSaveHarness('single', false);
  assert.equal(await clean.actions.confirmDiscardUnsavedScores(), true);
  assert.equal(clean.prompts.length, 0, 'clean state never prompts');

  const dirtyOff = scoreSaveHarness('single', false);
  dirtyOff.actions.handleScoreChange('student', '20', 'score');
  dirtyOff.answer(false);
  assert.equal(await dirtyOff.actions.confirmDiscardUnsavedScores(), false, 'Cancel keeps the current selection');
  assert.deepEqual(dirtyOff.prompts[0][0], 'Discard unsaved scores?');
  dirtyOff.answer(true);
  assert.equal(await dirtyOff.actions.confirmDiscardUnsavedScores(), true);
  assert.equal(dirtyOff.prompts.length, 2);

  const dirtyOn = scoreSaveHarness('single', true);
  dirtyOn.actions.handleScoreChange('student', '20', 'score');
  assert.equal(await dirtyOn.actions.confirmDiscardUnsavedScores(), true);
  assert.equal(dirtyOn.prompts.length, 0, 'Auto-save on and dirty alone does not prompt');

  const clearing = scoreSaveHarness('single', true);
  clearing.context.singlePendingClearRef.current.ids.add('student');
  await clearing.actions.confirmDiscardUnsavedScores();
  assert.equal(clearing.prompts.length, 1, 'pending cleared scores prompt even with Auto-save on');
});

test('Period or category change asks first only when it drops the current assessment while scores are unsaved', async () => {
  const dirty = () => { const h = scoreSaveHarness('single', false); h.actions.handleScoreChange('student', '20', 'score'); return h; };

  const cancelled = dirty();
  cancelled.answer(false);
  await cancelled.actions.changeActivityFilter('Final', 'all');
  assert.equal(cancelled.prompts.length, 1);
  assert.deepEqual(cancelled.filters, [], 'Cancel leaves the filters unchanged');
  await cancelled.actions.changeActivityFilter('all', 'Lab');
  assert.deepEqual(cancelled.filters, [], 'category change is guarded too');

  const confirmed = dirty();
  await confirmed.actions.changeActivityFilter('Final', 'all');
  assert.deepEqual(confirmed.filters, [['period', 'Final'], ['type', 'all']]);
  assert.equal(confirmed.actions.hasUnsavedSingleScores(), false, 'discarding lets the auto-select effect switch');

  const stillMatches = dirty();
  await stillMatches.actions.changeActivityFilter('Midterm', 'Quiz');
  assert.equal(stillMatches.prompts.length, 0, 'current assessment still listed: no prompt');
  assert.equal(stillMatches.filters.length, 2);

  const clean = scoreSaveHarness('single', false);
  await clean.actions.changeActivityFilter('Final', 'all');
  assert.equal(clean.prompts.length, 0, 'nothing unsaved: no prompt');
  assert.equal(clean.filters.length, 2);

  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const effect = source.slice(source.indexOf('// Set default assessment when subject/class or filter changes'));
  assert.ok(effect.indexOf('if (hasUnsavedSingleScores()) return;') > 0
    && effect.indexOf('if (hasUnsavedSingleScores()) return;') < effect.indexOf('setSelectedAssessmentId('),
  'auto-select must not run while scores are unsaved');
  assert.equal(matchesActivityFilters({ title: 'Quiz 1', type: 'Quiz' }, 'Midterm', 'all', ' quiz '), true);
  assert.equal(matchesActivityFilters({ title: 'Quiz 1', type: 'Quiz', gradingPeriod: 'Final' }, 'Midterm', 'all', ''), false);
});

test('Save badge shows saving, failed, unsaved or all saved', () => {
  assert.deepEqual(saveStatusBadge('saving', true), { kind: 'saving', label: 'Saving...' });
  assert.deepEqual(saveStatusBadge('error', true), { kind: 'error', label: 'Save failed' });
  assert.deepEqual(saveStatusBadge('saved', true), { kind: 'unsaved', label: 'Unsaved changes' });
  assert.deepEqual(saveStatusBadge('saved', false), { kind: 'saved', label: 'All changes saved' });
});

test('Score entry auto-saves 10 seconds after typing stops, only while Auto-save is on; manual Save needs no confirmation', async () => {
  const h = scoreSaveHarness();
  h.actions.handleScoreChange('student', '20', 'score');
  assert.equal(h.calls.length, 0, 'typing alone must not save');
  assert.equal(h.pending(10_000), 1, 'typing starts the 10 second wait');
  h.actions.handleScoreChange('student', '22', 'score');
  assert.equal(h.pending(10_000), 1, 'each edit restarts the wait instead of adding another');
  h.fire(10_000);
  await h.settle();
  assert.equal(h.calls.length, 1, 'a burst of edits is one save');
  assert.equal(h.calls[0][0].score, 22);
  h.actions.handleScoreChange('student', '25', 'score');
  h.fire(10_000);
  await h.settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1][0].score, 25);

  const leaving = scoreSaveHarness();
  leaving.actions.handleScoreChange('student', '30', 'score');
  leaving.actions.flush();
  await leaving.settle();
  assert.equal(leaving.calls.length, 1, 'switching or leaving saves at once');
  assert.equal(leaving.calls[0][0].score, 30);
  assert.equal(leaving.pending(10_000), 0, 'the wait is over once it has saved');
  leaving.actions.flush();
  await leaving.settle();
  assert.equal(leaving.calls.length, 1, 'nothing pending: leaving saves nothing');

  const off = scoreSaveHarness('single', false);
  off.actions.handleScoreChange('student', '20', 'score');
  assert.equal(off.pending(10_000), 0, 'Auto-save off schedules nothing');
  off.actions.flush();
  await off.settle();
  assert.equal(off.calls.length, 0, 'Auto-save off saves nothing by itself');
  await off.actions.handleManualSaveScores();
  await off.settle();
  assert.equal(off.calls.length, 1);
  assert.equal(off.calls[0][0].score, 20);
  assert.equal(off.context.singleDirtyRef.current, false);

  const manual = scoreSaveHarness();
  manual.actions.handleScoreChange('student', '40', 'score');
  await manual.actions.handleManualSaveScores();
  await manual.settle();
  assert.equal(manual.pending(10_000), 0, 'Save cancels the wait');
  manual.fire(10_000);
  await manual.settle();
  assert.equal(manual.calls.length, 1);

  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const warn = source.slice(source.indexOf('const warnUnsaved'), source.indexOf("window.addEventListener('beforeunload'"));
  assert.ok(warn.includes('singleDebounceTimerRef.current') && warn.includes('matrixDebounceTimerRef.current'),
    'the leave-page warning also covers a pending 10 second wait');
  assert.ok(!source.includes('handleScoreBlur') && !source.includes('onScoreBlur={'), 'leaving a field no longer saves');
  assert.ok(!source.includes('refreshPersistedGrades'), 'a save no longer calls the compute endpoint separately');
});

test('A save shows the notice for the recompute results the server returned', async () => {
  const h = scoreSaveHarness();
  const response = { results: [{ status: 'incomplete_attendance' }], recomputeFailed: false };
  h.setSave(async () => response);
  h.actions.handleScoreChange('student', '20', 'score');
  h.actions.flush();
  await h.settle();
  assert.deepEqual(h.notices, [response]);
  const matrix = scoreSaveHarness('matrix');
  const failed = { results: [], recomputeFailed: true };
  matrix.setSave(async () => failed);
  matrix.actions.handleScoreChange('student', '20');
  matrix.actions.flush();
  await matrix.settle();
  assert.deepEqual(matrix.notices, [failed]);
});

test('Score entry queues the latest edit while a save is in flight and keeps manual saves manual', async () => {
  const h = scoreSaveHarness();
  let finish!: () => void;
  h.setSave(() => new Promise<void>(resolve => { finish = resolve; }));
  h.actions.handleScoreChange('student', '20', 'score');
  h.fire(10_000);
  h.actions.handleScoreChange('student', '10', 'score');
  await h.actions.handleManualSaveScores();
  assert.equal(h.calls.length, 1, 'a second save does not start while one is running');
  assert.deepEqual(h.context.singleQueuedRef.current, { manual: true });
  h.setSave(async () => {});
  finish();
  await h.settle();
  h.fire(0);
  await h.settle();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1][0].score, 10, 'the queued save sends the latest value');
  assert.equal(h.context.singleScoresRef.current.student.score, '10');
  assert.equal(h.context.singleDirtyRef.current, false);
  assert.equal(h.feedback.filter(message => /^Saved \d+ scores/.test(message)).length, 1, 'only the queued manual save reports success');
});

test('Clearing a stored score is applied only by a manual Save, and failed saves remain retryable', async () => {
  const h = scoreSaveHarness();
  h.actions.handleScoreChange('student', '', 'score');
  h.fire(10_000);
  await h.settle();
  assert.equal(h.calls.length, 0, 'auto-save never deletes a stored score');
  assert.equal(h.context.singleScoresRef.current.student.score, '', 'the field stays cleared');
  assert.deepEqual([...h.context.singlePendingClearRef.current.ids], ['student']);
  assert.equal(h.context.singleDirtyRef.current, true);
  await h.actions.handleManualSaveScores();
  await h.settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0].score, null, 'manual Save applies the clear without a confirmation');
  assert.equal(h.context.singlePendingClearRef.current.ids.size, 0);

  h.setSave(async () => { throw new Error('Offline'); });
  h.actions.handleScoreChange('student', '30', 'score');
  h.fire(10_000);
  await h.settle();
  assert.equal(h.statuses.at(-1), 'error');
  assert.equal(h.context.singleDirtyRef.current, true);
  h.setSave(async () => {});
  await h.actions.handleManualSaveScores();
  await h.settle();
  assert.equal(h.statuses.at(-1), 'saved');
  assert.equal(h.calls.at(-1)?.[0].score, 30);
});

test('Matrix always auto-saves, applies clears only on manual Save, and queues the latest scores', async () => {
  const h = scoreSaveHarness('matrix');
  h.actions.handleScoreChange('student', '20');
  assert.equal(h.calls.length, 0, 'typing alone must not save');
    h.fire(10_000);
  await h.settle();
  assert.equal(h.calls[0][0].score, 20);

  const clearing = scoreSaveHarness('matrix');
  clearing.actions.handleScoreChange('student', '');
  clearing.fire(10_000);
  await clearing.settle();
  assert.equal(clearing.calls.length, 0, 'auto-save never deletes a stored score');
  assert.deepEqual([...clearing.context.matrixPendingClearRef.current], ['student|assessment']);
  assert.equal(clearing.context.matrixDirtyRef.current, true);
  await clearing.actions.handleManualSaveScores();
  await clearing.settle();
  assert.equal(clearing.calls[0][0].score, null, 'manual Save applies the clear without a confirmation');

  let finish!: () => void;
  const queued = scoreSaveHarness('matrix');
  queued.setSave(() => new Promise<void>(resolve => { finish = resolve; }));
  queued.actions.handleScoreChange('student', '30');
  queued.fire(10_000);
  queued.actions.handleScoreChange('student', '40');
  queued.fire(10_000);
  assert.equal(queued.calls.length, 1);
  queued.setSave(async () => {});
  finish();
  await queued.settle();
  queued.fire(0);
  await queued.settle();
  assert.equal(queued.calls.at(-1)?.[0].score, 40);
  assert.equal(queued.context.matrixDirtyRef.current, false);

  const failing = scoreSaveHarness('matrix');
  failing.setSave(async () => { throw new Error('Offline'); });
  failing.actions.handleScoreChange('student', '50');
  failing.fire(10_000);
  await failing.settle();
  assert.equal(failing.statuses.at(-1), 'error');
  assert.equal(failing.context.matrixDirtyRef.current, true);
  failing.setSave(async () => {});
  await failing.actions.handleManualSaveScores();
  await failing.settle();
  assert.equal(failing.statuses.at(-1), 'saved');
  assert.equal(failing.calls.at(-1)?.[0].score, 50);
});

test('Matrix auto-save skips invalid cells and keeps them dirty; manual Save still refuses', async () => {
  const partial = scoreSaveHarness('matrix');
  partial.actions.handleCellChange('student', '150');
  partial.actions.handleCellChange('other', '70');
  partial.fire(10_000);
  await partial.settle();
  assert.deepEqual(partial.calls, [[{ studentId: 'other', score: 70, remarks: '' }]]);
  assert.equal(partial.context.matrixDirtyRef.current, true);
  assert.equal(partial.context.matrixScoresRef.current.student.assessment, '150');

  const onlyInvalid = scoreSaveHarness('matrix');
  onlyInvalid.actions.handleCellChange('student', '150');
  onlyInvalid.fire(10_000);
  await onlyInvalid.settle();
  assert.equal(onlyInvalid.calls.length, 0);
  assert.equal(onlyInvalid.context.matrixDirtyRef.current, true);

  const manual = scoreSaveHarness('matrix');
  manual.actions.handleCellChange('student', '150');
  manual.actions.handleCellChange('other', '70');
  await manual.actions.handleManualSaveScores();
  await manual.settle();
  assert.equal(manual.calls.length, 0);
  assert.deepEqual(manual.feedback, ['Some scores in the matrix are invalid (exceed max score or negative).']);
});

test('Single auto-save skips invalid scores and keeps them dirty; manual Save still refuses; switching prompts', async () => {
  const partial = scoreSaveHarness('single');
  partial.actions.handleScoreChange('student', '150', 'score');
  partial.actions.handleScoreChange('other', '70', 'score');
  partial.fire(10_000);
  await partial.settle();
  assert.deepEqual(partial.calls, [[{ studentId: 'other', score: 70, remarks: '' }]]);
  assert.equal(partial.context.singleDirtyRef.current, true);
  assert.equal(partial.context.singleScoresRef.current.student.score, '150');

  const onlyInvalid = scoreSaveHarness('single');
  onlyInvalid.actions.handleScoreChange('student', '150', 'score');
  onlyInvalid.fire(10_000);
  await onlyInvalid.settle();
  assert.equal(onlyInvalid.calls.length, 0);
  assert.equal(onlyInvalid.context.singleDirtyRef.current, true);
  onlyInvalid.answer(false);
  assert.equal(await onlyInvalid.actions.confirmDiscardUnsavedScores(), false);
  assert.equal(onlyInvalid.prompts.length, 1, 'an invalid score prompts even with Auto-save on');

  const manual = scoreSaveHarness('single');
  manual.actions.handleScoreChange('student', '150', 'score');
  manual.actions.handleScoreChange('other', '70', 'score');
  await manual.actions.handleManualSaveScores();
  await manual.settle();
  assert.equal(manual.calls.length, 0);
  assert.deepEqual(manual.feedback, ['Some scores are invalid. Scores cannot exceed the assessment maximum.']);
});

test('Evaluation Extraction: legacy results expose server retention state and exact percentage', () => {
  const result: FacultyLegacyComputedResult = {
    status: 'computed',
    enrollmentId: '1',
    studentId: '2',
    percentage: 80.01,
    gwa: 2.5,
    retentionState: 'active',
    breakdown: { calculationMode: 'raw_points', retentionThreshold: 2.5 },
  };
  const evaluation = extractPeriodEvaluation(null, result, 'overall');
  assert.equal(evaluation.overallPercentage, 80.01);
  assert.equal(evaluation.retentionState, 'active');
  const { retentionState: _state, ...olderResult } = result;
  const fallback = extractPeriodEvaluation(null, olderResult as FacultyLegacyComputedResult, 'overall');
  assert.equal(fallback.overallPercentage, 80.01);
  assert.equal(fallback.retentionState, null);
});
