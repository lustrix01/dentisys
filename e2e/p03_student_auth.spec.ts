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
      const payload = route.request().postDataJSON() as { token?: string };
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

  test('Google mismatch during Student invitation acceptance is reported without leaving the reusable invitation page', async ({ page }) => {
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
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Google identity does not match the invited Student email.' }) });
    });
    await page.goto('/activate-student?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByLabel(/^Password$/i).fill('Student123!');
    await page.getByLabel(/Confirm password/i).fill('Student123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page.getByRole('alert')).toContainText(/does not match the invited Student email/i);
    await expect(page).toHaveURL('/activate-student');
    expect(submittedPayload).toMatchObject({ credential: 'mock-student-google-credential', token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
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
    await page.locator('input[type="email"]').fill('real.student@bicol-u.edu.ph');
    await page.locator('input[type="password"]').fill('Student123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page).toHaveURL('/student/dashboard');

    for (const value of [realStudent.display_name, realStudent.login_email, realStudent.student.student_number, realStudent.student.status]) {
      await expect(page.getByRole('main').getByText(value, { exact: true }).first()).toBeVisible();
    }
    for (const value of fabricatedValues) {
      await expect(page.locator('body')).not.toContainText(value);
    }
    await expect(page.getByRole('link', { name: 'Daily Attendance' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Attendance Logs' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Face Registration' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'My Classes' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Retention Monitoring' })).toHaveCount(0);

    await page.goto('/student/profile');
    await expect(page.getByRole('main').getByRole('heading', { name: 'My Profile' })).toBeVisible();
    await expect(page.getByText('Two-factor authentication')).toBeVisible();
    for (const value of fabricatedValues) {
      await expect(page.locator('body')).not.toContainText(value);
    }

    const authoritativeRoutes: Array<[string, string]> = [
      ['/student/attendance', 'Daily Class Check-In'],
      ['/student/attendance-logs', 'My Session Attendance Logs'],
      ['/student/face-registration', 'Facial Recognition Registration'],
      ['/student/classes', 'My Enrolled Classes & Retention Standing'],
      ['/student/retention', 'Retention Risk Monitoring'],
    ];
    for (const [path, title] of authoritativeRoutes) {
      await page.goto(path);
      await expect(page.getByText(title)).toBeVisible();
      for (const value of fabricatedValues) {
        await expect(page.locator('body')).not.toContainText(value);
      }
    }
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
    await expect(page.getByText('Daily Class Check-In')).toBeVisible();
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
    await expect(page.getByRole('main').getByRole('heading', { name: 'My Profile' })).toBeVisible();
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
      const studentEvent = {
        id: 'student-event', timestamp: '2026-09-17T10:00:00Z', userName: 'Student account', userRole: 'student',
        action: 'student_auth_eligibility_denied', module: 'auth', description: 'Student authentication eligibility denied.',
        status: 'Failed', ipAddress: '127.0.0.1', device: 'Browser',
      };
      const facultyEvent = {
        id: 'faculty-event', timestamp: '2026-09-17T09:00:00Z', userName: 'Faculty account', userRole: 'faculty',
        action: 'faculty_profile_updated', module: 'profile', description: 'Faculty profile updated.',
        status: 'Success', ipAddress: '127.0.0.1', device: 'Browser',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(role === 'student' ? [studentEvent] : [studentEvent, facultyEvent]),
      });
    });
    await page.goto('/admin/audit-trail');
    await expect(page.getByText('student_auth_eligibility_denied')).toBeVisible();
    await expect(page.getByText('faculty_profile_updated')).toBeVisible();
    await page.locator('select').first().selectOption('student');
    await expect(page.getByText('student_auth_eligibility_denied')).toBeVisible();
    await expect(page.getByText('faculty_profile_updated')).toHaveCount(0);
  });
});
