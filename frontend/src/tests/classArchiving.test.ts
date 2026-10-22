import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveGroup, isViewOnlyClass } from '../utils/classArchiving.ts';

test('CLS-003: archived and past-year classes are view-only, active ones are not', () => {
  assert.equal(isViewOnlyClass({}), false);
  assert.equal(isViewOnlyClass({ isCurrentSchoolYear: true, isArchived: false, archiveReason: null }), false);
  assert.equal(isViewOnlyClass({ isArchived: true }), true);
  assert.equal(isViewOnlyClass({ archiveReason: 'mistake' }), true);
  assert.equal(isViewOnlyClass({ isCurrentSchoolYear: false }), true);
  assert.equal(isViewOnlyClass({ isHistorical: true }), true);
  assert.equal(isViewOnlyClass(null), false);
});

test('CLS-003: Archived tab groups Finished and past-year as Completed, cancelled/mistake apart', () => {
  assert.equal(archiveGroup({ archiveReason: 'finished', isArchived: true }), 'completed');
  assert.equal(archiveGroup({ isHistorical: true, isArchived: true }), 'completed');
  assert.equal(archiveGroup({ archiveReason: 'cancelled', isArchived: true }), 'removed');
  assert.equal(archiveGroup({ archiveReason: 'mistake', isArchived: true }), 'removed');
  assert.equal(archiveGroup({ archiveReason: null, isArchived: false }), null);
});
