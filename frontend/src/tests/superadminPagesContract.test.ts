import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditQueryString } from '../services/auditService.ts';

// ADM-001 Parts A-C: the three Superadmin pages use the real routes and keep the contract's behaviour.
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), 'utf8');
const api = read('../services/apiClient.ts');
const courses = read('../pages/admin/CourseCatalog.tsx');
const people = read('../pages/admin/PeopleAndAccounts.tsx');
const audit = read('../components/AuditTrailPage.tsx');

test('API client has the Course Catalog and People routes', () => {
  for (const route of ['/admin/courses?status=', '/admin/courses/update', '/admin/courses/retire', '/admin/courses/restore',
    '/admin/people?', '/admin/people/deactivate', '/admin/people/reactivate', '/admin/audit-logs?lookup=students']) {
    assert.ok(api.includes(route), route);
  }
});

test('Part A: class-work scope is a query filter, sent only when chosen, and the view stays read-only', () => {
  assert.equal(auditQueryString({ scope: 'class_work', facultyId: '3', classId: '', studentId: '12', page: 1 }), '?scope=class_work&facultyId=3&studentId=12');
  assert.equal(auditQueryString({ q: 'x' }), '?q=x');
  assert.match(audit, /\{ superadmin\?: boolean \}|superadmin\?: boolean/);
  assert.match(audit, /Tabs variant="switch"[\s\S]{0,120}label="Audit views"/);
  assert.match(audit, /scope: 'class_work' as const, facultyId, classId, studentId/);
  assert.match(audit, /This list is read-only\./);
  assert.match(audit, /\{superadmin && \(/); // the switch exists only in Superadmin mode
  const dean = read('../pages/admin/AuditTrail.tsx');
  assert.match(dean, /export const AuditTrail[^\n]*allLogs accent="accent" \/>;/);
  assert.doesNotMatch(dean.split('export const SuperadminAuditTrail')[0], /superadmin/); // the Dean view page is unchanged
  assert.match(dean, /SuperadminAuditTrail[^\n]* superadmin /);
});

test('Part B: Course Catalog edits, retires and restores through the API; no create, no preview data', () => {
  for (const call of ['getAdminCoursesApi', 'updateCourseApi', 'retireCourseApi', 'restoreCourseApi']) assert.match(courses, new RegExp(`${call}\\(`));
  assert.doesNotMatch(courses, /Preview data|INITIAL_COURSES|Add Course/);
  assert.match(courses, /Used by \$\{draft\.classCount\}/); // SA14: the edit dialog shows its reach
  assert.match(courses, /Retiring hides the course from Faculty's course list/);
});

test('Part C: People & Accounts deactivates and reactivates through the API and shows the blocking classes', () => {
  for (const call of ['getAdminPeopleApi', 'deactivatePersonApi', 'reactivatePersonApi']) assert.match(people, new RegExp(`${call}\\(`));
  assert.doesNotMatch(people, /Preview data|PREVIEW_ACCOUNTS|Deans/);
  assert.match(people, /faculty_has_current_classes/);
  assert.match(people, /Reassign or archive them first\./);
  assert.match(people, /Link to="\/admin\/classes"/); // the blocked case lists the classes as links
  assert.match(people, /Reason \(optional\)/);
  assert.match(people, /Class Secretary, the Secretary sign-in is blocked too/);
});
