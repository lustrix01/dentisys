import test from 'node:test';
import assert from 'node:assert/strict';
import { addMinutes, applyTimeChange, checkTimes, formatDuration, formatTime12, from12h, isNextDay, minutesAfter, nextDigits, parseTypedTime, sessionEndOffsetMs, sessionMinutes, stepLoop, to12h } from '../utils/sessionTimes.ts';

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

test('checkTimes accepts overnight and rejects out-of-order or over-12 h sessions', () => {
  assert.equal(checkTimes(base), null);
  assert.equal(checkTimes({ openingTime: '23:00', presentCutoff: '23:30', lateCutoff: '01:00', classEndTime: '02:00' }), null);
  assert.equal(checkTimes({ ...base, presentCutoff: '08:00' }), 'Present cutoff must be after the opening time.');
  assert.equal(checkTimes({ ...base, lateCutoff: '09:00' }), 'Late cutoff must be after the present cutoff.');
  assert.equal(checkTimes({ ...base, classEndTime: '11:00' }), 'Class end time must be at or after the late cutoff.');
  assert.equal(checkTimes({ ...base, classEndTime: '08:00' }), 'Class end must be after the opening time.');
  assert.equal(checkTimes({ ...base, classEndTime: '' }), 'Fill in all four times.');
  assert.equal(sessionMinutes({ ...base, classEndTime: '07:59' }), 23 * 60 + 59);
  assert.equal(checkTimes({ ...base, classEndTime: '21:00' }), 'A session can last at most 12 hours.');
  assert.equal(checkTimes({ ...base, classEndTime: '20:00' }), null);
  assert.equal(checkTimes({ ...base, classEndTime: '07:59' }), 'A session can last at most 12 hours.');
  assert.equal(checkTimes({ openingTime: '23:00', presentCutoff: '23:30', lateCutoff: '00:30', classEndTime: '01:00' }), null);
});

test('typed times (parseTypedTime)', () => {
  const cases: Array<[string, string | null]> = [
    ['8', '08:00'], ['830', '08:30'], ['8:05', '08:05'], ['1:30p', '13:30'], ['1:30 pm', '13:30'], ['19:00', '19:00'], ['0730', '07:30'],
    ['12', '12:00'], ['12am', '00:00'], ['12:15 AM', '00:15'], ['12pm', '12:00'], ['3', '15:00'], ['11', '11:00'], ['0', '00:00'], ['00:30', '00:30'],
    ['9a', '09:00'], ['7p', '19:00'], ['13', '13:00'], ['23:59', '23:59'],
    ['', null], ['abc', null], ['8:60', null], ['24:00', null], ['13pm', null], ['0am', null], ['8:5', null], ['12345', null],
  ];
  for (const [text, expected] of cases) assert.equal(parseTypedTime(text), expected, `"${text}"`);
});

test('minutes after the opening count past midnight', () => {
  assert.equal(addMinutes('22:00', 180), '01:00');
  assert.equal(isNextDay('22:00', addMinutes('22:00', 180)), true);
  assert.equal(minutesAfter('22:00', '01:00'), 180);
  assert.equal(checkTimes({ openingTime: '22:00', presentCutoff: '22:15', lateCutoff: '22:30', classEndTime: '01:00' }), null);
});

test('wheel columns loop: 12 -> 1 and 59 -> 00, both ways', () => {
  assert.equal(stepLoop(12, 1, 1, 12), 1);
  assert.equal(stepLoop(1, -1, 1, 12), 12);
  assert.equal(stepLoop(59, 1, 0, 59), 0);
  assert.equal(stepLoop(0, -1, 0, 59), 59);
  assert.equal(stepLoop(5, 62, 0, 59), 7);
});

test('12-hour wheel values convert to and from HH:MM', () => {
  assert.deepEqual(to12h('00:05'), { hour: 12, minute: 5, pm: false });
  assert.deepEqual(to12h('12:00'), { hour: 12, minute: 0, pm: true });
  assert.deepEqual(to12h('19:45'), { hour: 7, minute: 45, pm: true });
  assert.equal(from12h(12, 5, false), '00:05');
  assert.equal(from12h(12, 0, true), '12:00');
  assert.equal(from12h(7, 45, true), '19:45');
  for (let h = 0; h < 24; h++) { const t = `${String(h).padStart(2, '0')}:30`; const w = to12h(t); assert.equal(from12h(w.hour, w.minute, w.pm), t); }
});

test('typed digits on a column and the typed field commit', () => {
  assert.equal(nextDigits('', '1', 12), '1');
  assert.equal(nextDigits('1', '2', 12), '12');
  assert.equal(nextDigits('1', '5', 12), '5');
  assert.equal(nextDigits('12', '3', 12), '3');
  assert.equal(nextDigits('', '0', 59), '0');
  assert.equal(nextDigits('0', '7', 59), '07');
  assert.equal(nextDigits('6', '5', 59), '5');
  assert.equal(parseTypedTime('7:45 pm'), '19:45');
  assert.equal(parseTypedTime('7:45 xm'), null);
});
