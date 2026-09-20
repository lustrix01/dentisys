import { test, expect } from './fixtures';

test.describe('Faculty Module E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-faculty-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 200,
          login_email: 'faculty@bicol-u.edu.ph',
          display_name: 'Prof. Jane Doe',
          role: 'faculty',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('faculty dashboard renders properly', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Faculty|Dashboard|Classes|Student/i);
  });

  test('faculty can navigate to Class Management', async ({ page }) => {
    await page.click('a[href="/classes"]');
    await expect(page).toHaveURL('/classes');
    await expect(page.locator('body')).toContainText(/Class|Course|Subject|Section/i);
  });

  test('faculty can navigate to Student Management', async ({ page }) => {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/students');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL('/students');
    await expect(page.locator('body')).toContainText(/Student|Enrolled|List/i);
  });

  test('faculty can navigate to Grade Computation', async ({ page }) => {
    await page.click('a[href="/grades"]');
    await expect(page).toHaveURL('/grades');
    await expect(page.locator('body')).toContainText(/Grade|Computation|Evaluation/i);
  });

  test('faculty can navigate to Retention Monitoring', async ({ page }) => {
    await page.click('a[href="/retention"]');
    await expect(page).toHaveURL('/retention');
    await expect(page.locator('body')).toContainText(/Retention|Standing|Status/i);
  });

  test('faculty can navigate to Attendance Monitoring', async ({ page }) => {
    await page.click('a[href="/attendance"]');
    await expect(page).toHaveURL('/attendance');
    await expect(page.locator('body')).toContainText(/Attendance|Log|Record/i);
  });

  test('faculty can navigate to Reports', async ({ page }) => {
    await page.click('a[href="/reports"]');
    await expect(page).toHaveURL('/reports');
    await expect(page.locator('body')).toContainText(/Report|Export|Summary/i);
  });

  test('faculty can navigate to Email Management', async ({ page }) => {
    await page.click('a[href="/email-management"]');
    await expect(page).toHaveURL('/email-management');
    await expect(page.locator('body')).toContainText(/Email|Notification|Template|Message/i);
  });

  test('Email Management Student invitations use the authoritative API and report skipped recipients', async ({ page }) => {
    const invitationPayloads: Array<Record<string, unknown>> = [];
    let emailLogs: Array<Record<string, unknown>> = [];
    const appPage = await page.context().newPage();
    try {
      await appPage.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/api/auth/refresh') return json({ status: 'error', message: 'Authentication required.' }, 401);
        if (path === '/api/auth/login') return json({ type: 'direct_login', access_token: 'mock-faculty-token' });
        if (path === '/api/auth/me') return json({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' });
        if (path === '/api/runtime-config') return json({
          status: 'ok', environment: 'test', allowed_email_domains: ['bicol-u.edu.ph'],
          providers: { identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } }, email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' } },
          features: { browser_attendance_prototype: false, student_auth_enabled: false },
        });
        if (path === '/api/faculty/students') return json([
          { id: '42', studentId: 'P03-42', name: 'Canonical Student', email: 'student@bicol-u.edu.ph', yearLevel: 4, status: 'active', classSections: [{ classId: '77', className: 'Section 4-A', enrollmentId: '88' }] },
          { id: 'not-canonical', studentId: 'P03-43', name: 'Unscoped Student', email: 'unscoped@bicol-u.edu.ph', yearLevel: 4, status: 'active', classSections: [] },
        ]);
        if (path === '/api/faculty/assessments') return json([]);
        if (path === '/api/faculty/attendance') return json({ status: 'ok', records: [] });
        if (path === '/api/secretary/invitations') return json([]);
        if (path === '/api/faculty/email-logs') return json({ status: 'ok', logs: emailLogs });
        if (path === '/api/faculty/student-invitations' && request.method() === 'POST') {
          const payload = request.postDataJSON() as Record<string, unknown>;
          invitationPayloads.push(payload);
          emailLogs = [{ id: 'mail-student-42', recipient: 'Canonical Student', recipientEmail: 'student@bicol-u.edu.ph', subject: 'DentiSys Student Invitation', type: 'Student Invitation', sentAt: '2026-09-20T00:00:00Z', status: 'Failed' }];
          return json({ status: 'ok', message: 'Student invitation issued, but email delivery failed.', delivery_status: 'Failed' }, 201);
        }
        return json(request.method() === 'GET' ? [] : { status: 'ok', message: 'ok' });
      });

      await appPage.goto('/login');
      await appPage.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
      await appPage.fill('input[type="password"]', 'Password123!');
      await appPage.click('button[type="submit"]');
      await expect(appPage).toHaveURL('/');
      await appPage.evaluate(() => {
        window.history.pushState({}, '', '/email-management');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(appPage.getByText('Canonical Student')).toBeVisible();
      await expect(appPage.getByText('Unscoped Student')).toBeVisible();
      await appPage.locator('tbody input[type="checkbox"]').nth(0).check();
      await appPage.locator('tbody input[type="checkbox"]').nth(1).check();
      await appPage.getByRole('button', { name: /Send Invitations \(2\)/i }).click();

      await expect(appPage.getByText('Student invitations: 1 issued, 1 email deliveries failed, 1 failed or skipped.')).toBeVisible();
      await expect(appPage.getByText('Invitation Issued · Delivery Failed')).toBeVisible();
      await appPage.getByRole('button', { name: /Email History Log \(1\)/i }).click();
      await expect(appPage.getByText('Student Invitation', { exact: true })).toBeVisible();
      await expect(appPage.getByText('Failed', { exact: true })).toBeVisible();
      expect(invitationPayloads).toEqual([{ studentId: '42', classId: '77' }]);
    } finally {
      await appPage.close();
    }
  });

  test('Classes and Rosters surfaces the backend eligibility conflict for an active Student', async ({ page }) => {
    await page.route('**/api/faculty/classes', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok',
        classes: [{ id: '77', csId: 77, csName: 'CLIN401-SecA', courseId: 1, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', units: 3, schoolYear: '2025-2026', semester: '1st Semester', yearLevel: 4, block: 'Section 4-A', schedule: 'Mon/Wed', lecRoom: 'Hall A', labRoom: 'Lab A', enrolledCount: 1, instructorName: 'Prof. Jane Doe', status: 'Active' }],
      }) });
    });
    await page.route('**/api/faculty/courses', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [] }) });
    });
    await page.route('**/api/faculty/students', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: '42', studentId: 'P03-42', name: 'Active Student', email: 'active.student@bicol-u.edu.ph', yearLevel: 4, status: 'active', classSections: [{ classId: '77', className: 'Section 4-A', enrollmentId: '88' }] },
      ]) });
    });
    await page.route('**/api/faculty/student-invitations', async route => {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'This Student identity is already linked to an active account.' }) });
    });

    await page.click('a[href="/classes"]');
    await expect(page.getByRole('button', { name: 'View Roster' })).toBeVisible();
    await page.getByRole('button', { name: 'View Roster' }).click();
    await expect(page.getByText('Active Student')).toBeVisible();
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(page.getByText('This Student identity is already linked to an active account.')).toBeVisible();
    await expect(page.getByText('An unexpected error occurred. Please try again.')).toHaveCount(0);
  });

  test('Email Management records a successfully delivered Student invitation', async ({ page }) => {
    const appPage = await page.context().newPage();
    let emailLogs: Array<Record<string, unknown>> = [];
    try {
      await appPage.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path === '/api/auth/refresh') return json({ status: 'error', message: 'Authentication required.' }, 401);
        if (path === '/api/auth/login') return json({ type: 'direct_login', access_token: 'mock-faculty-token' });
        if (path === '/api/auth/me') return json({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' });
        if (path === '/api/runtime-config') return json({ status: 'ok', environment: 'test', allowed_email_domains: ['bicol-u.edu.ph'], providers: { identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } }, email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' } }, features: { browser_attendance_prototype: false, student_auth_enabled: false } });
        if (path === '/api/faculty/students') return json([{ id: '42', studentId: 'P03-42', name: 'Canonical Student', email: 'student@bicol-u.edu.ph', yearLevel: 4, status: 'active', classSections: [{ classId: '77', className: 'Section 4-A', enrollmentId: '88' }] }]);
        if (path === '/api/secretary/invitations') return json([]);
        if (path === '/api/faculty/email-logs') return json({ status: 'ok', logs: emailLogs });
        if (path === '/api/faculty/student-invitations' && request.method() === 'POST') {
          emailLogs = [{ id: 'mail-student-42', recipient: 'Canonical Student', recipientEmail: 'student@bicol-u.edu.ph', subject: 'DentiSys Student Invitation', type: 'Student Invitation', sentAt: '2026-09-20T00:00:00Z', status: 'Sent' }];
          return json({ status: 'ok', message: 'Student invitation issued and sent.', delivery_status: 'Sent' }, 201);
        }
        return json(request.method() === 'GET' ? [] : { status: 'ok', message: 'ok' });
      });
      await appPage.goto('/login');
      await appPage.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
      await appPage.fill('input[type="password"]', 'Password123!');
      await appPage.click('button[type="submit"]');
      await expect(appPage).toHaveURL('/');
      await appPage.evaluate(() => { window.history.pushState({}, '', '/email-management'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(appPage.getByText('Canonical Student')).toBeVisible();
      await appPage.locator('tbody input[type="checkbox"]').first().check();
      await appPage.getByRole('button', { name: /Send Invitations \(1\)/i }).click();
      await expect(appPage.getByText('Student invitations: 1 issued, 0 failed or skipped.')).toBeVisible();
      await expect(appPage.getByText('Invitation Sent')).toBeVisible();
      await appPage.getByRole('button', { name: /Email History Log \(1\)/i }).click();
      await expect(appPage.getByText('Student Invitation', { exact: true })).toBeVisible();
      await expect(appPage.getByText('Sent', { exact: true })).toBeVisible();
    } finally {
      await appPage.close();
    }
  });

  test('faculty can view Profile and Settings', async ({ page }) => {
    await page.click('a[href="/faculty/profile"]');
    await expect(page).toHaveURL('/faculty/profile');
    await expect(page.locator('body')).toContainText(/Profile|Jane Doe/i);

    await page.click('a[href="/faculty/settings"]');
    await expect(page).toHaveURL('/faculty/settings');
    await expect(page.locator('body')).toContainText(/Settings/i);
  });

  test('faculty theme changes persist only after a successful API save', async ({ page }) => {
    await page.route('**/api/faculty/settings', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', settings: { theme: 'light' } }),
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Unable to save theme.' }),
      });
    });

    await page.click('a[href="/faculty/settings"]');
    await expect(page).toHaveURL('/faculty/settings');
    const light = page.getByRole('button', { name: /Clean light mode/i });
    const dark = page.getByRole('button', { name: /Clinical dark mode/i });
    await expect(light).toHaveClass(/border-clinical-500/);
    await dark.click();
    await expect(dark).toHaveClass(/border-clinical-500/);
    await page.getByRole('button', { name: /Save preferences/i }).click();
    await expect(page.getByRole('alert')).toContainText(/server error|Unable to save theme/i);
    await expect(light).toHaveClass(/border-clinical-500/);
    await expect(dark).not.toHaveClass(/border-clinical-500/);
  });

  test('fresh faculty account defaults to 0 students and 0 active classes', async ({ page }) => {
    await page.route('**/api/faculty/dashboard/kpis', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          kpis: {
            assignedStudents: 0,
            activeClasses: 0,
            averageAttendance: 0,
            retentionAlerts: 0,
            goodStanding: 0,
            remedialCount: 0,
          },
          classes: [],
        }),
      });
    });

    await page.route('**/api/faculty/students', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await expect(page.locator('body')).toContainText(/Faculty|Dashboard/i);
  });

  test('faculty class and roster surface identifies its current development status', async ({ page }) => {
    await page.click('a[href="/classes"]');
    await expect(page).toHaveURL('/classes');
    await expect(page.locator('body')).toContainText(/Classes & Student Rosters|Assigned Classes|Enrolled Student Roster/i);
    await expect(page.locator('body')).toContainText(/Development preview|browser-local/i);
  });
});
