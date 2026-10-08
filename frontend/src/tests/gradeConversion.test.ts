import test from 'node:test';
import assert from 'node:assert/strict';
import { percentageToGWA, percentageToGWAExact } from '../utils/gradeHelper.ts';

test('Grade conversion matches server display rounding and interpolation', () => {
  const cases: Array<[number, number]> = [
    [97, 1],
    [94, 1.25],
    [87.34, 1.81],
    [81, 2.38],
    [78.16, 2.73],
    [80, 2.5],
    [80.01, 2.5],
    [79.99, 2.5],
    [74.99, 5],
    [Number.NaN, 5],
  ];
  for (const [percentage, expected] of cases) {
    assert.equal(percentageToGWA(percentage), expected, `percentage ${percentage}`);
  }
});

test('Exact grade conversion preserves the inclusive remediation boundary before rounding', () => {
  assert.ok(percentageToGWAExact(80.01) < 2.5);
  assert.ok(percentageToGWAExact(80.00) >= 2.5);
  assert.ok(percentageToGWAExact(79.99) >= 2.5);
});
