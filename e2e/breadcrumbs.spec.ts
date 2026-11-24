import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

type Role = 'faculty' | 'admin' | 'superadmin' | 'secretary' | 'student';

type CrumbExpectation = {
  name?: string;
  href?: string;
};

async function signInRole(page: Page, role: Role) {
  const displayNames: Record<Role, string> = {
    faculty: 'Dr. Roberto Santos',
    admin: 'Dr. Dean Admin',
    superadmin: 'Sam Superadmin',
    secretary: 'Clara Secretary',
    student: 'Juan Student',
  };
  const mePayload: Record<string, unknown> = {
    id: 100,
    user_id: 100,
    login_email: `${role}@bicol-u.edu.ph`,
    display_name: displayNames[role],
    role,
    authentication_source: 'password',
  };
  await page.route('**/api/auth/login', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'direct_login', access_token: `mock-${role}-token` }),
    }),
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mePayload),
    }),
  );
  await page.goto(role === 'superadmin' ? '/superadmin/sign-in' : '/login');
  await page.fill('input[inputmode="email"]', `${role}@bicol-u.edu.ph`);
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(
    role === 'superadmin' ? '/superadmin/overview' : role === 'student' ? '/student/dashboard' : '/',
  );
}

async function assertBreadcrumbs(page: Page, route: string, expected: CrumbExpectation[]) {
  await page.goto(route);
  const nav = page.locator('header nav');
  await expect(nav).toBeVisible();

  const crumbs = await nav.evaluate(el =>
    Array.from(el.children)
      .filter(child => (child.textContent ?? '').trim() !== '/')
      .map(child => ({
        tag: child.tagName,
        text: (child.textContent ?? '').trim(),
        href: child.getAttribute('href'),
        ariaCurrent: child.getAttribute('aria-current'),
        className: child.getAttribute('class') ?? '',
      })),
  );

  expect(crumbs, `crumb count on ${route}`).toHaveLength(expected.length);

  for (let i = 0; i < expected.length - 1; i++) {
    const actual = crumbs[i];
    const exp = expected[i];
    expect(actual.tag, `ancestor crumb ${i} on ${route} must be a link`).toBe('A');
    if (exp.name !== undefined) {
      expect(actual.text, `ancestor crumb ${i} text on ${route}`).toBe(exp.name);
    }
    expect(actual.href, `ancestor crumb ${i} href on ${route}`).toBe(exp.href);
    expect(actual.ariaCurrent, `ancestor crumb ${i} on ${route} must not have aria-current`).toBeNull();
  }

  const last = crumbs[crumbs.length - 1];
  const lastExp = expected[expected.length - 1];
  expect(last.tag, `last crumb on ${route} must be plain text, not a link`).toBe('SPAN');
  expect(last.href, `last crumb on ${route} must not have href`).toBeNull();
  expect(last.ariaCurrent, `last crumb on ${route} must have aria-current="page"`).toBe('page');
  expect(last.className, `last crumb classes on ${route}`).toBe('text-slate-500 dark:text-slate-400 font-semibold');
  if (lastExp.name !== undefined) {
    expect(last.text, `last crumb text on ${route}`).toBe(lastExp.name);
  }
}

test.describe('Item 9.27 breadcrumbs', () => {
  test('Faculty routes render plain-text current crumb with aria-current="page" and Home link to /', async ({ page }) => {
    await signInRole(page, 'faculty');
    const routes: Array<[string, CrumbExpectation[]]> = [
      ['/', [{ name: 'Home' }]],
      ['/dashboard', [{ name: 'Home', href: '/' }, { name: 'Dashboard' }]],
      ['/classes', [{ name: 'Home', href: '/' }, { name: 'My Classes & Rosters' }]],
      ['/students', [{ name: 'Home', href: '/' }, { name: 'My Classes & Rosters' }]],
      ['/faculty/classes', [{ name: 'Home', href: '/' }, { name: 'My Classes & Rosters' }]],
      ['/faculty/classes-rosters', [{ name: 'Home', href: '/' }, { name: 'My Classes & Rosters' }]],
      ['/grades', [{ name: 'Home', href: '/' }, { name: 'Grade Computation' }]],
      ['/retention', [{ name: 'Home', href: '/' }, { name: 'Retention Monitoring' }]],
      ['/attendance', [{ name: 'Home', href: '/' }, { name: 'Attendance Monitoring' }]],
      ['/reports', [{ name: 'Home', href: '/' }, { name: 'Reports & Export' }]],
      ['/email-management', [{ name: 'Home', href: '/' }, { name: 'Email Management' }]],
      ['/faculty/audit-trail', [{ name: 'Home', href: '/' }, { name: 'My Activity' }]],
      ['/faculty/profile', [{ name: 'Home', href: '/' }, { name: 'My Profile' }]],
      ['/faculty/settings', [{ name: 'Home', href: '/' }, { name: 'Faculty Settings' }]],
    ];
    for (const [route, expected] of routes) {
      await assertBreadcrumbs(page, route, expected);
    }
  });

  test('Dean routes render plain-text current crumb with aria-current="page" and Home link to /', async ({ page }) => {
    await signInRole(page, 'admin');
    const routes: Array<[string, CrumbExpectation[]]> = [
      ['/', [{ name: 'Home' }]],
      ['/admin/reports', [{ name: 'Home', href: '/' }, { name: 'Reports & Analytics' }]],
      ['/admin/grade-submissions', [{ name: 'Home', href: '/' }, { name: 'Grade Submissions' }]],
      ['/admin/faculty-invite', [{ name: 'Home', href: '/' }, { name: 'Faculty Invitations' }]],
      ['/admin/audit-trail', [{ name: 'Home', href: '/' }, { name: 'My Activity' }]],
      ['/admin/profile', [{ name: 'Home', href: '/' }, { name: 'Dean Profile' }]],
      ['/admin/settings', [{ name: 'Home', href: '/' }, { name: 'Dean Settings' }]],
    ];
    for (const [route, expected] of routes) {
      await assertBreadcrumbs(page, route, expected);
    }
  });

  test('Superadmin routes render plain-text current crumb with aria-current="page" and Home link to /', async ({ page }) => {
    await signInRole(page, 'superadmin');
    const routes: Array<[string, CrumbExpectation[]]> = [
      ['/superadmin/overview', [{ name: 'Home', href: '/' }, { name: 'Overview' }]],
      ['/superadmin/people', [{ name: 'Home', href: '/' }, { name: 'People & Accounts' }]],
      ['/superadmin/classes', [{ name: 'Home', href: '/' }, {}]],
      ['/superadmin/grade-submissions', [{ name: 'Home', href: '/' }, { name: 'Grade Submissions' }]],
      ['/superadmin/course-catalog', [{ name: 'Home', href: '/' }, {}]],
      ['/superadmin/terms', [{ name: 'Home', href: '/' }, {}]],
      ['/superadmin/rooms', [{ name: 'Home', href: '/' }, {}]],
      ['/superadmin/face-enrolments', [{ name: 'Home', href: '/' }, { name: 'Face Enrolments' }]],
      ['/superadmin/audit-trail', [{ name: 'Home', href: '/' }, { name: 'Audit Trail' }]],
      ['/superadmin/profile', [{ name: 'Home', href: '/' }, { name: 'Superadmin Profile' }]],
      ['/superadmin/settings', [{ name: 'Home', href: '/' }, { name: 'Superadmin Settings' }]],
    ];
    for (const [route, expected] of routes) {
      await assertBreadcrumbs(page, route, expected);
    }
  });

  test('Secretary routes render plain-text current crumb with aria-current="page" and Home link to /', async ({ page }) => {
    await signInRole(page, 'secretary');
    const routes: Array<[string, CrumbExpectation[]]> = [
      ['/', [{ name: 'Home' }]],
      ['/secretary/attendance', [{ name: 'Home', href: '/' }, { name: 'Attendance Monitoring' }]],
      ['/secretary/audit-trail', [{ name: 'Home', href: '/' }, { name: 'My Activity' }]],
      ['/secretary/profile', [{ name: 'Home', href: '/' }, { name: 'My Profile' }]],
      ['/secretary/settings', [{ name: 'Home', href: '/' }, { name: 'Settings' }]],
    ];
    for (const [route, expected] of routes) {
      await assertBreadcrumbs(page, route, expected);
    }
  });

  test('Student routes render plain-text current crumb with aria-current="page" and Home link to /', async ({ page }) => {
    await signInRole(page, 'student');
    const routes: Array<[string, CrumbExpectation[]]> = [
      ['/', [{ name: 'Home' }]],
      ['/student/dashboard', [{ name: 'Home', href: '/' }, { name: 'Student Dashboard' }]],
      ['/student/attendance', [{ name: 'Home', href: '/' }, { name: 'Daily Attendance' }]],
      ['/student/attendance-logs', [{ name: 'Home', href: '/' }, { name: 'Attendance Logs' }]],
      ['/student/face-registration', [{ name: 'Home', href: '/' }, { name: 'Face Registration' }]],
      ['/student/classes', [{ name: 'Home', href: '/' }, { name: 'My Classes & Retention' }]],
      ['/student/retention', [{ name: 'Home', href: '/' }, { name: 'Retention Monitoring' }]],
      ['/student/profile', [{ name: 'Home', href: '/' }, { name: 'My Profile' }]],
    ];
    for (const [route, expected] of routes) {
      await assertBreadcrumbs(page, route, expected);
    }
  });
});
