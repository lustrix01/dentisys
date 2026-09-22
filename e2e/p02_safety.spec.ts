import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ENABLED_RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  providers: {
    identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
    email: { active: 'mailpit' },
    biometrics: { active: 'development-mock' },
    location: { active: 'development-mock' },
  },
  features: { browser_attendance_prototype: true, student_auth_enabled: true },
};

async function signInDevelopmentStudent(page: Page): Promise<void> {
  await page.route('**/api/runtime-config', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) });
  });
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Authentication required.' }) });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user_id: 101,
      login_email: 'student@bicol-u.edu.ph',
      display_name: 'Development Student',
      role: 'student',
      session_uuid: 'server-fixture-student-session',
      authentication_source: 'development_mock',
      student: { student_id: 26, student_number: 'DEV-P03-0001', status: 'active' },
    }) });
  });
  await page.route('**/api/auth/development/mock-student-session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      type: 'direct_login',
      two_factor_required: false,
      two_factor_enrolled: false,
      access_token: 'server-fixture-student-token',
      user: { user_id: 101 },
    }) });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Development mock Student sign-in/i })).toBeVisible();
  await page.getByRole('button', { name: /Development mock Student sign-in/i }).click();
  await expect(page).toHaveURL('/student/dashboard');
}

test.describe('P02 development safety seams', () => {
  test('student biometric and attendance fixtures are deterministic and browser-only', async ({ page }) => {
    await signInDevelopmentStudent(page);
    await page.click('a[href="/student/face-registration"]');
    await expect(page).toHaveURL('/student/face-registration');
    await page.check('#privacy-consent-checkbox');
    await page.getByRole('button', { name: /Continue to Camera Scan/i }).click();
    await page.getByRole('button', { name: /Capture & Submit Enrollment/i }).click();
    await expect(page.getByText('Development fixture enrollment')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /Go to Daily Attendance/i }).click();
    await expect(page).toHaveURL('/student/attendance');
    await page.getByRole('button', { name: /Take Attendance \(Simulated\)/i }).click();
    await expect(page.getByText(/Attendance recorded successfully for CLIN401/i)).toBeVisible({ timeout: 5000 });
  });

  test('student biometric enrollment remains fail-closed when providers are disabled', async ({ page }) => {
    const disabledProviderConfig = {
      ...ENABLED_RUNTIME_CONFIG,
      providers: {
        ...ENABLED_RUNTIME_CONFIG.providers,
        identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: true } },
        biometrics: { active: 'disabled' as const },
        location: { active: 'disabled' as const },
      },
      features: { browser_attendance_prototype: false, student_auth_enabled: true },
    };
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(disabledProviderConfig) });
    });
    let refreshCalls = 0;
    await page.route('**/api/auth/refresh', async (route) => {
      refreshCalls += 1;
      if (refreshCalls === 1) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Authentication required.' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'student-token', user: { user_id: 400 } }) });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 400, user_id: 400, login_email: 'student@bicol-u.edu.ph', display_name: 'Development Student', role: 'student', session_uuid: 'fixture-student-session', authentication_source: 'development_mock', student: { student_id: 26, student_number: 'DEV-P03-0001', status: 'active' } }) });
    });
    await page.route('**/api/auth/development/mock-student-session', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'student-token', user: { user_id: 400 } }) });
    });
    await page.goto('/login');
    await page.getByRole('button', { name: /Development mock Student sign-in/i }).click();
    await expect(page).toHaveURL('/student/dashboard');
    await expect(page.getByRole('link', { name: 'Face Registration' })).toHaveCount(0);
    await page.goto('/student/face-registration');
    await expect(page.getByRole('status')).toContainText('Face Registration unavailable');
  });

  test('secretary session prototype uses the stable inside-location fixture', async ({ page }) => {
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ENABLED_RUNTIME_CONFIG, providers: { ...ENABLED_RUNTIME_CONFIG.providers, identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } }, biometrics: { active: 'disabled' } } }) });
    });
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'secretary-token' }) });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 300, login_email: 'secretary@bicol-u.edu.ph', display_name: 'Secretary', role: 'secretary' }) });
    });
    await page.goto('/login');
    await page.fill('input[type="email"]', 'secretary@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await page.click('a[href="/secretary/start-session"]');
    await page.getByRole('button', { name: /Locate My GPS/i }).click();
    await expect(page.getByText(/BU Dental Room Location Verified/i)).toBeVisible();
    await page.getByRole('button', { name: /Start Class Session Now/i }).click();
    await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toBeVisible();
  });
});
