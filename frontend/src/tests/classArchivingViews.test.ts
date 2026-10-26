import test from 'node:test';
import assert from 'node:assert/strict';
import { isArchivedCurrentYear, orderCurrentYearClasses } from '../utils/classArchiving.ts';

test('A2/A3: active classes first, then Finished-archived; Cancelled and mistake dropped', () => {
  const list = [
    { id: 'new-finished', archiveReason: 'finished' as const, isArchived: true },
    { id: 'gone', archiveReason: 'cancelled' as const, isArchived: true },
    { id: 'oops', archiveReason: 'mistake' as const, isArchived: true },
    { id: 'active' },
  ];
  assert.deepEqual(orderCurrentYearClasses(list).map(c => c.id), ['active', 'new-finished']);
});

test('isArchivedCurrentYear is true only for archived current-year classes', () => {
  assert.equal(isArchivedCurrentYear({ archiveReason: 'finished' }), true);
  assert.equal(isArchivedCurrentYear({ isHistorical: true, archiveReason: 'finished' }), false);
  assert.equal(isArchivedCurrentYear({}), false);
  assert.equal(isArchivedCurrentYear(undefined), false);
});
