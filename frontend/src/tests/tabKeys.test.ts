import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTabIndex } from '../utils/tabKeys.ts';

test('arrow keys move and wrap', () => {
  assert.equal(nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(nextTabIndex('ArrowRight', 2, 3), 0);
  assert.equal(nextTabIndex('ArrowLeft', 1, 3), 0);
  assert.equal(nextTabIndex('ArrowLeft', 0, 3), 2);
});

test('Home and End jump to first and last', () => {
  assert.equal(nextTabIndex('Home', 2, 4), 0);
  assert.equal(nextTabIndex('End', 0, 4), 3);
});

test('other keys are not handled', () => {
  assert.equal(nextTabIndex('Enter', 0, 3), null);
  assert.equal(nextTabIndex('ArrowRight', 0, 0), null);
});
