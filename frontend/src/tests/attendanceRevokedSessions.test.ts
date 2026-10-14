import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countRevokedSessions, matchesRollCallFilters, revokedHiddenText, visibleSessions,
} from '../utils/attendanceRollCall.ts';

const src = (relative: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), relative), 'utf8');
const sessions = [{ id: 'a', status: 'active' }, { id: 'b', status: 'revoked' }, { id: 'c', status: 'ended' }];

test('revoked sessions are hidden by default and shown on request', () => {
  assert.deepEqual(visibleSessions(sessions, false).map(s => s.id), ['a', 'c']);
  assert.deepEqual(visibleSessions(sessions, true).map(s => s.id), ['a', 'b', 'c']);
  assert.equal(countRevokedSessions(sessions), 1);
  assert.deepEqual(visibleSessions([sessions[1]], false), []);
});

test('the all-hidden message pluralises', () => {
  assert.equal(revokedHiddenText(1), 'No sessions to show on this date. 1 revoked session is hidden.');
  assert.equal(revokedHiddenText(2), 'No sessions to show on this date. 2 revoked sessions are hidden.');
});

test('Overridden and Recorded by filters exclude unrecorded rows unless All', () => {
  const original = { status: 'present', verificationMethod: 'biometric', overrideReason: null };
  const fixed = { status: 'late', verificationMethod: 'manual_faculty', overrideReason: 'Teacher corrected' };
  const secretary = { status: 'present', verificationMethod: 'manual_secretary', overrideReason: null };
  const unrecorded = { status: null, verificationMethod: null, overrideReason: null };
  const rows = [original, fixed, secretary, unrecorded, { ...unrecorded, status: 'not_recorded' }];
  const pick = (o: 'all' | 'overridden' | 'original', r: 'all' | 'biometric' | 'faculty' | 'secretary') =>
    rows.filter(row => matchesRollCallFilters(row, o, r));
  assert.equal(pick('all', 'all').length, 5);
  assert.deepEqual(pick('overridden', 'all'), [fixed]);
  assert.deepEqual(pick('original', 'all'), [original, secretary]);
  assert.deepEqual(pick('all', 'biometric'), [original]);
  assert.deepEqual(pick('all', 'faculty'), [fixed]);
  assert.deepEqual(pick('all', 'secretary'), [secretary]);
  assert.deepEqual(pick('original', 'secretary'), [secretary]);
  assert.deepEqual(pick('overridden', 'secretary'), []);
});

for (const [name, file] of [['Faculty', '../pages/faculty/AttendanceMonitoring.tsx'], ['Secretary', '../pages/secretary/AttendanceList.tsx']] as const) {
  test(`${name} roll call hides revoked by default, clears a revoked selection on Hide and is view-only for revoked`, () => {
    const source = src(file);
    assert.match(source, /const \[showRevoked, setShowRevoked\] = useState\(false\)/);
    assert.match(source, /if \(!show && [^\n]*\) \{?\s*\r?\n?\s*(setSelectedSessionId|setSessionId)\(''\)/);
    assert.match(source, /visibleSessions\(/);
    assert.match(source, /View-only/);
    assert.match(source, /REVOKED_SESSION_VIEW_ONLY_NOTE/);
    assert.match(source, /aria-label="Overridden"/);
    assert.match(source, /aria-label="Recorded by"/);
    assert.match(source, /<RevokedSessionsSwitch /);
    assert.ok(!source.includes('localStorage.setItem(\'show') && !/localStorage[^\n]*[Rr]evoked/.test(source));
  });
}

test('Faculty shows the picker when more than one session is visible or a revoked session exists; no Mark-all when revoked', () => {
  const source = src('../pages/faculty/AttendanceMonitoring.tsx');
  assert.match(source, /shownSessions\.length > 1 \|\| revokedSessionCount > 0/);
  assert.match(source, /\{!revokedSessionOpen && \(\s*<button[\s\S]{0,200}setIsBulkConfirmOpen\(true\)/);
});

test('Secretary has no "All recorded results" option and asks to choose a session', () => {
  const source = src('../pages/secretary/AttendanceList.tsx');
  assert.ok(!source.includes('All recorded results'));
  assert.ok(source.includes('<option value="">Choose a session</option>'));
  assert.ok(source.includes('Choose a session to manage its attendance.'));
});

test('the revoked switch copies the Pin switch design', () => {
  const source = src('../components/RevokedSessionsSwitch.tsx');
  assert.ok(source.includes('Revoked sessions:'));
  assert.ok(source.includes('aria-label="Revoked sessions"'));
  assert.ok(source.includes('role="group"'));
  assert.ok(source.includes('`Show (${revokedCount})`'));
  assert.ok(source.includes('aria-pressed'));
});
