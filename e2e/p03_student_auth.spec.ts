import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ENABLED_RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  providers: {
    identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
    email: { active: 'mailpit' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: true },
};

const GOOGLE_ENABLED_RUNTIME_CONFIG = {
  ...ENABLED_RUNTIME_CONFIG,
  providers: {
    ...ENABLED_RUNTIME_CONFIG.providers,
    identity: { password: { enabled: true }, google: { enabled: true, client_id: 'client.apps.googleusercontent.com' }, development_mock: { enabled: false } },
  },
};

async function installMockGoogleIdentityServices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { callback: null as null | ((response: { credential: string }) => void) };
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (options: { callback: (response: { credential: string }) => void }) => { state.callback = options.callback; },
          renderButton: (element: HTMLElement) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue with Google';
            button.onclick = () => state.callback?.({ credential: 'mock-student-google-credential' });
            element.appendChild(button);
          },
        },
      },
    };
  });
}

test.describe('P03 Student identity and authentication', () => {
  test('legacy development login paths redirect to the canonical login page', async ({ page }) => {
    await page.goto('/login/dev');
    await expect(page).toHaveURL('/login');
    await page.goto('/dev-login');
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: /Development mock Student sign-in/i })).toHaveCount(0);
  });

  test('Student public signup redirects to invitation-only login', async ({ page }) => {
    await page.goto('/signup/student');
    await expect(page).toHaveURL('/login?invitationRequired=1');
    await expect(page.getByText(/accounts are created through invitations/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /request activation/i })).toHaveCount(0);
  });

  test('activation scrubs the token from the URL before submitting the password', async ({ page }) => {
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/student/invitation**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', invitation: { studentName: 'Test Student', studentNumber: 'P03-TEST', email: 'test.student@bicol-u.edu.ph', className: 'CLIN401-SecA', expiresAt: '2026-09-25T00:00:00Z' },
      }) });
    });
    await page.route('**/api/auth/student/activate', async route => {
      const payload = route.request().postDataJSON() as { token?: string; password?: string };
      expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(payload.password).toBe('Student123!');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Student account activated. You may now sign in.' }) });
    });
    await page.goto('/activate-student?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(page).toHaveURL('/activate-student');
    await expect(page.getByText('Test Student')).toBeVisible();
    await expect(page.getByText('Class: CLIN401-SecA')).toBeVisible();
    await expect(page.getByText('Student account activation is unavailable.')).toHaveCount(0);
    await page.getByLabel(/^Password$/i).fill('Student123!');
    await page.getByLabel(/Confirm password/i).fill('Student123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page).toHaveURL('/login?activated=1');
  });

  test('disabled Student authentication retains the unavailable activation state', async ({ page }) => {
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        features: { ...ENABLED_RUNTIME_CONFIG.features, student_auth_enabled: false },
      }) });
    });
    await page.goto('/activate-student?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(page.getByRole('alert')).toContainText('Student account activation is unavailable.');
  });

  test('Student invitation acceptance is password-only even when Google Sign-In is enabled', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_ENABLED_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/student/invitation**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', invitation: { studentName: 'Test Student', studentNumber: 'P03-TEST', email: 'test.student@bicol-u.edu.ph', className: 'CLIN401-SecA', expiresAt: '2026-09-25T00:00:00Z' },
      }) });
    });
    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/auth/student/activate', async route => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Student account activated.' }) });
    });
    await page.goto('/activate-student?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await expect(page.getByText(/verify this invited institutional email with Google/i)).toHaveCount(0);
    await page.getByLabel(/^Password$/i).fill('Student123!');
    await page.getByLabel(/Confirm password/i).fill('Student123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page).toHaveURL(/\/login\?activated=1/);
    expect(submittedPayload).toEqual({ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', password: 'Student123!' });
  });

  test('real password-authenticated Student uses authoritative surfaces without prototype data', async ({ page }) => {
    const fabricatedValues = [
      'FABRICATED-APP-STUDENT',
      'FABRICATED-APP-COURSE',
      'FABRICATED-APP-ATTENDANCE',
      'FABRICATED-APP-RETENTION',
      'FABRICATED-FACE-LOCALSTORAGE',
    ];
    await page.addInitScript(values => {
      localStorage.setItem('dentisys_students', JSON.stringify([{ id: 'fabricated', name: values[0], studentId: values[0], email: 'fabricated@example.invalid' }]));
      localStorage.setItem('dentisys_attendance', JSON.stringify([{ id: values[2], studentId: 'fabricated', subjectCode: values[1] }]));
      localStorage.setItem('dentisys_settings', JSON.stringify({ retentionThreshold: 0, theme: 'dark', fabricated: values[3] }));
      localStorage.setItem('dentisys_face_registered_1', 'true');
      localStorage.setItem('dentisys_face_registered_fabricated', values[4]);
    }, fabricatedValues);

    const realStudent = {
      user_id: 26,
      login_email: 'real.student@bicol-u.edu.ph',
      display_name: 'Real Student',
      role: 'student',
      session_uuid: 'real-student-session',
      authentication_source: 'password',
      student: { student_id: 26, student_number: 'P03-REAL', status: 'active' },
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: {
          ...ENABLED_RUNTIME_CONFIG.providers,
          identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
          biometrics: { active: 'development-mock' },
          location: { active: 'development-mock' },
        },
        features: { browser_attendance_prototype: true, student_auth_enabled: true },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'real-student-refresh-token', user: { user_id: 26 } }) });
    });
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'real-student-token' }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(realStudent) });
    });
    await page.route('**/api/student/dashboard**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          student: {
            studentId: 26,
            studentNumber: 'P03-REAL',
            name: 'Real Student',
            firstName: 'Real',
            lastName: 'Student',
            status: 'active',
            yearLevel: 4,
            account: { id: 26, email: 'real.student@bicol-u.edu.ph', role: 'student', status: 'Active' },
          },
          summary: { classCount: 0, gwa: null, attendanceRate: null, clinicalHoursCompleted: 0, retentionAlerts: 0 },
          classes: [],
        }),
      });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          consentGranted: false,
          enrollmentStatus: 'unregistered',
          enrolledAt: null,
          expiresAt: null,
          usableSampleCount: 0,
          requiredUsableSamples: 20,
          manualFallbackAvailable: true,
        }),
      });
    });
    await page.route('**/api/student/attendance/sessions/active', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [] }) });
    });
    await page.route('**/api/student/attendance/logs**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [], total: 0 }) });
    });
    await page.goto('/login');
    await page.locator('input[inputmode="email"]').fill('real.student@bicol-u.edu.ph');
    await page.locator('input[type="password"]').fill('Student123!');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL('/student/dashboard');

    await expect(page.getByRole('main').getByRole('heading', { name: /Welcome, Real Student!/i })).toBeVisible();
    for (const value of fabricatedValues) {
      await expect(page.locator('body')).not.toContainText(value);
    }
    await expect(page.getByRole('link', { name: 'Daily Attendance' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Attendance Logs' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Face Registration' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'My Classes' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Retention Monitoring' })).toHaveCount(1);

    await page.goto('/student/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'My Profile', exact: true })).toBeVisible();
    await expect(page.getByText('Two-factor authentication')).toBeVisible();
    await expect(page.getByRole('main').getByText(realStudent.student.student_number, { exact: true })).toBeVisible();
    for (const value of fabricatedValues) {
      await expect(page.locator('body')).not.toContainText(value);
    }

    const authoritativeRoutes: Array<[string, string]> = [
      ['/student/attendance', 'Daily Attendance'],
      ['/student/attendance-logs', 'Attendance Logs'],
      ['/student/face-registration', 'Face Registration'],
      ['/student/classes', 'My Classes'],
      ['/student/retention', 'Retention Monitoring'],
    ];
    for (const [path, title] of authoritativeRoutes) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      for (const value of fabricatedValues) {
        await expect(page.locator('body')).not.toContainText(value);
      }
    }
  });

  test('an enrolled Student sees a Registered screen that only offers revoking', async ({ page }) => {
    const student = {
      user_id: 27,
      login_email: 'enrolled.student@bicol-u.edu.ph',
      display_name: 'Enrolled Student',
      role: 'student',
      session_uuid: 'enrolled-student-session',
      authentication_source: 'password',
      student: { student_id: 27, student_number: 'P03-ENROLLED', status: 'active' },
    };
    let revoked = false;
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: { ...ENABLED_RUNTIME_CONFIG.providers, biometrics: { active: 'sidecar' } },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'enrolled-student-token', user: { user_id: 27 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(student) });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      if (route.request().method() === 'DELETE') {
        revoked = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', enrollmentStatus: 'revoked' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok',
        consentGranted: true,
        enrollmentStatus: 'active',
        enrolledAt: '2026-09-27T08:00:00+08:00',
        expiresAt: '2026-12-20',
        usableSampleCount: 28,
        requiredUsableSamples: 20,
        manualFallbackAvailable: true,
      }) });
    });

    await page.goto('/student/face-registration');
    const main = page.getByRole('main');
    await expect(main.getByText('Your face is registered for attendance')).toBeVisible();
    await expect(main.getByText('Privacy Agreement')).toHaveCount(0);
    await expect(main.getByRole('button', { name: /Re-Enroll|Re-Register|Continue to Camera Scan/i })).toHaveCount(0);

    await main.getByRole('button', { name: 'Revoke Registration' }).click();
    await page.getByRole('button', { name: 'Yes, Revoke Registration' }).click();
    await expect.poll(() => revoked).toBe(true);
    await expect(main.getByText('Data Privacy & Facial Biometrics Consent')).toBeVisible();
    await expect(main.getByText('Your face is registered for attendance')).toHaveCount(0);
  });

  test('Daily Attendance lists upcoming sessions and requests all on demand', async ({ page }) => {
    const student = {
      user_id: 28,
      login_email: 'upcoming.student@bicol-u.edu.ph',
      display_name: 'Upcoming Student',
      role: 'student',
      session_uuid: 'upcoming-student-session',
      authentication_source: 'password',
      student: { student_id: 28, student_number: 'P03-UPCOMING', status: 'active' },
    };
    const makeSession = (id: number, courseCode: string, sessionDate: string, times: string[], extra: Record<string, unknown>) => ({
      id, sessionId: String(id), courseCode, courseName: `${courseCode} Course`, sessionDate,
      openingTime: times[0], presentCutoff: times[1], lateCutoff: times[2], classEndTime: times[3],
      status: 'scheduled', captureOpen: false, captureStatus: 'session_not_open', alreadyRecordedStatus: null, ...extra,
    });
    const open = makeSession(901, 'OPEN101', '2026-10-12', ['09:00', '10:30', '11:00', '12:00'], { status: 'active', captureOpen: true, captureStatus: 'present' });
    const later = makeSession(902, 'LATER102', '2026-10-12', ['13:30', '14:00', '14:30', '15:00'], {});
    const nextWeek = makeSession(903, 'WEEK103', '2026-10-15', ['08:00', '09:00', '10:00', '11:00'], {});
    const farAway = makeSession(904, 'FAR104', '2026-10-30', ['08:00', '09:00', '10:00', '11:00'], {});
    const requestedRanges: string[] = [];
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: { ...ENABLED_RUNTIME_CONFIG.providers, biometrics: { active: 'sidecar' } },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'upcoming-student-token', user: { user_id: 28 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(student) });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', consentGranted: true, enrollmentStatus: 'active', enrolledAt: '2026-09-27T08:00:00+08:00',
        expiresAt: '2026-12-20', usableSampleCount: 28, requiredUsableSamples: 20, manualFallbackAvailable: true,
      }) });
    });
    await page.route('**/api/student/attendance/sessions/active', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [open] }) });
    });
    await page.route('**/api/student/attendance/sessions/upcoming**', async route => {
      const range = new URL(route.request().url()).searchParams.get('range') ?? 'week';
      requestedRanges.push(range);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', range, timezone: 'Asia/Manila', serverNow: '2026-10-12T02:00:00Z',
        sessions: range === 'all' ? [open, later, nextWeek, farAway] : [open, later, nextWeek],
      }) });
    });

    await page.goto('/student/attendance');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Attendance' })).toBeVisible();
    await expect(main.getByText('Today & upcoming sessions')).toBeVisible();
    await expect(main.getByText('Open · Present until 10:30')).toBeVisible();
    await expect(main.getByText('Opens in 3h 30m')).toBeVisible();
    await expect(main.getByText('WEEK103')).toBeVisible();
    await expect(main.getByText('Thu, Oct 15 · 08:00–11:00')).toBeVisible();
    await expect(main.getByText('FAR104')).toHaveCount(0);

    await main.getByRole('button', { name: 'Show all upcoming' }).click();
    await expect(main.getByText('FAR104')).toBeVisible();
    expect(requestedRanges).toContain('all');
    await expect(main.getByRole('button', { name: 'Show next 7 days' })).toBeVisible();
  });

  test('Take attendance starts check-in and scrolls to the liveness stage', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const student = {
      user_id: 28, login_email: 'upcoming.student@bicol-u.edu.ph', display_name: 'Upcoming Student', role: 'student',
      session_uuid: 'upcoming-student-session', authentication_source: 'password',
      student: { student_id: 28, student_number: 'P03-UPCOMING', status: 'active' },
    };
    const open = {
      id: 901, sessionId: '901', courseCode: 'OPEN101', courseName: 'OPEN101 Course', sessionDate: '2026-10-12',
      openingTime: '09:00', presentCutoff: '10:30', lateCutoff: '11:00', classEndTime: '12:00',
      status: 'active', captureOpen: true, captureStatus: 'present', alreadyRecordedStatus: null,
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: { ...ENABLED_RUNTIME_CONFIG.providers, biometrics: { active: 'sidecar' } },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'upcoming-student-token', user: { user_id: 28 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(student) });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', consentGranted: true, enrollmentStatus: 'active', enrolledAt: '2026-09-27T08:00:00+08:00',
        expiresAt: '2026-12-20', usableSampleCount: 28, requiredUsableSamples: 20, manualFallbackAvailable: true,
      }) });
    });
    await page.route('**/api/student/attendance/sessions/active', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [open] }) });
    });
    await page.route('**/api/student/attendance/sessions/upcoming**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', range: 'week', timezone: 'Asia/Manila', serverNow: '2026-10-12T02:00:00Z', sessions: [open],
      }) });
    });

    await page.goto('/student/attendance');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    const stage = main.getByRole('heading', { name: 'Active Liveness & Face Verification' });
    await expect(stage).toBeVisible();
    await expect(stage).toBeInViewport();
  });

  async function openGeofencedAttendance(page: Page, geofenceEnabled: boolean, locationChecks: unknown[], reply: (n: number) => Record<string, unknown>): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 700 });
    const open = {
      id: 901, sessionId: '901', courseCode: 'OPEN101', courseName: 'OPEN101 Course', sessionDate: '2026-10-12',
      openingTime: '09:00', presentCutoff: '10:30', lateCutoff: '11:00', classEndTime: '12:00',
      status: 'active', captureOpen: true, captureStatus: 'present', alreadyRecordedStatus: null, geofenceEnabled,
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: { ...ENABLED_RUNTIME_CONFIG.providers, biometrics: { active: 'sidecar' } },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'geo-student-token', user: { user_id: 28 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 28, login_email: 'upcoming.student@bicol-u.edu.ph', display_name: 'Upcoming Student', role: 'student',
        session_uuid: 'geo-student-session', authentication_source: 'password',
        student: { student_id: 28, student_number: 'P03-UPCOMING', status: 'active' },
      }) });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', consentGranted: true, enrollmentStatus: 'active', enrolledAt: '2026-09-27T08:00:00+08:00',
        expiresAt: '2026-12-20', usableSampleCount: 28, requiredUsableSamples: 20, manualFallbackAvailable: true,
      }) });
    });
    await page.route('**/api/student/attendance/sessions/active', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [open] }) });
    });
    await page.route('**/api/student/attendance/sessions/upcoming**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', range: 'week', timezone: 'Asia/Manila', serverNow: '2026-10-12T02:00:00Z', sessions: [open],
      }) });
    });
    await page.route('**/api/student/attendance/location-check', async route => {
      locationChecks.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', geofenceEnabled: true, radiusMeters: 100, accuracyLimitMeters: 100, ...reply(locationChecks.length),
      }) });
    });
    await page.goto('/student/attendance');
  }

  test('geofenced Take attendance: inside the radius opens the face stage in view', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.1436, longitude: 123.7438, accuracy: 20 });
    const checks: unknown[] = [];
    await openGeofencedAttendance(page, true, checks, () => ({ result: 'inside', distanceMeters: 12, accuracyMeters: 20 }));
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    const stage = main.getByRole('heading', { name: 'Active Liveness & Face Verification' });
    await expect(stage).toBeVisible();
    await expect(stage).toBeInViewport();
    expect(checks).toEqual([{ sessionId: 901, latitude: 13.1436, longitude: 123.7438, accuracy: 20 }]);
  });

  test('geofenced Take attendance: outside the radius shows the distance and no camera', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.1436, longitude: 123.7438, accuracy: 20 });
    await openGeofencedAttendance(page, true, [], () => ({ result: 'outside', distanceMeters: 2400, accuracyMeters: 20 }));
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    await expect(main.getByText('You are about 2,400 m from the session location. Allowed: within 100 m (about 2,300 m too far). GPS accuracy ±20 m.')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Active Liveness & Face Verification' })).toHaveCount(0);
  });

  test('geofenced Take attendance: a second imprecise result directs the Student to manual attendance', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.1436, longitude: 123.7438, accuracy: 25 });
    await openGeofencedAttendance(page, true, [], () => ({ result: 'imprecise', distanceMeters: 5, accuracyMeters: 25 }));
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    await expect(main.getByText(/Your location is too imprecise \(±25 m\)\. Turn on Wi-Fi/)).toBeVisible();
    await main.getByRole('button', { name: 'Retry' }).click();
    await expect(main.getByText("Your phone can't get a precise enough location here. Ask your Class Secretary or Course Instructor to record your attendance.")).toBeVisible();
    await expect(main.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Active Liveness & Face Verification' })).toHaveCount(0);
  });

  test('geofenced Take attendance: denied location permission says location is required and skips the check', async ({ page, context }) => {
    await context.clearPermissions();
    const checks: unknown[] = [];
    await openGeofencedAttendance(page, true, checks, () => ({ result: 'inside', distanceMeters: 1, accuracyMeters: 1 }));
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    await expect(main.getByText('Location is required for this session. Allow location for this site, or ask your Class Secretary or Course Instructor to record your attendance.')).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Active Liveness & Face Verification' })).toHaveCount(0);
    expect(checks).toHaveLength(0);
  });

  test('non-geofenced Take attendance never asks for location', async ({ page }) => {
    const checks: unknown[] = [];
    await openGeofencedAttendance(page, false, checks, () => ({ result: 'not_required' }));
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Take attendance' }).click();
    await expect(main.getByRole('heading', { name: 'Active Liveness & Face Verification' })).toBeVisible();
    expect(checks).toHaveLength(0);
  });

  test('Take attendance without an active face registration asks to register instead of starting', async ({ page }) => {
    const open = {
      id: 901, sessionId: '901', courseCode: 'OPEN101', courseName: 'OPEN101 Course', sessionDate: '2026-10-12',
      openingTime: '09:00', presentCutoff: '10:30', lateCutoff: '11:00', classEndTime: '12:00',
      status: 'active', captureOpen: true, captureStatus: 'present', alreadyRecordedStatus: null,
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: { ...ENABLED_RUNTIME_CONFIG.providers, biometrics: { active: 'sidecar' } },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'upcoming-student-token', user: { user_id: 28 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 28, login_email: 'upcoming.student@bicol-u.edu.ph', display_name: 'Upcoming Student', role: 'student',
        session_uuid: 'upcoming-student-session', authentication_source: 'password',
        student: { student_id: 28, student_number: 'P03-UPCOMING', status: 'active' },
      }) });
    });
    await page.route('**/api/student/biometric/profile', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', consentGranted: false, enrollmentStatus: 'not_enrolled', usableSampleCount: 0,
        requiredUsableSamples: 20, manualFallbackAvailable: true,
      }) });
    });
    await page.route('**/api/student/attendance/sessions/active', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [open] }) });
    });
    await page.route('**/api/student/attendance/sessions/upcoming**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', range: 'week', timezone: 'Asia/Manila', serverNow: '2026-10-12T02:00:00Z', sessions: [open],
      }) });
    });

    await page.goto('/student/attendance');
    const main = page.getByRole('main');
    const dialog = page.locator('body > div.fixed.inset-0'); // Modal portal; has no dialog role
    await main.getByRole('button', { name: 'Take attendance' }).click();
    await expect(dialog.getByRole('heading', { name: 'Face registration required' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Active Liveness & Face Verification' })).toHaveCount(0);

    await main.getByRole('button', { name: 'Take attendance' }).click();
    await dialog.getByRole('button', { name: 'Register Face' }).click();
    await expect(page).toHaveURL('/student/face-registration');
  });

  test('development-mock Student retains the gated prototype subtree and actions', async ({ page }) => {
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...ENABLED_RUNTIME_CONFIG,
        providers: {
          ...ENABLED_RUNTIME_CONFIG.providers,
          identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
          biometrics: { active: 'development-mock' },
          location: { active: 'development-mock' },
        },
        features: { browser_attendance_prototype: true, student_auth_enabled: true },
      }) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-student-refresh-token', user: { user_id: 10 } }) });
    });
    await page.route('**/api/auth/development/mock-student-session', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-student-token', user: { user_id: 10 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 10,
        login_email: 'student@bicol-u.edu.ph',
        display_name: 'Development Student',
        role: 'student',
        session_uuid: 'development-mock-session',
        authentication_source: 'development_mock',
        student: { student_id: 26, student_number: 'DEV-P03-0001', status: 'active' },
      }) });
    });
    await page.goto('/login');
    await page.getByRole('button', { name: /Development mock Student sign-in/i }).click();
    await expect(page).toHaveURL('/student/dashboard');
    await expect(page.getByText('Academic Progress Overview')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Daily Attendance' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Attendance Logs' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Face Registration' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Daily Attendance' }).click();
    await expect(page).toHaveURL('/student/attendance');
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Attendance' })).toBeVisible();
    await expect(page.getByText('Step 1: Select Enrolled Subject')).toBeVisible();
  });

  test('stale development-mock /me cannot unlock Student prototypes when identity mock is disabled', async ({ page }) => {
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'stale-student-token', user: { user_id: 10 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 10,
        login_email: 'student@bicol-u.edu.ph',
        display_name: 'Stale Development Student',
        role: 'student',
        session_uuid: 'stale-development-mock-session',
        authentication_source: 'development_mock',
        student: { student_id: 26, student_number: 'STALE-P03', status: 'active' },
      }) });
    });
    await page.goto('/student/classes');
    await expect(page.getByRole('status')).toContainText('My Classes unavailable');
    await expect(page.getByRole('link', { name: 'Daily Attendance' })).toHaveCount(0);
  });

  test('disabled browser attendance blocks Attendance Logs while academic Student surfaces remain bounded', async ({ page }) => {
    const config = {
      ...ENABLED_RUNTIME_CONFIG,
      providers: {
        ...ENABLED_RUNTIME_CONFIG.providers,
          identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
        biometrics: { active: 'development-mock' as const },
        location: { active: 'development-mock' as const },
      },
      features: { browser_attendance_prototype: false, student_auth_enabled: true },
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-student-token', user: { user_id: 10 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 10, login_email: 'student@bicol-u.edu.ph', display_name: 'Development Student', role: 'student',
        session_uuid: 'development-mock-session', authentication_source: 'development_mock',
        student: { student_id: 26, student_number: 'DEV-P03-0001', status: 'active' },
      }) });
    });
    await page.goto('/student/attendance-logs');
    await expect(page.getByRole('status')).toContainText('Attendance Logs unavailable');
    await expect(page.getByRole('link', { name: 'Attendance Logs' })).toHaveCount(0);
  });

  test('disabled biometric provider blocks Face and hides prototype biometric Profile state', async ({ page }) => {
    const config = {
      ...ENABLED_RUNTIME_CONFIG,
      providers: {
        ...ENABLED_RUNTIME_CONFIG.providers,
          identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
        biometrics: { active: 'disabled' as const },
        location: { active: 'development-mock' as const },
      },
      features: { browser_attendance_prototype: true, student_auth_enabled: true },
    };
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-student-token', user: { user_id: 10 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 10, login_email: 'student@bicol-u.edu.ph', display_name: 'Development Student', role: 'student',
        session_uuid: 'development-mock-session', authentication_source: 'development_mock',
        student: { student_id: 26, student_number: 'DEV-P03-0001', status: 'active' },
      }) });
    });
    await page.goto('/student/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'My Profile' })).toBeVisible();
    await expect(page.getByText('Biometric Registration & Privacy Audit')).toHaveCount(0);
    await expect(page.getByText('Biometric Face')).toHaveCount(0);
    await page.goto('/student/face-registration');
    await expect(page.getByRole('status')).toContainText('Face Registration unavailable');
  });

  test('Admin audit trail displays and filters Student events', async ({ page }) => {
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'admin-token', user: { user_id: 1 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        user_id: 1, login_email: 'admin@bicol-u.edu.ph', display_name: 'Dean Admin', role: 'admin',
        session_uuid: 'admin-session', authentication_source: 'password',
      }) });
    });
    await page.route('**/api/admin/audit-logs*', async route => {
      const role = new URL(route.request().url()).searchParams.get('role');
      const common = { area: 'Sign-in & security', isSignIn: false, batch: null, details: { fromWhere: { ip: '127.0.0.1', device: 'Browser' }, reason: null, changes: [] } };
      const studentEvent = {
        ...common, id: 'e:student', occurredAt: '2026-09-17T10:00:00+08:00',
        who: { name: 'Student account', email: null, role: 'student', roleLabel: 'Student' }, whoText: null,
        what: 'Student sign-in denied', record: '—', change: '—', status: 'Failed',
      };
      const facultyEvent = {
        ...common, id: 'e:faculty', occurredAt: '2026-09-17T09:00:00+08:00', area: 'People & accounts',
        who: { name: 'Faculty account', email: null, role: 'faculty', roleLabel: 'Faculty' }, whoText: null,
        what: 'Profile updated', record: 'Faculty account', change: '1 field changed', status: 'Success',
      };
      const entries = role === 'student' ? [studentEvent] : [studentEvent, facultyEvent];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', entries, total: entries.length, page: 1, pageSize: 50, areas: ['Sign-in & security', 'People & accounts'],
          attention: { failedSignIns: 1, securityAlerts: 0, mfaTurnedOff: 0 },
        }),
      });
    });
    await page.goto('/admin/audit-trail');
    await expect(page.getByText('Student sign-in denied').first()).toBeVisible();
    await expect(page.getByText('Profile updated').first()).toBeVisible();
    await page.getByLabel('Role', { exact: true }).selectOption('student');
    await expect(page.getByText('Student sign-in denied').first()).toBeVisible();
    await expect(page.getByText('Profile updated')).toHaveCount(0);
  });
});
