import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const course = {
  enrollmentId: '41', classId: '7', className: 'DENT-4', courseId: '2', courseCode: 'DENT401', courseName: 'Clinical Dentistry', units: 3,
  isClinical: true, semester: 'First', schoolYear: '2026-2027', yearLevel: 4, grade: null, percentage: null, retentionState: 'active',
  gradeComponents: null, remedial: null, clinicHoursCompleted: 0, dateEnrolled: null, isCurrent: true, isPast: false,
};

async function studentIdentity(page: Page) {
  await page.route('**/api/runtime-config', route => route.fulfill({ json: {
    status: 'ok', environment: 'test', providers: { identity: { password: { enabled: true }, google: { enabled: false }, development_mock: { enabled: false } }, email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' } },
    features: { student_auth_enabled: true, browser_attendance_prototype: false },
  } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    user_id: 26, role: 'student', display_name: 'Real Student', login_email: 'student@bicol-u.edu.ph', authentication_source: 'password',
    student: { student_id: 26, student_number: 'REAL-26', status: 'active' },
  } }));
}

test('Student pending standing stays unresolved and past-only courses never become active', async ({ page }) => {
  await studentIdentity(page);
  let records: unknown[] = [course];
  await page.route('**/api/student/retention', route => route.fulfill({ json: { status: 'ok', retention: {
    currentSchoolYear: '2026-2027', records, atRiskCount: 0, midtermAtRiskCount: 0, hasPendingGrades: true,
  } } }));
  await page.goto('/student/retention');
  await expect(page.getByText('Standing Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Active Standing · Cleared')).toHaveCount(0);
  await page.getByRole('button', { name: /Remedial Exams/ }).click();
  await expect(page.getByText('Remedial Requirements Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('No Remedial Exams Required', { exact: true })).toHaveCount(0);
  records = [{ ...course, schoolYear: '2025-2026', isCurrent: false, isPast: true }];
  await page.reload();
  await expect(page.getByText('No courses enrolled for the active term.')).toBeVisible();
  await page.getByRole('button', { name: /Past Courses/ }).click();
  await expect(page.getByText('DENT401', { exact: true })).toBeVisible();
});

test('Student Classes reads canonical meetings including Sunday and avoids fabricating identity/year', async ({ page }) => {
  await studentIdentity(page);
  await page.route('**/api/student/classes', route => route.fulfill({ json: { status: 'ok', currentSchoolYear: '2027-2028', classes: [{
    ...course, schoolYear: '2027-2028', lecRoom: 'Old room (Mon 08:00 AM - 09:00 AM)', meetingsRecorded: true,
    meetings: [{ component: 'Lecture', day: 'Sun', room: 'New clinic', startTime: '13:00', endTime: '14:00' }, { component: 'Lecture', day: 'Tue', room: 'Clinic 2', startTime: '09:00', endTime: '10:00' }],
  }] } }));
  await page.goto('/student/classes');
  await expect(page.getByRole('button', { name: /Current Classes \(2027-2028\)/ })).toBeVisible();
  await expect(page.getByText(/Sun 13:00 - 14:00 \(New clinic\).*Tue 09:00 - 10:00/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Mon 08:00 AM');
  await expect(page.getByRole('main')).not.toContainText('2023-2689-70869');
});

test('Student profile route and sidebar remain within Student self-service', async ({ page }) => {
  await studentIdentity(page);
  await page.goto('/student/profile');
  await expect(page).toHaveURL('/student/profile');
  await expect(page.getByRole('main').getByRole('heading', { name: 'My Profile' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Profile', exact: true }).first()).toHaveAttribute('href', '/student/profile');
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone', width: 390, height: 844 }]) {
  const phone = viewport.name === 'phone';

  test(`Student sidebar and profile menu open their own profile on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await studentIdentity(page);
    await page.goto('/student/classes');
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    const sidebarProfile = page.locator('aside').getByRole('link', { name: 'My Profile', exact: true });
    await expect(sidebarProfile).toHaveAttribute('href', '/student/profile');
    await sidebarProfile.click();
    await expect(page).toHaveURL('/student/profile');
    await expect(page.getByRole('main').getByRole('heading', { name: 'My Profile', exact: true })).toBeVisible();
    await page.goto('/student/classes');
    const header = page.locator('header').nth(phone ? 0 : 1);
    await (phone ? header.getByTitle('Profile menu') : header.getByRole('button', { name: /Real Student/ })).click();
    const menuProfile = header.getByRole('link', { name: 'My Profile', exact: true });
    await expect(menuProfile).toHaveAttribute('href', '/student/profile');
    await menuProfile.click();
    await expect(page).toHaveURL('/student/profile');
    await expect(page.getByRole('main').getByRole('heading', { name: 'My Profile', exact: true })).toBeVisible();
  });

  test(`linked Secretary switches to Student Dashboard and back with the same account on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await studentIdentity(page);
    let identityReads = 0;
    await page.route('**/api/auth/me', route => {
      identityReads++;
      return route.fulfill({ json: {
        user_id: 26, role: 'secretary', display_name: 'Real Student', login_email: 'student@bicol-u.edu.ph', authentication_source: 'password',
        student: { student_id: 26, student_number: 'REAL-26', status: 'active' },
      } });
    });
    await page.route('**/api/student/dashboard**', route => route.fulfill({ json: {
      status: 'ok', student: { studentId: 26, studentNumber: 'REAL-26', name: 'Real Student', status: 'active', yearLevel: 4 },
      summary: { classCount: 0, gwa: null, attendanceRate: null, clinicalHoursCompleted: 0, retentionAlerts: 0 }, classes: [],
    } }));
    await page.route('**/api/secretary/profile', route => route.fulfill({ json: { status: 'ok', profile: {
      id: '26', name: 'Real Student', firstName: 'Real', lastName: 'Student', email: 'student@bicol-u.edu.ph', title: 'Class Secretary', assignedClassName: 'DENT-4', classroomName: 'Clinic',
    } } }));
    await page.goto('/');
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    const toggle = page.locator('[aria-label="Account view"]');
    await toggle.getByRole('button', { name: 'Student', exact: true }).click();
    await expect(page).toHaveURL('/student/dashboard');
    await expect(page.getByRole('main')).toContainText('REAL-26');
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    await expect(toggle.getByRole('button', { name: 'Student', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await toggle.getByRole('link', { name: 'Secretary', exact: true }).click();
    await expect(page).toHaveURL('/secretary/attendance');
    const header = page.locator('header').nth(phone ? 0 : 1);
    const openProfile = () => (phone ? header.getByTitle('Profile menu') : header.getByRole('button', { name: /Real Student/ })).click();
    await openProfile();
    await expect(header.getByRole('link', { name: 'Switch to Student View', exact: true })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Return to Secretary View', exact: true })).toHaveCount(0);
    await expect(header.getByRole('link', { name: /My (Secretary )?Profile/, exact: true })).toBeVisible();
    if (!phone) {
      await expect(header.getByTitle('Switch to Linked Student Self-Service')).toHaveCount(0);
      await expect(header.getByTitle('Return to Secretary Dashboard')).toHaveCount(0);
    }
    await openProfile();
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    await toggle.getByRole('button', { name: 'Student', exact: true }).click();
    await expect(page).toHaveURL('/student/dashboard');
    await expect(page.getByRole('main')).toContainText('REAL-26');
    await expect(toggle.getByRole('button', { name: 'Student', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await openProfile();
    await expect(header.getByRole('link', { name: 'My Profile', exact: true })).toHaveAttribute('href', '/secretary/profile');
    await expect(header.getByRole('link', { name: 'Switch to Student View', exact: true })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Return to Secretary View', exact: true })).toHaveCount(0);
    if (!phone) {
      await expect(header.getByTitle('Switch to Linked Student Self-Service')).toHaveCount(0);
      await expect(header.getByTitle('Return to Secretary Dashboard')).toHaveCount(0);
    }
    await openProfile();
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    await toggle.getByRole('link', { name: 'Secretary', exact: true }).click();
    await expect(page).toHaveURL('/secretary/attendance');
    expect(identityReads).toBe(1);
    await page.goto('/student/profile');
    await expect(page).toHaveURL('/secretary/profile');
    await expect(page.getByRole('main')).toContainText('student@bicol-u.edu.ph');
  });

  test(`unlinked Secretary cannot open Student academic data on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await studentIdentity(page);
    await page.route('**/api/auth/me', route => route.fulfill({ json: {
      user_id: 300, role: 'secretary', display_name: 'Unlinked Secretary', login_email: 'secretary@bicol-u.edu.ph', authentication_source: 'password',
    } }));
    const studentRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/student/')) studentRequests.push(request.url());
    });
    await page.goto('/');
    if (phone) await page.locator('header').first().getByRole('button').last().click();
    await expect(page.locator('[aria-label="Account view"]').getByRole('button', { name: 'Student', exact: true })).toBeDisabled();
    for (const [path, title] of [['dashboard', 'Student Dashboard'], ['classes', 'My Classes'], ['retention', 'Retention Monitoring']]) {
      await page.goto(`/student/${path}?studentId=26`);
      await expect(page.getByRole('main').getByRole('heading', { name: `${title} unavailable`, exact: true })).toBeVisible();
    }
    expect(studentRequests).toEqual([]);
  });
}

test('future and unclassified enrollments remain visible outside current and past classes', async ({ page }) => {
  await studentIdentity(page);
  await page.route('**/api/student/classes', route => route.fulfill({ json: {
    status: 'ok', currentSchoolYear: '2026-2027', classes: [
      { ...course, courseCode: 'FUTURE', schoolYear: '2027-2028', isCurrent: false, isPast: false },
      { ...course, enrollmentId: '42', courseCode: 'UNKNOWN', schoolYear: '', isCurrent: false, isPast: false },
    ],
  } }));
  await page.goto('/student/classes');
  await expect(page.getByRole('heading', { name: 'Other School-Year Enrollments', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'FUTURE' })).toContainText('2027-2028');
  await expect(page.getByRole('row').filter({ hasText: 'UNKNOWN' })).toContainText('Unavailable');
  await expect(page.getByRole('main')).toContainText('No Active Classes for S.Y. 2026-2027');
  await page.getByRole('button', { name: /Archived Classes/ }).click();
  await expect(page.getByText('No Archived Classes Found', { exact: true })).toBeVisible();
});

test('completed cost recovery is labelled passed rather than required', async ({ page }) => {
  await studentIdentity(page);
  await page.route('**/api/student/retention', route => route.fulfill({ json: { status: 'ok', retention: {
    currentSchoolYear: '2026-2027', records: [{ ...course, grade: 2.75, remedialProgression: { stage: 'cost_recovery_passed', attempts: [], passedAttempt: null } }], atRiskCount: 0, hasPendingGrades: false,
  } } }));
  await page.goto('/student/retention');
  await page.getByRole('button', { name: /Remedial Exams/ }).click();
  await expect(page.getByText('Cost recovery passed · Course cleared.')).toBeVisible();
  await expect(page.getByText(/Cost recovery required \(Both/)).toHaveCount(0);
});

test('Secretary missing attendance is reachable for an exact session and writes only that target', async ({ page }) => {
  await page.route('**/api/secretary/profile', route => route.fulfill({ json: { status: 'ok', profile: { assignedClassName: 'DENT-4' } } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user_id: 300, role: 'secretary', display_name: 'Secretary', login_email: 'secretary@bicol-u.edu.ph' } }));
  const session = { sessionId: '900', subjectCode: 'DENT401', className: 'DENT-4', classId: '7', date: '2026-10-03', sessionCode: 'SESSION-900', startedAt: '2026-10-03T01:00:00Z', status: 'ended' };
  const missing = { id: '', attendanceSessionId: '900', studentId: '42', studentNumber: 'REAL-42', studentName: 'Missing Student', date: session.date, subjectCode: session.subjectCode, status: '' };
  let payload: unknown;
  let saved = false;
  await page.route('**/api/secretary/attendance**', route => {
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON();
      saved = true;
      return route.fulfill({ json: { status: 'ok', record: { id: '501' } } });
    }
    const selectedSession = new URL(route.request().url()).searchParams.get('sessionId');
    const recorded = { ...missing, id: '501', status: 'present' };
    const records = selectedSession === '900' ? [saved ? recorded : missing]
      : selectedSession === '901' ? [{ ...missing, attendanceSessionId: '901' }]
        : saved ? [recorded] : [];
    return route.fulfill({ json: { status: 'ok', sessions: [session, { ...session, sessionId: '901', sessionCode: 'SESSION-901' }], records } });
  });
  await page.goto('/secretary/override?student=REAL-42&sessionId=900&date=2026-10-03');
  await expect(page).toHaveURL(/\/secretary\/attendance\?student=REAL-42&sessionId=900&date=2026-10-03$/);
  await expect(page.getByLabel('Attendance session')).toHaveValue('900');
  const row = page.getByRole('row').filter({ hasText: 'Missing Student' });
  await expect(row).toContainText('Not recorded');
  await row.getByRole('button', { name: 'Override' }).click();
  await page.locator('textarea').fill('Verified attendance with Faculty');
  await page.getByRole('button', { name: 'Confirm override' }).click();
  await expect.poll(() => payload).toMatchObject({ studentId: '42', sessionId: 900, status: 'present', reason: 'Verified attendance with Faculty' });
  await expect(row).toContainText('present');
  await page.getByLabel('Attendance session').selectOption('');
  await expect(row).toContainText('present');
  await page.getByLabel('Attendance session').selectOption('901');
  await expect(row).toContainText('Not recorded');
  await expect(row).not.toContainText('present');
});

test('Faculty watchlist unlocking does not claim incomplete grades were computed or unlock all classes', async ({ page }) => {
  const records = [
    { enrollmentId: '901', studentId: '42', studentNumber: 'REAL-42', studentName: 'Incomplete Candidate', classId: '77', className: 'DENT-A', subjectCode: 'DENT401', schoolYear: '2026-2027', state: 'active', gwa: null, percentage: null, midtermComplete: false, midtermPercentage: null, watchlistUnlocked: true },
    { enrollmentId: '902', studentId: '43', studentNumber: 'REAL-43', studentName: 'Locked Candidate', classId: '78', className: 'DENT-B', subjectCode: 'DENT402', schoolYear: '2026-2027', state: 'active', gwa: null, percentage: null, midtermComplete: false, midtermPercentage: null, watchlistUnlocked: false },
  ];
  const writes: unknown[] = [];
  await page.route('**/api/faculty/retention', route => route.fulfill({ json: { status: 'ok', currentSchoolYear: '2026-2027', retention: records } }));
  await page.route('**/api/faculty/retention/watchlist/unlock', route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { status: 'ok' } });
  });
  await page.goto('/faculty/retention');
  await page.getByRole('button', { name: /Midterm Risk/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Incomplete Candidate' })).toContainText('Unlocked · Assessments incomplete');
  await expect(page.getByText('Computed · Ready', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unlock Midterm Watchlist', exact: true })).toBeDisabled();
  await page.getByRole('row').filter({ hasText: 'Locked Candidate' }).getByRole('button', { name: 'Unlock watchlist', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ classId: '78' });
});


test('Student projection advisory can be available while missing grades stay pending', async ({ page }) => {
  await studentIdentity(page);
  await page.route('**/api/student/retention', route => route.fulfill({ json: { status: 'ok', retention: {
    currentSchoolYear: '2026-2027', records: [
      { ...course, midtermEvaluation: { complete: false, percentage: null, grade: null, isAtRisk: true, risk: { level: 'High', period: 'Midterm', assumedAssessments: 2 } } },
      { ...course, enrollmentId: '42', courseCode: 'NO-DATA', midtermEvaluation: { complete: false, percentage: null, grade: null, isAtRisk: false, risk: null } },
    ], atRiskCount: 0, midtermAtRiskCount: 1, hasPendingGrades: true,
  } } }));
  await page.goto('/student/retention');
  await page.getByRole('button', { name: /Midterm/ }).click();
  const row = page.getByRole('row').filter({ hasText: 'DENT401' });
  await expect(row).toContainText('High · Midterm projection');
  await expect(row.getByText('Pending', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Advisory Pending/Unavailable for courses without sufficient assessment data.', { exact: true })).toBeVisible();
  await expect(page.getByText('Remedial exams are not held at midterm.', { exact: false })).toBeVisible();
});

test('Secretary correction uses a fresh reason, preserves failures for retry, and blocks refresh while saving', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user_id: 300, role: 'secretary', display_name: 'Secretary', login_email: 'secretary@bicol-u.edu.ph' } }));
  await page.route('**/api/secretary/profile', route => route.fulfill({ json: { status: 'ok', profile: { assignedClassName: 'DENT-4' } } }));
  const record = { id: '501', attendanceSessionId: '900', studentId: '42', studentNumber: 'REAL-42', studentName: 'Correction Student', date: '2026-10-03', subjectCode: 'DENT401', status: 'present', overrideReason: 'A previous reason', verificationMethod: 'biometric' };
  let writing = false;
  const payloads: unknown[] = [];
  let release: (() => void) | undefined;
  await page.route('**/api/secretary/attendance**', async route => {
    if (route.request().method() === 'POST') {
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1) {
        writing = true;
        await new Promise<void>(resolve => { release = resolve; });
        writing = false;
        return route.fulfill({ status: 503, json: { status: 'error', message: 'Temporary save failure.' } });
      }
      return route.fulfill({ json: { status: 'ok', record: { id: '501', overrideAt: '2026-10-03T02:00:00+08:00' } } });
    }
    return route.fulfill({ json: { status: 'ok', records: [record], sessions: [] } });
  });
  await page.goto('/secretary/attendance');
  await page.getByRole('row').filter({ hasText: 'Correction Student' }).getByRole('button', { name: 'Override' }).click();
  await expect(page.locator('textarea')).toHaveValue('');
  await page.locator('textarea').fill('New verified correction reason');
  await expect(page.getByRole('button', { name: 'Confirm override' })).toBeDisabled();
  expect(payloads).toEqual([]);
  await page.getByRole('button', { name: 'Late', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm override' }).click();
  await expect.poll(() => writing).toBe(true);
  await expect(page.getByRole('button', { name: 'Refresh attendance', exact: true })).toBeDisabled();
  release?.();
  await expect(page.getByText('Service is temporarily unavailable. Please try again later.', { exact: true })).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue('New verified correction reason');
  await expect(page.getByRole('button', { name: 'Confirm override' })).toBeEnabled();
  const row = page.getByRole('row').filter({ hasText: 'Correction Student' });
  await expect(row).toContainText('present');
  await expect(page.getByText('Attendance override applied successfully.', { exact: true })).toHaveCount(0);
  const expected = { studentId: '42', recordId: '501', sessionId: 900, date: '2026-10-03', status: 'late', reason: 'New verified correction reason' };
  expect(payloads).toEqual([expected]);
  await page.getByRole('button', { name: 'Confirm override' }).click();
  await expect(page.getByText('Attendance override applied successfully.', { exact: true })).toBeVisible();
  await expect(row).toContainText('late');
  await expect(page.getByRole('heading', { name: 'Manual Attendance Override', exact: true })).toHaveCount(0);
  expect(payloads).toEqual([expected, expected]);
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`Secretary History opens the exact same-day session on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user_id: 300, role: 'secretary', display_name: 'Secretary', login_email: 'secretary@bicol-u.edu.ph' } }));
    await page.route('**/api/secretary/profile', route => route.fulfill({ json: { status: 'ok', profile: { assignedClassName: 'DENT-4' } } }));
    const sessions = [
      { sessionId: '900', subjectCode: 'DENT401', className: 'DENT-4', classId: '7', date: '2026-10-03', sessionCode: 'MORNING-900', startedAt: '2026-10-03T00:00:00Z', status: 'ended' },
      { sessionId: '901', subjectCode: 'DENT401', className: 'DENT-4', classId: '7', date: '2026-10-03', sessionCode: 'AFTERNOON-901', startedAt: '2026-10-03T05:00:00Z', status: 'ended' },
    ];
    const reads: string[] = [];
    await page.route('**/api/secretary/attendance**', route => {
      const sessionId = new URL(route.request().url()).searchParams.get('sessionId');
      if (sessionId) reads.push(sessionId);
      return route.fulfill({ json: { status: 'ok', sessions, records: sessionId ? [{
        id: '', attendanceSessionId: sessionId, studentId: '42', studentNumber: 'REAL-42', studentName: sessionId === '901' ? 'Afternoon Student' : 'Morning Student',
        date: '2026-10-03', subjectCode: 'DENT401', status: '',
      }] : [] } });
    });
    await page.goto('/secretary/attendance?view=history');
    const history = page.getByText('Session code: AFTERNOON-901', { exact: true }).locator('../..');
    await history.getByRole('button', { name: 'View roll call', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Attendance session', exact: true })).toHaveValue('901');
    await expect(page.getByRole('row').filter({ hasText: 'Afternoon Student' })).toContainText('Not recorded');
    await expect(page.getByRole('row').filter({ hasText: 'Morning Student' })).toHaveCount(0);
    expect(reads).toEqual(['901']);
  });
}

for (const boundary of [
  { action: 'override', length: 8, limit: 240 }, { action: 'override', length: 240, limit: 240 },
  { action: 'excused', length: 8, limit: 500 }, { action: 'excused', length: 500, limit: 500 },
]) {
  test(`Secretary ${boundary.action} accepts ${boundary.length} characters and rejects a short reason`, async ({ page }) => {
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user_id: 300, role: 'secretary', display_name: 'Secretary', login_email: 'secretary@bicol-u.edu.ph' } }));
    await page.route('**/api/secretary/profile', route => route.fulfill({ json: { status: 'ok', profile: { assignedClassName: 'DENT-4' } } }));
    const record = { id: '501', attendanceSessionId: '900', studentId: '42', studentNumber: 'REAL-42', studentName: 'Boundary Student',
      date: '2026-10-03', subjectCode: 'DENT401', status: 'absent', verificationMethod: 'system_resolution' };
    const overrides: unknown[] = [];
    const requests: unknown[] = [];
    await page.route('**/api/secretary/attendance**', route => {
      if (route.request().method() === 'POST') {
        overrides.push(route.request().postDataJSON());
        return route.fulfill({ json: { status: 'ok', record: { id: '501' } } });
      }
      return route.fulfill({ json: { status: 'ok', records: [record], sessions: [] } });
    });
    await page.route('**/api/secretary/excused-requests', route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { status: 'ok', requests: [] } });
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { status: 'ok', message: 'Excused request sent to Faculty for approval.' } });
    });
    await page.goto('/secretary/attendance');
    const row = page.getByRole('row').filter({ hasText: 'Boundary Student' });
    await row.getByRole('button', { name: 'Override', exact: true }).click();
    await page.getByRole('button', { name: boundary.action === 'excused' ? 'Request Excused' : 'Present', exact: true }).click();
    const reason = page.locator('textarea');
    const submit = page.getByRole('button', { name: boundary.action === 'excused' ? 'Send request' : 'Confirm override', exact: true });
    await expect(reason).toHaveAttribute('maxlength', String(boundary.limit));
    await reason.fill('1234567');
    await expect(submit).toBeDisabled();
    expect(overrides).toEqual([]);
    expect(requests).toEqual([]);
    const text = 'R'.repeat(boundary.length);
    await reason.fill(text);
    await submit.click();
    if (boundary.action === 'excused') {
      await expect(page.getByText('Excused request sent to Faculty for approval.', { exact: true })).toBeVisible();
      expect(requests).toEqual([{ studentId: '42', recordId: '501', sessionId: 900, reason: text }]);
      expect(overrides).toEqual([]);
      await expect(row).toContainText('absent');
    } else {
      await expect(page.getByText('Attendance override applied successfully.', { exact: true })).toBeVisible();
      expect(overrides).toEqual([{ studentId: '42', recordId: '501', sessionId: 900, date: '2026-10-03', status: 'present', reason: text }]);
      expect(requests).toEqual([]);
      await expect(row).toContainText('present');
    }
  });
}

test('Student academic details remain available in Classes and Dashboard', async ({ page }) => {
  await studentIdentity(page);
  const gradedCourse = { ...course, grade: 2.75, percentage: 80.5, clinicHoursCompleted: 14, retentionState: 'warning' };
  await page.route('**/api/student/classes', route => route.fulfill({ json: { status: 'ok', currentSchoolYear: '2026-2027', classes: [gradedCourse] } }));
  await page.route('**/api/student/dashboard**', route => route.fulfill({ json: { status: 'ok', currentSchoolYear: '2026-2027', student: { name: 'Real Student', studentNumber: 'REAL-26' }, summary: { classCount: 1, gwa: 2.75, attendanceRate: null, clinicalHoursCompleted: 14, retentionAlerts: 1 }, classes: [gradedCourse] } }));
  await page.goto('/student/classes');
  await expect(page.getByText('Course Grade:', { exact: false })).toContainText('2.75');
  await expect(page.getByText('Clinical Hours Completed:', { exact: false })).toContainText('14 hrs');
  await expect(page.getByRole('main')).toContainText('Retention Standing Warning');
  await page.goto('/student/dashboard');
  await expect(page.getByText('Overall GWA', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Score %', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'DENT401' })).toContainText('80.5%');
});

test('Remedial work is separated from completed and historical courses', async ({ page }) => {
  await studentIdentity(page);
  const pending = { stage: 'attempt_1_pending', attempts: [{ attemptNumber: 1, scheduledDate: '2026-10-05', outcome: 'pending', percentage: null }], passedAttempt: null };
  const completed = { stage: 'passed', attempts: [{ attemptNumber: 1, scheduledDate: '2026-09-30', outcome: 'passed', percentage: 65 }], passedAttempt: 1 };
  await page.route('**/api/student/retention', route => route.fulfill({ json: { status: 'ok', retention: {
    currentSchoolYear: '2026-2027', records: [{ ...course, grade: 2.75, retentionState: 'remedial', remedialProgression: pending }, { ...course, enrollmentId: '42', courseCode: 'DONE', retentionState: 'cleared', remedialProgression: completed }, { ...course, enrollmentId: '43', courseCode: 'PAST', isCurrent: false, isPast: true, schoolYear: '2025-2026', remedialProgression: pending }], atRiskCount: 1, hasPendingGrades: true,
  } } }));
  await page.goto('/student/retention');
  const assignedRow = page.getByRole('row').filter({ hasText: 'DENT401' });
  await expect(assignedRow.getByRole('cell').nth(2)).toContainText('2.75');
  await expect(assignedRow.getByRole('cell').nth(3)).toContainText('Deficient');
  await expect(assignedRow.getByRole('button', { name: 'View Exam', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Remedial Exams/ }).click();
  await expect(page.getByRole('heading', { name: 'Active Remediation', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Completed / Historical Remediation', exact: true })).toBeVisible();
  const codes = await page.getByRole('main').locator('span.font-mono').allTextContents();
  expect(codes.filter(code => ['DENT401', 'DONE', 'PAST'].includes(code.trim())).map(code => code.trim())).toEqual(['DENT401', 'DONE', 'PAST']);
  await expect(page.getByText('Passed Exam Date')).toBeVisible();
  await expect(page.getByText('Exam date: 2026-09-30', { exact: true })).toBeVisible();
});

for (const fixture of [
  { state: 'warning', grade: null },
  { state: 'critical', grade: null },
  { state: 'warning', grade: 2.4 },
  { state: 'critical', grade: 2.4 },
]) {
  test(`Manual ${fixture.state} with ${fixture.grade === null ? 'pending' : 'passing'} grade does not assign remediation`, async ({ page }) => {
    await studentIdentity(page);
    await page.route('**/api/student/retention', route => route.fulfill({ json: { status: 'ok', retention: {
      currentSchoolYear: '2026-2027', records: [{ ...course, grade: fixture.grade, retentionState: fixture.state,
        remedialProgression: { stage: 'none', attempts: [], passedAttempt: null } }],
      atRiskCount: 1, hasPendingGrades: fixture.grade === null,
    } } }));
    await page.goto('/student/retention');
    const row = page.getByRole('row').filter({ hasText: 'DENT401' });
    await expect(row.getByRole('cell').nth(2)).toContainText(fixture.grade === null ? 'Pending' : '2.40');
    await expect(row.getByRole('cell').nth(3)).toHaveText(`${fixture.state === 'warning' ? 'Warning' : 'Critical'} · Review required`);
    await expect(row.getByRole('button', { name: 'View Exam', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remedial Exams', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Retention Review / Unassigned', exact: true })).toBeVisible();
    await expect(page.getByText('No remedial attempt assigned.', { exact: true })).toBeVisible();
    await expect(page.getByText(`Original Course Grade: ${fixture.grade === null ? 'Pending' : '2.40'}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active Remediation', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Completed / Historical Remediation', exact: true })).toHaveCount(0);
    await expect(page.getByText('Schedule to be announced by faculty', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Attempt 1', { exact: true })).toHaveCount(0);
  });
}

test('Faculty at-risk filter follows server projection without a percentage fallback', async ({ page }) => {
  await page.route('**/api/faculty/retention', route => route.fulfill({ json: { status: 'ok', currentSchoolYear: '2026-2027', retention: [
    { enrollmentId: '991', studentId: '42', studentNumber: 'LOW-42', studentName: 'Low Projection', classId: '77', className: 'DENT-A', subjectCode: 'DENT401', schoolYear: '2026-2027', state: 'active', gwa: null, percentage: null, midtermComplete: true, midtermPercentage: 79, risk: { level: 'Low', period: 'Overall' } },
    { enrollmentId: '992', studentId: '43', studentNumber: 'HIGH-43', studentName: 'High Projection', classId: '77', className: 'DENT-A', subjectCode: 'DENT401', schoolYear: '2026-2027', state: 'active', gwa: null, percentage: null, midtermComplete: true, midtermPercentage: 92, risk: { level: 'High', period: 'Overall' } },
  ] } }));
  await page.goto('/retention');
  await page.getByRole('button', { name: /Midterm Risk/ }).click();
  await page.getByRole('button', { name: /Show At-Risk Only/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'High Projection' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Low Projection' })).toHaveCount(0);
});


for (const enabled of [true, false]) {
  test(`Development Classes prototype requires current runtime provenance (${enabled ? 'enabled' : 'disabled'})`, async ({ page }) => {
    await page.route('**/api/auth/me', route => route.fulfill({ json: { user_id: 101, role: 'student', display_name: 'Mock Student', login_email: 'sample@bicol-u.edu.ph', authentication_source: 'development_mock' } }));
    await page.route('**/api/runtime-config', route => route.fulfill({ json: {
      status: 'ok', environment: 'test', providers: { identity: { password: { enabled: true }, google: { enabled: false }, development_mock: { enabled } }, email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' } },
      features: { student_auth_enabled: true, browser_attendance_prototype: false },
    } }));
    const academicReads: string[] = [];
    await page.route('**/api/student/classes', route => { academicReads.push(route.request().url()); return route.fulfill({ status: 500, json: { message: 'Prototype must not use authoritative API' } }); });
    await page.goto('/student/classes');
    if (enabled) {
      await expect(page.getByText('Development-only Classes prototype', { exact: false })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'My Classes unavailable' })).toBeVisible();
      await expect(page.getByText('Development-only Classes prototype', { exact: false })).toHaveCount(0);
    }
    await page.route('**/api/student/retention', route => { academicReads.push(route.request().url()); return route.fulfill({ status: 500, json: { message: 'Prototype must not use authoritative API' } }); });
    await page.goto('/student/retention');
    if (enabled) {
      await expect(page.getByText('Development-only Retention prototype', { exact: false })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Sample Grade' })).toBeVisible();
      await expect(page.getByText('No sample courses available.', { exact: true })).toBeVisible();
      await expect(page.getByRole('row')).toHaveCount(2);
    } else {
      await expect(page.getByRole('heading', { name: 'Retention Monitoring unavailable' })).toBeVisible();
      await expect(page.getByText('Development-only Retention prototype', { exact: false })).toHaveCount(0);
    }
    expect(academicReads).toEqual([]);
  });
}
