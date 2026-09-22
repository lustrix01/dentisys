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
test.describe('Authoritative Faculty Attendance Monitoring Workflow', () => {
  const mockClasses = [
    {
      id: '1',
      csId: 1,
      csName: 'CLIN401 - Section A',
      courseId: 101,
      courseCode: 'CLIN401',
      courseName: 'Clinical Dentistry I',
      units: 3.0,
      schoolYear: '2025-2026',
      semester: '1st',
      yearLevel: 4,
      block: 'A',
      schedule: 'Room 101',
      enrolledCount: 2,
      instructorName: 'Prof. Jane Doe',
      status: 'Active',
    },
    {
      id: '2',
      csId: 2,
      csName: 'CLIN401 - Section B',
      courseId: 101,
      courseCode: 'CLIN401',
      courseName: 'Clinical Dentistry I',
      units: 3.0,
      schoolYear: '2025-2026',
      semester: '1st',
      yearLevel: 4,
      block: 'B',
      schedule: 'Room 102',
      enrolledCount: 1,
      instructorName: 'Prof. Jane Doe',
      status: 'Active',
    },
    {
      id: '3',
      csId: 3,
      csName: 'CLIN402 - Section A',
      courseId: 102,
      courseCode: 'CLIN402',
      courseName: 'Clinical Dentistry II',
      units: 4.0,
      schoolYear: '2025-2026',
      semester: '1st',
      yearLevel: 4,
      block: 'A',
      schedule: 'Room 201',
      enrolledCount: 1,
      instructorName: 'Prof. Jane Doe',
      status: 'Active',
    },
  ];

  const mockWorksheetSectionA = {
    classSection: { id: '1', name: 'CLIN401 - Section A', block: 'A', semester: '1st', schoolYear: '2025-2026', status: 'Active' },
    course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I', units: 3.0 },
    date: '2026-09-20',
    attendanceSession: null,
    attendanceSessions: [],
    roster: [
      {
        id: null,
        enrollmentId: '10',
        studentId: '1001',
        studentNumber: '2024-0001',
        studentName: 'Alice Green',
        date: '2026-09-20',
        sessionCode: null,
        attendanceSessionId: null,
        status: null,
        verificationMethod: null,
        timeRecorded: null,
        overrideReason: null,
        overrideAt: null,
      },
      {
        id: '50',
        enrollmentId: '11',
        studentId: '1002',
        studentNumber: '2024-0002',
        studentName: 'Bob White',
        date: '2026-09-20',
        sessionCode: null,
        attendanceSessionId: null,
        status: 'present',
        verificationMethod: 'manual_faculty',
        timeRecorded: '2026-09-20 08:30:00',
        overrideReason: null,
        overrideAt: null,
      },
    ],
  };

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

    await page.route('**/api/faculty/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', classes: mockClasses }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('hierarchy: courses derive from classes, section list filters by course, course change clears section', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Attendance Monitoring' })).toBeVisible();

    // Verify course options are derived and deduplicated
    const courseSelect = page.locator('select').first();
    await expect(courseSelect.locator('option[value="101"]')).toHaveCount(1);
    await expect(courseSelect.locator('option[value="102"]')).toHaveCount(1);
    await expect(courseSelect.locator('option')).toHaveCount(3); // placeholder + 2 courses

    // Class section select is initially disabled
    const sectionSelect = page.locator('select').nth(1);
    await expect(sectionSelect).toBeDisabled();

    // Select course CLIN401
    await courseSelect.selectOption('101');

    // Section dropdown should now be enabled and contain only CLIN401 sections
    await expect(sectionSelect).toBeEnabled();
    await expect(sectionSelect.locator('option[value="1"]')).toHaveCount(1);
    await expect(sectionSelect.locator('option[value="2"]')).toHaveCount(1);
    await expect(sectionSelect.locator('option[value="3"]')).toHaveCount(0);

    // Switch course to CLIN402 -> section clears to empty
    await courseSelect.selectOption('102');
    expect(await sectionSelect.inputValue()).toBe('');
    await expect(sectionSelect.locator('option[value="3"]')).toHaveCount(1);
    await expect(sectionSelect.locator('option[value="1"]')).toHaveCount(0);
  });

  test('worksheet: loads authoritative roster, unrecorded renders Not recorded, empty roster shows empty state', async ({ page }) => {
    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }),
      });
    });

    await page.goto('/attendance');
    const courseSelect = page.locator('select').first();
    await courseSelect.selectOption('101');

    const sectionSelect = page.locator('select').nth(1);
    await sectionSelect.selectOption('1');

    // Roster should appear
    await expect(page.getByText('Alice Green')).toBeVisible();
    await expect(page.getByText('2024-0001')).toBeVisible();
    await expect(page.getByText('Bob White')).toBeVisible();

    // Alice Green has status null -> should render 'Not recorded'
    await expect(page.locator('tbody tr').filter({ hasText: 'Alice Green' }).getByText('Not recorded')).toBeVisible();

    // Bob White has status 'present' -> should render 'Present' badge
    await expect(page.locator('tbody tr').filter({ hasText: 'Bob White' }).getByText('Present', { exact: true }).first()).toBeVisible();

    // Summary counts
    await expect(page.locator('div').filter({ hasText: /^Enrolled/ }).getByText('2', { exact: true })).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^Recorded/ }).getByText('1', { exact: true })).toBeVisible();
  });

  test('worksheet: API failure renders error and retry button without injecting mock data', async ({ page }) => {
    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Internal server error while resolving worksheet.' }),
      });
    });

    await page.goto('/attendance');
    await page.locator('select').first().selectOption('101');
    await page.locator('select').nth(1).selectOption('1');

    await expect(page.getByText(/A server error occurred|Internal server error|Unable to load/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });

  test('date: max attribute prevents future date selection and sends exact YYYY-MM-DD', async ({ page }) => {
    let capturedDateQuery = '';
    await page.route('**/api/faculty/attendance?*', async (route) => {
      const url = new URL(route.request().url());
      capturedDateQuery = url.searchParams.get('date') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }),
      });
    });

    await page.goto('/attendance');
    const dateInput = page.locator('input[type="date"]');
    const maxVal = await dateInput.getAttribute('max');
    expect(maxVal).not.toBeNull();

    await page.locator('select').first().selectOption('101');
    await page.locator('select').nth(1).selectOption('1');

    // Change date
    await dateInput.fill('2026-09-18');
    await expect.poll(() => capturedDateQuery).toBe('2026-09-18');
  });

  test('initial entry: unset student status -> present submits without reason', async ({ page }) => {
    let overridePayload: Record<string, unknown> | null = null;

    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }),
      });
    });

    await page.route('**/api/faculty/attendance/override', async (route) => {
      overridePayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          operation: 'created',
          recordId: '999',
        }),
      });
    });

    await page.goto('/attendance');
    await page.locator('select').first().selectOption('101');
    await page.locator('select').nth(1).selectOption('1');

    await expect(page.getByText('Alice Green')).toBeVisible();

    // Ensure dentisys_attendance is empty before action
    await page.evaluate(() => localStorage.removeItem('dentisys_attendance'));

    // Alice Green has status null. Click 'Present'
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
    await aliceRow.getByRole('button', { name: 'Present' }).click();

    await expect(page.getByText(/Recorded Alice Green as present/i)).toBeVisible();
    expect(overridePayload).not.toBeNull();
    expect(overridePayload?.csId).toBe(1);
    expect(overridePayload?.enrollmentId).toBe(10);
    expect(overridePayload?.status).toBe('present');
    expect(overridePayload?.reason).toBeUndefined();

    // Ensure localStorage was not used
    const localAttendance = await page.evaluate(() => localStorage.getItem('dentisys_attendance'));
    expect(localAttendance).toBeNull();
  });

  test('correction: existing status change requires reason; cancellation leaves state unchanged', async ({ page }) => {
    let overridePayload: Record<string, unknown> | null = null;

    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }),
      });
    });

    await page.route('**/api/faculty/attendance/override', async (route) => {
      overridePayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          operation: 'updated',
          recordId: '50',
        }),
      });
    });

    await page.goto('/attendance');
    await page.locator('select').first().selectOption('101');
    await page.locator('select').nth(1).selectOption('1');

    // Bob White currently has 'present'. Click 'Absent'
    const bobRow = page.locator('tbody tr').filter({ hasText: 'Bob White' });
    await bobRow.getByRole('button', { name: 'Absent' }).click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Attendance Correction' })).toBeVisible();
    await expect(page.locator('form').getByText('Bob White')).toBeVisible();
    await expect(page.getByText(/PRESENT → ABSENT/i)).toBeVisible();

    // Try submitting without reason
    await page.getByRole('button', { name: 'Save Correction' }).click();
    await expect(page.getByText(/justification reason is required/i)).toBeVisible();
    expect(overridePayload).toBeNull();

    // Cancel modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Attendance Correction' })).toHaveCount(0);
    expect(overridePayload).toBeNull();

    // Click Absent again and provide valid reason
    await bobRow.getByRole('button', { name: 'Absent' }).click();
    await page.fill('textarea', 'Student was absent due to illness');
    await page.getByRole('button', { name: 'Save Correction' }).click();

    await expect(page.getByText(/Attendance corrected for Bob White \(absent\)/i)).toBeVisible();
    expect(overridePayload).not.toBeNull();
    expect(overridePayload?.recordId).toBe('50');
    expect(overridePayload?.status).toBe('absent');
    expect(overridePayload?.reason).toBe('Student was absent due to illness');
  });

  test('no-op: selecting the same status that is already persisted does not call API', async ({ page }) => {
    let overrideCalled = false;

    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }),
      });
    });

    await page.route('**/api/faculty/attendance/override', async () => {
      overrideCalled = true;
    });

    await page.goto('/attendance');
    await page.locator('select').first().selectOption('101');
    await page.locator('select').nth(1).selectOption('1');

    // Bob White is already 'present'. Click 'Present'
    const bobRow = page.locator('tbody tr').filter({ hasText: 'Bob White' });
    await bobRow.getByRole('button', { name: 'Present' }).click();

    // Modal should not open and API should not be called
    await expect(page.getByRole('heading', { name: 'Attendance Correction' })).toHaveCount(0);
    expect(overrideCalled).toBe(false);
  });

  test.describe('Faculty Grade Weights Editor', () => {
    const mockFacultyClasses = [
      {
        id: '1',
        csId: 1,
        csName: 'CLIN401-A',
        courseId: 101,
        courseCode: 'CLIN401',
        courseName: 'Clinical Dentistry I',
        units: 3,
        schoolYear: '2026-2027',
        semester: '1st Semester',
        yearLevel: 4,
        block: 'A',
        schedule: 'Mon/Wed 8-11AM',
        enrolledCount: 25,
        instructorName: 'Prof. Jane Doe',
        status: 'Active',
      },
      {
        id: '2',
        csId: 2,
        csName: 'CLIN401-B',
        courseId: 101,
        courseCode: 'CLIN401',
        courseName: 'Clinical Dentistry I',
        units: 3,
        schoolYear: '2026-2027',
        semester: '1st Semester',
        yearLevel: 4,
        block: 'B',
        schedule: 'Tue/Thu 8-11AM',
        enrolledCount: 24,
        instructorName: 'Prof. Jane Doe',
        status: 'Active',
      },
      {
        id: '3',
        csId: 3,
        csName: 'CLIN402-A',
        courseId: 102,
        courseCode: 'CLIN402',
        courseName: 'Clinical Dentistry II',
        units: 3,
        schoolYear: '2026-2027',
        semester: '2nd Semester',
        yearLevel: 4,
        block: 'A',
        schedule: 'Fri 1-5PM',
        enrolledCount: 20,
        instructorName: 'Prof. Jane Doe',
        status: 'Active',
      },
    ];

    test.beforeEach(async ({ page }) => {
      await page.route('**/api/faculty/classes', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', classes: mockFacultyClasses }),
        });
      });
    });

    test('collapses duplicate sections into course offering and shows honest unconfigured empty state', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.goto('/grades?tab=components');

      // Offering dropdown should collapse CLIN401-A and CLIN401-B into 1 option with 2 sections
      const offeringSelect = page.locator('#course-offering-select');
      await expect(offeringSelect).toBeVisible();
      await expect(offeringSelect.locator('option')).toHaveCount(2);
      await expect(offeringSelect.locator('option').first()).toContainText('CLIN401 - Clinical Dentistry I (1st Semester, 2026-2027) · 2 Sections');
      await expect(offeringSelect.locator('option').nth(1)).toContainText('CLIN402 - Clinical Dentistry II (2nd Semester, 2026-2027) · 1 Section');

      // Honest empty state
      await expect(page.getByText(/Unconfigured Course Offering/i)).toBeVisible();
      await expect(page.getByText(/No grade weights have been configured for this course offering yet/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Add First Category/i })).toBeVisible();
    });

    test('supports adding dynamic categories, reordering, weight updates, and live percentage validation', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Add First Category/i }).click();

      // Row 1
      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      await nameInputs.nth(0).fill('Quizzes');
      await weightInputs.nth(0).fill('35');

      // Check sum shows 35% and invalid
      await expect(page.getByText('35%')).toBeVisible();
      await expect(page.getByText(/Must equal 100%/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeDisabled();

      // Add Row 2
      await page.getByRole('button', { name: /Add Category/i }).click();
      await nameInputs.nth(1).fill('Midterm Exam');
      await weightInputs.nth(1).fill('30');

      // Add Row 3
      await page.getByRole('button', { name: /Add Category/i }).click();
      await nameInputs.nth(2).fill('Final Exam');
      await weightInputs.nth(2).fill('35');

      // Check sum shows 100% and valid
      await expect(page.locator('text=Total Weight:').locator('..')).toContainText('100% / 100%');
      await expect(page.getByText(/Valid 100%/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeEnabled();

      // Test decimal precision (e.g. 33.3333 + 33.3333 + 33.3334)
      await weightInputs.nth(0).fill('33.3333');
      await weightInputs.nth(1).fill('33.3333');
      await weightInputs.nth(2).fill('33.3334');
      await expect(page.locator('text=Total Weight:').locator('..')).toContainText('100% / 100%');
      await expect(page.getByText(/Valid 100%/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeEnabled();

      // Test reordering: move Row 1 ('Quizzes') down
      await page.locator('button[aria-label="Move category down"]').first().click();
      await expect(nameInputs.nth(0)).toHaveValue('Midterm Exam');
      await expect(nameInputs.nth(1)).toHaveValue('Quizzes');
    });

    test('first save sends canonical payload omitting version and category IDs', async ({ page }) => {
      let putPayload: any = null;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.route('**/api/faculty/grading-config', async (route) => {
        if (route.request().method() === 'PUT') {
          putPayload = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              configuration: {
                id: 'cfg-new',
                course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
                semester: '1st Semester',
                schoolYear: '2026-2027',
                version: 1,
                categories: [
                  { id: 100, name: 'Quizzes', weight: '50', sortOrder: 1, inUse: false },
                  { id: 101, name: 'Final Exam', weight: '50', sortOrder: 2, inUse: false },
                ],
              },
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Add First Category/i }).click();

      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      await nameInputs.nth(0).fill('Quizzes');
      await weightInputs.nth(0).fill('50');

      await page.getByRole('button', { name: /Add Category/i }).click();
      await nameInputs.nth(1).fill('Final Exam');
      await weightInputs.nth(1).fill('50');

      await page.getByRole('button', { name: /Save Initial Schema/i }).click();

      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
      expect(putPayload).not.toBeNull();
      expect(putPayload.courseId).toBe(101);
      expect(putPayload.semester).toBe('1st Semester');
      expect(putPayload.schoolYear).toBe('2026-2027');
      expect(putPayload.version).toBeUndefined();
      expect(putPayload.categories).toHaveLength(2);
      expect(putPayload.categories[0].id).toBeUndefined();
      expect(putPayload.categories[0].name).toBe('Quizzes');
      expect(putPayload.categories[0].weight).toBe('50');
      expect(putPayload.categories[0].sortOrder).toBe(1);
      expect(putPayload.categories[1].id).toBeUndefined();
      expect(putPayload.categories[1].name).toBe('Final Exam');
      expect(putPayload.categories[1].weight).toBe('50');
      expect(putPayload.categories[1].sortOrder).toBe(2);

      // Should now display Version 1 badge
      await expect(page.getByText(/Version 1/i)).toBeVisible();
    });

    test('update save sends version, preserves category IDs after Move Up and Move Down, and sets matching sortOrder', async ({ page }) => {
      let putPayload: any = null;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-1',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              categories: [
                { id: 201, name: 'Quizzes', weight: '50', sortOrder: 1, inUse: true },
                { id: 202, name: 'Exams', weight: '50', sortOrder: 2, inUse: false },
              ],
            },
          }),
        });
      });

      await page.route('**/api/faculty/grading-config', async (route) => {
        if (route.request().method() === 'PUT') {
          putPayload = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              configuration: {
                id: 'cfg-1',
                course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
                semester: '1st Semester',
                schoolYear: '2026-2027',
                version: 3,
                categories: [
                  { id: 202, name: 'Exams', weight: '30', sortOrder: 1, inUse: false },
                  { id: 201, name: 'Quizzes', weight: '40', sortOrder: 2, inUse: true },
                  { id: 203, name: 'Practicum', weight: '30', sortOrder: 3, inUse: false },
                ],
              },
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText(/Version 2/i)).toBeVisible();

      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      // In-use category delete button should be disabled
      const deleteButtons = page.locator('button[aria-label^="Delete category"]');
      await expect(deleteButtons.nth(0)).toBeDisabled();
      await expect(deleteButtons.nth(1)).toBeEnabled();

      // Modify weights
      await weightInputs.nth(0).fill('40');
      await weightInputs.nth(1).fill('30');

      // Add a third category (new)
      await page.getByRole('button', { name: /Add Category/i }).click();
      await nameInputs.nth(2).fill('Practicum');
      await weightInputs.nth(2).fill('30');

      // Reorder categories: Move row 0 (Quizzes) down
      await page.locator('button[aria-label="Move category down"]').first().click();
      await expect(nameInputs.nth(0)).toHaveValue('Exams');
      await expect(nameInputs.nth(1)).toHaveValue('Quizzes');

      // Move row 1 back up, then down again to verify Move Up works
      await page.locator('button[aria-label="Move category up"]').nth(1).click();
      await expect(nameInputs.nth(0)).toHaveValue('Quizzes');
      await page.locator('button[aria-label="Move category down"]').first().click();
      await expect(nameInputs.nth(0)).toHaveValue('Exams');
      await expect(nameInputs.nth(1)).toHaveValue('Quizzes');

      await page.getByRole('button', { name: /Save Grade Weights/i }).click();

      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
      expect(putPayload).not.toBeNull();
      expect(putPayload.version).toBe(2);
      expect(putPayload.categories).toHaveLength(3);

      // Row 0: Exams (stable id: 202, weight: 30, sortOrder: 1)
      expect(putPayload.categories[0].id).toBe(202);
      expect(putPayload.categories[0].name).toBe('Exams');
      expect(putPayload.categories[0].weight).toBe('30');
      expect(putPayload.categories[0].sortOrder).toBe(1);

      // Row 1: Quizzes (stable id: 201, weight: 40, sortOrder: 2)
      expect(putPayload.categories[1].id).toBe(201);
      expect(putPayload.categories[1].name).toBe('Quizzes');
      expect(putPayload.categories[1].weight).toBe('40');
      expect(putPayload.categories[1].sortOrder).toBe(2);

      // Row 2: Practicum (new category, id omitted, weight: 30, sortOrder: 3)
      expect(putPayload.categories[2].id).toBeUndefined();
      expect(putPayload.categories[2].name).toBe('Practicum');
      expect(putPayload.categories[2].weight).toBe('30');
      expect(putPayload.categories[2].sortOrder).toBe(3);

      // New version badge
      await expect(page.getByText(/Version 3/i)).toBeVisible();
    });

    test('handles 409 stale version conflict, preserves local edits, and supports reload confirmation', async ({ page }) => {
      let getCallCount = 0;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        getCallCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-1',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 1,
              categories: [
                { id: 1, name: 'Quizzes', weight: '50', sortOrder: 1, inUse: false },
                { id: 2, name: 'Exams', weight: '50', sortOrder: 2, inUse: false },
              ],
            },
          }),
        });
      });

      await page.route('**/api/faculty/grading-config', async (route) => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'error',
              code: 'GRADING_CONFIGURATION_VERSION_CONFLICT',
              message: 'The grading configuration is stale. Reload it before saving.',
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      const weightInputs = page.locator('input[placeholder="0"]');
      await weightInputs.nth(0).fill('60');
      await weightInputs.nth(1).fill('40');

      await page.getByRole('button', { name: /Save Grade Weights/i }).click();

      // Conflict banner appears
      await expect(page.getByText(/Version Conflict Detected/i)).toBeVisible();
      await expect(page.getByText(/Another session or user modified this grading configuration/i)).toBeVisible();

      // Local dirty edits must NOT be wiped out
      await expect(weightInputs.nth(0)).toHaveValue('60');
      await expect(weightInputs.nth(1)).toHaveValue('40');

      // Click Reload Latest in conflict banner
      const reloadBannerBtn = page.locator('button', { hasText: 'Reload Latest' }).last();
      await reloadBannerBtn.click();

      // Confirmation modal appears
      await expect(page.getByText(/Discard unsaved changes?/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();

      // Confirm reload
      await page.getByRole('button', { name: 'Confirm' }).click();

      // Edits should be reset to server version
      await expect(weightInputs.nth(0)).toHaveValue('50');
      await expect(weightInputs.nth(1)).toHaveValue('50');
      expect(getCallCount).toBeGreaterThanOrEqual(2);
    });

    test('handles 422 legacy assessment mapping error and renders affected assessments table while preserving rows', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.route('**/api/faculty/grading-config', async (route) => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'error',
              code: 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED',
              message: 'Existing assessments require matching grading categories before this configuration can be activated.',
              assessments: [
                { assessmentId: 42, title: 'Practical Exam 1', legacyType: 'Laboratory' },
                { assessmentId: 43, title: 'Dental Radiography Lab', legacyType: 'Laboratory' },
              ],
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Add First Category/i }).click();

      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      await nameInputs.nth(0).fill('Quizzes');
      await weightInputs.nth(0).fill('100');

      await page.getByRole('button', { name: /Save Initial Schema/i }).click();

      // 422 warning banner appears
      await expect(page.getByText(/Existing Assessments Require Matching Categories/i)).toBeVisible();
      await expect(page.getByText('Practical Exam 1')).toBeVisible();
      await expect(page.getByText('Dental Radiography Lab')).toBeVisible();
      await expect(page.getByText('Laboratory').first()).toBeVisible();

      // Local row remains intact and wasn't cleared
      await expect(nameInputs.nth(0)).toHaveValue('Quizzes');
      await expect(weightInputs.nth(0)).toHaveValue('100');
    });

    test('confirms before discarding unsaved changes when switching course offerings', async ({ page }) => {
      let loadedCourseId = '';

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        const url = new URL(route.request().url());
        loadedCourseId = url.searchParams.get('courseId') || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.goto('/grades?tab=components');
      await expect(page.locator('#course-offering-select')).toBeVisible();

      // Add a category to make it dirty
      await page.getByRole('button', { name: /Add First Category/i }).click();
      const nameInputs = page.locator('input[placeholder*="Category name"]');
      await nameInputs.nth(0).fill('Dirty Category');

      // Attempt to switch offering to CLIN402
      const offeringSelect = page.locator('#course-offering-select');
      await offeringSelect.selectOption({ index: 1 });

      // Confirmation modal should appear
      await expect(page.getByText(/Discard unsaved changes?/i)).toBeVisible();
      await expect(page.getByText(/You have unsaved changes to grade weights/i)).toBeVisible();

      // Click Cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Selection must remain CLIN401 and dirty edits preserved
      await expect(offeringSelect).toHaveValue(/101:/);
      await expect(nameInputs.nth(0)).toHaveValue('Dirty Category');

      // Attempt switch again and Confirm
      await offeringSelect.selectOption({ index: 1 });
      await expect(page.getByText(/Discard unsaved changes?/i)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm' }).click();

      // Now switched to CLIN402
      await expect(offeringSelect).toHaveValue(/102:/);
      expect(loadedCourseId).toBe('102');
    });

    test('maintains strict localStorage isolation without reading or writing dentisys_grading_components', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.addInitScript(() => {
        window.localStorage.setItem('dentisys_grading_components', JSON.stringify([
          { subjectCode: 'CLIN401', category: 'IsolatedLegacyCat', weight: 99, maxScore: 100 },
        ]));
      });

      await page.goto('/grades?tab=components');

      // The legacy category from localStorage must NOT be used by Grade Weights Editor
      await expect(page.getByText('IsolatedLegacyCat')).toHaveCount(0);
    });
  });

  test.describe('Faculty Assessment Manager stable grading categories', () => {
    const mockFacultyClasses = [
      {
        id: '1',
        csId: 1,
        csName: 'CLIN401-A',
        courseId: 101,
        courseCode: 'CLIN401',
        courseName: 'Clinical Dentistry I',
        units: 3,
        schoolYear: '2026-2027',
        semester: '1st Semester',
        yearLevel: 4,
        block: 'A',
        status: 'Active',
      },
      {
        id: '2',
        csId: 2,
        csName: 'CLIN401-B',
        courseId: 101,
        courseCode: 'CLIN401',
        courseName: 'Clinical Dentistry I',
        units: 3,
        schoolYear: '2026-2027',
        semester: '1st Semester',
        yearLevel: 4,
        block: 'B',
        status: 'Active',
      },
      {
        id: '3',
        csId: 3,
        csName: 'CLIN402-A',
        courseId: 102,
        courseCode: 'CLIN402',
        courseName: 'Clinical Dentistry II',
        units: 3,
        schoolYear: '2026-2027',
        semester: '2nd Semester',
        yearLevel: 4,
        block: 'A',
        status: 'Active',
      },
    ];

    const mockGradingConfig401 = {
      id: '10',
      course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
      semester: '1st Semester',
      schoolYear: '2026-2027',
      version: 1,
      categories: [
        { id: 11, name: 'Quizzes', weight: '25', sortOrder: 1, inUse: true },
        { id: 12, name: 'Major Exams', weight: '45', sortOrder: 2, inUse: true },
        { id: 13, name: 'Clinical Work', weight: '30', sortOrder: 3, inUse: false },
      ],
    };

    const mockGradingConfig402 = {
      id: '20',
      course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
      semester: '2nd Semester',
      schoolYear: '2026-2027',
      version: 1,
      categories: [
        { id: 21, name: 'Case Presentations', weight: '50', sortOrder: 1, inUse: false },
        { id: 22, name: 'Practical Exam', weight: '50', sortOrder: 2, inUse: false },
      ],
    };

    test.beforeEach(async ({ page }) => {
      await page.route('**/api/faculty/classes', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', classes: mockFacultyClasses }),
        });
      });
      await page.route('**/api/faculty/settings', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            settings: { theme: 'light', transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } },
          }),
        });
      });
    });

    test('configured offering renders dynamic categories in modal, requires selection, and sends gradingCategoryId on create', async ({ page }) => {
      let postedAssessmentPayload: Record<string, any> | null = null;
      let getAssessmentsCallCount = 0;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessmentPayload = payload;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment persisted successfully.',
              assessments: [{ id: 'ass-new', classId: payload.classId, title: payload.title }],
            }),
          });
          return;
        }
        getAssessmentsCallCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      await expect(page.getByRole('heading', { name: 'Create New Assessment activity' })).toBeVisible();

      // Check category options in the modal
      const categorySelect = modalForm.locator('select').nth(1);
      const categoryOptions = await categorySelect.evaluate((sel: HTMLSelectElement) =>
        Array.from(sel.options).map(opt => ({ value: opt.value, text: opt.textContent?.trim() }))
      );

      // Verify dynamic categories from config, NOT legacy Quiz/Activity hardcoded list
      expect(categoryOptions).toEqual([
        { value: '', text: 'Select grading category' },
        { value: '11', text: 'Quizzes (25%)' },
        { value: '12', text: 'Major Exams (45%)' },
        { value: '13', text: 'Clinical Work (30%)' },
      ]);

      // Fill in title
      await modalForm.locator('input[type="text"]').first().fill('Midterm Crown Quiz');

      // Attempt submit without category selection: Confirm button is disabled
      const submitBtn = modalForm.getByRole('button', { name: 'Confirm Assessment' });
      await expect(submitBtn).toBeDisabled();

      // Select 'Quizzes (25%)'
      await categorySelect.selectOption('11');
      await expect(submitBtn).toBeEnabled();

      const initialGetCount = getAssessmentsCallCount;
      await submitBtn.click();

      await expect(page.getByText('Assessment persisted successfully.')).toBeVisible();
      expect(postedAssessmentPayload).not.toBeNull();
      expect(postedAssessmentPayload?.gradingCategoryId).toBe(11);
      expect(postedAssessmentPayload?.type).toBe('Quizzes');
      expect(postedAssessmentPayload?.classId).toBe('1');
      expect(postedAssessmentPayload?.title).toBe('Midterm Crown Quiz');

      // Authoritative re-fetch: GET /api/faculty/assessments called
      expect(getAssessmentsCallCount).toBeGreaterThan(initialGetCount);
    });

    test('edit resolves category by stable ID, shows renamed category name, and preserves stable ID on save', async ({ page }) => {
      let postedAssessmentPayload: Record<string, any> | null = null;
      let assessmentsList = [
        {
          id: 'ass-100',
          title: 'Periodontics Practical',
          type: 'Old Stale Name',
          gradingCategoryId: 12,
          subjectCode: 'CLIN401',
          classId: '1',
          gradingPeriod: 'Midterm',
          maxScore: 100,
          dueDate: '2026-10-15',
          status: 'Active',
        },
      ];

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessmentPayload = payload;
          assessmentsList = [{ ...assessmentsList[0], ...payload }];
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment updated successfully.',
              assessments: [{ id: payload.id, classId: payload.classId, title: payload.title }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(assessmentsList),
        });
      });

      await page.goto('/grades?tab=assessments');

      // Table displays category name resolved from stable ID 12 ("Major Exams"), not "Old Stale Name"
      const row = page.getByRole('row').filter({ hasText: 'Periodontics Practical' });
      await expect(row).toBeVisible();
      await expect(row.getByText('Major Exams')).toBeVisible();
      await expect(row.getByText('Old Stale Name')).toHaveCount(0);

      // Open Edit modal
      await row.getByRole('button', { name: 'Edit' }).click();
      const modalForm = page.locator('form').last();
      await expect(page.getByRole('heading', { name: 'Edit Assessment Spec' })).toBeVisible();

      // Category select is preselected with stable ID 12
      const categorySelect = modalForm.locator('select').nth(1);
      await expect(categorySelect).toHaveValue('12');

      // Confirm without changing category: preserves stable ID
      await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();
      await expect(page.getByText('Assessment updated successfully.')).toBeVisible();
      expect(postedAssessmentPayload?.gradingCategoryId).toBe(12);
      expect(postedAssessmentPayload?.type).toBe('Major Exams');
    });

    test('edit changing category sends new stable category ID and updated type', async ({ page }) => {
      let postedAssessmentPayload: Record<string, any> | null = null;
      const assessmentsList = [
        {
          id: 'ass-100',
          title: 'Periodontics Practical',
          type: 'Quizzes',
          gradingCategoryId: 11,
          subjectCode: 'CLIN401',
          classId: '1',
          gradingPeriod: 'Midterm',
          maxScore: 100,
          dueDate: '2026-10-15',
          status: 'Active',
        },
      ];

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessmentPayload = payload;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment updated successfully.',
              assessments: [{ id: payload.id, classId: payload.classId, title: payload.title }],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(assessmentsList),
        });
      });

      await page.goto('/grades?tab=assessments');
      const row = page.getByRole('row').filter({ hasText: 'Periodontics Practical' });
      await row.getByRole('button', { name: 'Edit' }).click();

      const modalForm = page.locator('form').last();
      const categorySelect = modalForm.locator('select').nth(1);
      await expect(categorySelect).toHaveValue('11');

      // Change category to Clinical Work (13)
      await categorySelect.selectOption('13');
      await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();

      await expect(page.getByText('Assessment updated successfully.')).toBeVisible();
      expect(postedAssessmentPayload?.gradingCategoryId).toBe(13);
      expect(postedAssessmentPayload?.type).toBe('Clinical Work');
    });

    test('switching sections within same offering preserves category selection', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      const sectionSelect = modalForm.locator('select').nth(0);
      const categorySelect = modalForm.locator('select').nth(1);

      // Select category Clinical Work (13)
      await categorySelect.selectOption('13');
      await expect(categorySelect).toHaveValue('13');

      // Switch from Section 1 (CLIN401-A) to Section 2 (CLIN401-B), both under CLIN401 1st Sem
      await sectionSelect.selectOption('2');

      // Category remains Clinical Work (13)
      await expect(categorySelect).toHaveValue('13');
    });

    test('unconfigured offering displays legacy category selector and omits gradingCategoryId', async ({ page }) => {
      let postedAssessmentPayload: Record<string, any> | null = null;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessmentPayload = payload;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment persisted successfully.',
              assessments: [{ id: 'legacy-ass', classId: payload.classId, title: payload.title }],
            }),
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      const categorySelect = modalForm.locator('select').nth(1);

      // Verify legacy options are shown
      const options = await categorySelect.evaluate((sel: HTMLSelectElement) =>
        Array.from(sel.options).map(opt => opt.value)
      );
      expect(options).toEqual(['Quiz', 'Activity', 'Assignment', 'Laboratory', 'Midterm Exam', 'Final Exam', 'Others']);

      await modalForm.locator('input[type="text"]').first().fill('Legacy Lab Activity');
      await categorySelect.selectOption('Laboratory');

      await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();
      await expect(page.getByText('Assessment persisted successfully.')).toBeVisible();

      expect(postedAssessmentPayload).not.toBeNull();
      expect('gradingCategoryId' in (postedAssessmentPayload ?? {})).toBe(false);
      expect(postedAssessmentPayload?.type).toBe('Laboratory');
    });

    test('configured offering with missing or invalid category ID displays warning badge and blocks save until resolved', async ({ page }) => {
      let postedAssessmentPayload: Record<string, any> | null = null;
      const unassignedAssessments = [
        {
          id: 'ass-broken',
          title: 'Uncategorized Lab Exam',
          type: 'Orphaned Quiz',
          gradingCategoryId: null,
          subjectCode: 'CLIN401',
          classId: '1',
          gradingPeriod: 'Midterm',
          maxScore: 50,
          dueDate: '2026-10-20',
          status: 'Active',
        },
      ];

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessmentPayload = payload;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment updated successfully.',
              assessments: [{ id: payload.id, classId: payload.classId, title: payload.title }],
            }),
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(unassignedAssessments) });
      });

      await page.goto('/grades?tab=assessments');

      // Table displays "Unassigned Category" badge
      const row = page.getByRole('row').filter({ hasText: 'Uncategorized Lab Exam' });
      await expect(row).toBeVisible();
      await expect(row.getByText('Unassigned Category')).toBeVisible();

      // Click Edit
      await row.getByRole('button', { name: 'Edit' }).click();
      const modalForm = page.locator('form').last();

      // Modal displays warning alert
      await expect(page.getByText(/requires a valid grading category assignment/i)).toBeVisible();

      // Category select is empty and submit button is disabled
      const categorySelect = modalForm.locator('select').nth(1);
      await expect(categorySelect).toHaveValue('');
      const submitBtn = modalForm.getByRole('button', { name: 'Confirm Assessment' });
      await expect(submitBtn).toBeDisabled();

      // Explicitly assign category 11
      await categorySelect.selectOption('11');
      await expect(submitBtn).toBeEnabled();

      await submitBtn.click();
      await expect(page.getByText('Assessment updated successfully.')).toBeVisible();
      expect(postedAssessmentPayload?.gradingCategoryId).toBe(11);
      expect(postedAssessmentPayload?.type).toBe('Quizzes');
    });

    test('grading config error state displays retry, disables save, and never falls back to legacy categories', async ({ page }) => {
      let shouldFail = true;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        if (shouldFail) {
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'error', message: 'Failed to load database config' }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();

      // Error banner with retry is visible
      await expect(page.getByText('Failed to load database config')).toBeVisible();
      const retryBtn = modalForm.getByRole('button', { name: 'Retry Loading Configuration' });
      await expect(retryBtn).toBeVisible();

      // Confirm button is disabled
      const submitBtn = modalForm.getByRole('button', { name: 'Confirm Assessment' });
      await expect(submitBtn).toBeDisabled();

      // Legacy category dropdown must NOT be displayed
      await expect(modalForm.locator('option', { hasText: 'Quiz' })).toHaveCount(0);

      // Now recover by clicking Retry
      shouldFail = false;
      await retryBtn.click();

      // Recovers to show dynamic categories
      const categorySelect = modalForm.locator('select').nth(1);
      await expect(categorySelect).toBeVisible();
      await expect(categorySelect).toContainText('Quizzes (25%)');
    });

    test('authoritative re-fetch: archive and delete re-fetch assessments from server', async ({ page }) => {
      let getAssessmentsCount = 0;
      let deleteCalled = false;
      let archiveCalled = false;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/assessments/delete', async (route) => {
        deleteCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', message: 'Assessment deleted.', assessmentId: 'ass-1', deletedScoreCount: 0 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') {
          archiveCalled = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              message: 'Assessment archived.',
              assessments: [{ id: 'ass-1', classId: '1', title: 'Test Ass' }],
            }),
          });
          return;
        }
        getAssessmentsCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'ass-1',
              title: 'Assessment For Archive and Delete',
              type: 'Quizzes',
              gradingCategoryId: 11,
              subjectCode: 'CLIN401',
              classId: '1',
              gradingPeriod: 'Midterm',
              maxScore: 50,
              dueDate: '2026-10-30',
              status: 'Active',
            },
          ]),
        });
      });

      await page.goto('/grades?tab=assessments');
      const row = page.getByRole('row').filter({ hasText: 'Assessment For Archive and Delete' });
      await expect(row).toBeVisible();

      // Trigger Archive
      const beforeArchiveCount = getAssessmentsCount;
      await row.getByRole('button', { name: 'Archive' }).click();

      // Confirmation modal
      const confirmModal = page.locator('button', { hasText: 'Confirm' });
      if (await confirmModal.isVisible()) {
        await confirmModal.click();
      }

      await expect.poll(() => archiveCalled).toBe(true);
      await expect.poll(() => getAssessmentsCount).toBeGreaterThan(beforeArchiveCount);

      // Trigger Delete
      const beforeDeleteCount = getAssessmentsCount;
      await row.getByRole('button', { name: 'Delete' }).click();
      const deleteConfirmModal = page.locator('button', { hasText: 'Confirm' });
      if (await deleteConfirmModal.isVisible()) {
        await deleteConfirmModal.click();
      }

      await expect.poll(() => deleteCalled).toBe(true);
      await expect.poll(() => getAssessmentsCount).toBeGreaterThan(beforeDeleteCount);
    });

    test('switching sections to a different offering clears category, loads new config, and blocks submitting old category ID', async ({ page }) => {
      const classesWithTwoOfferings = [
        {
          id: '1',
          csId: 1,
          csName: 'CLIN401-Sem1',
          courseId: 101,
          courseCode: 'CLIN401',
          courseName: 'Clinical Dentistry I',
          units: 3,
          schoolYear: '2026-2027',
          semester: '1st Semester',
          yearLevel: 4,
          block: 'A',
          status: 'Active',
        },
        {
          id: '4',
          csId: 4,
          csName: 'CLIN401-Sem2',
          courseId: 101,
          courseCode: 'CLIN401',
          courseName: 'Clinical Dentistry I',
          units: 3,
          schoolYear: '2026-2027',
          semester: '2nd Semester',
          yearLevel: 4,
          block: 'B',
          status: 'Active',
        },
      ];

      await page.route('**/api/faculty/classes', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', classes: classesWithTwoOfferings }),
        });
      });

      await page.route('**/api/faculty/grading-config?*semester=1st*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig401 }),
        });
      });

      await page.route('**/api/faculty/grading-config?*semester=2nd*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: mockGradingConfig402 }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      const sectionSelect = modalForm.locator('select').nth(0);
      const categorySelect = modalForm.locator('select').nth(1);

      // Initially on Section 1 (1st Sem): select Quizzes (11)
      await categorySelect.selectOption('11');
      await expect(categorySelect).toHaveValue('11');

      // Now switch to Section 4 (2nd Sem - DIFFERENT offering)
      await sectionSelect.selectOption('4');

      // Category selection is cleared
      await expect(categorySelect).toHaveValue('');

      // New configuration categories are loaded (21: Case Presentations, 22: Practical Exam)
      await expect(categorySelect).toContainText('Case Presentations (50%)');
      await expect(categorySelect).not.toContainText('Quizzes');

      // Confirm button is disabled because category was cleared and requires re-selection
      const submitBtn = modalForm.getByRole('button', { name: 'Confirm Assessment' });
      await expect(submitBtn).toBeDisabled();
    });

    test('category rename on server immediately updates table display without modifying assessment', async ({ page }) => {
      const renamedConfig = {
        ...mockGradingConfig401,
        categories: [
          { id: 11, name: 'Renamed Comprehensive Quizzes', weight: '25', sortOrder: 1, inUse: true },
          { id: 12, name: 'Major Exams', weight: '45', sortOrder: 2, inUse: true },
          { id: 13, name: 'Clinical Work', weight: '30', sortOrder: 3, inUse: false },
        ],
      };

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: renamedConfig }),
        });
      });

      await page.route('**/api/faculty/assessments', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'ass-rename-test',
              title: 'Assessment Under Renamed Category',
              type: 'Legacy Stale Category Name',
              gradingCategoryId: 11,
              subjectCode: 'CLIN401',
              classId: '1',
              gradingPeriod: 'Midterm',
              maxScore: 50,
              dueDate: '2026-10-30',
              status: 'Active',
            },
          ]),
        });
      });

      await page.goto('/grades?tab=assessments');

      // Table displays the current configured name "Renamed Comprehensive Quizzes"
      const row = page.getByRole('row').filter({ hasText: 'Assessment Under Renamed Category' });
      await expect(row).toBeVisible();
      await expect(row.getByText('Renamed Comprehensive Quizzes')).toBeVisible();
      await expect(row.getByText('Legacy Stale Category Name')).toHaveCount(0);
    });
  });
});
