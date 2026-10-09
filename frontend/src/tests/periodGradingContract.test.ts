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
import { percentageToGWAExact } from '../utils/gradeHelper.ts';
import type { FacultyLegacyComputedResult, FacultyPeriodModeComputedResult, FacultyPeriodModeIncompleteResult } from '../services/apiClient.ts';

test('Grade Weights banner and category steps describe combined, grouped, and unsaved configurations', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  assert.doesNotMatch(source, /BU Dental Medicine Schema Active/);
  const start = source.indexOf('<span>{loadedConfig ?');
  assert.ok(start >= 0);
  const banner = source.slice(start, source.indexOf('</span>', start) + '</span>'.length);
  const compiled = ts.transpileModule(`return (${banner});`, {
    fileName: 'banner.tsx',
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = (saved: boolean, mode: string, midterm = 35, final = 65) => renderToStaticMarkup(
    new Function('React', 'loadedConfig', 'componentMode', 'termRatio', 'componentWeights', compiled)(
      React, saved ? {} : null, mode, { midterm, final }, { lecture: 60, laboratory: 40 }
    )
  );
  assert.equal(render(true, 'combined'), '<span>Saved grading: Midterm 35% / Finals 65%</span>');
  assert.equal(render(true, 'lecture_laboratory'), '<span>Saved grading: Midterm 35% / Finals 65% · Lecture 60% / Laboratory 40%</span>');
  assert.equal(render(false, 'lecture_laboratory', 30, 70), '<span>BU syllabus default (unsaved): Midterm 30% / Finals 70% · Lecture 60% / Laboratory 40%</span>');
  assert.match(source, /componentMode === 'lecture_laboratory' \? '3\.' : '2\.'/);
  assert.match(source, /componentMode === 'lecture_laboratory' && ` • \$\{activeComponentEditorTab\}`/);
});

test('Score panels keep one manual save per view in safe-area sticky live status bars', () => {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const panels = source.slice(source.indexOf("{scoreEntryMode === 'matrix' ?"), source.indexOf('TAB 2:'));
  assert.equal((panels.match(/data-manual-score-save\s/g) ?? []).length, 2);
  for (const [status, handler, ref] of [
    ['matrixSaveStatus', 'handleSaveMatrixScores', 'matrixSaveRef'],
    ['singleSaveStatus', 'handleManualSaveScores', 'singleSaveRef'],
  ]) {
    const position = panels.indexOf(`<span role="status" aria-live="polite">{${status}`);
    assert.ok(position >= 0);
    const barStart = panels.lastIndexOf('<div className="sticky bottom-0', position);
    assert.ok(barStart >= 0);
    const bar = panels.slice(barStart, panels.indexOf('</button>', panels.indexOf('data-manual-score-save', position)));
    assert.match(bar, /bg-white dark:bg-slate-900/);
    assert.match(bar, /env\(safe-area-inset-bottom\)/);
    for (const text of ['Saving…', 'Saved', 'Failed – Retry', 'Unsaved changes']) assert.ok(bar.includes(text));
    assert.ok(bar.includes(`${ref}.current(true)`));
    assert.ok(bar.includes(`onClick={${handler}}`));
  }
  assert.match(source, /grid grid-cols-2 gap-1 sm:flex sm:gap-0/);
  assert.match(source, /hidden sm:block[^"\n]*">Use Enter/);
  assert.match(source, /id=\{`score-input-\$\{idx\}`\}[\s\S]*?inputMode="decimal"/);
  assert.match(source, /whitespace-nowrap[^\n]*rounded-full/);
});

test('Matrix pins opaque identity cells and offers a guarded phone switch without changing input navigation', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  const identityCells = matrix.split('\n').filter(line => /<(?:th|td) /.test(line) && /(?:ID Number|Full Name|student\.studentId|student\.name)/.test(line));
  assert.equal(identityCells.length, 4);
  assert.match(matrix, /<thead className="sticky top-0 z-30/);
  for (const cell of identityCells) {
    assert.match(cell, /sticky/);
    assert.match(cell, /left-0/);
    assert.match(cell, /bg-(?:slate-50|white) dark:bg-slate-900/);
  }
  for (const cell of [identityCells[1], identityCells[3]]) assert.match(cell, /left-\[120px\]/);
  assert.match(identityCells[0], /!isPhone &&/);
  assert.match(identityCells[2], /!isPhone &&/);
  assert.match(identityCells[3], /isPhone && <span/);
  assert.match(matrix, /The full matrix is easier on a larger screen\. Use Single Activity View to enter scores on a phone\./);
  assert.match(matrix, /onClick=\{onSingleActivityView\} disabled=\{!canSwitchView\}/);
  assert.match(matrix, /id=\{inputId\}\s+inputMode="decimal"/);
  assert.match(matrix, /const inputId = `matrix-score-\$\{studentIndex\}-\$\{assessment\.id\}`/);
});

test('Matrix renders exactly one identity header with matching desktop and phone columns', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  const studentHeader = matrix.split('\n').find(line => line.includes('>Student Info</th>'))!;
  assert.equal((matrix.match(/>Student Info<\/th>/g) ?? []).length, 1);
  const identityHeaders = matrix.slice(matrix.indexOf('{!isPhone && <th'), matrix.indexOf('{periodMode && visiblePeriods.map', matrix.indexOf('{!isPhone && <th')));
  const identityBody = matrix.slice(matrix.indexOf('{!isPhone && <td'), matrix.indexOf('{periodMode && visiblePeriods.map', matrix.indexOf('{!isPhone && <td')));
  assert.doesNotMatch(identityHeaders + identityBody, /hidden|sm:table-cell/);
  const render = (jsx: string, isPhone: boolean, periodMode: boolean) => {
    const compiled = ts.transpileModule(`return (<table>${jsx}</table>);`, {
      fileName: 'identity.tsx', compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return renderToStaticMarkup(new Function('React', 'isPhone', 'periodMode', 'th', 'student', compiled)(
      React, isPhone, periodMode, '', { name: 'Alice Reyes', studentId: 'DENT-001' }
    ));
  };
  for (const isPhone of [false, true]) {
    const columns = isPhone ? 1 : 2;
    const group = render(`<thead><tr>${studentHeader}</tr></thead>`, isPhone, true);
    assert.match(group, new RegExp(`colSpan="${columns}"`, 'i'));
    for (const periodMode of [false, true]) {
      const headers = render(`<thead><tr>${identityHeaders}</tr></thead>`, isPhone, periodMode);
      const body = render(`<tbody><tr>${identityBody}</tr></tbody>`, isPhone, periodMode);
      assert.equal((headers.match(/<th /g) ?? []).length, columns);
      assert.equal((body.match(/<td /g) ?? []).length, columns);
      assert.equal(headers.includes('ID Number'), !isPhone);
      assert.match(headers, new RegExp(`rowSpan="${periodMode ? 3 : 1}"`, 'i'));
      assert.equal((body.match(/DENT-001/g) ?? []).length, 1);
      assert.equal(body.includes('<span'), isPhone);
    }
  }
});

test('Matrix phone state defaults safely and follows media changes with cleanup', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  const source = matrix.slice(matrix.indexOf('  const [isPhone,'), matrix.indexOf('  // Filters state'));
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const states: boolean[] = [];
  let cleanup: (() => void) | undefined;
  let listener: (() => void) | undefined;
  const media = {
    matches: true,
    addEventListener: (event: string, callback: () => void) => { assert.equal(event, 'change'); listener = callback; },
    removeEventListener: (event: string, callback: () => void) => { assert.equal(event, 'change'); assert.equal(callback, listener); listener = undefined; },
  };
  const run = (window: unknown) => new Function('window', 'useState', 'useEffect', compiled)(
    window,
    (initial: boolean) => { assert.equal(initial, false); return [initial, (value: boolean) => states.push(value)]; },
    (effect: () => (() => void) | undefined) => { cleanup = effect(); }
  );
  run(undefined);
  run({});
  assert.deepEqual(states, []);
  run({ matchMedia: (query: string) => { assert.equal(query, '(max-width: 639px)'); return media; } });
  assert.deepEqual(states, [true]);
  media.matches = false;
  listener!();
  assert.deepEqual(states, [true, false]);
  cleanup!();
  assert.equal(listener, undefined);
});

test('Gradebook matrix component values and weight labels use only saved server data', () => {
  const matrix = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components/GradebookMatrix.tsx'), 'utf8');
  assert.doesNotMatch(matrix, /\?\?\s*(?:60|40)\b/);
  assert.match(matrix, /const lectureWeight = config\.componentWeights\?\.lecture;/);
  assert.match(matrix, /const labWeight = config\.componentWeights\?\.laboratory;/);
  assert.match(matrix, /comp\.weight !== undefined \? `\(\$\{comp\.weight\}%\)` : ''/);
  assert.match(matrix, /Every calculated column comes from the server's own computation/);
  const source = matrix.slice(matrix.indexOf('  const componentPercentage ='), matrix.indexOf('  const getVisibleComponents ='));
  assert.doesNotMatch(source, /contribution|\.reduce\(/, 'missing server component totals must never be reconstructed from category contributions');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const percentage = (breakdown: unknown, componentKey = 'lecture') => new Function('periodBreakdown', 'format', compiled + 'return componentPercentage("student", "midterm", { componentKey: "' + componentKey + '" });')(
    () => breakdown,
    (value: number) => Number.isFinite(value) ? value.toFixed(2) : '—'
  );
  assert.equal(percentage(undefined), '—');
  assert.equal(percentage({ categories: [{ categoryId: 1, contribution: 85 }] }), '—');
  assert.equal(percentage({ components: { lecture: { percentage: null } }, categories: [{ contribution: 85 }] }), '—');
  assert.equal(percentage({ components: { lecture: { percentage: 0 } } }), '0.00');
  assert.equal(percentage({ components: { lecture: { percentage: 81.25 } } }), '81.25');
  assert.equal(percentage({ components: { laboratory: { percentage: 92.5 } } }, 'laboratory'), '92.50');
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
      [80.01, 'active', false],
      [80, 'remedial', true],
      [79.99, 'active', false],
      [81, 'remedial', true],
      [80.01, undefined, false],
      [80, undefined, true],
      [79.99, undefined, true],
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
    gwa: 1.75,
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
  assert.equal(evaluation.overallGwa, 1.75);
  assert.equal(evaluation.statusText, 'PASS');
  assert.equal(evaluation.retentionState, 'active');
  const boundaryResult = { ...computedResult, percentage: 80.01, gwa: 2.5, retentionState: 'active' };
  const boundaryEvaluation = extractPeriodEvaluation(null, boundaryResult);
  assert.equal(boundaryEvaluation.overallGwa, 2.5);
  assert.equal(boundaryEvaluation.overallPercentage, 80.01);
  assert.equal(boundaryEvaluation.retentionState, 'active');

});

test('Evaluation Extraction: handles incomplete period with zero-weight without blocking overall', () => {
  // A zero-weight Midterm is incomplete due to missing date range, but overall is computed from 100% Final!
  const zeroWeightResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '102',
    studentId: '202',
    percentage: 90.0,
    gwa: 1.75,
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
  assert.equal(evaluation.overallGwa, 1.75);
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
  // Legacy enrolled subject with grade 1.75
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 1.75,
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
    grade: 1.75,
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
  assert.equal(evaluation.historicalGwa, 1.75);
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
          grade: 1.75,
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
      overallGWA: 1.75,
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

  assert.equal(lines[0], 'Student ID,Name,Midterm %,Final %,Overall GWA,Status');
  // Student 1: distinct Midterm 88.75%, Final 90.00%, Overall GWA 1.75
  assert.equal(lines[1], 'DENT-001,"Alice Reyes",88.75%,90.00%,1.75,PASS');
  // Student 2: Midterm Incomplete (Missing Date Range), Final 90.00%, Overall GWA Incomplete
  assert.equal(lines[2], 'DENT-002,"Bob Santos",Incomplete (Missing Date Range),90.00%,Incomplete,INCOMPLETE');
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
  // Student 3 has previouslyPersisted: true -> Prior: 2.00 (Historical)
  assert.equal(lines[1], 'DENT-003,"Clara Santos",Incomplete (Unresolved Attendance),85.00%,Prior: 2.00 (Historical),INCOMPLETE');
  // Student 4 has previouslyPersisted: false -> Incomplete (no fallback to subj.grade 2.50)
  assert.equal(lines[2], 'DENT-004,"Danilo Cruz",Incomplete (Unresolved Attendance),85.00%,Incomplete,INCOMPLETE');
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
          grade: 1.75, // Legacy grade from earlier semester
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
      overallGWA: 1.75,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student ID,Name,Midterm %,Final %,Overall GWA,Status');
  assert.equal(lines[1], 'DENT-005,"Elena Ramos",Pending,Pending,Pending,PENDING');
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
          grade: 1.50,
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
      overallGWA: 1.50,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'ANAT101', false);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student ID,Name,Quizzes,Practicum,Exams,Attendance,Overall GWA,Remarks');
  assert.equal(lines[1], 'DENT-004,"David Lim",85.0%,90.0%,88.0%,95.0%,1.50,PASS');
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
    gwa: 1.65,
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
      grade: 1.65, isClinical: false, hasRemedial: false,
    }],
    clinicHoursCompleted: 0,
    overallGWA: 1.65,
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
  assert.equal(lines[0], 'Student ID,Name,Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %,Overall GWA,Status');
  assert.equal(lines[1], "\"'=DENT-007\",\"Alice Reyes\",\"81.00%\",\"91.00%\",\"87.00%\",\"93.00%\",\"83.00%\",\"89.00%\",\"1.65\",\"PASS\"");

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
    '"\'=DENT-007","Alice Reyes","Unavailable (recompute required)","Unavailable (recompute required)","87.00%","Unavailable (recompute required)","Unavailable (recompute required)","89.00%","1.65","PASS"'
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
    'Student ID,Name,Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %,Overall GWA,Status',
    '"\'@DENT-008","\'=Dana, ""Quoted""\nStudent","Incomplete (missing ""lab"", score\nplease)","Incomplete","Incomplete (Missing Assessment Score)","93.00%","83.00%","95.00%","Prior: 2.00 (Historical)","INCOMPLETE"',
  ].join('\n'));
});

// Exercise the actual score handlers with controlled API promises.
function scoreSaveHarness(mode: 'single' | 'matrix' = 'single') {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../pages/faculty/GradeComputation.tsx'), 'utf8');
  const handlers = mode === 'single'
    ? source.slice(source.indexOf('  const performSaveSingleScores'), source.indexOf('  // View Mode:'))
    : source.slice(source.indexOf('  const performSaveMatrixScores'), source.indexOf('  // Helper stats'));
  const initial = { student: { score: '10', remarks: '' } };
  const calls: Array<Array<{ studentId: string; score: number | null }>> = [];
  const statuses: string[] = [];
  const confirmations: string[] = [];
  let approve = true;
  let save = async () => {};
  const context = {
    selectedClassId: 'class',
    availableClasses: [],
    activeAssessments: [{ id: 'assessment', maxScore: 100 }],
    activeStudents: [{ id: 'student' }],
    matrixSavingRef: { current: false },
    matrixQueuedRef: { current: false },
    matrixDirtyRef: { current: false },
    matrixSavedRef: { current: { student: { assessment: '10' } } },
    matrixScoresRef: { current: { student: { assessment: '10' } } },
    matrixSaveRef: { current: async (_manual?: boolean) => {} },
    setMatrixSaveStatus: (status: string) => statuses.push(status),
    setMatrixScoresState: () => {},
    setMatrixRefreshKey: () => {},
    setIsMatrixSavedAlert: () => {},
    saveFacultyScoreBatchesApi: async (batches: Array<{ scores: Array<{ studentId: string; score: number | null }> }>) => { calls.push(batches.flatMap(batch => batch.scores)); await save(); },
    selectedAssessmentId: 'assessment',
    activeAssessment: { classId: 'class', maxScore: 100, title: 'Quiz' },
    autoSaveRef: { current: true },
    singleSavingRef: { current: false },
    singleQueuedRef: { current: false },
    singleDirtyRef: { current: false },
    singleSavedRef: { current: initial },
    singleScoresRef: { current: initial },
    singleSaveRef: { current: async (_manual?: boolean) => {} },
    assessmentScores: [{ assessmentId: 'assessment', studentId: 'student', score: 10 }],
    setSingleSaveStatus: (status: string) => statuses.push(status),
    validateSingleScore: (value: string, max: number) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max),
    hasStoredScore: () => true,
    requestConfirmation: async (message: string) => { confirmations.push(message); return approve; },
    setScoresInputState: () => {},
    saveFacultyAssessmentScoresApi: async (_id: string, scores: Array<{ studentId: string; score: number | null }>) => { calls.push(scores); await save(); },
    saveAssessmentScores: () => {},
    refreshPersistedGrades: async () => {},
    setIsScoresSavedAlert: () => {},
    showFeedback: () => {},
  };
  const compiled = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const exposed = mode === 'single' ? 'return { handleScoreChange, handleScoreBlur, handleManualSaveScores };'
    : 'return { handleScoreChange: (_student, value) => handleMatrixScoreChange(_student, "assessment", value), handleScoreBlur: handleMatrixScoreBlur, handleManualSaveScores: handleSaveMatrixScores };';
  const actions = new Function(...Object.keys(context), compiled + exposed)(...Object.values(context));
  return { actions, context, calls, statuses, confirmations, setApprove: (value: boolean) => { approve = value; }, setSave: (next: () => Promise<void>) => { save = next; } };
}

test('Score entry saves on exit, respects Auto-save, and confirms manual Save', async () => {
  const h = scoreSaveHarness();
  h.actions.handleScoreChange('student', '20', 'score');
  assert.equal(h.calls.length, 0, 'typing must not save');
  h.context.autoSaveRef.current = false;
  await h.actions.handleScoreBlur('student');
  assert.equal(h.calls.length, 0, 'Auto-save off must not save on blur');
  await h.actions.handleManualSaveScores();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0].score, 20);
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.context.singleDirtyRef.current, false);
});

test('Score entry queues the latest edit while a save is in flight', async () => {
  const h = scoreSaveHarness();
  let finish!: () => void;
  h.setSave(() => new Promise<void>(resolve => { finish = resolve; }));
  h.actions.handleScoreChange('student', '20', 'score');
  const first = h.actions.handleScoreBlur('student');
  h.actions.handleScoreChange('student', '10', 'score');
  await h.actions.handleScoreBlur('student');
  assert.equal(h.calls.length, 1);
  h.setSave(async () => {});
  finish();
  await first;
  // Drain the queued async API and recomputation microtasks.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1][0].score, 10, 'reverting during save is still an edit against the in-flight value');
  assert.equal(h.context.singleScoresRef.current.student.score, '10');
  assert.equal(h.context.singleDirtyRef.current, false);
});

test('Declining a stored-score deletion restores the value and failed saves remain retryable', async () => {
  const h = scoreSaveHarness();
  h.setApprove(false);
  h.actions.handleScoreChange('student', '', 'score');
  await h.actions.handleScoreBlur('student');
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.singleScoresRef.current.student.score, '10');
  assert.equal(h.context.singleDirtyRef.current, false);
  h.setApprove(true);
  h.setSave(async () => { throw new Error('Offline'); });
  h.actions.handleScoreChange('student', '30', 'score');
  await h.actions.handleScoreBlur('student');
  assert.equal(h.statuses.at(-1), 'error');
  assert.equal(h.context.singleDirtyRef.current, true);
  h.setSave(async () => {});
  await h.actions.handleManualSaveScores();
  assert.equal(h.statuses.at(-1), 'saved');
  assert.equal(h.calls.at(-1)?.[0].score, 30);
});

test('Matrix saves obey the toggle, confirm clearing, and queue the latest scores', async () => {
  const h = scoreSaveHarness('matrix');
  h.context.autoSaveRef.current = false;
  h.actions.handleScoreChange('student', '20');
  await h.actions.handleScoreBlur();
  assert.equal(h.calls.length, 0);
  await h.actions.handleManualSaveScores();
  assert.match(h.confirmations[0], /All changes are saved together or not at all/);
  assert.equal(h.calls[0][0].score, 20);

  h.context.autoSaveRef.current = true;
  let finish!: () => void;
  h.setSave(() => new Promise<void>(resolve => { finish = resolve; }));
  h.actions.handleScoreChange('student', '30');
  const first = h.actions.handleScoreBlur();
  h.actions.handleScoreChange('student', '40');
  await h.actions.handleScoreBlur();
  h.setSave(async () => {});
  finish();
  await first;
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.calls.at(-1)?.[0].score, 40);
  assert.equal(h.context.matrixDirtyRef.current, false);

  const deletion = scoreSaveHarness('matrix');
  deletion.setApprove(false);
  deletion.actions.handleScoreChange('student', '');
  await deletion.actions.handleScoreBlur();
  assert.equal(deletion.calls.length, 0);
  assert.equal(deletion.context.matrixScoresRef.current.student.assessment, '10');
  assert.equal(deletion.context.matrixDirtyRef.current, false);
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
