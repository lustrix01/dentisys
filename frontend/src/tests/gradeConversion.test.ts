import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGrade, percentageToGWA, percentageToGWAExact } from '../utils/gradeHelper.ts';

// [percentage, Midterm grade, Final/course grade]; identical list lives in tests/backend/faculty_grading_test.php.
const CASES: Array<[number, number, number]> = [
  [100, 1.0, 1.0],
  [99.5, 1.0, 1.0],
  [99, 1.0, 1.0],
  [98.9, 1.1, 1.1],
  [97, 1.2, 1.2],
  [96, 1.3, 1.3],
  [95, 1.4, 1.4],
  [94, 1.5, 1.5],
  [93, 1.6, 1.6],
  [92, 1.7, 1.7],
  [91, 1.8, 1.8],
  [90, 1.9, 1.9],
  [89, 2.0, 2.0],
  [88, 2.1, 2.1],
  [87, 2.2, 2.2],
  [86, 2.3, 2.3],
  [85.0, 2.4, 2.4],
  [84.99, 2.5, 2.5],
  [84.9, 2.5, 2.5],
  [84, 2.5, 2.5],
  [83.5, 2.6, 2.6],
  [82, 2.6, 2.6],
  [81, 2.7, 2.7],
  [80, 2.7, 2.7],
  [79, 2.8, 2.8],
  [78, 2.8, 2.8],
  [77, 2.9, 2.9],
  [76, 2.9, 2.9],
  [75, 3.0, 3.0],
  [74.9, 3.1, 5.0],
  [74, 3.1, 5.0],
  [73, 3.2, 5.0],
  [70, 3.5, 5.0],
  [66, 3.9, 5.0],
  [65.9, 4.0, 5.0],
  [65, 4.0, 5.0],
  [10, 4.0, 5.0],
  [0, 4.0, 5.0],
  [Number.NaN, 5, 5],
];

test('BUCDM conversion: truncation, table rows and Midterm/Final bands match the server list', () => {
  for (const [pct, midterm, final] of CASES) {
    assert.equal(percentageToGWA(pct, 'Midterm'), midterm, `Midterm ${pct}`);
    assert.equal(percentageToGWA(pct), final, `Final ${pct}`);
    assert.equal(percentageToGWAExact(pct, 'Midterm'), midterm, `Midterm exact ${pct}`);
    assert.equal(percentageToGWAExact(pct, 'Final'), final, `Final exact ${pct}`);
  }
});

test('BUCDM conversion: float drift cannot drop a whole percent', () => {
  assert.equal(percentageToGWAExact(83.99999999999), 2.5);
  assert.equal(percentageToGWAExact(0.84 * 100), 2.5);
});

test('Remediation boundary: 84% or below is 2.5 or worse, 85% is 2.4', () => {
  assert.ok(percentageToGWAExact(84.99) >= 2.5);
  assert.ok(percentageToGWAExact(85) < 2.5);
});

test('formatGrade trims one trailing zero and never rounds saved two-decimal grades', () => {
  const cases: Array<[number, string]> = [[2.6, '2.6'], [2.5, '2.5'], [1.0, '1.0'], [2.33, '2.33'], [2.46, '2.46'], [2.45, '2.45'], [5.0, '5.0']];
  for (const [grade, text] of cases) assert.equal(formatGrade(grade), text);
});
