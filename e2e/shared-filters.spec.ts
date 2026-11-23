import { test, expect, openAccountMenu } from './fixtures';
import type { Page } from '@playwright/test';

// Backlog 14.10: a class chosen in a page's top filter carries to the same user's other pages (one sign-in, one tab).
// Every move uses the sidebar links (client-side routing), so the page never reloads; sessionStorage would also survive
// a reload in the same tab.

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

const classItem = (csId: number, courseCode: string, courseTitle: string) => ({
  id: String(csId),
  csId,
  csName: 'A',
  block: 'A',
  courseId: 100 + csId,
  courseCode,
  courseName: courseTitle,
  courseTitle,
  schoolYear: '2026-2027',
  semester: '1st Semester',
  status: 'Active',
  isArchived: false,
  isHistorical: false,
  isCurrentSchoolYear: true,
  gradesSubmitted: false,
  gradeDeadlineStatus: 'not_submitted',
  gradeChangeStatus: null,
  midtermPublished: false,
  midtermPublishedAt: null,
  midtermAdvisoryDirty: false,
  midtermAtRiskCount: 0,
  enrolledCount: 1,
});
const first = classItem(41, 'CLIN401', 'Clinical Dentistry I');
const second = classItem(42, 'CLIN402', 'Clinical Dentistry II');

const retentionRecord = (enrollmentId: string, studentName: string, cls: typeof first) => ({
  enrollmentId, studentId: enrollmentId, studentNumber: `2026-0${enrollmentId}`, studentName, email: `${enrollmentId}@bicol-u.edu.ph`,
  classId: cls.id, className: `${cls.courseCode}-A`, subjectCode: cls.courseCode, percentage: 70, gwa: 2.8,
  state: 'remedial', remedial: null, schoolYear: '2026-2027', remedialEligible: true,
  remedialProgression: { stage: 'none', attempts: [], passedAttempt: null, legacyUnclassified: false },
});

async function mockFaculty(page: Page) {
  await page.route('**/api/auth/login', route => route.fulfill(json({ type: 'direct_login', access_token: 'mock-faculty-token' })));
  await page.route('**/api/auth/me', route => route.fulfill(json({
    id: 200, user_id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty', session_uuid: 'faculty-shared-filters',
  })));
  await page.route('**/api/faculty/classes', route => route.fulfill(json({ status: 'ok', currentSchoolYear: '2026-2027', classes: [first, second], academicTerms: [] })));
  await page.route('**/api/faculty/retention', route => route.fulfill(json({
    status: 'ok', currentSchoolYear: '2026-2027', retentionThreshold: 2.5,
    retention: [retentionRecord('901', 'First Class Student', first), retentionRecord('902', 'Second Class Student', second)],
  })));
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill('faculty@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/');
}

const gradeClass = (page: Page) => page.getByLabel(/Class: course code, section, and course title/);
const retentionClass = (page: Page) => page.getByLabel('Class: course code, section, and course title');

async function goTo(page: Page, href: string) {
  await page.click(`a[href="${href}"]`);
  await expect(page).toHaveURL(href);
}

test.describe('Shared filters carry across pages (Backlog 14.10)', () => {
  test.beforeEach(async ({ page }) => {
    await mockFaculty(page);
    await signIn(page);
  });

  test('a class chosen in Grade Computation shows on Retention, "All" there does not replace it, sign-out clears it, and Attendance starts on it', async ({ page }) => {
    // Own default first: the first class.
    await goTo(page, '/grades');
    await expect(gradeClass(page)).toHaveValue('41');

    // (a) choose the second class, then open Retention through the sidebar.
    await gradeClass(page).selectOption('42');
    await expect(gradeClass(page)).toHaveValue('42');
    await goTo(page, '/retention');
    await expect(page.getByRole('row').filter({ hasText: 'Second Class Student' })).toBeVisible();
    await expect(retentionClass(page)).toHaveValue('class:42');
    await expect(page.getByRole('row').filter({ hasText: 'First Class Student' })).toHaveCount(0);

    // (b) "All classes" on Retention is Retention's own choice; Grade Computation keeps the specific class.
    await retentionClass(page).selectOption('all');
    await expect(page.getByRole('row').filter({ hasText: 'First Class Student' })).toBeVisible();
    await goTo(page, '/grades');
    await expect(gradeClass(page)).toHaveValue('42');

    // (d) Attendance Monitoring starts on the class chosen in Grade Computation.
    await goTo(page, '/attendance'); // the Class section select is a hidden test-compat control but holds the selected class
    await expect(page.getByLabel('Class section')).toHaveValue('42');
    await expect(page.getByLabel('Assigned course')).toHaveValue('142');
    expect(await page.evaluate(() => localStorage.getItem('faculty_attendance_selected_cs_id'))).toBeNull();

    // (c) sign out and sign in again: Grade Computation is back on its own default.
    await openAccountMenu(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).not.toHaveURL(/\/attendance/);
    expect(await page.evaluate(() => sessionStorage.getItem('dentisys_shared_filters'))).toBeNull();
    await signIn(page);
    await goTo(page, '/grades');
    await expect(gradeClass(page)).toHaveValue('41');
  });
});
