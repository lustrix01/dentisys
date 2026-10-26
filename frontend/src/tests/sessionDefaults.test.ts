import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassMeeting } from '../services/apiClient.ts';
import { manilaNow, meetingTimes, pickMeeting, sortMeetings } from '../utils/sessionDefaults.ts';

const lecture = { component: 'Lecture', day: 'Mon', startTime: '09:00', endTime: '11:00', room: 'CDM 1' } as const;
const lab = { component: 'Laboratory', day: 'Mon', startTime: '13:00', endTime: '16:00', room: 'CDM 2' } as const;
const thu = { component: 'Laboratory', day: 'Thu', startTime: '12:00', endTime: '17:00', room: 'CDM 2' } as const;
const meetings = [thu, lab, lecture];
const at = (h: number, m: number) => h * 60 + m;
const fill = (m: ClassMeeting) => { const t = meetingTimes(m); return [t.openingTime, t.presentCutoff, t.lateCutoff, t.classEndTime, t.room].join(' / '); };

test('contract example table', () => {
  assert.equal(fill(pickMeeting(meetings, 'Mon', at(8, 40))!), '08:45 / 09:15 / 09:30 / 11:00 / CDM 1');
  assert.equal(pickMeeting(meetings, 'Mon', at(9, 40)), lecture);
  assert.equal(fill(pickMeeting(meetings, 'Mon', at(11, 30))!), '12:45 / 13:15 / 13:30 / 16:00 / CDM 2');
  assert.equal(pickMeeting(meetings, 'Mon', at(17, 0)), null);
  assert.equal(pickMeeting(meetings, 'Tue', at(10, 0)), null);
  assert.equal(fill(thu), '11:45 / 12:15 / 12:30 / 17:00 / CDM 2');
});

test('end of a meeting is not under way; next one is chosen', () => {
  assert.equal(pickMeeting(meetings, 'Mon', at(11, 0)), lab);
});

test('short meeting ends the late cutoff at its end, present stays before late', () => {
  const t = meetingTimes({ ...lecture, startTime: '09:00', endTime: '09:20' });
  assert.deepEqual([t.openingTime, t.presentCutoff, t.lateCutoff, t.classEndTime], ['08:45', '09:15', '09:20', '09:20']);
  const tiny = meetingTimes({ ...lecture, startTime: '09:00', endTime: '09:10' });
  assert.ok(tiny.presentCutoff < tiny.lateCutoff);
});

test('opening clamps at midnight', () => {
  assert.equal(meetingTimes({ ...lecture, startTime: '00:10', endTime: '01:00' }).openingTime, '00:00');
});

test('chips sort Mon to Sun then by start', () => {
  assert.deepEqual(sortMeetings(meetings), [lecture, lab, thu]);
});

test('manilaNow reads Asia/Manila weekday and time', () => {
  assert.deepEqual(manilaNow(new Date('2026-10-26T00:40:00Z')), { day: 'Mon', minutes: at(8, 40) });
  assert.deepEqual(manilaNow(new Date('2026-10-26T17:00:00Z')), { day: 'Tue', minutes: at(1, 0) });
});
