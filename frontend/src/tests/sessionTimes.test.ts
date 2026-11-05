import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTimeChange, checkTimes, formatDuration, formatTime12, isNextDay, sessionEndOffsetMs, sessionMinutes } from '../utils/sessionTimes.ts';

const base = { openingTime: '08:00', presentCutoff: '09:00', lateCutoff: '12:00', classEndTime: '13:00' };

test('Opening moves the other three by the same amount, wrapping past midnight', () => {
  assert.deepEqual(applyTimeChange(base, 'openingTime', '02:00'), { openingTime: '02:00', presentCutoff: '03:00', lateCutoff: '06:00', classEndTime: '07:00' });
  assert.deepEqual(applyTimeChange(base, 'openingTime', '22:00'), { openingTime: '22:00', presentCutoff: '23:00', lateCutoff: '02:00', classEndTime: '03:00' });
});

test('a cleared Opening does not shift anything and the next typed value does not either', () => {
  const cleared = applyTimeChange(base, 'openingTime', '');
  assert.deepEqual(cleared, { ...base, openingTime: '' });
  assert.deepEqual(applyTimeChange(cleared, 'openingTime', '10:00'), { ...base, openingTime: '10:00' });
});

test('a cutoff pushes only later fields that would fall before it; earlier fields never move', () => {
  assert.deepEqual(applyTimeChange(base, 'lateCutoff', '14:00'), { ...base, lateCutoff: '14:00', classEndTime: '14:00' });
  assert.deepEqual(applyTimeChange(base, 'presentCutoff', '15:00'), { ...base, presentCutoff: '15:00', lateCutoff: '15:01', classEndTime: '15:01' });
  assert.deepEqual(applyTimeChange(base, 'presentCutoff', '10:00'), { ...base, presentCutoff: '10:00' });
  assert.deepEqual(applyTimeChange(base, 'classEndTime', '08:30'), { ...base, classEndTime: '08:30' });
});

test('pushes are not undone when the cutoff moves back', () => {
  const pushed = applyTimeChange(base, 'presentCutoff', '15:00');
  assert.deepEqual(applyTimeChange(pushed, 'presentCutoff', '09:00'), { ...base, lateCutoff: '15:01', classEndTime: '15:01' });
});

test('the push works across midnight', () => {
  const night = { openingTime: '23:00', presentCutoff: '23:30', lateCutoff: '01:00', classEndTime: '02:00' };
  assert.deepEqual(applyTimeChange(night, 'presentCutoff', '00:30'), { ...night, presentCutoff: '00:30', lateCutoff: '01:00' });
  assert.deepEqual(applyTimeChange(night, 'presentCutoff', '01:30'), { ...night, presentCutoff: '01:30', lateCutoff: '01:31' });
});

test('next-day detection and end offset', () => {
  assert.equal(isNextDay('23:00', '02:00'), true);
  assert.equal(isNextDay('23:00', '23:30'), false);
  assert.equal(isNextDay('', '02:00'), false);
  assert.equal(sessionEndOffsetMs('23:00', '02:00'), 86400000);
  assert.equal(sessionEndOffsetMs('08:00', '13:00'), 0);
  assert.equal(sessionEndOffsetMs('08:00', '13:00', true), 86400000);
  assert.equal(sessionEndOffsetMs('23:00', '02:00', false), 0);
});

test('duration, formats and the long-session figure', () => {
  assert.equal(sessionMinutes({ openingTime: '23:00', presentCutoff: '23:30', lateCutoff: '01:00', classEndTime: '02:00' }), 180);
  assert.equal(sessionMinutes({ ...base, classEndTime: '' }), null);
  assert.equal(formatDuration(180), '3 h');
  assert.equal(formatDuration(150), '2 h 30 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatTime12('00:05'), '12:05 AM');
  assert.equal(formatTime12('13:00'), '1:00 PM');
});

test('checkTimes accepts overnight and rejects out-of-order or 24 h sessions', () => {
  assert.equal(checkTimes(base), null);
  assert.equal(checkTimes({ openingTime: '23:00', presentCutoff: '23:30', lateCutoff: '01:00', classEndTime: '02:00' }), null);
  assert.equal(checkTimes({ ...base, presentCutoff: '08:00' }), 'Present cutoff must be after the Opening time.');
  assert.equal(checkTimes({ ...base, lateCutoff: '09:00' }), 'Late cutoff must be after the Present cutoff.');
  assert.equal(checkTimes({ ...base, classEndTime: '11:00' }), 'Class end time must be at or after the Late cutoff.');
  assert.equal(checkTimes({ ...base, classEndTime: '08:00' }), 'Class end time must be at or after the Late cutoff.');
  assert.equal(checkTimes({ ...base, classEndTime: '' }), 'Fill in all four times.');
  assert.equal(sessionMinutes({ ...base, classEndTime: '07:59' }), 23 * 60 + 59);
});
