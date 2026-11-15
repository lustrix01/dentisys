import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// People & Accounts filters are applied on the server; the page only sends them.
const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '../pages/admin/PeopleAndAccounts.tsx'), 'utf8');

test('no client-side filtering of the page; the count uses the server rows', () => {
  assert.doesNotMatch(page, /people\.filter\(/);
  assert.match(page, /\{people\.length\}<\/b> of \{total\}/);
});

test('every filter is sent to the API and reloads the list', () => {
  for (const key of ['twoFactor', 'activity', 'classes', 'secretary', 'face', 'courseId', 'classId']) assert.match(page, new RegExp(`${key}: `));
  assert.match(page, /useEffect\(load, \[kind, status, q, page, twoFactor, activity, classes, secretary, face, courseId, classId\]\)/);
});

test('filter selects use the agreed labels and wording', () => {
  for (const label of ['Status', '2FA', 'Activity', 'Classes', 'Role', 'Face enrollment', 'Course', 'Class section']) assert.match(page, new RegExp(`<select aria-label="${label}"`));
  for (const text of ['Any activity', 'Never signed in', 'Inactive 30\\+ days', 'All classes', 'Has classes this school year', 'No classes this school year',
    'All students', 'Class Secretaries', 'Any face status', 'Face enrolled', 'Face not enrolled', 'Invited', 'All courses', 'All class sections']) assert.match(page, new RegExp(`>${text}<`));
  assert.match(page, /kind === 'faculty' && \(\s*<label[\s\S]{0,200}aria-label="Classes"/);
  assert.match(page, /kind === 'student' && \(\s*<>\s*<label[\s\S]{0,200}aria-label="Role"/);
});

test('tab switch and Clear filters reset the tab-specific filters; the URL is read once', () => {
  assert.match(page, /setKind\(value\); setClasses\('all'\); setSecretary\(false\); setFace\('all'\)/);
  assert.match(page, /const clearFilters = \(\) => \{[^}]*setActivity\('all'\); setClasses\('all'\); setSecretary\(false\); setFace\('all'\); setCourseId\(0\); setClassId\(0\); setPage\(1\)/);
  assert.match(page, /useSearchParams\(\)/);
  assert.doesNotMatch(page, /setSearchParams/);
});

test('the info note uses the notice standard', () => {
  assert.match(page, /rounded-xl border border-slate-200 bg-white p-3 text-xs[^"]*"[^>]*>\s*<ShieldCheck/);
});
