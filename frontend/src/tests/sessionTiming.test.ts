import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSessionDate } from '../utils/sessionDate.ts';
import { sessionTimingSegmentWidths, changeSessionTime, changeSessionDuration } from '../utils/sessionTiming.ts';

const faculty = { openingTime: '08:00', presentCutoff: '09:00', lateCutoff: '12:00', classEndTime: '13:00' };
test('opening preserves every window length for chips, custom and exact times', () => {
  assert.deepEqual(changeSessionTime(faculty, 'openingTime', '10:00').timing,
    { openingTime: '10:00', presentCutoff: '11:00', lateCutoff: '14:00', classEndTime: '15:00' });
  assert.deepEqual(changeSessionTime(faculty, 'openingTime', '07:15').timing,
    { openingTime: '07:15', presentCutoff: '08:15', lateCutoff: '11:15', classEndTime: '12:15' });
});
test('opening rejects midnight overflow atomically and accepts 23:59', () => {
  const rejected = changeSessionTime(faculty, 'openingTime', '20:00');
  assert.equal(rejected.timing, faculty);
  assert.equal(rejected.error, 'Times must stay within the same day.');
  assert.equal(changeSessionTime(faculty, 'openingTime', '18:59').timing.classEndTime, '23:59');
});
test('later exact fields push only subsequent cutoffs when needed', () => {
  assert.deepEqual(changeSessionTime(faculty, 'presentCutoff', '12:30').timing,
    { ...faculty, presentCutoff: '12:30', lateCutoff: '12:31' });
  assert.deepEqual(changeSessionTime(faculty, 'lateCutoff', '14:00').timing,
    { ...faculty, lateCutoff: '14:00', classEndTime: '14:00' });
  assert.equal(changeSessionTime(faculty, 'presentCutoff', '07:00').timing.presentCutoff, '08:01');
  assert.equal(changeSessionTime(faculty, 'classEndTime', '11:00').timing.classEndTime, '12:00');
});
test('quick and custom durations produce HH:MM fields with strict order and optional zero end gap', () => {
  const present = changeSessionDuration(faculty, 'presentCutoff', 30).timing;
  const late = changeSessionDuration(present, 'lateCutoff', 120).timing;
  const end = changeSessionDuration(late, 'classEndTime', 60).timing;
  assert.deepEqual(changeSessionTime(end, 'openingTime', '10:00').timing,
    { openingTime: '10:00', presentCutoff: '10:30', lateCutoff: '12:30', classEndTime: '13:30' });
  assert.equal(changeSessionDuration(faculty, 'classEndTime', 0).timing.classEndTime, '12:00');
  assert.ok(changeSessionDuration(faculty, 'lateCutoff', 0).error);
  assert.ok(changeSessionDuration(faculty, 'presentCutoff', 1.5).error);
  assert.equal(changeSessionDuration(faculty, 'lateCutoff', 1000).error, 'Times must stay within the same day.');
});

test('session dates stay on the calendar day, including leap days and year boundaries', () => {
  assert.equal(formatSessionDate('2099-10-02'), 'Fri, Oct 2, 2099');
  assert.equal(formatSessionDate('2026-10-03'), 'Sat, Oct 3, 2026');
  assert.equal(formatSessionDate('2024-02-29'), 'Thu, Feb 29, 2024');
  assert.equal(formatSessionDate('2027-01-01'), 'Fri, Jan 1, 2027');
  assert.equal(formatSessionDate('2026-02-29'), '2026-02-29');
  assert.equal(formatSessionDate(undefined), '—');
});
test('timing segments follow window lengths and keep zero or tiny windows visible', () => {
  const widths = sessionTimingSegmentWidths({ openingTime: '08:00', presentCutoff: '08:30', lateCutoff: '10:30', classEndTime: '11:30' });
  assert.ok(Math.abs(widths[1] / widths[0] - 4) < 0.00001);
  assert.ok(Math.abs(widths[2] / widths[0] - 2) < 0.00001);
  const tiny = sessionTimingSegmentWidths({ openingTime: '08:00', presentCutoff: '08:01', lateCutoff: '23:59', classEndTime: '23:59' });
  assert.deepEqual(tiny, [5, 90, 5]);
  assert.equal(tiny.reduce((sum, width) => sum + width, 0), 100);
});
