import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGrade, percentageToGWA, percentageToGWAExact, roundPercent } from '../utils/gradeHelper.ts';

// [whole percent, grade]; Midterm, Final and course grades share one table (spec 2026-10-26). Same list as tests/backend/faculty_grading_test.php.
const CASES: Array<[number, number]> = [
  [100, 1.0], [99, 1.0], [98, 1.1], [97, 1.2], [96, 1.3], [95, 1.4], [94, 1.5], [93, 1.6], [92, 1.7], [91, 1.8],
  [90, 1.9], [89, 2.0], [88, 2.1], [87, 2.2], [86, 2.3], [85, 2.4], [84, 2.5], [83, 2.6], [82, 2.6], [81, 2.7],
  [80, 2.7], [79, 2.8], [78, 2.8], [77, 2.9], [76, 2.9], [75, 3.0], [74, 5.0], [70, 5.0], [65, 5.0], [0, 5.0],
  [Number.NaN, 5],
];

test('BUCDM conversion: table rows match the server list and below 75% is 5.0 for every period', () => {
  for (const [pct, grade] of CASES) {
    assert.equal(percentageToGWA(pct, 'Midterm'), grade, `Midterm ${pct}`);
    assert.equal(percentageToGWA(pct), grade, `Final ${pct}`);
    assert.equal(percentageToGWAExact(pct, 'Midterm'), grade, `Midterm exact ${pct}`);
    assert.equal(percentageToGWAExact(pct, 'Final'), grade, `Final exact ${pct}`);
  }
});

test('Whole-percent rounding is half-up and float-noise safe', () => {
  const cases: Array<[number, number]> = [[74.5, 75], [74.49999999, 74], [74.4999999999, 75], [84.5, 85], [83.7667, 84], [0.4, 0], [99.5, 100]];
  for (const [raw, whole] of cases) assert.equal(roundPercent(raw), whole, String(raw));
  assert.equal(percentageToGWAExact(roundPercent(74.5)), 3.0);
});

test('BUCDM conversion: float drift cannot drop a whole percent', () => {
  assert.equal(percentageToGWAExact(83.99999999999), 2.5);
  assert.equal(percentageToGWAExact(0.84 * 100), 2.5);
});

test('Remediation boundary: 84% or below is 2.5 or worse, 85% is 2.4', () => {
  assert.ok(percentageToGWAExact(84) >= 2.5);
  assert.ok(percentageToGWAExact(85) < 2.5);
});

test('formatGrade trims one trailing zero and never rounds saved two-decimal grades', () => {
  const cases: Array<[number, string]> = [[2.6, '2.6'], [2.5, '2.5'], [1.0, '1.0'], [2.33, '2.33'], [2.46, '2.46'], [2.45, '2.45'], [5.0, '5.0']];
  for (const [grade, text] of cases) assert.equal(formatGrade(grade), text);
});
