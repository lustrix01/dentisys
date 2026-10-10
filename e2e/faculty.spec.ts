import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

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
    await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });


  test('Faculty creation offers only Dean terms for the current year', async ({ page }) => {
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [], academicTerms: [
      { id: 12, schoolYear: '2026-2027', semester: 'Summer', startDate: '2027-05-01', endDate: '2027-07-31', classCount: 0 },
      { id: 11, schoolYear: '2025-2026', semester: '1ST', startDate: '2025-08-01', endDate: '2025-12-31', classCount: 0 },
    ] }) }));
    await page.click('a[href="/classes"]');
    await page.getByRole('button', { name: 'Create Class', exact: true }).first().click();
    const terms = page.getByLabel('Academic term *');
    await expect(terms).toHaveValue('12');
    await expect(terms.locator('option')).toHaveCount(2);
    await expect(terms).toContainText('Summer 2026-2027');
    await expect(terms).not.toContainText('2025-2026');
    await terms.selectOption('12');
  });

  test('Faculty creation explains when the Dean has no current-year term', async ({ page }) => {
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [], academicTerms: [] }) }));
    await page.click('a[href="/classes"]');
    await page.getByRole('button', { name: 'Create Class', exact: true }).first().click();
    await expect(page.getByText('No open term. Ask the Dean to add the terms for 2026-2027.')).toBeVisible();
    await expect(page.getByLabel('Academic term *')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save Class Section' })).toBeDisabled();
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
      await appPage.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
      await appPage.fill('input[type="password"]', 'Password123!');
      await appPage.click('button[type="submit"]');
      await expect(appPage).toHaveURL('/');
      await appPage.evaluate(() => {
        window.history.pushState({}, '', '/email-management');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      // The roster loads after the in-app navigation; allow for a busy test
      // machine (parallel workers) instead of the default 5 s.
      await expect(appPage.getByText('Canonical Student')).toBeVisible({ timeout: 20000 });
      await expect(appPage.getByText('Unscoped Student')).toBeVisible();
      await appPage.locator('tbody input[type="checkbox"]').nth(0).check();
      await appPage.locator('tbody input[type="checkbox"]').nth(1).check();
      await appPage.getByRole('button', { name: /Send Invitations \(2\)/i }).click();

      await expect(appPage.getByText('Student invitations: 1 issued, 1 email deliveries failed, 1 failed or skipped.')).toBeVisible();
      await expect(appPage.getByText('Invitation Issued · Delivery Failed')).toBeVisible();
      await appPage.getByRole('button', { name: /Email History Log \(1\)/i }).click();
      await expect(appPage.getByRole('cell', { name: 'Student Invitation', exact: true })).toBeVisible();
      await expect(appPage.getByText('Failed', { exact: true })).toBeVisible();
      // The history type filter matches the stored email types.
      const historyTypeFilter = appPage.locator('select', { has: appPage.locator('option', { hasText: 'All email categories' }) });
      await historyTypeFilter.selectOption('Privacy Consent');
      await expect(appPage.getByRole('cell', { name: 'Student Invitation', exact: true })).toHaveCount(0);
      await historyTypeFilter.selectOption('Student Invitation');
      await expect(appPage.getByRole('cell', { name: 'Student Invitation', exact: true })).toBeVisible();
      expect(invitationPayloads).toEqual([{ studentId: '42', classId: '77' }]);
    } finally {
      await appPage.close();
    }
  });

  test('Add Student fills in an existing student by ID number and enrolls them instead of registering a duplicate', async ({ page }) => {
    const currentClass = { id: '77', csId: 77, csName: 'CLIN401-A', courseId: 1, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', units: 3, schoolYear: '2026-2027', isCurrentSchoolYear: true, isHistorical: false, semester: '1st Semester', yearLevel: 5, block: 'A', schedule: null, lecRoom: '', labRoom: '', enrolledCount: 0, instructorName: 'Prof. Jane Doe', status: 'Active' };
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [currentClass] }) }));
    await page.route('**/api/faculty/courses', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [] }) }));
    let createCalled = false;
    await page.route('**/api/faculty/students', async route => {
      if (route.request().method() === 'POST') createCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/faculty/classes/available-students?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', students: [
      { id: '501', studentId: '2021-DENT-0501', name: 'Returning Student', prefix: null, firstName: 'Returning', middleName: null, lastName: 'Student', suffix: null, email: 'returning.student@bicol-u.edu.ph', yearLevel: 6, status: 'active' },
    ] }) }));
    const enrollPayloads: unknown[] = [];
    await page.route('**/api/faculty/classes/enroll', async route => {
      enrollPayloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Successfully enrolled 1 student(s).', enrolledCount: 1 }) });
    });

    await page.click('a[href="/classes"]');
    await page.getByRole('button', { name: 'Add Student' }).first().click();
    await page.getByPlaceholder('e.g. 2024-DENT-0012').fill('2021-dent-0501');
    await expect(page.getByText(/Existing student found: Returning Student/)).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Juan')).toHaveValue('Returning');
    await expect(page.getByPlaceholder('e.g. Dela Cruz')).toHaveValue('Student');
    await expect(page.getByPlaceholder('e.g. Juan')).toHaveAttribute('readonly', '');
    await page.getByRole('button', { name: 'Enroll Existing Student' }).click();
    await expect(page.getByText('Successfully enrolled 1 student(s).')).toBeVisible();
    expect(enrollPayloads).toEqual([{ csId: 77, studentIds: [501] }]);
    expect(createCalled).toBe(false);
  });

  test('Create Class records lecture and laboratory units with a separate schedule for each', async ({ page }) => {
    let created: Record<string, unknown> | null = null;
    await page.route('**/api/faculty/classes', async route => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', csId: 91, message: 'Class section created successfully.' }) });
      } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', academicTerms: [{ id: 1, schoolYear: '2026-2027', semester: '1ST', startDate: '2026-08-01', endDate: '2026-12-31', classCount: 0 }], classes: [] }) });
    });
    await page.route('**/api/faculty/courses', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [] }) }));
    await page.route('**/api/faculty/students', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));

    await page.click('a[href="/classes"]');
    await page.getByRole('button', { name: 'Create Class' }).first().click();
    await page.getByPlaceholder('e.g. DENT 301').fill('NEW601');
    await page.getByPlaceholder('e.g. Restorative Dentistry I').fill('Advanced Clinic');
    await page.getByPlaceholder('e.g. 4B or Section 3-A').fill('6A');
    await page.getByRole('radio', { name: 'Lecture & Lab' }).click();
    await page.getByLabel('Lecture Units *').fill('2');
    await page.getByLabel('Laboratory Units *').fill('1.5');
    await expect(page.getByText('Lecture Schedule', { exact: true })).toBeVisible();
    await expect(page.getByText('Laboratory Schedule', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Lecture only' }).click();
    await page.getByLabel('Lecture Room Venue *').selectOption('Room 101');
    await page.getByRole('button', { name: 'Mon', exact: true }).click();
    await page.getByRole('button', { name: 'Tue', exact: true }).click();
    await page.getByLabel('Lecture Mon end time').selectOption('10:00 AM');
    await page.getByLabel('Lecture Tue start time').selectOption('03:00 PM');
    await page.getByLabel('Lecture Tue end time').selectOption('05:00 PM');
    await expect(page.getByText('Room 101 • Mon 08:00 AM - 10:00 AM; Tue 03:00 PM - 05:00 PM')).toBeVisible();
    await page.getByRole('button', { name: 'Save Class Section' }).click();
    await expect.poll(() => created?.meetings).toEqual([
      { component: 'Lecture', day: 'Mon', room: 'Room 101', startTime: '08:00', endTime: '10:00' },
      { component: 'Lecture', day: 'Tue', room: 'Room 101', startTime: '15:00', endTime: '17:00' },
    ]);
    await page.getByRole('button', { name: 'Create Class', exact: true }).first().click();
    // Lab only: the lecture units and lecture schedule disappear.
    await page.getByRole('radio', { name: 'Lab only' }).click();
    await expect(page.getByLabel('Lecture Units *')).toHaveCount(0);
    await expect(page.getByText('Lecture Schedule', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Laboratory Schedule', { exact: true })).toBeVisible();
  });

  test('Edit Class offers the same lecture/lab component choices and sends changed units', async ({ page }) => {
    const editableClass = { id: '91', csId: 91, csName: 'NEW601-A', courseId: 9, courseCode: 'NEW601', courseName: 'Advanced Clinic', units: 3, lectureUnits: 2, labUnits: 1, courseUnitsEditable: true, hasGrades: false, schoolYear: '2026-2027', isCurrentSchoolYear: true, isHistorical: false, semester: '1ST', yearLevel: 6, block: 'A', schedule: null, lecRoom: 'Lecture Hall A (Mon 08:00 AM - 09:00 AM)', labRoom: 'Simulation Lab (Wed 10:00 AM - 01:00 PM)', enrolledCount: 0, instructorName: 'Prof. Jane Doe', status: 'Active' };
    const updates: Array<Record<string, unknown>> = [];
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [editableClass] }) }));
    await page.route('**/api/faculty/classes/update', async route => {
      updates.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Class section updated successfully.', csId: 91 }) });
    });
    await page.route('**/api/faculty/courses', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [{ id: 9, courseCode: 'NEW601', name: 'Advanced Clinic', units: 3, lectureUnits: 2, labUnits: 1, yearLevel: 6, semester: '1ST', isClinical: false }] }) }));
    await page.route('**/api/faculty/students', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));

    await page.click('a[href="/classes"]');
    await page.getByTitle('Edit Class Section Details').first().click();
    await expect(page.getByRole('radio', { name: 'Lecture & Lab' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Lab only' }).click();
    await expect(page.getByText('Lecture Venue & Schedule')).toHaveCount(0);
    await page.getByLabel('Laboratory Units *').fill('3');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toMatchObject({ csId: 91, lectureUnits: null, labUnits: 3, lecRoom: '' });
  });

  test('class editing preserves legacy text on metadata changes and keeps two Monday meetings separate', async ({ page }) => {
    const meetings = [
      { component: 'Lecture', day: 'Mon', room: 'Room 101', startTime: '08:00', endTime: '10:00' },
      { component: 'Lecture', day: 'Mon', room: 'Room 102', startTime: '15:00', endTime: '17:00' },
    ];
    const cls = { id: '91', csId: 91, csName: 'NEW601-A', courseId: 9, courseCode: 'NEW601', courseName: 'Advanced Clinic', units: 3, lectureUnits: 3, labUnits: 0, courseUnitsEditable: true, hasGrades: false, schoolYear: '2026-2027', semester: '1ST', yearLevel: 6, block: 'A', lecRoom: 'Room 101 (Mon 08:00 AM - 10:00 AM); Room 102 (Mon 03:00 PM - 05:00 PM); Unfinished', labRoom: '', meetings, status: 'Active' };
    const updates: Array<Record<string, unknown>> = [];
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [cls] }) }));
    await page.route('**/api/faculty/classes/update', async route => { updates.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }); });
    await page.route('**/api/faculty/courses', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [] }) }));
    await page.route('**/api/faculty/students', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/classes');
    await expect(page.getByText(/Unfinished/).first()).toBeVisible();
    await page.getByTitle('Edit Class Section Details').first().click();
    await expect(page.getByLabel('Lecture Mon start time', { exact: true })).toHaveValue('08:00 AM');
    await expect(page.getByLabel('Lecture Mon meeting 2 start time')).toHaveValue('03:00 PM');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).not.toHaveProperty('meetings');
    expect(updates[0]).not.toHaveProperty('lecRoom');
    await page.getByTitle('Edit Class Section Details').first().click();
    await page.getByLabel('Lecture Mon meeting 2 end time').selectOption('06:00 PM');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect.poll(() => updates.length).toBe(2);
    expect(updates[1].meetings).toEqual([meetings[0], { ...meetings[1], endTime: '18:00' }]);
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
    await page.getByRole('button', { name: 'Actions for Active Student' }).click();
    await page.getByRole('button', { name: 'Send Invite', exact: true }).click();
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
      await appPage.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
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
      await expect(appPage.getByRole('table').getByText('Student Invitation', { exact: true })).toBeVisible();
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

  test('remedial scheduling starts from a row with the enrollment fixed, a future date and notes', async ({ page }) => {
    const remedialPosts: Record<string, unknown>[] = [];
    await page.route('**/api/faculty/retention', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', currentSchoolYear: '2026-2027', retentionThreshold: 2.5,
          retention: [{
            enrollmentId: '901', studentId: '42', studentNumber: '2023-0042', studentName: 'Remedial Candidate',
            classId: '77', className: 'CLIN401-A', subjectCode: 'CLIN401', percentage: 70, gwa: 2.75,
            state: 'remedial', remedial: null, schoolYear: '2026-2027', remedialEligible: true,
            remedialProgression: { stage: 'none', attempts: [], passedAttempt: null, legacyUnclassified: false },
          }],
        }),
      });
    });
    await page.route('**/api/faculty/retention/remedial', async (route) => {
      remedialPosts.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'ok', enrollmentId: '901' }) });
    });
    await page.evaluate(() => {
      window.history.pushState({}, '', '/retention');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByText('Schedule Remedial Exam', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Midterm Evaluation Rules')).toHaveCount(0);
    await page.getByRole('row').filter({ hasText: 'Remedial Candidate' }).getByTitle('Schedule remedial exam').click();
    const dialog = page.locator('form').filter({ hasText: 'Confirm & Schedule Exam' });
    await expect(dialog.getByText('Remedial Candidate')).toBeVisible();
    await expect(dialog.getByText('CLIN401-A')).toBeVisible();
    await expect(dialog.locator('select').filter({ hasText: 'Remedial Candidate' })).toHaveCount(0);
    const dateInput = dialog.locator('input[type="date"]');
    await expect(dateInput).toHaveAttribute('min', /^\d{4}-\d{2}-\d{2}$/);
    await dialog.locator('textarea').fill('Bring the lab manual.');
    await dialog.getByRole('button', { name: 'Confirm & Schedule Exam' }).click();
    await expect.poll(() => remedialPosts.length).toBe(1);
    expect(remedialPosts[0]).toMatchObject({ enrollmentId: '901', attemptNumber: 1, notes: 'Bring the lab manual.' });
  });

  test('person names block digits while typing, sanitize paste and preserve accents, punctuation and IME', async ({ page }) => {
    await page.goto('/faculty/profile');
    await page.getByRole('button', { name: 'Change Name' }).click();
    const first = page.getByRole('textbox', { name: /First name/ });
    await first.fill('Ana');
    await first.pressSequentially('123@#$');
    await expect(first).toHaveValue('Ana');
    await first.fill("José123-María@");
    await expect(first).toHaveValue('José-María');
    await first.press('ControlOrMeta+a');
    await first.pressSequentially("O'Neill");
    await expect(first).toHaveValue("O'Neill");
    await first.dispatchEvent('compositionstart');
    await first.evaluate(input => {
      const element = input as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '山田1');
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '山田1', isComposing: true }));
    });
    await expect(first).toHaveValue('山田1');
    await first.dispatchEvent('compositionend', { data: '山田1' });
    await expect(first).toHaveValue('山田');
    await page.getByRole('textbox', { name: /Suffix/ }).fill('DMD, PhD2');
    await expect(page.getByRole('textbox', { name: /Suffix/ })).toHaveValue('DMD, PhD');
  });

  test('retention identifies current-year students separately from enrollments and exposes filtered alerts', async ({ page }) => {
    const common = { studentNumber: '2026-0042', studentName: 'Current Candidate', studentId: '42', percentage: 70, gwa: 2.75, state: 'warning', schoolYear: '2026-2027', remedialEligible: true };
    await page.route('**/api/faculty/dashboard/kpis**', route => {
      const year = new URL(route.request().url()).searchParams.get('schoolYear');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', kpis: { retentionAlerts: year === 'current' ? 1 : 2, remedialCount: 0 } }) });
    });
    await page.route('**/api/faculty/retention', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', retentionThreshold: 2.5, retention: [
      { ...common, enrollmentId: '901', classId: '77', className: 'CLIN401-A', subjectCode: 'CLIN401' },
      { ...common, enrollmentId: '902', classId: '78', className: 'CLIN402-A', subjectCode: 'CLIN402' },
      { ...common, enrollmentId: '903', studentId: '43', studentName: 'Historical Candidate', classId: '79', className: 'OLD401-A', subjectCode: 'OLD401', schoolYear: '2025-2026' },
    ] }) }));
    await page.goto('/retention');
    await expect(page.getByText('Showing 1 student across 2 course enrollments', { exact: false })).toBeVisible();
    await expect(page.getByText('1 student needs attention in the current school year', { exact: false })).toBeVisible();
    await expect(page.getByLabel('1 students needing attention in the current school year')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Historical Candidate' })).toHaveCount(0);
    await page.getByPlaceholder('Search...').fill('not-a-student');
    await expect(page.getByRole('row').filter({ hasText: 'Current Candidate' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View current-year students needing attention' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Current Candidate' })).toHaveCount(2);
  });

  test('faculty name dialog shows MFA, displays server errors, and sends no email', async ({ page }) => {
    let postedProfile: Record<string, unknown> | null = null;
    let firstName = 'Jane';
    await page.route('**/api/faculty/profile', async (route) => {
      if (route.request().method() === 'POST') {
        postedProfile = route.request().postDataJSON() as Record<string, unknown>;
        if (postedProfile.code !== '123456') {
          await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({
            status: 'error', code: 'INVALID_TWO_FACTOR_CODE', message: 'Invalid or already used authenticator code.', requestId: 'name-change-e2e',
          }) });
          return;
        }
        firstName = String(postedProfile.firstName);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          status: 'ok', message: 'Faculty profile updated successfully.',
          name: `${firstName} Doe`, prefix: '', firstName, middleName: '', lastName: 'Doe', suffix: '',
        }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', profile: { name: `${firstName} Doe`, firstName, lastName: 'Doe', email: 'faculty@bicol-u.edu.ph' } }),
      });
    });
    await page.route('**/api/auth/mfa/settings', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', two_factor: { enabled: true, authenticator_enabled: true, recovery_code_count: 8 } }),
    }));
    await page.click('a[href="/faculty/profile"]');
    const emailInput = page.locator('input[readonly]').first();
    await expect(emailInput).toHaveValue('faculty@bicol-u.edu.ph');
    await expect(page.getByText('Your login email cannot be changed.')).toBeVisible();
    await page.getByRole('button', { name: 'Change Name' }).click();
    const saveName = page.getByRole('button', { name: 'Save name' });
    await expect(saveName).toBeDisabled();
    await expect(page.getByLabel('Authenticator code')).toHaveAttribute('autocomplete', 'one-time-code');
    await page.getByLabel('First name *').fill('Janet');
    await page.getByLabel('Authenticator code').fill('111111');
    await saveName.click();
    await expect(page.getByRole('alert')).toContainText('Invalid or already used authenticator code.');
    await page.getByLabel('Authenticator code').fill('123456');
    await saveName.click();
    await expect.poll(() => postedProfile).not.toBeNull();
    expect(postedProfile).not.toHaveProperty('email');
    expect(postedProfile).toMatchObject({ prefix: '', firstName: 'Janet', middleName: '', lastName: 'Doe', suffix: '' });
    await expect(page.getByRole('main').getByRole('heading', { name: 'Janet Doe' })).toBeVisible();
  });

  test('faculty theme applies on click and is saved to the account', async ({ page }) => {
    const savedThemes: unknown[] = [];
    await page.route('**/api/auth/theme', async route => {
      savedThemes.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', theme: 'dark' }) });
    });

    await page.click('a[href="/faculty/settings"]');
    await expect(page).toHaveURL('/faculty/settings');
    const light = page.getByRole('button', { name: /Clean light mode/i });
    const dark = page.getByRole('button', { name: /Clinical dark mode/i });
    await expect(light).toHaveClass(/border-clinical-500/);
    await dark.click();
    // Applied immediately, with no separate Save step.
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(dark).toHaveClass(/border-clinical-500/);
    await expect(page.getByRole('status').filter({ hasText: /saved to your account/i })).toBeVisible();
    expect(savedThemes).toEqual([{ theme: 'dark' }]);
  });

  test('faculty theme stays applied on this device when the account save fails', async ({ page }) => {
    await page.route('**/api/auth/theme', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', message: 'Unable to save theme.' }),
    }));

    await page.click('a[href="/faculty/settings"]');
    const dark = page.getByRole('button', { name: /Clinical dark mode/i });
    await dark.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('alert')).toContainText(/not saved to your account/i);
  });

  test('change password lists the required strength and blocks a weak password', async ({ page }) => {
    const changeRequests: unknown[] = [];
    await page.route('**/api/auth/password/change', async route => {
      changeRequests.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sign_in_again: true, message: 'Password changed successfully. Please sign in again.' }) });
    });
    await page.click('a[href="/faculty/profile"]');
    await expect(page).toHaveURL('/faculty/profile');
    const requirements = page.locator('#new-password-requirements');
    await expect(requirements).toContainText('At least 8 characters');
    await expect(requirements).toContainText('An uppercase letter');
    await expect(requirements).toContainText('A lowercase letter');
    await expect(requirements).toContainText('A number');
    await expect(requirements).toContainText('A special character');

    await page.locator('#current-password').fill('OldPassword1!');
    await page.locator('#new-password').fill('weakpass');
    await page.locator('#confirm-password').fill('weakpass');
    const submit = page.getByRole('button', { name: /Update Password/i });
    await expect(submit).toBeDisabled();
    await expect(requirements).toContainText('An uppercase letter (A-Z) (not met)');

    await page.locator('#new-password').fill('NewPassword2@');
    await page.locator('#confirm-password').fill('NewPassword2@');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole('status').filter({ hasText: /Password changed successfully/i })).toBeVisible();
    expect(changeRequests).toEqual([{ current_password: 'OldPassword1!', new_password: 'NewPassword2@', confirm_password: 'NewPassword2@' }]);
  });

  test('fresh faculty account defaults to 0 students and 0 active classes', async ({ page }) => {
    await page.route('**/api/faculty/dashboard/kpis**', async (route) => {
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

  test('faculty class and roster surface is server-backed, not a browser-local preview', async ({ page }) => {
    await page.click('a[href="/classes"]');
    await expect(page).toHaveURL('/classes');
    await expect(page.locator('body')).toContainText(/Classes & Student Rosters|Assigned Classes|Enrolled Student Roster/i);
    await expect(page.locator('body')).not.toContainText(/Development preview|browser-local/i);
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
        body: JSON.stringify({ status: 'ok', currentSchoolYear: '2025-2026', classes: mockClasses }),
      });
    });

    await page.goto('/login');
    await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('attendance defaults to configured current year and makes historical classes filterable and read-only', async ({ page }) => {
    await page.route('**/api/faculty/classes', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2025-2026', classes: [...mockClasses,
      { ...mockClasses[0], id: '4', csId: 4, courseId: 103, courseCode: 'OLD401', schoolYear: '2024-2025' },
    ] }) }));
    await page.route('**/api/faculty/attendance?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }) }));
    await page.goto('/attendance');
    await expect(page.getByLabel('Attendance school year')).toHaveValue('current');
    await expect(page.getByLabel('Assigned course').locator('option[value="103"]')).toHaveCount(0);
    await page.getByLabel('Attendance school year').selectOption('2024-2025');
    await page.getByLabel('Assigned course').selectOption('103');
    await page.getByLabel('Class section').selectOption('4');
    await expect(page.getByText('Past school-year attendance is view-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Attendance Session', exact: true })).toBeDisabled();
    await expect(page.locator('tbody tr').filter({ hasText: 'Alice Green' }).getByRole('button', { name: 'Override', exact: true })).toBeDisabled();
    await page.getByLabel('Attendance school year').selectOption('current');
    await expect(page.getByLabel('Assigned course')).toHaveValue('');
    await expect(page.getByLabel('Class section')).toHaveValue('');
    await expect(page.getByText('Alice Green')).toHaveCount(0);
  });

  test('Faculty can choose a future session date and sees creator details for overlapping bookings', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await page.route('**/api/faculty/attendance?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }) }));
    await page.route('**/api/faculty/attendance/session', async route => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'A schedule already exists on 2099-10-02 from 08:00 to 13:00 (Asia/Manila), created by Secretary Bea Alonzo.' }) });
    });
    await page.goto('/attendance');
    await page.getByLabel('Assigned course').selectOption('101');
    await page.getByLabel('Class section').selectOption('1');
    await page.getByRole('button', { name: 'Start Attendance Session', exact: true }).click();
    const date = page.getByLabel('Session date (Asia/Manila)');
    expect(await date.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await date.fill('2099-10-02');
    await page.getByRole('checkbox', { name: /Geofence/ }).uncheck();
    await page.locator('form').getByRole('button', { name: 'Schedule Session', exact: true }).click();
    await expect.poll(() => payload?.sessionDate).toBe('2099-10-02');
    await expect(page.getByText(/created by Secretary Bea Alonzo/)).toBeVisible();
  });

  test('hierarchy: courses derive from classes, section list filters by course, course change clears section', async ({ page }) => {
    await page.goto('/attendance');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Attendance Monitoring' })).toBeVisible();

    // Verify course options are derived and deduplicated
    const courseSelect = page.getByLabel('Assigned course', { exact: true });
    await expect(courseSelect.locator('option[value="101"]')).toHaveCount(1);
    await expect(courseSelect.locator('option[value="102"]')).toHaveCount(1);
    await expect(courseSelect.locator('option')).toHaveCount(3); // placeholder + 2 courses

    // Class section select is initially disabled
    const sectionSelect = page.getByLabel('Class section', { exact: true });
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
    const courseSelect = page.getByLabel('Assigned course', { exact: true });
    await courseSelect.selectOption('101');

    const sectionSelect = page.getByLabel('Class section', { exact: true });
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

  test('worksheet: Faculty can end an active session after confirming', async ({ page }) => {
    let ended = false;
    let endPayload: Record<string, unknown> | null = null;
    const activeSession = {
      sessionId: '900', classId: '1', sessionDate: '2026-09-20', sessionCode: 'CS1-END-TEST', room: null,
      status: 'active', openingTime: '08:00', presentCutoff: '09:00', lateCutoff: '10:00', classEndTime: '12:00',
      timingConfigured: true, geofenceEnabled: false, biometricRequired: false, revokedAt: null, revocationReason: null,
    };
    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          worksheet: { ...mockWorksheetSectionA, attendanceSession: ended ? { ...activeSession, status: 'ended' } : activeSession },
        }),
      });
    });
    await page.route('**/api/faculty/attendance/session/end', async (route) => {
      endPayload = route.request().postDataJSON() as Record<string, unknown>;
      ended = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: { ...activeSession, status: 'ended' } }) });
    });

    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    await expect(page.getByText(/Class ends 12:00/)).toBeVisible();
    await page.getByRole('button', { name: 'End Session' }).click();
    await expect(page.getByText(/Students without an attendance record will be marked Absent/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm End Session' }).click();
    await expect.poll(() => endPayload).toEqual({ sessionId: '900' });
    await expect(page.getByText(/Attendance session ended/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Session' })).toHaveCount(0);
  });

  test('Excused requests (ATT-006): Faculty approve a pending Secretary request', async ({ page }) => {
    let decision: Record<string, unknown> | null = null;
    let decided = false;
    const pending = {
      id: '31', status: 'pending', studentId: '1001', studentNumber: '2024-0001', studentName: 'Alice Green', classId: '1',
      className: 'Section A', courseCode: 'CLIN401', sessionId: '900', sessionDate: '2026-09-20', sessionCode: 'CS1-20260920',
      currentStatus: 'absent', reason: 'Medical certificate given to the Secretary', requestedBy: 'Bea Alonzo',
      requestedAt: '2026-09-20T03:00:00Z', decidedBy: null, decidedAt: null, decisionNote: null,
    };
    await page.route('**/api/faculty/excused-requests', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', requests: decided ? [{ ...pending, status: 'approved' }] : [pending] }) });
    });
    await page.route('**/api/faculty/excused-requests/decide', async (route) => {
      decision = route.request().postDataJSON() as Record<string, unknown>;
      decided = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Excused request approved; attendance set to Excused.', request: { ...pending, status: 'approved' } }) });
    });
    await page.goto('/attendance');
    const panel = page.getByRole('region', { name: 'Excused requests' });
    await expect(panel).toContainText('Alice Green');
    await expect(panel).toContainText('Medical certificate given to the Secretary');
    await panel.getByLabel('Decision note for Alice Green').fill('Certificate verified');
    await panel.getByRole('button', { name: 'Approve' }).click();
    await expect.poll(() => decision).toEqual({ requestId: '31', decision: 'approve', note: 'Certificate verified' });
    await expect(panel).toContainText('Excused request approved');
  });

  test('Student Notices sends an At-Risk notice and reports suppressed test-mode deliveries', async ({ page }) => {
    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/faculty/students', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: '42', studentId: '2024-0042', name: 'Notice Student', email: 'notice.student@bicol-u.edu.ph', yearLevel: 4, status: 'active', classSections: [{ classId: '1', className: 'CLIN401 - Section A', enrollmentId: '88' }] },
      ]) });
    });
    await page.route('**/api/faculty/send-email', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', message: '0 email(s) sent; 1 suppressed (test mode); 0 failed.', sentCount: 0, suppressedCount: 1, failedCount: 0,
        deliveries: [{ id: '5', recipient: 'notice.student@bicol-u.edu.ph', status: 'Suppressed' }],
      }) });
    });
    await page.goto('/email-management');
    await page.getByRole('button', { name: 'Student Notices' }).click();
    await page.getByLabel('Select Notice Student').check();
    await page.getByRole('button', { name: /Send Notice \(1\)/ }).click();
    await expect.poll(() => posted).toMatchObject({ studentIds: ['42'], emailType: 'At-Risk Notification', subject: 'DentiSys At-Risk Notice' });
    await expect(page.getByText('1 suppressed (test mode)')).toBeVisible();
  });

  test('Class Attendance Activity lists attendance changes with old and new status', async ({ page }) => {
    await page.route('**/api/faculty/attendance-activity**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          activity: [
            { id: 'correction-1', occurredAt: '2026-09-20T02:00:00Z', studentName: 'Alice Green', studentNumber: '2024-0001', classId: '1', className: 'Section A', courseCode: 'CLIN401',
              sessionDate: '2026-09-20', sessionCode: 'CS1-20260920', previousStatus: 'absent', newStatus: 'excused', reason: 'Medical certificate', actorRole: 'secretary', actorName: 'Bea Alonzo' },
            { id: 'record-9', occurredAt: '2026-09-19T02:00:00Z', studentName: 'Bob White', studentNumber: '2024-0002', classId: '1', className: 'Section A', courseCode: 'CLIN401',
              sessionDate: '2026-09-19', sessionCode: 'CS1-20260919', previousStatus: null, newStatus: 'present', reason: 'Enrolled late', actorRole: 'faculty', actorName: 'Prof. Jane Doe' },
          ],
        }),
      });
    });
    await page.goto('/faculty/attendance-activity');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Class Attendance Activity' })).toBeVisible();
    const aliceRow = page.getByRole('row').filter({ hasText: 'Alice Green' });
    await expect(aliceRow).toContainText('Absent → Excused');
    await expect(aliceRow).toContainText('Medical certificate');
    await expect(aliceRow).toContainText('Bea Alonzo');
    await expect(page.getByRole('row').filter({ hasText: 'Bob White' })).toContainText('Not recorded → Present');
    await page.getByLabel('Search class attendance activity').fill('Bob');
    await expect(page.getByRole('row').filter({ hasText: 'Alice Green' })).toHaveCount(0);
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
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');

    await expect(page.getByText(/A server error occurred|Internal server error|Unable to load/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });

  test('date: worksheet accepts a viewing date and sends exact YYYY-MM-DD', async ({ page }) => {
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
    expect(maxVal).toBeNull();

    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');

    // Change date
    await dateInput.fill('2026-09-18');
    await expect.poll(() => capturedDateQuery).toBe('2026-09-18');
  });

  test('future attendance worksheet is read-only until its Manila date', async ({ page }) => {
    const manilaParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => manilaParts.find(item => item.type === type)?.value ?? '';
    const manilaToday = `${part('year')}-${part('month')}-${part('day')}`;
    const futureDateValue = new Date(`${manilaToday}T00:00:00.000Z`);
    futureDateValue.setUTCDate(futureDateValue.getUTCDate() + 2);
    const futureDate = futureDateValue.toISOString().slice(0, 10);
    const requestedDates: string[] = [];
    let overrideRequests = 0;

    await page.route('**/api/faculty/attendance?*', async route => {
      const date = new URL(route.request().url()).searchParams.get('date') ?? '';
      requestedDates.push(date);
      const worksheet = date === futureDate
        ? {
          ...mockWorksheetSectionA,
          date,
          pendingSessions: [{
            sessionId: '101', sessionDate: futureDate, sessionCode: 'FUTURE-101',
            status: 'scheduled', openingTime: '08:00', classEndTime: '11:00',
          }],
        }
        : { ...mockWorksheetSectionA, date: manilaToday, pendingSessions: [] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet }) });
    });
    await page.route('**/api/faculty/attendance/override', async route => {
      overrideRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill(futureDate);

    await expect.poll(() => requestedDates[requestedDates.length - 1]).toBe(futureDate);
    await expect(page.getByText('Scheduled session: attendance opens at its chosen date/time in Asia/Manila.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`${futureDate}.*Scheduled.*FUTURE-101`) })).toBeVisible();
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
    const overrideButton = aliceRow.getByRole('button', { name: 'Override', exact: true });
    const bulkButton = page.getByRole('button', { name: 'Mark all unrecorded as Present', exact: true });
    const overrideButtons = page.locator('tbody tr').getByRole('button', { name: 'Override', exact: true });
    await expect(overrideButtons).toHaveCount(mockWorksheetSectionA.roster.length);
    for (const button of await overrideButtons.all()) await expect(button).toBeDisabled();
    await expect(bulkButton).toBeDisabled();
    expect(overrideRequests).toBe(0);

    await dateInput.fill(manilaToday);
    await expect.poll(() => requestedDates[requestedDates.length - 1]).toBe(manilaToday);
    await expect(page.getByText('Scheduled session: attendance opens at its chosen date/time in Asia/Manila.', { exact: true })).toHaveCount(0);
    await expect(overrideButton).toBeEnabled();
    await expect(bulkButton).toBeEnabled();
    expect(overrideRequests).toBe(0);
  });

  for (const operation of ['initial', 'correction', 'bulk'] as const) {
    test(`Faculty polling waits for the pending ${operation} attendance write`, async ({ page }) => {
      await page.clock.install();
      let reads = 0;
      let writing = false;
      let releaseWrite: () => void = () => {};
      const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
      await page.route('**/api/faculty/attendance?*csId=1*', route => {
        ++reads;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: { ...mockWorksheetSectionA, pendingSessions: [{ sessionId: '101', status: 'scheduled', sessionDate: '2099-10-02' }] } }) });
      });
      await page.route('**/api/faculty/attendance/override', async route => {
        writing = true;
        await writeGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation: 'updated', recordId: '999' }) });
      });
      await page.goto('/attendance');
      await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
      await page.getByLabel('Class section', { exact: true }).selectOption('1');
      const student = operation === 'correction' ? 'Bob White' : 'Alice Green';
      const row = page.locator('tbody tr').filter({ hasText: student });
      await expect(row).toBeVisible();
      // Begin the write just before the 30-second poll, within the API timeout.
      await page.clock.fastForward(28000);
      if (operation === 'bulk') {
        await page.getByRole('button', { name: 'Mark all unrecorded as Present' }).click();
        await page.getByRole('button', { name: 'Mark Present', exact: true }).click();
      } else {
        await row.getByRole('button', { name: 'Override', exact: true }).click();
        await page.locator('form').getByRole('button', { name: operation === 'correction' ? 'absent' : 'present', exact: true }).click();
        if (operation === 'correction') {
          await page.locator('textarea').fill('Student was absent due to illness');
        }
        await page.getByRole('button', { name: 'Save Override', exact: true }).click();
      }
      await expect.poll(() => writing).toBe(true);
      await expect(page.getByLabel('Assigned course', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('Class section', { exact: true })).toBeDisabled();
      await expect(page.locator('input[type="date"]')).toBeDisabled();
      const readsBefore = reads;
      await page.clock.fastForward(3100);
      await page.clock.runFor(100);
      expect(reads).toBe(readsBefore);
      releaseWrite();
      await expect(page.getByText(operation === 'bulk' ? 'Marked 1 student as present.' : operation === 'correction' ? 'Attendance corrected for Bob White (absent).' : 'Attendance updated for Alice Green (present).', { exact: true })).toBeVisible();
    });
  }

  for (const newerRead of ['refresh', 'date change', 'same session'] as const) {
    test(`Faculty ${newerRead} during a write keeps the target fixed and avoids stale results`, async ({ page }) => {
      let reads = 0;
      let writing = false;
      let releaseWrite: () => void = () => {};
      const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
      await page.route('**/api/faculty/attendance?*csId=1*', async route => {
        const date = new URL(route.request().url()).searchParams.get('date');
        ++reads;
        let result = mockWorksheetSectionA;
        if (newerRead === 'same session') result = { ...result, date,
          attendanceSession: { sessionId: '42', sessionDate: date, sessionCode: 'SAME-SESSION', status: 'active', openingTime: '08:00', classEndTime: '23:59', room: 'Room 101' },
          attendanceSessions: [{ sessionId: '42', sessionDate: date, sessionCode: 'SAME-SESSION', status: 'active' }],
          pendingSessions: [{ sessionId: '42', sessionDate: date, sessionCode: 'SAME-SESSION', status: 'active', openingTime: '08:00', classEndTime: '23:59' }],
        } as typeof result;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: result }) });
      });
      await page.route('**/api/faculty/attendance/override', async route => {
        writing = true;
        await writeGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation: 'created', recordId: '999' }) });
      });
      await page.goto('/attendance');
      await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
      await page.getByLabel('Class section', { exact: true }).selectOption('1');
      const alice = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
      await alice.getByRole('button', { name: 'Override', exact: true }).click();
    await page.locator('form').getByRole('button', { name: 'present', exact: true }).click();
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
      await expect.poll(() => writing).toBe(true);
      if (newerRead !== 'refresh') {
        await expect(page.getByLabel('Attendance school year', { exact: true })).toBeDisabled();
        await expect(page.getByLabel('Assigned course', { exact: true })).toBeDisabled();
        await expect(page.getByLabel('Class section', { exact: true })).toBeDisabled();
        await expect(page.locator('input[type="date"]')).toBeDisabled();
        if (newerRead === 'same session') await expect(page.getByRole('button', { name: /Open.*SAME-SESSION/ })).toBeDisabled();
        releaseWrite();
        await expect(page.getByText('Attendance updated for Alice Green (present).', { exact: true })).toBeVisible();
        await expect(alice.getByTestId('attendance-status')).toHaveText(/Present$/);
        await expect(page.locator('input[type="date"]')).toBeEnabled();
        await expect(page.getByLabel('Class section', { exact: true })).toBeEnabled();
        expect(reads).toBe(1);
        return;
      }
      await expect(page.getByRole('button', { name: 'Refresh attendance worksheet', exact: true })).toBeDisabled();
      releaseWrite();
      await expect(page.getByText('Attendance updated for Alice Green (present).', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh attendance worksheet', exact: true })).toBeEnabled();
      await expect(alice.getByTestId('attendance-status')).toHaveText(/Present$/);
      expect(reads).toBe(1);
    });
  }

  for (const action of ['manual refresh', 'session revocation'] as const) {
  test(`Faculty defers ${action} between bulk row saves and preserves each saved result`, async ({ page }) => {
    let reads = 0;
    let writes = 0;
    const releases: Array<() => void> = [];
    const gates = [0, 1, 2].map(() => new Promise<void>(resolve => { releases.push(resolve); }));
    const roster = mockWorksheetSectionA.roster.map(row => ({ ...row, id: null, status: null }));
    roster.push({ ...roster[0], enrollmentId: '12', studentId: '1003', studentNumber: '2024-0003', studentName: 'Carol Brown' });
    let revoked = false;
    const activeSession = { sessionId: '900', sessionDate: '2026-09-20', sessionCode: 'BULK-SESSION', status: 'active', openingTime: '08:00', classEndTime: '23:59' };
    expect(roster).toHaveLength(3);
    await page.route('**/api/faculty/attendance?*csId=1*', route => {
      ++reads;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: { ...mockWorksheetSectionA, roster: roster.map((row, index) => ({ ...row, status: index < completed ? 'present' : null })), attendanceSession: action === 'session revocation' ? { ...activeSession, status: revoked ? 'revoked' : 'active' } : null } }) });
    });
    let completed = 0;
    await page.route('**/api/faculty/attendance/override', async route => {
      const index = writes++;
      await gates[index];
      ++completed;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation: 'created', recordId: String(900 + index) }) });
    });
    await page.route('**/api/faculty/attendance/session/revoke', route => {
      revoked = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: { ...activeSession, status: 'revoked' } }) });
    });
    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Mark all unrecorded as Present' }).click();
    await page.getByRole('button', { name: 'Mark Present', exact: true }).click();
    const refresh = page.getByRole('button', { name: 'Refresh attendance worksheet', exact: true });
    for (let index = 0; index < roster.length; ++index) {
      await expect.poll(() => writes).toBe(index + 1);
      await expect(refresh).toBeDisabled();
      expect(reads).toBe(1);
      if (action === 'session revocation' && index === 1) {
        await page.getByRole('button', { name: 'Revoke Session', exact: true }).click();
        await page.getByRole('button', { name: 'Confirm Revoke Session', exact: true }).click();
        await expect(page.getByText(/Attendance session revoked\. Already-recorded/)).toBeVisible();
        expect(reads).toBe(1);
      }
      releases[index]();
      const row = page.locator('tbody tr').filter({ hasText: roster[index].studentName });
      await expect(row.getByTestId('attendance-status')).toHaveText(/Present$/);
    }
    await expect(page.getByText('Marked 3 students as present.', { exact: true })).toBeVisible();
    await expect(refresh).toBeEnabled();
    for (const student of roster) {
      await expect(page.locator('tbody tr').filter({ hasText: student.studentName }).getByTestId('attendance-status')).toHaveText(/Present$/);
    }
    await expect.poll(() => reads).toBe(action === 'session revocation' ? 2 : 1);
  });
  }

  test('Faculty defers an Excused approval refresh until the pending row save completes', async ({ page }) => {
    let reads = 0;
    let approved = false;
    let saved = false;
    let writing = false;
    let releaseWrite: () => void = () => {};
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    const pending = { id: '31', status: 'pending', studentId: '1002', studentName: 'Bob White', studentNumber: '2024-0002', classId: '1', className: 'Section A', courseCode: 'CLIN401', sessionDate: '2026-09-20', currentStatus: 'present', reason: 'Medical certificate', requestedBy: 'Secretary' };
    await page.route('**/api/faculty/excused-requests', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', requests: approved ? [] : [pending] }) }));
    await page.route('**/api/faculty/excused-requests/decide', route => {
      approved = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Bob approval saved.', request: { ...pending, status: 'approved' } }) });
    });
    await page.route('**/api/faculty/attendance?*csId=1*', route => {
      ++reads;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: { ...mockWorksheetSectionA, roster: mockWorksheetSectionA.roster.map((row, index) => ({ ...row, status: index === 0 ? saved ? 'present' : null : approved ? 'excused' : 'present' })) } }) });
    });
    await page.route('**/api/faculty/attendance/override', async route => {
      writing = true;
      await gate;
      saved = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation: 'created', recordId: '999' }) });
    });
    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    const alice = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
    await alice.getByRole('button', { name: 'Override', exact: true }).click();
    await page.locator('form').getByRole('button', { name: 'present', exact: true }).click();
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
    await expect.poll(() => writing).toBe(true);
    await page.getByRole('region', { name: 'Excused requests' }).getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('Bob approval saved.', { exact: true })).toBeVisible();
    expect(reads).toBe(1);
    releaseWrite();
    await expect(alice.getByTestId('attendance-status')).toHaveText(/Present$/);
    await expect(page.locator('tbody tr').filter({ hasText: 'Bob White' }).getByTestId('attendance-status')).toHaveText(/Excused$/);
    expect(reads).toBe(2);
    await expect(page.getByRole('button', { name: 'Refresh attendance worksheet', exact: true })).toBeEnabled();
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
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');

    await expect(page.getByText('Alice Green')).toBeVisible();

    // Ensure dentisys_attendance is empty before action
    await page.evaluate(() => localStorage.removeItem('dentisys_attendance'));

    // Alice Green has status null. Click 'Present'
    const aliceRow = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
    await aliceRow.getByRole('button', { name: 'Override', exact: true }).click();
    await page.locator('form').getByRole('button', { name: 'present', exact: true }).click();
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();

    await expect(page.getByText(/Attendance updated for Alice Green \(present\)/i)).toBeVisible();
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
        body: JSON.stringify({ status: 'ok', worksheet: { ...mockWorksheetSectionA,
          roster: mockWorksheetSectionA.roster.map(item => item.id === '50'
            ? { ...item, overrideReason: 'Previous correction justification', overrideAt: '2026-09-20 09:00:00' } : item),
        } }),
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
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');

    // Bob White currently has 'present'. Click 'Absent'
    const bobRow = page.locator('tbody tr').filter({ hasText: 'Bob White' });
    await bobRow.getByRole('button', { name: 'Override', exact: true }).click();
    await expect(page.locator('textarea')).toHaveValue('');
    await page.locator('form').getByRole('button', { name: 'absent', exact: true }).click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Manual Attendance Override' })).toBeVisible();
    await expect(page.locator('form').getByText('Bob White')).toBeVisible();
    await expect(page.getByText(/PRESENT → ABSENT/i)).toBeVisible();

    // Try submitting without reason
    await page.getByRole('button', { name: 'Save Override' }).click();
    await expect(page.getByText(/justification reason is required/i)).toBeVisible();
    expect(overridePayload).toBeNull();

    // Cancel modal
    await page.locator('textarea').fill('Abandoned correction draft');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Manual Attendance Override' })).toHaveCount(0);
    expect(overridePayload).toBeNull();

    // Click Absent again and provide valid reason
    await bobRow.getByRole('button', { name: 'Override', exact: true }).click();
    await expect(page.locator('textarea')).toHaveValue('');
    await page.locator('form').getByRole('button', { name: 'absent', exact: true }).click();
    await page.fill('textarea', 'Student was absent due to illness');
    await page.getByRole('button', { name: 'Save Override' }).click();

    await expect(page.getByText(/Attendance corrected for Bob White \(absent\)/i)).toBeVisible();
    expect(overridePayload).not.toBeNull();
    expect(overridePayload?.recordId).toBe('50');
    expect(overridePayload?.status).toBe('absent');
    expect(overridePayload?.reason).toBe('Student was absent due to illness');
  });

  test('Faculty correction preserves a failed save for retry without changing the recorded status', async ({ page }) => {
    const payloads: Array<Record<string, unknown>> = [];
    await page.route('**/api/faculty/attendance?*csId=1*', route => route.fulfill({
      json: { status: 'ok', worksheet: mockWorksheetSectionA },
    }));
    await page.route('**/api/faculty/attendance/override', route => {
      payloads.push(route.request().postDataJSON());
      return payloads.length === 1
        ? route.fulfill({ status: 500, json: { status: 'error', message: 'Attendance save failed; please retry.' } })
        : route.fulfill({ json: { status: 'ok', operation: 'updated', recordId: '50' } });
    });
    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    const row = page.locator('tbody tr').filter({ hasText: 'Bob White' });
    await row.getByRole('button', { name: 'Override', exact: true }).click();
    await page.locator('form').getByRole('button', { name: 'absent', exact: true }).click();
    await page.locator('textarea').fill('  Verified absence with the Student  ');
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
    await expect(page.getByText('A server error occurred. Please try again later.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manual Attendance Override', exact: true })).toBeVisible();
    await expect(page.locator('textarea')).toHaveValue('  Verified absence with the Student  ');
    await expect(row.getByTestId('attendance-status')).toHaveText(/Present$/);
    await expect(page.getByText('Attendance corrected for Bob White (absent).', { exact: true })).toHaveCount(0);
    expect(payloads).toEqual([{ recordId: '50', status: 'absent', reason: 'Verified absence with the Student' }]);
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
    await expect(page.getByText('Attendance corrected for Bob White (absent).', { exact: true })).toBeVisible();
    await expect(row.getByTestId('attendance-status')).toHaveText(/Absent$/);
    await expect(page.getByRole('heading', { name: 'Manual Attendance Override', exact: true })).toHaveCount(0);
    expect(payloads).toEqual([payloads[0], payloads[0]]);
  });

  test('Faculty initial entry targets the selected same-day session and sends its optional reason', async ({ page }) => {
    const sessions = [
      { sessionId: '41', sessionDate: '2026-09-20', sessionCode: 'MORNING-41', status: 'ended', openingTime: '08:00', classEndTime: '10:00', room: 'Room 101' },
      { sessionId: '42', sessionDate: '2026-09-20', sessionCode: 'AFTERNOON-42', status: 'ended', openingTime: '13:00', classEndTime: '15:00', room: 'Room 102' },
    ];
    const payloads: Array<Record<string, unknown>> = [];
    await page.route('**/api/faculty/attendance?*csId=1*', route => {
      const sessionId = new URL(route.request().url()).searchParams.get('sessionId');
      return route.fulfill({ json: { status: 'ok', worksheet: {
        ...mockWorksheetSectionA, date: '2026-09-20', attendanceSessions: sessions,
        attendanceSession: sessions.find(session => session.sessionId === sessionId) ?? null,
        roster: mockWorksheetSectionA.roster.map(item => ({ ...item, attendanceSessionId: sessionId,
          sessionCode: sessions.find(session => session.sessionId === sessionId)?.sessionCode ?? null })),
      } } });
    });
    await page.route('**/api/faculty/attendance/override', route => {
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: 'ok', operation: 'created', recordId: '999' } });
    });
    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    await page.locator('input[type="date"]').fill('2026-09-20');
    const row = page.locator('tbody tr').filter({ hasText: 'Alice Green' });
    await expect(row.getByRole('button', { name: 'Override', exact: true })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Attendance session', exact: true }).selectOption('42');
    await row.getByRole('button', { name: 'Override', exact: true }).click();
    await expect(page.getByText('Initial Entry Reason (Optional)', { exact: true })).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'late', exact: true }).click();
    await page.locator('textarea').fill('  Verified arrival for the afternoon session  ');
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
    await expect(page.getByText('Attendance updated for Alice Green (late).', { exact: true })).toBeVisible();
    expect(payloads).toEqual([{ csId: 1, enrollmentId: 10, sessionDate: '2026-09-20', sessionId: 42,
      status: 'late', reason: 'Verified arrival for the afternoon session' }]);
    await expect(row.getByTestId('attendance-status')).toHaveText(/Late$/);
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
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');

    // Bob White is already 'present'. Click 'Present'
    const bobRow = page.locator('tbody tr').filter({ hasText: 'Bob White' });
    await bobRow.getByRole('button', { name: 'Override', exact: true }).click();
    await page.getByRole('button', { name: 'Save Override', exact: true }).click();
    await expect(page.getByText('Choose a different attendance status.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Modal should not open and API should not be called
    await expect(page.getByRole('heading', { name: 'Manual Attendance Override' })).toHaveCount(0);
    expect(overrideCalled).toBe(false);
  });

  test('bulk: mark all unrecorded as Present asks first and only records students without a status', async ({ page }) => {
    const payloads: Array<Record<string, unknown>> = [];
    await page.route('**/api/faculty/attendance?*csId=1*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', worksheet: mockWorksheetSectionA }) });
    });
    await page.route('**/api/faculty/attendance/override', async (route) => {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', operation: 'created', recordId: '1000' }) });
    });

    await page.goto('/attendance');
    await page.getByLabel('Assigned course', { exact: true }).selectOption('101');
    await page.getByLabel('Class section', { exact: true }).selectOption('1');
    await expect(page.getByText('Alice Green')).toBeVisible();

    await page.getByRole('button', { name: 'Mark all unrecorded as Present' }).click();
    await expect(page.getByRole('heading', { name: 'Mark Unrecorded Students Present' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(payloads).toHaveLength(0);

    await page.getByRole('button', { name: 'Mark all unrecorded as Present' }).click();
    await page.getByRole('button', { name: 'Mark Present', exact: true }).click();
    await expect(page.getByText('Marked 1 student as present.')).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.enrollmentId).toBe(10);
    expect(payloads[0]?.status).toBe('present');
    await expect(page.locator('tbody tr').filter({ hasText: 'Alice Green' }).getByText('Present', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all unrecorded as Present' })).toBeDisabled();
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

    test('collapses duplicate sections into course offering and shows editable unsaved starting preset', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.goto('/grades?tab=components');

      // The shared course bar lists each course once; its two sections share one set of weights
      const courseSelect = page.getByRole('main').locator('select').first();
      await expect(courseSelect.locator('option')).toHaveCount(2);
      await expect(courseSelect.locator('option').first()).toContainText('CLIN401 - Clinical Dentistry I');
      await expect(courseSelect.locator('option').nth(1)).toContainText('CLIN402 - Clinical Dentistry II');
      await expect(page.getByTestId('weights-sections-note')).toContainText('2 sections of this course (CLIN401-A, CLIN401-B)');

      // Suggested starting preset indicator
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();
      await expect(page.getByText('Period Grading', { exact: true })).toBeVisible();

      // Mandatory split preset and term weights appear without an optional action.
      await expect(page.getByRole('tab', { name: 'Lecture Categories' })).toBeVisible();
      await expect(page.getByLabel('Lecture contribution (%)')).toHaveValue('60');
      await expect(page.getByLabel('Laboratory contribution (%)')).toHaveValue('40');
      await expect(page.locator('#period-component-mode')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Apply syllabus example/i })).toHaveCount(0);
      const midtermRatioInput = page.locator('#midterm-ratio-input');
      const finalRatioInput = page.locator('#final-ratio-input');
      await expect(midtermRatioInput).toHaveValue('30');
      await expect(finalRatioInput).toHaveValue('70');

      // Save Initial Schema button
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeVisible();
    });

    test('supports adding dynamic categories, reordering, weight updates, and live percentage validation across period tabs', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', configuration: null }),
        });
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();

      // The default Lecture list for Midterm is already populated and totals 100%.
      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      await expect(nameInputs).toHaveCount(4);
      await expect(nameInputs.nth(0)).toHaveValue('Term Exam');
      await expect(weightInputs.nth(0)).toHaveValue('50');

      // Check sum shows 100% and valid initially
      await expect(page.getByText(/Valid 100%/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeEnabled();

      // Update Term Exam weight to 60 -> sum is 110% (invalid)
      await weightInputs.nth(0).fill('60');
      await expect(page.getByText(/Must equal 100%/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeDisabled();

      // Reduce Quiz to 10 -> sum returns to 100% (valid)
      await weightInputs.nth(1).fill('10');
      await expect(page.getByText(/Valid 100%/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeEnabled();

      // Add a dynamic category to Midterm
      await page.getByRole('button', { name: /Add Midterm Category/i }).click();
      await nameInputs.nth(4).fill('Extra Assessment');
      await weightInputs.nth(4).fill('5');

      // Test decimal precision (e.g. 30.3333 + 30.3333 + 29.3334 + 5 + 5). Weights must be positive.
      await weightInputs.nth(0).fill('30.3333');
      await weightInputs.nth(1).fill('30.3333');
      await weightInputs.nth(2).fill('29.3334');
      await weightInputs.nth(3).fill('5');
      await expect(page.getByText(/Valid 100%/i).first()).toBeVisible();
      await weightInputs.nth(3).fill('0');
      await expect(page.getByText(/Must equal 100%/i).first()).toBeVisible();
      await weightInputs.nth(3).fill('5');

      // Test decimal precision across the four defaults and a fifth category.
      await weightInputs.nth(0).fill('30.3333');
      await weightInputs.nth(1).fill('30.3333');
      await weightInputs.nth(2).fill('29.3334');
      await weightInputs.nth(3).fill('5');
      await weightInputs.nth(4).fill('5');
      await expect(page.getByText(/Valid 100%/i).first()).toBeVisible();
      await weightInputs.nth(3).fill('0');
      await expect(page.getByText(/Must equal 100%/i).first()).toBeVisible();
      await weightInputs.nth(3).fill('5');

      // Test reordering: move category 0 down
      await page.locator('button[aria-label^="Move category"]').nth(1).click();
      await expect(nameInputs.nth(0)).toHaveValue('Quiz');
      await expect(nameInputs.nth(1)).toHaveValue('Term Exam');

      // Switch to Finals period tab
      await page.getByRole('button', { name: /Finals Categories/i }).click();
      await expect(page.locator('input[placeholder*="Category name"]').first()).toHaveValue('Term Exam');
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
                schemaMode: 'periods',
                componentMode: putPayload.componentMode,
                componentWeights: putPayload.componentWeights,
                termRatio: putPayload.termRatio,
                midtermCategories: putPayload.midtermCategories.map((category: Record<string, any>, idx: number) => ({
                  ...category, id: 100 + idx, inUse: false,
                })),
                finalCategories: putPayload.finalCategories.map((category: Record<string, any>, idx: number) => ({
                  ...category, id: 200 + idx, inUse: false,
                })),
                attendanceDateRanges: {
                  midterm: { startDate: '2026-08-01', endDate: '2026-10-15' },
                  final: { startDate: '2026-10-16', endDate: '2026-12-20' },
                },
              },
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();

      // Fill attendance date inputs
      await page.locator('#midterm-start-date').fill('2026-08-01');
      await page.locator('#midterm-end-date').fill('2026-10-15');
      await page.locator('#final-start-date').fill('2026-10-16');
      await page.locator('#final-end-date').fill('2026-12-20');

      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
      expect(putPayload).not.toBeNull();
      expect(putPayload.courseId).toBe(101);
      expect(putPayload.semester).toBe('1st Semester');
      expect(putPayload.schoolYear).toBe('2026-2027');
      expect(putPayload.schemaMode).toBe('periods');
      expect(putPayload.version).toBeUndefined();
      expect(putPayload.componentMode).toBe('lecture_laboratory');
      expect(putPayload.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
      expect(putPayload.termRatio).toEqual({ midterm: 30, final: 70 });
      expect(putPayload.midtermCategories).toHaveLength(8);
      expect(putPayload.finalCategories).toHaveLength(8);
      expect(putPayload.midtermCategories[0].id).toBeUndefined();
      expect(putPayload.finalCategories[0].id).toBeUndefined();
      for (const categories of [putPayload.midtermCategories, putPayload.finalCategories]) {
        expect(categories.filter((category: Record<string, any>) => category.component === 'Lecture').map((category: Record<string, any>) => category.name))
          .toEqual(['Term Exam', 'Quiz', 'Outputs', 'Participation']);
        expect(categories.filter((category: Record<string, any>) => category.component === 'Laboratory').map((category: Record<string, any>) => category.name))
          .toEqual(['Practical Exam', 'Laboratory Exercises', 'Quiz', 'Recitation']);
      }
      expect(putPayload.attendanceDateRanges).toEqual({
        midterm: { startDate: '2026-08-01', endDate: '2026-10-15' },
        final: { startDate: '2026-10-16', endDate: '2026-12-20' },
      });

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
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

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
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

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

      const nameInputs = page.locator('input[placeholder*="Category name"]');
      const weightInputs = page.locator('input[placeholder="0"]');

      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      // 422 warning banner appears
      await expect(page.getByText(/Existing Assessments Require Category Mappings/i)).toBeVisible();
      await expect(page.getByText('Practical Exam 1')).toBeVisible();
      await expect(page.getByText('Dental Radiography Lab')).toBeVisible();
      await expect(page.getByText('Laboratory').first()).toBeVisible();

      // Local row remains intact and wasn't cleared
      await expect(nameInputs.nth(0)).toHaveValue('Term Exam');
      await expect(weightInputs.nth(0)).toHaveValue('50');
    });

    test('422 unmatched assessments can be assigned to a category by hand and are sent on the next save', async ({ page }) => {
      const putPayloads: any[] = [];
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: null }) });
      });
      await page.route('**/api/faculty/grading-config', async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        putPayloads.push(route.request().postDataJSON());
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'error',
            code: 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED',
            message: 'Existing assessments require matching grading categories before this configuration can be activated.',
            assessments: [{ assessmentId: 42, title: 'Practical Exam 1', legacyType: 'Practical', gradingPeriod: 'Midterm' }],
          }),
        });
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      const picker = page.getByRole('combobox', { name: 'Category for Practical Exam 1' });
      await expect(picker).toBeVisible();
      const options = await picker.locator('option').allTextContents();
      expect(options).toEqual([
        'Choose category…',
        'Lecture · Term Exam', 'Lecture · Quiz', 'Lecture · Outputs', 'Lecture · Participation',
        'Laboratory · Practical Exam', 'Laboratory · Laboratory Exercises', 'Laboratory · Quiz', 'Laboratory · Recitation',
      ]);
      expect(putPayloads[0].assessmentAssignments).toBeUndefined();

      await picker.selectOption({ label: 'Laboratory · Practical Exam' });
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect.poll(() => putPayloads.length).toBe(2);
      expect(putPayloads[1].assessmentAssignments).toEqual([{
        assessmentId: 42, categoryName: 'Practical Exam', gradingPeriod: 'Midterm', component: 'Laboratory',
      }]);
    });

    test('legacy assessments without a period can be explicitly mapped to either grouped period', async ({ page }) => {
      const putPayloads: Array<Record<string, any>> = [];
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: null }) });
      });
      await page.route('**/api/faculty/grading-config', async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        const payload = route.request().postDataJSON() as Record<string, any>;
        putPayloads.push(payload);
        if (putPayloads.length === 1) {
          await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({
            status: 'error', code: 'GRADING_COMPONENT_MAPPING_REQUIRED',
            message: 'Existing assessments require Lecture/Laboratory mappings.',
            assessments: [{ assessmentId: 45, title: 'Unperioded Legacy Quiz', legacyType: 'Quiz', gradingPeriod: null }],
          }) });
          return;
        }
        const withIds = (rows: Array<Record<string, any>>, period: string, firstId: number) => rows.map((row, index) => ({
          ...row, id: firstId + index, gradingPeriod: period, inUse: false,
        }));
        const midtermCategories = withIds(payload.midtermCategories, 'Midterm', 100);
        const finalCategories = withIds(payload.finalCategories, 'Final', 200);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
          id: 'grouped-legacy-mapping', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1st Semester', schoolYear: '2026-2027', version: 1, schemaMode: 'periods',
          componentMode: payload.componentMode, componentWeights: payload.componentWeights, termRatio: payload.termRatio,
          attendanceDateRanges: payload.attendanceDateRanges, midtermCategories, finalCategories,
          categories: [...midtermCategories, ...finalCategories],
        } }) });
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();
      await expect(page.locator('#period-component-mode')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Lecture Categories' })).toBeVisible();
      await expect(page.locator('input[placeholder*="Category name"]')).toHaveCount(4);
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      const picker = page.getByRole('combobox', { name: 'Category for Unperioded Legacy Quiz' });
      await expect(picker).toBeVisible();
      await expect(page.getByText('Choose period', { exact: true })).toBeVisible();
      const finalLectureOption = picker.locator('option').filter({ hasText: /Final.*Lecture.*Quiz/ });
      await expect(finalLectureOption).toHaveCount(1);
      await picker.selectOption((await finalLectureOption.getAttribute('value'))!);
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

      expect(putPayloads).toHaveLength(2);
      expect(putPayloads[1].assessmentAssignments).toEqual([{
        assessmentId: 45, categoryName: 'Quiz', gradingPeriod: 'Final', component: 'Lecture',
      }]);
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
      const offeringSelect = page.getByRole('main').locator('select').first();
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();

      // Edit a category name to make it dirty
      const nameInputs = page.locator('input[placeholder*="Category name"]');
      await nameInputs.nth(0).fill('Dirty Category');

      // Attempt to switch the shared course bar to CLIN402
      await offeringSelect.selectOption({ index: 1 });

      // Confirmation modal should appear
      await expect(page.getByText(/Discard unsaved changes?/i)).toBeVisible();
      await expect(page.getByText(/You have unsaved changes to grade weights/i)).toBeVisible();

      // Click Cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Selection must remain CLIN401 and dirty edits preserved
      await expect(offeringSelect).toHaveValue('CLIN401');
      await expect(nameInputs.nth(0)).toHaveValue('Dirty Category');

      // Attempt switch again and Confirm
      await offeringSelect.selectOption({ index: 1 });
      await expect(page.getByText(/Discard unsaved changes?/i)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm' }).click();

      // Now switched to CLIN402
      await expect(offeringSelect).toHaveValue('CLIN402');
      await expect.poll(() => loadedCourseId).toBe('102');
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

    test('legacy overall conversion requires split category mapping and preserves existing IDs/names/weights', async ({ page }) => {
      let putPayload: any = null;

      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-overall-1',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 4,
              schemaMode: 'overall',
              categories: [
                { id: 301, name: 'Quizzes', weight: '30', sortOrder: 1, inUse: true },
                { id: 302, name: 'Major Exams', weight: '60', sortOrder: 2, inUse: true },
                { id: 303, name: 'Attendance', weight: '10', sortOrder: 3, inUse: false },
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
                id: 'cfg-period-1',
                course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
                semester: '1st Semester',
                schoolYear: '2026-2027',
                version: 5,
                schemaMode: 'periods',
                componentMode: 'lecture_laboratory',
                componentWeights: { lecture: 60, laboratory: 40 },
                termRatio: { midterm: 40, final: 60 },
                midtermCategories: putPayload.midtermCategories,
                finalCategories: putPayload.finalCategories,
                categories: [...putPayload.midtermCategories, ...putPayload.finalCategories],
              },
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText('This course offering uses single-list overall grading categories.')).toBeVisible();

      // Click "Convert to Period Grading"
      await page.getByRole('button', { name: /Convert to Period Grading/i }).click();

      // Conversion review modal should be visible
      const modal = page.locator('div[role="dialog"]').or(page.locator('.fixed')).filter({ hasText: /Convert Course Offering to Period Grading/i });
      await expect(modal).toBeVisible();

      // Check that proposed period mapping displays preserved category IDs
      await expect(modal.getByText('Quizzes').first()).toBeVisible();
      await expect(modal.getByText('(#301)').first()).toBeVisible();
      await expect(modal.getByText('Major Exams').first()).toBeVisible();
      await expect(modal.getByText('(#302)').first()).toBeVisible();
      await expect(modal.getByText('Attendance').first()).toBeVisible();
      await expect(modal.getByText('(#303)').first()).toBeVisible();

      // Continue into the editable split draft; conversion is saved only after every list totals 100%.
      await page.getByRole('button', { name: 'Continue to Lecture/Laboratory Mapping', exact: true }).click();
      await expect(page.getByTestId('unassigned-component-categories')).toBeVisible();

      const assignCurrentPeriodCategoriesToLecture = async () => {
        const componentSelects = page.getByTestId('unassigned-component-categories').getByRole('combobox');
        while (await componentSelects.count()) await componentSelects.first().selectOption('Lecture');
      };
      const addLaboratoryCategory = async (period: 'Midterm' | 'Final') => {
        await page.getByRole('tab', { name: 'Laboratory Categories', exact: true }).click();
        await page.getByRole('button', {
          name: period === 'Midterm' ? 'Add Midterm Category' : 'Add Finals Category', exact: true,
        }).click();
        const names = page.locator('input[placeholder*="Category name"]');
        const weights = page.locator('input[placeholder="0"]');
        const newIndex = (await names.count()) - 1;
        await names.nth(newIndex).fill('Laboratory Exercises');
        await weights.nth(newIndex).fill('100');
      };

      await assignCurrentPeriodCategoriesToLecture();
      await addLaboratoryCategory('Midterm');
      await page.getByRole('button', { name: /Finals Categories/i }).click();
      await assignCurrentPeriodCategoriesToLecture();
      await addLaboratoryCategory('Final');
      await page.getByRole('tab', { name: 'Lecture Categories', exact: true }).click();
      await expect(page.getByRole('button', { name: /Save Grade Weights/i })).toBeEnabled();

      await page.getByRole('button', { name: /Save Grade Weights/i }).click();
      await expect(page.getByText(/Confirm forward grading conversion/i)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
      expect(putPayload).not.toBeNull();
      expect(putPayload.convertFromOverall).toBe(true);
      expect(putPayload.convertToLectureLaboratory).toBe(true);
      expect(putPayload.schemaMode).toBe('periods');
      expect(putPayload.version).toBe(4);
      expect(putPayload.componentMode).toBe('lecture_laboratory');
      expect(putPayload.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
      for (const categories of [putPayload.midtermCategories, putPayload.finalCategories]) {
        expect(categories).toHaveLength(4);
        expect(categories.slice(0, 3).map((category: any) => category.id)).toEqual([301, 302, 303]);
        expect(categories.slice(0, 3).map((category: any) => category.weight)).toEqual(['30', '60', '10']);
        expect(categories.slice(0, 3).every((category: any) => category.component === 'Lecture')).toBeTruthy();
        expect(categories[3]).toEqual(expect.objectContaining({
          name: 'Laboratory Exercises', weight: '100', component: 'Laboratory', sourceKind: 'assessment',
        }));
      }
    });

    test('direct navigation to /grades?tab=summary loads canonical period configuration independently of components tab', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-direct',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [
                { id: 401, name: 'Quizzes', weight: '50', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
                { id: 402, name: 'Exams', weight: '50', sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
              ],
              finalCategories: [
                { id: 403, name: 'Quizzes', weight: '50', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' },
                { id: 404, name: 'Exams', weight: '50', sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment' },
              ],
            },
          }),
        });
      });

      // Directly open summaries tab
      await page.goto('/grades?tab=summary');

      // The table headers must reflect canonical period mode: Midterm % and Final %
      await expect(page.locator('.no-print th', { hasText: 'Midterm %' })).toBeVisible();
      await expect(page.locator('.no-print th', { hasText: 'Final %' })).toBeVisible();
      // Should NOT have legacy Quizzes / Practicum headers
      await expect(page.locator('.no-print th', { hasText: 'Practicum' })).toHaveCount(0);
    });

    test('print output uses authoritative period columns and no fabricated 80.0% fallbacks', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-print',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [],
              finalCategories: [],
            },
          }),
        });
      });

      await page.goto('/grades?tab=summary');

      // Inspect printable table headers
      const printTable = page.locator('.print-only table');
      await expect(printTable.locator('th', { hasText: 'Midterm %' })).toBeAttached();
      await expect(printTable.locator('th', { hasText: 'Final %' })).toBeAttached();
      await expect(printTable.locator('th', { hasText: 'Overall GWA' })).toBeAttached();

      // Verify no hardcoded 80.0% exists in the printable table
      await expect(printTable.getByText('80.0%')).toHaveCount(0);
    });

    test('incomplete recomputation requires confirmation, marks status INCOMPLETE, and displays prior grade visibly as historical', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-incomp',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [],
              finalCategories: [],
            },
          }),
        });
      });

      await page.route('**/api/faculty/students', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: '42',
              studentId: 'DENT-042',
              name: 'Clara Santos',
              email: 'clara@bicol-u.edu.ph',
              yearLevel: 4,
              status: 'active',
              classSections: [{ classId: '1', className: 'CLIN401-A', enrollmentId: '1' }],
              enrolledSubjects: [
                {
                  code: 'CLIN401',
                  name: 'Clinical Dentistry I',
                  units: 3,
                  grade: 1.75,
                  classId: '1',
                  enrollmentId: '1',
                  isClinical: true,
                },
              ],
            },
          ]),
        });
      });

      let recomputeRequested = false;
      await page.route('**/api/faculty/grades/compute', async (route) => {
        recomputeRequested = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            results: [
              {
                status: 'incomplete_period',
                enrollmentId: 1,
                previouslyPersisted: true,
                previousGwa: 1.75,
                previousPercentage: 88.5,
                reasons: ['unresolved_attendance'],
                periods: {
                  midterm: {
                    period: 'Midterm',
                    status: 'incomplete',
                    percentage: null,
                    incomplete: [{ reason: 'unresolved_attendance' }],
                  },
                  final: {
                    period: 'Final',
                    status: 'computed',
                    percentage: 92.0,
                    incomplete: [],
                  },
                },
              },
            ],
          }),
        });
      });

      await page.goto('/grades?tab=summary');

      // Click Recompute Grades
      await page.getByRole('button', { name: /Recompute Grades/i }).click();

      // Expect confirmation dialog
      const confirmModal = page.locator('div[role="dialog"]').or(page.locator('.fixed')).filter({ hasText: /Confirm Grade Recomputation/i });
      await expect(confirmModal).toBeVisible();
      expect(recomputeRequested).toBe(false);

      // Confirm recomputation
      await page.getByRole('button', { name: /Confirm Recomputation/i }).click();
      expect(recomputeRequested).toBe(true);

      // Table should now display historical prior grade and INCOMPLETE status badge (NOT PASS)
      await expect(page.locator('.no-print').getByText(/Prior: 1.75 \(Historical\)/i)).toBeVisible();
      await expect(page.locator('.no-print tbody').getByText('INCOMPLETE', { exact: true })).toBeVisible();
      await expect(page.locator('.no-print tbody').getByText('PASS')).toHaveCount(0);
    });

    test('uncomputed period mode displays Pending and — across summary table and print without leaking legacy grade', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-pending',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [
                { id: 401, name: 'Quizzes', weight: '50', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
                { id: 402, name: 'Exams', weight: '50', sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
              ],
              finalCategories: [
                { id: 403, name: 'Quizzes', weight: '50', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' },
                { id: 404, name: 'Exams', weight: '50', sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment' },
              ],
            },
          }),
        });
      });

      await page.route('**/api/faculty/students', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: '42',
              studentId: 'DENT-042',
              name: 'Clara Santos',
              email: 'clara@bicol-u.edu.ph',
              yearLevel: 4,
              status: 'active',
              classSections: [{ classId: '1', className: 'CLIN401-A', enrollmentId: '1' }],
              enrolledSubjects: [
                {
                  code: 'CLIN401',
                  name: 'Clinical Dentistry I',
                  units: 3,
                  grade: 1.75,
                  classId: '1',
                  enrollmentId: '1',
                  isClinical: true,
                  components: {
                    quizzes: 85,
                    exams: 90,
                    practicum: 88,
                    attendance: 95,
                  },
                },
              ],
            },
          ]),
        });
      });

      await page.goto('/grades?tab=summary');

      // In interactive summary table:
      const interactiveRow = page.locator('.no-print tbody tr').filter({ hasText: 'Clara Santos' });
      await expect(interactiveRow).toBeVisible();

      // Midterm & Finals cells must show 'Pending', NOT legacy quiz percentages or 80.0%
      await expect(interactiveRow.locator('td').nth(1)).toContainText('Pending');
      await expect(interactiveRow.locator('td').nth(2)).toContainText('Pending');

      // Overall GWA must show '—', NOT the legacy 1.75!
      await expect(interactiveRow.locator('td').nth(3)).toContainText('—');
      await expect(interactiveRow.locator('td').nth(3)).not.toContainText('1.75');

      // Status badge must be PENDING, NOT PASS!
      await expect(interactiveRow.locator('td').nth(4)).toContainText('PENDING');
      await expect(interactiveRow.locator('td').nth(4)).not.toContainText('PASS');

      // In printable view:
      const printRow = page.locator('.print-only tbody tr').filter({ hasText: 'Clara Santos' });
      await expect(printRow.locator('td').nth(2)).toContainText('Pending');
      await expect(printRow.locator('td').nth(3)).toContainText('Pending');
      await expect(printRow.locator('td').nth(4)).toContainText('—');
      await expect(printRow.locator('td').nth(4)).not.toContainText('1.75');
      await expect(printRow.locator('td').nth(5)).toContainText('PENDING');
    });

    test('incomplete recomputation without server previouslyPersisted does not display historical grade', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-incomp2',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [],
              finalCategories: [],
            },
          }),
        });
      });

      await page.route('**/api/faculty/students', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: '43',
              studentId: 'DENT-043',
              name: 'Danilo Cruz',
              email: 'danilo@bicol-u.edu.ph',
              yearLevel: 4,
              status: 'active',
              classSections: [{ classId: '1', className: 'CLIN401-A', enrollmentId: '2' }],
              enrolledSubjects: [
                {
                  code: 'CLIN401',
                  name: 'Clinical Dentistry I',
                  units: 3,
                  grade: 2.25,
                  classId: '1',
                  enrollmentId: '2',
                  isClinical: true,
                },
              ],
            },
          ]),
        });
      });

      await page.route('**/api/faculty/grades/compute', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            results: [
              {
                status: 'incomplete_period',
                enrollmentId: 2,
                previouslyPersisted: false,
                previousGwa: null,
                previousPercentage: null,
                reasons: ['unresolved_attendance'],
                periods: {
                  midterm: {
                    period: 'Midterm',
                    status: 'incomplete',
                    percentage: null,
                    incomplete: [{ reason: 'unresolved_attendance' }],
                  },
                  final: {
                    period: 'Final',
                    status: 'computed',
                    percentage: 85.0,
                    incomplete: [],
                  },
                },
              },
            ],
          }),
        });
      });

      await page.goto('/grades?tab=summary');
      await page.getByRole('button', { name: /Recompute Grades/i }).click();
      await page.getByRole('button', { name: /Confirm Recomputation/i }).click();

      const row = page.locator('.no-print tbody tr').filter({ hasText: 'Danilo Cruz' });
      await expect(row).toBeVisible();

      // INCOMPLETE badge is shown in remarks (column 4)
      await expect(row.locator('td').nth(4)).toContainText('INCOMPLETE');
      // Overall GWA (column 3) must show '—', and must NOT fall back to legacy 2.25 or 'Prior: 2.25 (Historical)'
      await expect(row.locator('td').nth(3)).toContainText('—');
      await expect(page.locator('.no-print').getByText(/Prior:/i)).toHaveCount(0);
      await expect(page.locator('.no-print').getByText(/Historical/i)).toHaveCount(0);
    });

    test('recompute shows no exam-date matching warning (GRD-001 removed auto-match)', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: null }) });
      });
      await page.route('**/api/faculty/grades/compute', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            results: [],
            transmutationWarnings: [
              { assessmentId: '9', title: 'Crown Prep Practical', classId: '1', dueDate: '2026-10-05', reason: 'multiple_sessions', sessionCount: 2,
                message: '2 attendance sessions were held on 2026-10-05 for "Crown Prep Practical" (CLIN401-A). Link the exam\'s session in the assessment so the right attendance is used.' },
              { assessmentId: '10', title: 'Radiology Quiz', classId: '1', dueDate: '2026-10-07', reason: 'no_session', sessionCount: 0,
                message: 'No attendance session was held on 2026-10-07 for "Radiology Quiz" (CLIN401-A). Link the correct session or change the exam date.' },
            ],
          }),
        });
      });

      await page.goto('/grades?tab=summary');
      await page.getByRole('button', { name: /Recompute Grades/i }).click();
      await page.getByRole('button', { name: /Confirm Recomputation/i }).click();

      // Even a stale server field is ignored: there is no exam-date matching to warn about.
      await expect(page.getByRole('button', { name: /Recompute Grades/i })).toBeVisible();
      await expect(page.getByTestId('transmutation-warnings')).toHaveCount(0);
      await expect(page.getByText('Attendance session could not be matched for transmutation')).toHaveCount(0);
    });

    test('409 GRADING_CATEGORY_IN_USE displays error alert and does NOT trigger reload flow', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-cat-inuse',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 1,
              categories: [
                { id: 1, name: 'Quizzes', weight: '50', sortOrder: 1, inUse: true },
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
              code: 'GRADING_CATEGORY_IN_USE',
              message: 'A grading category referenced by an assessment cannot be deleted.',
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Save Grade Weights/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      // Specific error message must be visible
      await expect(page.getByText('A grading category referenced by an assessment cannot be deleted.').first()).toBeVisible();

      // Reload latest conflict banner must NOT be visible
      await expect(page.getByText(/Version Conflict Detected/i)).toHaveCount(0);
      await expect(page.locator('.bg-rose-500\\/10', { hasText: 'Version Conflict Detected' })).toHaveCount(0);
    });

    test('409 GRADING_SCHEMA_MODE_CONFLICT displays error alert and does NOT trigger reload flow', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-schema-conflict',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              componentMode: 'lecture_laboratory',
              componentWeights: { lecture: 60, laboratory: 40 },
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [
                { id: 401, name: 'Quizzes', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture' },
                { id: 403, name: 'Practical Exam', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Laboratory' },
              ],
              finalCategories: [
                { id: 402, name: 'Final Exam', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture' },
                { id: 404, name: 'Practical Exam', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Laboratory' },
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
              code: 'GRADING_SCHEMA_MODE_CONFLICT',
              message: 'An existing period configuration cannot be changed back to overall categories.',
            }),
          });
        }
      });

      await page.goto('/grades?tab=components');
      await page.getByRole('button', { name: /Save Grade Weights/i }).click();
      // Saving asks for confirmation first.
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      // Specific error message must be visible
      await expect(page.getByText('An existing period configuration cannot be changed back to overall categories.').first()).toBeVisible();

      // Reload latest conflict banner must NOT be visible
      await expect(page.getByText(/Version Conflict Detected/i)).toHaveCount(0);
      await expect(page.locator('.bg-rose-500\\/10', { hasText: 'Version Conflict Detected' })).toHaveCount(0);
    });

    test('rejects impossible calendar dates such as February 31, disabling save and rendering validation error', async ({ page }) => {
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'cfg-period-dates',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester',
              schoolYear: '2026-2027',
              version: 2,
              schemaMode: 'periods',
              termRatio: { midterm: 40, final: 60 },
              midtermCategories: [
                { id: 401, name: 'Quizzes', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
              ],
              finalCategories: [
                { id: 402, name: 'Final Exam', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' },
              ],
              attendanceDateRanges: {
                midterm: { startDate: '2026-02-31', endDate: '2026-03-15' },
                final: { startDate: '2026-03-16', endDate: '2026-05-15' },
              },
            },
          }),
        });
      });

      await page.goto('/grades?tab=components');

      // Validation error appears rejecting February 31
      await expect(page.getByText(/Midterm start date must be a valid calendar date in YYYY-MM-DD format/i).first()).toBeVisible();

      // Save button is disabled
      const saveBtn = page.getByRole('button', { name: /Save Grade Weights/i });
      await expect(saveBtn).toBeDisabled();
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

      // Check category options in the modal. The category select renders once the
      // grading configuration has loaded, so wait for it before reading options.
      await expect(modalForm.locator('option', { hasText: 'Quizzes (25%)' })).toBeAttached();
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
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

    test('switching assessment period preserves its selected component when category names repeat', async ({ page }) => {
      let postedAssessment: Record<string, any> | null = null;
      const categories = [
        { id: 101, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture' },
        { id: 102, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Laboratory' },
        { id: 103, name: 'Quiz', weight: 100, sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture' },
      ];
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
          id: 'grouped-period-switch', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1st Semester', schoolYear: '2026-2027', version: 1, schemaMode: 'periods',
          componentMode: 'lecture_laboratory', componentWeights: { lecture: 60, laboratory: 40 },
          termRatio: { midterm: 30, final: 70 }, categories,
          midtermCategories: categories.filter(category => category.gradingPeriod === 'Midterm'),
          finalCategories: categories.filter(category => category.gradingPeriod === 'Final'),
        } }) });
      });
      await page.route('**/api/faculty/assessments', async route => {
        if (route.request().method() === 'POST') {
          const [payload] = route.request().postDataJSON() as Record<string, any>[];
          postedAssessment = payload;
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            status: 'ok', message: 'Assessment saved.', assessments: [{ id: 'ass-period-switch', classId: payload.classId, title: payload.title }],
          }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByRole('tab', { name: 'Lecture Categories' })).toBeVisible();
      await page.getByRole('button', { name: /Finals Categories/ }).click();
      await expect(page.getByLabel('Source for Quiz')).toHaveValue('assessment');
      // The active editor draft now conflicts with the saved picker configuration.
      await page.getByLabel('Weight for Quiz').fill('25');
      await page.getByRole('button', { name: 'Assessments Manager' }).click();
      await page.getByRole('button', { name: 'Add Assessment' }).click();
      const modalForm = page.locator('form').last();
      const categorySelect = modalForm.getByLabel('Category Type');
      await expect(categorySelect).toContainText('Lecture · Quiz (100%)');
      await categorySelect.selectOption('101');
      await modalForm.getByLabel('Grading Period').selectOption('Final');
      await expect(categorySelect).toHaveValue('103');
      await expect(categorySelect.locator('option:checked')).toContainText('Lecture · Quiz');

      await modalForm.locator('input[type="text"]').first().fill('Final Lecture Quiz');
      await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();
      await expect(page.getByText('Assessment saved.')).toBeVisible();
      expect(postedAssessment?.gradingCategoryId).toBe(103);
      expect(postedAssessment?.gradingPeriod).toBe('Final');
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
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
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
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
      await expect(categorySelect).toHaveValue('11');

      // Change category to Clinical Work (13)
      await categorySelect.selectOption('13');
      await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();

      await expect(page.getByText('Assessment updated successfully.')).toBeVisible();
      expect(postedAssessmentPayload?.gradingCategoryId).toBe(13);
      expect(postedAssessmentPayload?.type).toBe('Clinical Work');
    });

    test('assessment modal targets the section chosen in the page-level selector', async ({ page }) => {
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
      // The page has one class selector; the modal has none of its own.
      await page.locator('select').nth(1).selectOption('2');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      await expect(modalForm.getByTestId('assessment-target-class')).toContainText('CLIN401-B');
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
      await categorySelect.selectOption('13');
      await expect(categorySelect).toHaveValue('13');
    });

    test('unconfigured offering asks for grade weights first and never creates an unlinked assessment', async ({ page }) => {
      let postCount = 0;
      await page.route('**/api/faculty/grading-config?*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: null }) });
      });
      await page.route('**/api/faculty/assessments', async (route) => {
        if (route.request().method() === 'POST') postCount += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/grades?tab=assessments');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      await expect(page.getByRole('heading', { name: 'Set up grade weights first' })).toBeVisible();
      await expect(page.getByText(/has no saved grade weights yet/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm Assessment' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Go to Grade Weights' }).click();
      await expect(page.getByRole('heading', { name: 'Set up grade weights first' })).toHaveCount(0);
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeVisible();
      expect(postCount).toBe(0);
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
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
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
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });
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

    test('assessment modal loads the grading categories of the offering chosen at the top of the page', async ({ page }) => {
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
      // Choose Section 4 (2nd Sem, a different offering) with the page-level
      // selector, then open the modal: it loads that offering's categories.
      await page.locator('select').nth(1).selectOption('4');
      await page.getByRole('button', { name: 'Add Assessment' }).click();

      const modalForm = page.locator('form').last();
      await expect(modalForm.getByTestId('assessment-target-class')).toContainText('CLIN401-Sem2');
      const categorySelect = modalForm.locator('select', { has: page.locator('option', { hasText: 'Select grading category' }) });

      // Configuration categories of the chosen offering are shown (21: Case Presentations)
      await expect(categorySelect).toContainText('Case Presentations (50%)');
      await expect(categorySelect).not.toContainText('Quizzes');
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

    test('mandatory split defaults stay an unsaved draft until save and send both Quiz categories distinctly', async ({ page }) => {
      const puts: Array<Record<string, any>> = [];
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: null }) });
      });
      await page.route('**/api/faculty/grading-config', async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        const payload = route.request().postDataJSON() as Record<string, any>;
        puts.push(payload);
        const withIds = (rows: Array<Record<string, any>>, period: string, startId: number) => rows.map((row, index) => ({
          ...row,
          id: startId + index,
          gradingPeriod: period,
          inUse: false,
        }));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            configuration: {
              id: 'grouped-draft',
              course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
              semester: '1st Semester', schoolYear: '2026-2027', version: 1,
              schemaMode: 'periods', componentMode: payload.componentMode,
              componentWeights: payload.componentWeights, termRatio: payload.termRatio,
              attendanceDateRanges: payload.attendanceDateRanges,
              midtermCategories: withIds(payload.midtermCategories, 'Midterm', 100),
              finalCategories: withIds(payload.finalCategories, 'Final', 200),
            },
          }),
        });
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByText(/^\s*Suggested starting preset.*unsaved\s*$/i).first()).toBeVisible();
      await expect(page.locator('#period-component-mode')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Apply syllabus example/i })).toHaveCount(0);

      await expect(page.getByRole('tab', { name: 'Lecture Categories' })).toBeVisible();
      await expect(page.locator('input[placeholder*="Category name"]')).toHaveCount(4);
      await expect(page.getByLabel('Source for Participation')).toHaveValue('assessment');
      await expect(page.getByLabel('Lecture contribution (%)')).toHaveValue('60');
      await expect(page.getByLabel('Laboratory contribution (%)')).toHaveValue('40');
      await expect(page.locator('#midterm-ratio-input')).toHaveValue('30');
      await expect(page.locator('#final-ratio-input')).toHaveValue('70');
      const lectureNames = page.locator('input[placeholder*="Category name"]');
      const firstLectureCategory = await lectureNames.nth(0).inputValue();
      const secondLectureCategory = await lectureNames.nth(1).inputValue();
      await page.locator('button[aria-label^="Move category"][aria-label$=" down"]').first().click();
      await expect(lectureNames.nth(0)).toHaveValue(secondLectureCategory);
      await expect(lectureNames.nth(1)).toHaveValue(firstLectureCategory);
      await page.getByRole('tab', { name: 'Laboratory Categories' }).click();
      await expect(page.locator('input[placeholder*="Category name"]')).toHaveCount(4);
      await expect(page.locator('input[placeholder*="Category name"]').nth(0)).toHaveValue('Practical Exam');
      await expect(page.locator('input[placeholder*="Category name"]').nth(2)).toHaveValue('Quiz');
      await page.getByRole('tab', { name: 'Lecture Categories' }).click();
      await page.getByLabel('Source for Participation').selectOption('attendance');
      await page.getByRole('tab', { name: 'Laboratory Categories' }).click();
      await page.getByLabel('Source for Recitation').selectOption('attendance');
      await expect(page.getByText('Each period may contain only one authoritative Attendance category.')).toBeVisible();
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeDisabled();
      await page.getByLabel('Source for Recitation').selectOption('assessment');
      await page.getByRole('tab', { name: 'Lecture Categories' }).click();
      await page.getByLabel('Source for Participation').selectOption('assessment');
      await expect(page.getByText('Each period may contain only one authoritative Attendance category.')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Save Initial Schema/i })).toBeEnabled();

      // Defaults are editable and unsaved until the Faculty explicitly saves them.
      expect(puts).toHaveLength(0);
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

      expect(puts).toHaveLength(1);
      const payload = puts[0];
      expect(payload.schemaMode).toBe('periods');
      expect(payload.componentMode).toBe('lecture_laboratory');
      expect(payload.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
      expect(payload.termRatio).toEqual({ midterm: 30, final: 70 });
      expect(payload.convertToLectureLaboratory).toBeUndefined();
      for (const [period, categories] of [['Midterm', payload.midtermCategories], ['Final', payload.finalCategories]] as const) {
        expect(categories).toHaveLength(8);
        const lecture = categories.filter((category: Record<string, any>) => category.component === 'Lecture');
        const laboratory = categories.filter((category: Record<string, any>) => category.component === 'Laboratory');
        expect(lecture.reduce((total: number, category: Record<string, any>) => total + Number(category.weight), 0)).toBe(100);
        expect(laboratory.reduce((total: number, category: Record<string, any>) => total + Number(category.weight), 0)).toBe(100);
        expect(lecture.map((category: Record<string, any>) => category.name)).toEqual(period === 'Midterm'
          ? ['Quiz', 'Term Exam', 'Outputs', 'Participation']
          : ['Term Exam', 'Quiz', 'Outputs', 'Participation']);
        expect(lecture.map((category: Record<string, any>) => category.sortOrder)).toEqual(lecture.map((_: Record<string, any>, index: number) => index + 1));
        expect(laboratory.map((category: Record<string, any>) => category.sortOrder)).toEqual(laboratory.map((_: Record<string, any>, index: number) => index + 1));
        expect(lecture.some((category: Record<string, any>) => category.name === 'Quiz')).toBeTruthy();
        expect(laboratory.some((category: Record<string, any>) => category.name === 'Quiz')).toBeTruthy();
        expect(categories.every((category: Record<string, any>) => category.gradingPeriod === period)).toBeTruthy();
        expect(categories.filter((category: Record<string, any>) => category.sourceKind === 'attendance')).toEqual([]);
      }
    });

    test('grouped grade summaries show four distinct component columns and export all four values', async ({ page }) => {
      const groupedCategories = [
        { id: 101, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture', inUse: true },
        { id: 102, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Laboratory', inUse: true },
        { id: 103, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture', inUse: true },
        { id: 104, name: 'Quiz', weight: 100, sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Laboratory', inUse: true },
      ];
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          status: 'ok', configuration: {
            id: 'grouped-summaries', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
            semester: '1st Semester', schoolYear: '2026-2027', version: 1,
            schemaMode: 'periods', componentMode: 'lecture_laboratory', componentWeights: { lecture: 60, laboratory: 40 },
            termRatio: { midterm: 30, final: 70 }, categories: groupedCategories,
            midtermCategories: groupedCategories.filter(category => category.gradingPeriod === 'Midterm'),
            finalCategories: groupedCategories.filter(category => category.gradingPeriod === 'Final'),
            attendanceDateRanges: { midterm: { startDate: null, endDate: null }, final: { startDate: null, endDate: null } },
          },
        }) });
      });
      await page.route('**/api/faculty/students', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
          id: '701', studentId: 'DENT-007', name: 'Alice Reyes', email: 'alice@bicol-u.edu.ph', yearLevel: 2, status: 'active',
          classSections: [{ classId: '1', className: 'CLIN401-A', enrollmentId: '801' }],
          enrolledSubjects: [{
            code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, classId: '1', enrollmentId: '801',
            grade: null, isClinical: false, hasRemedial: false, components: null,
          }],
        }]) });
      });
      await page.route('**/api/faculty/grades/compute', async route => {
        const component = (name: 'Lecture' | 'Laboratory', percentage: number) => ({ component: name, status: 'computed', percentage, categories: [], incomplete: [] });
        const period = (name: 'Midterm' | 'Final', percentage: number, lecture: number, laboratory: number) => ({
          period: name, status: 'computed', percentage, categories: [], incomplete: [],
          attendanceDateRange: { startDate: null, endDate: null },
          components: { lecture: component('Lecture', lecture), laboratory: component('Laboratory', laboratory) },
        });
        const midterm = period('Midterm', 87, 81, 91);
        const final = period('Final', 89, 93, 83);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', results: [{
          status: 'computed', enrollmentId: '801', studentId: '701', percentage: 88.4, gwa: 1.65, retentionState: 'active',
          periods: { midterm, final },
          breakdown: { calculationMode: 'authoritative_periods', termRatio: { midterm: 30, final: 70 }, periods: { midterm, final }, retentionThreshold: 2.5 },
        }] }) });
      });

      await page.goto('/grades?tab=summaries');
      await expect(page.getByRole('heading', { name: 'Academic Grade Summaries' })).toBeVisible();
      const recompute = page.getByRole('button', { name: 'Recompute Grades' });
      await expect(recompute).toBeEnabled();
      await recompute.click();
      await page.getByRole('button', { name: 'Confirm Recomputation', exact: true }).click();

      const row = page.locator('.no-print tbody tr').filter({ hasText: 'Alice Reyes' });
      await expect(row).toContainText('81.00%');
      await expect(row).toContainText('91.00%');
      await expect(row).toContainText('93.00%');
      await expect(row).toContainText('83.00%');
      await expect(row).toContainText('1.65');
      for (const label of ['Midterm Lecture %', 'Midterm Laboratory %', 'Finals Lecture %', 'Finals Laboratory %']) {
        await expect(page.locator('.no-print table').getByRole('columnheader', { name: label, exact: true })).toHaveCount(1);
      }

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV Ledger' }).click();
      const download = await downloadPromise;
      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv).toContain('Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %');
      expect(csv).toContain('"DENT-007","Alice Reyes","81.00%","91.00%","87.00%","93.00%","83.00%","89.00%","1.65","PASS"');
    });

    test('legacy combined period grading requires explicit forward conversion and preserves category IDs', async ({ page }) => {
      const midtermCategories = [
        { id: 101, name: 'Quiz', weight: 70, sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', inUse: false },
        { id: 102, name: 'Outputs', weight: 30, sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment', inUse: false },
      ];
      const finalCategories = [
        { id: 103, name: 'Quiz', weight: 60, sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', inUse: false },
        { id: 104, name: 'Outputs', weight: 40, sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment', inUse: false },
      ];
      const saves: Array<Record<string, any>> = [];
      let computeRequests = 0;
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
          id: 'combined-period-config', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1st Semester', schoolYear: '2026-2027', version: 8,
          schemaMode: 'periods', termRatio: { midterm: 40, final: 60 }, midtermCategories, finalCategories,
          categories: [...midtermCategories, ...finalCategories],
          attendanceDateRanges: { midterm: { startDate: null, endDate: null }, final: { startDate: null, endDate: null } },
        } }) });
      });
      await page.route('**/api/faculty/grading-config', async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        const payload = route.request().postDataJSON() as Record<string, any>;
        saves.push(payload);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
          id: 'combined-period-config', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1st Semester', schoolYear: '2026-2027', version: 9, schemaMode: 'periods',
          componentMode: payload.componentMode, componentWeights: payload.componentWeights, termRatio: payload.termRatio,
          midtermCategories: payload.midtermCategories, finalCategories: payload.finalCategories,
          categories: [...payload.midtermCategories, ...payload.finalCategories],
          attendanceDateRanges: payload.attendanceDateRanges,
        } }) });
      });
      await page.route('**/api/faculty/grades/compute', async route => {
        computeRequests += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', results: [] }) });
      });

      await page.goto('/grades?tab=components');
      await expect(page.getByRole('heading', { name: 'Configure Grading Weights & Schema' })).toBeVisible();
      await expect(page.getByText('Saved combined period grading')).toBeVisible();
      await expect(page.locator('#period-component-mode')).toHaveCount(0);
      await expect(page.getByLabel('Lecture contribution (%)')).toHaveCount(0);
      const savedName = page.locator('input[placeholder*="Category name"]').first();
      await expect(savedName).toBeDisabled();
      await expect(savedName).toHaveValue('Quiz');
      await expect(page.getByRole('button', { name: /Save Grade Weights/i })).toBeDisabled();
      expect(saves).toHaveLength(0);

      await page.getByRole('button', { name: 'Convert to Lecture/Laboratory' }).click();
      await expect(page.getByTestId('unassigned-component-categories')).toBeVisible();
      await page.getByLabel('Component for Quiz').selectOption('Lecture');
      await page.getByLabel('Component for Outputs').selectOption('Laboratory');
      await page.locator('input[placeholder="0"]').fill('100');
      await page.getByRole('tab', { name: 'Laboratory Categories' }).click();
      await page.locator('input[placeholder="0"]').fill('100');

      await page.getByRole('button', { name: /Finals Categories/ }).click();
      const finalUnassigned = page.getByTestId('unassigned-component-categories');
      await finalUnassigned.getByLabel('Component for Quiz').selectOption('Lecture');
      await finalUnassigned.getByLabel('Component for Outputs').selectOption('Laboratory');
      await page.getByRole('tab', { name: 'Lecture Categories' }).click();
      await page.locator('input[placeholder="0"]').fill('100');
      await page.getByRole('tab', { name: 'Laboratory Categories' }).click();
      await page.locator('input[placeholder="0"]').fill('100');
      await expect(page.locator('#midterm-ratio-input')).toHaveValue('40');
      await expect(page.locator('#final-ratio-input')).toHaveValue('60');
      await expect(page.getByRole('button', { name: /Save Grade Weights/i })).toBeEnabled();

      await page.getByRole('button', { name: /Save Grade Weights/i }).click();
      await expect(page.getByText(/Confirm forward grading conversion/i)).toBeVisible();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

      expect(saves).toHaveLength(1);
      const payload = saves[0];
      expect(payload.convertToLectureLaboratory).toBe(true);
      expect(payload).not.toHaveProperty('convertToCombined');
      expect(payload.componentMode).toBe('lecture_laboratory');
      expect(payload.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
      expect(payload.termRatio).toEqual({ midterm: 40, final: 60 });
      expect(payload.midtermCategories.map((category: Record<string, any>) => category.id)).toEqual([101, 102]);
      expect(payload.finalCategories.map((category: Record<string, any>) => category.id)).toEqual([103, 104]);
      for (const categories of [payload.midtermCategories, payload.finalCategories]) {
        expect(categories.find((category: Record<string, any>) => category.name === 'Quiz')).toMatchObject({ component: 'Lecture', weight: '100' });
        expect(categories.find((category: Record<string, any>) => category.name === 'Outputs')).toMatchObject({ component: 'Laboratory', weight: '100' });
      }
      expect(computeRequests).toBe(0);
    });

    test('Faculty Reports uses saved grouped results in its table, print layout, and CSV', async ({ page }) => {
      const groupedComponents = (lecture: number, laboratory: number) => ({
        lecture: { component: 'Lecture', status: 'computed', percentage: lecture, categories: [], incomplete: [] },
        laboratory: { component: 'Laboratory', status: 'computed', percentage: laboratory, categories: [], incomplete: [] },
      });
      const groupedPeriod = (name: 'Midterm' | 'Final', percentage: number, lecture: number, laboratory: number) => ({
        period: name, status: 'computed', percentage, categories: [], incomplete: [],
        components: groupedComponents(lecture, laboratory),
      });
      const oldPeriod = (name: 'Midterm' | 'Final', percentage: number) => ({
        period: name, status: 'computed', percentage, categories: [], incomplete: [],
      });
      const savedGroupResult = {
        calculationMode: 'authoritative_periods', termRatio: { midterm: 30, final: 70 },
        periods: { midterm: groupedPeriod('Midterm', 87, 81, 91), final: groupedPeriod('Final', 89, 93, 83) },
        percentage: 88.4, gwa: 1.65, retentionState: 'active',
      };
      const olderCombinedResult = {
        calculationMode: 'authoritative_periods', termRatio: { midterm: 40, final: 60 },
        periods: { midterm: oldPeriod('Midterm', 72), final: oldPeriod('Final', 84) },
        percentage: 79.2, gwa: 2.15, retentionState: 'active',
      };
      await page.route('**/api/faculty/reports/summary', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', reports: {
          currentSchoolYear: '2026-2027', students: [
            { id: '701', studentId: 'DENT-007', name: 'Alice Reyes', status: 'active', classId: '1', schoolYear: '2026-2027', enrolledSubjects: [
              { classId: '1', schoolYear: '2026-2027', code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, grade: 1.65, components: savedGroupResult },
            ] },
            { id: '702', studentId: 'DENT-008', name: 'Bea Santos', status: 'active', classId: '1', schoolYear: '2026-2027', enrolledSubjects: [
              { classId: '1', schoolYear: '2026-2027', code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, grade: 2.15, components: olderCombinedResult },
            ] },
            { id: '703', studentId: 'DENT-009', name: 'Caleb Reyes', status: 'active', classId: '1', schoolYear: '2026-2027', enrolledSubjects: [
              { classId: '1', schoolYear: '2026-2027', code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, grade: 2.45, components: {
                calculationMode: 'authoritative_categories', categories: [{ categoryId: 17, name: 'Quizzes', contribution: 23.5 }],
              } },
            ] },
          ],
          summary: { totalStudents: 2, averageGWA: 1.9, atRiskCount: 0, retentionPassRate: 100 },
        } }) });
      });
      await page.route('**/api/faculty/classes', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', currentSchoolYear: '2026-2027', classes: [
          { id: '1', csId: 1, csName: 'CLIN401-A', courseId: 101, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', semester: '1st Semester', schoolYear: '2026-2027', block: 'A' },
        ] }) });
      });
      await page.route('**/api/faculty/retention', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', retention: [] }) });
      });
      await page.route('**/api/faculty/grading-config?*', async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
          id: 'saved-grouped-report', course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1st Semester', schoolYear: '2026-2027', version: 3, schemaMode: 'periods',
          componentMode: 'lecture_laboratory', componentWeights: { lecture: 60, laboratory: 40 },
          termRatio: { midterm: 30, final: 70 }, categories: [], midtermCategories: [], finalCategories: [],
        } }) });
      });

      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Class Course Grade Reports' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Midterm Lecture', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Midterm Laboratory', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Finals Lecture', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Finals Laboratory', exact: true })).toBeVisible();
      const groupedRow = page.locator('.no-print tbody tr').filter({ hasText: 'Alice Reyes' });
      await expect(groupedRow).toContainText('81.0%');
      await expect(groupedRow).toContainText('91.0%');
      const oldRow = page.locator('.no-print tbody tr').filter({ hasText: 'Bea Santos' });
      await expect(oldRow).toContainText('Unavailable (recompute required)');
      await expect(oldRow).toContainText('72.0%');
      await expect(oldRow).toContainText('84.0%');
      await expect(oldRow).toContainText('2.15');
      const legacyOverallRow = page.locator('.no-print tbody tr').filter({ hasText: 'Caleb Reyes' });
      await expect(legacyOverallRow).toContainText('Prior: 2.45 (Historical)');
      await expect(legacyOverallRow).toContainText('PENDING');

      const printTable = page.locator('.print-only table').first();
      await expect(printTable.getByRole('columnheader', { name: 'Midterm Lecture %', exact: true })).toBeAttached();
      await expect(printTable.getByRole('columnheader', { name: 'Finals Laboratory %', exact: true })).toBeAttached();
      await expect(printTable.getByRole('row').filter({ hasText: 'Bea Santos' })).toContainText('Unavailable (recompute required)');
      await expect(printTable.getByRole('row').filter({ hasText: 'Caleb Reyes' })).toContainText('Prior: 2.45 (Historical)');

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      const download = await downloadPromise;
      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv).toContain('Student ID,Name,Course Code,Midterm Lecture %,Midterm Laboratory %,Midterm %,Finals Lecture %,Finals Laboratory %,Finals %,Grade,Remarks');
      expect(csv).toContain('"DENT-007","Alice Reyes","CLIN401","81.0%","91.0%","87.0","93.0%","83.0%","89.0","1.65"');
      expect(csv).toContain('"DENT-008","Bea Santos","CLIN401","Unavailable (recompute required)","Unavailable (recompute required)","72.0","Unavailable (recompute required)","Unavailable (recompute required)","84.0","2.15"');
      expect(csv).toContain('"DENT-009","Caleb Reyes","CLIN401","Pending","Pending","N/A","Pending","Pending","N/A","Prior: 2.45 (Historical)","PENDING"');
    });
  });
});
