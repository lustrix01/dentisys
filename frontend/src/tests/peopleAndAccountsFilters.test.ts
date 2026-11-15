import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTENTION_OPTIONS, DEFAULT_PEOPLE_SORT, attentionFromUrl, attentionParams, yearLevelLabel } from '../pages/admin/peopleHelpers.ts';

// People & Accounts filters are applied on the server; the page only sends them.
const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '../pages/admin/PeopleAndAccounts.tsx'), 'utf8');

test('no client-side filtering of the page; the count uses the server rows', () => {
  assert.doesNotMatch(page, /people\.filter\(/);
  assert.match(page, /\{people\.length\}<\/b> of \{total\}/);
});

test('every filter is sent to the API and reloads the list', () => {
  for (const key of ['classes', 'secretary', 'yearLevel', 'courseId', 'classId', 'sort', 'dir']) assert.match(page, new RegExp(`${key}[: ]`));
  assert.match(page, /\.\.\.attentionParams\(attention\)/);
  assert.match(page, /useEffect\(load, \[kind, status, q, page, attention, sort, classes, secretary, yearLevel, courseId, classId\]\)/);
  assert.doesNotMatch(page, /aria-label="(2FA|Activity|Face enrollment)"/);
});

test('filter selects use the agreed labels and wording', () => {
  for (const label of ['Status', 'Year level', 'Course', 'Class section', 'Show', 'Teaching this school year', 'Needs attention']) assert.match(page, new RegExp(`<select aria-label="${label}"`));
  for (const text of ['All statuses', 'Invited', 'All year levels', 'All courses', 'All class sections', 'All students', 'Class Secretaries', 'All Faculty', 'Teaching', 'Not teaching']) assert.match(page, new RegExp(`>${text}<`));
  assert.doesNotMatch(page, /All Statuses|Any activity|Any face/);
  assert.match(page, /kind === 'faculty' && \(\s*<label[\s\S]{0,200}Teaching this school year/);
  assert.match(page, /kind === 'student' && \(\s*<label[\s\S]{0,120}Year level/);
});

test('Status defaults to Active; the URL still wins', () => {
  assert.match(page, /\?\? \(attention === 'expired' \? 'invited' : 'active'\)/);
  assert.match(page, /setStatus\('active'\); setAttention\('all'\); setClasses\('all'\); setSecretary\(false\); setYearLevel\(0\)/);
});

test('Needs attention maps to the existing params and reads the Overview links', () => {
  assert.deepEqual(ATTENTION_OPTIONS.map(o => o.label), ['All accounts', 'Never signed in', 'Inactive 30+ days', '2FA off', 'Invitation expired']);
  assert.deepEqual(attentionParams('all'), {});
  assert.deepEqual(attentionParams('never'), { activity: 'never' });
  assert.deepEqual(attentionParams('inactive30'), { activity: 'inactive30' });
  assert.deepEqual(attentionParams('twoFactorOff'), { twoFactor: 'off' });
  assert.deepEqual(attentionParams('expired'), { invitation: 'expired' });
  const url = (q: string) => attentionFromUrl(key => new URLSearchParams(q).get(key));
  assert.equal(url('kind=faculty&twoFactor=off'), 'twoFactorOff');
  assert.equal(url('activity=inactive30'), 'inactive30');
  assert.equal(url('activity=never'), 'never');
  assert.equal(url('status=invited&invitation=expired'), 'expired');
  assert.equal(url('twoFactor=on'), 'all');
  assert.equal(url(''), 'all');
  assert.equal(yearLevelLabel(1), '1st year');
  assert.equal(yearLevelLabel(3), '3rd year');
  assert.equal(yearLevelLabel(5), '5th year');
});

test('sortable headers send sort and dir to the server and reset to page 1', () => {
  assert.deepEqual(DEFAULT_PEOPLE_SORT, { key: 'name', dir: 'asc' });
  assert.match(page, /sort: sort\.key, dir: sort\.dir/);
  assert.match(page, /const changeSort = \(next[^)]*\) => \{ setSort\(next\); setPage\(1\); \}/);
  for (const [key, first] of [['name', ''], ['studentNo', ''], ['classes', ' first="desc"'], ['lastActivity', ' first="desc"']]) assert.match(page, new RegExp(`sortKey="${key}"${first} sort=\{sort\}`));
  assert.match(page, /aria-sort=\{ariaSort\(sort, 'lastActivity'\)\}/);
  const api = fs.readFileSync(path.join(here, '../services/apiClient.ts'), 'utf8');
  assert.match(api, /for \(const key of \['invitation', 'sort', 'dir'\] as const\)/);
  assert.match(api, /\['courseId', 'classId', 'yearLevel'\]/);
});

test('tab switch and Clear filters reset the tab-specific filters; the URL is read once', () => {
  assert.match(page, /setKind\(value\); setClasses\('all'\); setSecretary\(false\); setYearLevel\(0\)[^}]*setSort\(DEFAULT_PEOPLE_SORT\)/);
  assert.match(page, /const clearFilters = \(\) => \{[^}]*setAttention\('all'\); setClasses\('all'\); setSecretary\(false\); setYearLevel\(0\); setCourseId\(0\); setClassId\(0\); setPage\(1\)/);
  assert.match(page, /useSearchParams\(\)/);
  assert.doesNotMatch(page, /setSearchParams/);
});

test('the info note uses the notice standard', () => {
  assert.match(page, /rounded-xl border border-slate-200 bg-white p-3 text-xs[^"]*"[^>]*>\s*<ShieldCheck/);
});
