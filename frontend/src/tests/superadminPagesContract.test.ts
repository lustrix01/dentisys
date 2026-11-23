import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditQueryString } from '../services/auditService.ts';

// ADM-001 Parts A-C, now owned by the Superadmin (13.9): the pages use the real routes and keep the contract's behaviour.
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
  assert.doesNotMatch(dean.match(/DeanAuditTrail[^\n]*/)?.[0] ?? 'superadmin', /superadmin/); // the Dean page is Activity only
  assert.match(dean, /SuperadminAuditTrail[^\n]* superadmin /);
  assert.match(audit, /Class work \(grades, attendance, retention\) is in '\+\(superadmin \? 'the Class work view\.' : 'Superadmin → Audit Trail\.'\)/);
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
  assert.match(people, /Link to=\{`\/superadmin\/classes\?facultyId=\$\{target\.userId\}`\}/); // D16: each blocking class links to the Superadmin Classes page filtered to that Faculty member
  assert.doesNotMatch(people, /Link to="\/(admin|superadmin)\/classes"/); // never the unfiltered page
  assert.match(people, /Reason \(optional\)/);
  assert.match(people, /Class Secretary, the Secretary sign-in is blocked too/);
});

test('Superadmin Classes (superadmin-classes.md): the page is live; read-only except Change Faculty; no preview data, no Create Class', () => {
  const classes = read('../pages/admin/Classes.tsx');
  for (const call of ['getAdminClassesApi', 'getAdminClassFiltersApi', 'getAdminClassDetailApi', 'changeClassFacultyApi']) assert.ok(classes.includes(`${call}(`), call);
  for (const route of ['/admin/classes?', '/admin/classes/filters', '/admin/classes/detail?csId=', '/admin/classes/change-faculty']) assert.ok(api.includes(route), route);
  assert.doesNotMatch(classes, /Preview data|PREVIEW|Preview roster only|Sample data/i); // no sample data, no notice banner
  assert.doesNotMatch(classes, /Create Class|Add Class|Edit Class|Archive Class|Restore/); // creating, editing, archiving and restoring stay with Faculty
  assert.match(classes, /Change Faculty/);
  assert.match(classes, /UserRoundCog/); // D17: the icon button
  assert.match(classes, /item\.canChangeFaculty &&/); // hidden, not disabled, where the server says no (D17)
  assert.match(classes, /Class Secretary/); // Class Details shows the Secretary row
  assert.match(classes, /useSearchParams/); // D16: ?facultyId= filters the page
  assert.match(classes, /\(deactivated\)/); // D15
  assert.match(classes, /Enter a reason of 8 to 240 characters\./); // 14.6
  assert.match(classes, /Active Classes/);
  assert.match(classes, /Archived Classes/);
  assert.match(classes, /Clear filters/);
});

test('DS22 My Activity: the Dean Audit Trail has the Faculty settings, no list switch, no role filter, no attention cards', () => {
  const dean = read('../pages/admin/AuditTrail.tsx');
  assert.match(dean, /title="My Activity"/);
  assert.doesNotMatch(dean.match(/DeanAuditTrail[\s\S]{0,400}/)?.[0] ?? 'superadmin', /superadmin/);
});

test('DS21 People & Accounts: the Dean row has a Dean badge, the action rules of 4.3 and the Hand Over Dean Role dialog', () => {
  assert.match(people, /isDean/);
  assert.match(people, /Hand over Dean role/);
  assert.match(people, /Hand Over Dean Role/);
  assert.match(people, /Choose what happens to the current Dean\./);
  assert.match(people, /type="radio"/);
  assert.match(people, /'Deactivated'/);
  assert.match(people, /transferDeanApi\(/);
  assert.ok(api.includes('/admin/people/transfer-dean'));
});

test('Section 8: user-visible wording names the Superadmin where the Superadmin now acts', () => {
  assert.doesNotMatch(api, /Contact the Dean/);
  assert.match(read('../components/RoomSelector.tsx'), /was retired\. Pick another room\./);
  assert.doesNotMatch(read('../components/RoomSelector.tsx') + read('../components/AutoSessionsPanel.tsx'), /by the Dean|Ask the Dean/);
  assert.match(read('../components/AutoSessionsPanel.tsx'), /Ask the Superadmin to set it in Rooms\./);
  assert.match(read('../pages/faculty/ClassesAndRosters.tsx'), /Ask the Superadmin to add the term/);
});

test('DS5-DS6 the Dean Dashboard drops the audit widget; the Overview shows Latest Audit Events (10 rows, link to the Superadmin Audit Trail)', () => {
  const dash = read('../pages/admin/Dashboard.tsx');
  assert.doesNotMatch(dash, /Latest Audit Events|recentAuditEvents|academicTermReminder/);
  const overview = read('../pages/admin/SuperadminOverview.tsx');
  assert.match(overview, /Latest Audit Events/);
  assert.match(overview, /\/superadmin\/audit-trail/);
  assert.match(overview, /\/superadmin\/terms/);
  assert.doesNotMatch(overview, /to: '\/admin\/(terms|rooms|course-catalog)'/);
});
