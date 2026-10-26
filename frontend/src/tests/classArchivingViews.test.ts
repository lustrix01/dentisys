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

test('an archived class no longer books its room or time slot', async () => {
  const { checkScheduleConflicts } = await import('../utils/scheduleHelper.ts');
  const slot = { id: 's1', type: 'Lecture' as const, room: 'CDM 1', days: ['Mon'], startTime: '09:00 AM', endTime: '11:00 AM' };
  const existing = { id: '7', csId: 7, csName: 'OLD-1A', schoolYear: '2026-2027', meetings: [{ component: 'Lecture', day: 'Mon', room: 'CDM 1', startTime: '09:00', endTime: '11:00' }] };
  assert.match(String(checkScheduleConflicts([slot], [existing] as never, '2026-2027')), /Conflict/);
  assert.equal(checkScheduleConflicts([slot], [{ ...existing, archiveReason: 'cancelled' }] as never, '2026-2027'), null);
});
