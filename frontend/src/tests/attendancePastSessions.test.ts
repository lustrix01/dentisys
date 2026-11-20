import test from 'node:test';
import assert from 'node:assert/strict';
import { countsBySession, filterPastSessions } from '../utils/attendanceRollCall.ts';

const students = [{}, {}, {}, {}, {}];
const sessions = [{ id: '1' }, { id: '2' }];

test('countsBySession counts each saved status per session', () => {
  const counts = countsBySession({
    sessions, students,
    records: [
      { sessionId: '1', status: 'present' }, { sessionId: '1', status: 'present' },
      { sessionId: '1', status: 'late' }, { sessionId: '1', status: 'absent' }, { sessionId: '1', status: 'excused' },
      { sessionId: '2', status: 'absent' },
    ],
  });
  assert.deepEqual(counts.get('1'), { present: 2, late: 1, absent: 1, excused: 1, notRecorded: 0 });
  assert.deepEqual(counts.get('2'), { present: 0, late: 0, absent: 1, excused: 0, notRecorded: 4 });
});

test('countsBySession reads statuses case-insensitively and ignores unknown ones', () => {
  const counts = countsBySession({
    sessions: [{ id: '1' }], students,
    records: [{ sessionId: '1', status: 'PRESENT' }, { sessionId: '1', status: 'Late' }, { sessionId: '1', status: 'not_recorded' }, { sessionId: '1', status: '' }],
  });
  assert.deepEqual(counts.get('1'), { present: 1, late: 1, absent: 0, excused: 0, notRecorded: 3 });
});

test('countsBySession: Not recorded is the active students minus those recorded, never negative', () => {
  const none = countsBySession({ sessions: [{ id: '1' }], students, records: [] });
  assert.equal(none.get('1')?.notRecorded, 5);
  const noStudents = countsBySession({ sessions: [{ id: '1' }], students: [], records: [{ sessionId: '1', status: 'present' }] });
  assert.deepEqual(noStudents.get('1'), { present: 1, late: 0, absent: 0, excused: 0, notRecorded: 0 });
});

test('countsBySession ignores records of sessions that are not in the sheet (such as revoked ones)', () => {
  const counts = countsBySession({ sessions: [{ id: '1' }], students, records: [{ sessionId: '9', status: 'present' }] });
  assert.deepEqual([...counts.keys()], ['1']);
  assert.equal(counts.get('1')?.present, 0);
  assert.equal(counts.get('9'), undefined);
});

const past = [
  { id: 'a', status: 'ended', sessionDate: '2026-10-01', openingTime: '08:00' },
  { id: 'b', status: 'revoked', sessionDate: '2026-10-05', openingTime: '08:00' },
  { id: 'c', status: 'ended', sessionDate: '2026-10-05', openingTime: '13:00' },
  { id: 'd', status: 'ended', sessionDate: '2026-10-05', openingTime: '09:00' },
  { id: 'e', status: 'scheduled', sessionDate: '2026-10-10', openingTime: '08:00' },
];
const ids = (list: { id: string }[]) => list.map(s => s.id);

test('filterPastSessions orders newest first by date, then opening time', () => {
  assert.deepEqual(ids(filterPastSessions(past, '', '', false)), ['e', 'c', 'd', 'a']);
});

test('filterPastSessions treats empty bounds as no bound and includes both bounds', () => {
  assert.deepEqual(ids(filterPastSessions(past, '2026-10-05', '', false)), ['e', 'c', 'd']);
  assert.deepEqual(ids(filterPastSessions(past, '', '2026-10-05', false)), ['c', 'd', 'a']);
  assert.deepEqual(ids(filterPastSessions(past, '2026-10-05', '2026-10-05', false)), ['c', 'd']);
  assert.deepEqual(filterPastSessions(past, '2026-11-01', '2026-11-30', false), []);
});

test('filterPastSessions hides revoked sessions unless shown', () => {
  assert.deepEqual(ids(filterPastSessions(past, '', '', true)), ['e', 'c', 'd', 'b', 'a']);
  assert.deepEqual(ids(filterPastSessions(past, '2026-10-05', '2026-10-05', true)), ['c', 'd', 'b']);
});

test('filterPastSessions does not reorder the list it is given', () => {
  const copy = past.map(s => s.id);
  filterPastSessions(past, '', '', true);
  assert.deepEqual(ids(past), copy);
});
