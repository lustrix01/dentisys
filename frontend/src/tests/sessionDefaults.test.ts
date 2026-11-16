import assert from 'node:assert/strict';
import test from 'node:test';
import { manilaNow, nextQuarterHour, pickSessionMeeting, sortMeetings } from '../utils/sessionDefaults.ts';
import { timesFromGrace } from '../utils/sessionTimes.ts';

const lecture = { component: 'Lecture', day: 'Mon', startTime: '09:00', endTime: '11:00', room: 'CDM 1' } as const;
const lab = { component: 'Laboratory', day: 'Mon', startTime: '13:00', endTime: '16:00', room: 'CDM 2' } as const;
const thu = { component: 'Laboratory', day: 'Thu', startTime: '12:00', endTime: '17:00', room: 'CDM 2' } as const;
const meetings = [thu, lab, lecture];
const at = (h: number, m: number) => h * 60 + m;
// Mon 2026-10-26 in Asia/Manila (UTC+8): 08:40 local is 00:40Z.
const manila = (iso: string) => new Date(`${iso}+08:00`);

test('meeting under way now, else the next one (this week or next)', () => {
  assert.deepEqual(pickSessionMeeting(meetings, manila('2026-10-26T08:40:00')), { meeting: lecture, date: '2026-10-26' });
  assert.deepEqual(pickSessionMeeting(meetings, manila('2026-10-26T09:40:00')), { meeting: lecture, date: '2026-10-26' });
  assert.deepEqual(pickSessionMeeting(meetings, manila('2026-10-26T11:00:00')), { meeting: lab, date: '2026-10-26' });
  assert.deepEqual(pickSessionMeeting(meetings, manila('2026-10-26T17:00:00')), { meeting: thu, date: '2026-10-29' });
  assert.deepEqual(pickSessionMeeting(meetings, manila('2026-10-30T10:00:00')), { meeting: lecture, date: '2026-11-02' });
});

test('the same weekday next week counts when today is over', () => {
  assert.deepEqual(pickSessionMeeting([lecture], manila('2026-10-26T12:00:00')), { meeting: lecture, date: '2026-11-02' });
});

test('a class without meetings has none to pick', () => {
  assert.equal(pickSessionMeeting([], manila('2026-10-26T12:00:00')), null);
});

test('times from a meeting use the class grace periods from the opening', () => {
  assert.deepEqual(timesFromGrace('09:00', '11:00', 15, 30), { openingTime: '09:00', presentCutoff: '09:15', lateCutoff: '09:30', classEndTime: '11:00' });
  assert.deepEqual(timesFromGrace('09:00', '11:00', 20, 45), { openingTime: '09:00', presentCutoff: '09:20', lateCutoff: '09:45', classEndTime: '11:00' });
});

test('late cutoff is capped at the class end when that stays valid', () => {
  assert.deepEqual(timesFromGrace('09:00', '09:20', 15, 30), { openingTime: '09:00', presentCutoff: '09:15', lateCutoff: '09:20', classEndTime: '09:20' });
  // End before the present cutoff: keep opening + grace and let the checks speak.
  assert.deepEqual(timesFromGrace('09:00', '09:10', 15, 30), { openingTime: '09:00', presentCutoff: '09:15', lateCutoff: '09:30', classEndTime: '09:10' });
});

test('next quarter hour for a class without meetings', () => {
  assert.equal(nextQuarterHour(at(8, 40)), '08:45');
  assert.equal(nextQuarterHour(at(8, 45)), '09:00');
  assert.equal(nextQuarterHour(at(23, 50)), '00:00');
});

test('chips sort Mon to Sun then by start', () => {
  assert.deepEqual(sortMeetings(meetings), [lecture, lab, thu]);
});

test('manilaNow reads Asia/Manila weekday and time', () => {
  assert.deepEqual(manilaNow(new Date('2026-10-26T00:40:00Z')), { day: 'Mon', minutes: at(8, 40) });
  assert.deepEqual(manilaNow(new Date('2026-10-26T17:00:00Z')), { day: 'Tue', minutes: at(1, 0) });
});

test('one-tap opening is 15 minutes before the meeting, defaults give the old 7:45 / 8:15 / 8:30', async () => {
  const { meetingOpening } = await import('../utils/sessionDefaults.ts');
  assert.equal(meetingOpening('08:00'), '07:45');
  assert.equal(meetingOpening('00:10'), '00:00');
  assert.deepEqual(timesFromGrace(meetingOpening('08:00'), '10:00', 30, 45), { openingTime: '07:45', presentCutoff: '08:15', lateCutoff: '08:30', classEndTime: '10:00' });
});
