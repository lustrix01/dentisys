import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailParts, peopleExportRow, personActions, PEOPLE_EXPORT_HEADERS } from '../pages/admin/peopleHelpers.ts';
import type { AdminPerson } from '../services/apiClient.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), 'utf8');
const base: AdminPerson = { userId: 1, name: 'Ana Cruz', email: 'ana.cruz@bicol-u.edu.ph', kind: 'faculty', status: 'active', disabledAt: null, twoFactor: true, lastActivityAt: null, classes: [] };

test('email wraps only before "@" and after "."', () => {
  assert.deepEqual(emailParts('juan.delacruz@bicol-u.edu.ph'), ['juan.', 'delacruz', '@bicol-u.edu.ph']);
  assert.equal(emailParts('juan.delacruz@bicol-u.edu.ph').join(''), 'juan.delacruz@bicol-u.edu.ph');
  const page = read('../pages/admin/PeopleAndAccounts.tsx');
  assert.doesNotMatch(page, /break-all/);
  assert.match(page, /<wbr \/>/);
});

test('row menu items by account state', () => {
  assert.deepEqual(personActions(base), ['edit-name', 'move-email', 'sign-out', 'reset-2fa', 'deactivate']);
  assert.deepEqual(personActions({ ...base, twoFactor: false }), ['edit-name', 'move-email', 'sign-out', 'deactivate']);
  assert.deepEqual(personActions({ ...base, kind: 'student', faceEnrolled: true, studentId: 7 }), ['edit-name', 'move-email', 'sign-out', 'reset-2fa', 'revoke-face', 'deactivate']);
  assert.deepEqual(personActions({ ...base, kind: 'student', faceEnrolled: false, studentId: 7 }), ['edit-name', 'move-email', 'sign-out', 'reset-2fa', 'deactivate']);
  assert.deepEqual(personActions({ ...base, status: 'deactivated' }), ['edit-name', 'move-email', 'reactivate']);
  assert.deepEqual(personActions({ ...base, status: 'invited', twoFactor: false }), ['resend', 'revoke-invite']);
});

test('Edit name and Move to new email: shown for active and deactivated rows, never invited or own row', () => {
  assert.deepEqual(personActions(base, 99).slice(0, 2), ['edit-name', 'move-email']);
  assert.deepEqual(personActions({ ...base, status: 'deactivated' }, 99), ['edit-name', 'move-email', 'reactivate']);
  assert.deepEqual(personActions({ ...base, status: 'invited' }, 99), ['resend', 'revoke-invite']);
  assert.deepEqual(personActions(base, base.userId), ['sign-out', 'reset-2fa', 'deactivate']);
});

test('move email needs the ID checkbox and a reason; payload shapes', () => {
  const page = read('../pages/admin/PeopleAndAccounts.tsx');
  assert.ok(page.includes('if (!idChecked) errors.idChecked'));
  assert.ok(page.includes('note.length < 8 || note.length > 240'));
  assert.ok(page.includes("info.destructive || action === 'move-email' ? 'bg-rose-600"));
  const api = read('../services/apiClient.ts');
  assert.ok(api.includes("'/admin/people/move-email', { userId, newEmail, reason, idChecked: true }"));
  assert.ok(api.includes("'/admin/people/name', { userId, name, reason }"));
});

test('export rows match the table columns, with the full class list and the shown status', () => {
  const when = (iso: string) => `at ${iso}`;
  const faculty = { ...base, classes: [{ csId: 1, label: 'A', schoolYear: '', current: true }, { csId: 2, label: 'B', schoolYear: '', current: false }] };
  assert.equal(PEOPLE_EXPORT_HEADERS('faculty').length, peopleExportRow(faculty, when).length);
  assert.deepEqual(peopleExportRow(faculty, when), ['Ana Cruz', 'ana.cruz@bicol-u.edu.ph', 'A, B', 'Active', 'On', '—']);
  const invited: AdminPerson = { ...base, kind: 'student', studentNo: '2024-1', enrolledClasses: [], status: 'invited', invitation: { sentAt: '2026-11-01', expiresAt: null, expired: true } };
  assert.equal(PEOPLE_EXPORT_HEADERS('student').length, peopleExportRow(invited, when).length);
  assert.deepEqual(peopleExportRow(invited, when).slice(3), ['', 'Invitation expired', '—', 'Invited at 2026-11-01']);
});

test('course, class, invited and year-level filters reach the API', () => {
  const api = read('../services/apiClient.ts');
  assert.match(api, /for \(const key of \['courseId', 'classId', 'yearLevel'\] as const\)/);
  assert.match(api, /'active' \| 'deactivated' \| 'invited' \| 'all'/);
  assert.match(api, /'\/admin\/people\/filters'/);
  const page = read('../pages/admin/PeopleAndAccounts.tsx');
  assert.match(page, /classId: kind === 'student' \? classId \|\| undefined : undefined/);
});

test('screen tables pin the header and first column', () => {
  for (const f of ['PeopleAndAccounts', 'CourseCatalog', 'FacultyInvitation', 'Classes', 'SystemAudit']) {
    assert.match(read(`../pages/admin/${f}.tsx`), /table-pin table-pin-first/, f);
  }
});
