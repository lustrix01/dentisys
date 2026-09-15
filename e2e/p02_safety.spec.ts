import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const ENABLED_RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  providers: {
    identity: { primary: 'password', development_mock_enabled: true },
    email: { active: 'mailpit' },
    biometrics: { active: 'development-mock' },
    location: { active: 'development-mock' },
  },
  features: { browser_attendance_prototype: true },
};

async function signInDevelopmentStudent(page: Page): Promise<void> {
  await page.route('**/api/runtime-config', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Development mock Student sign-in/i })).toBeVisible();
  await page.fill('input[type="email"]', 'student@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/student/dashboard');
}

test.describe('P02 development safety seams', () => {
  test('student biometric and attendance fixtures are deterministic and browser-only', async ({ page }) => {
    await signInDevelopmentStudent(page);
    await page.click('a[href="/student/face-registration"]');
    await expect(page).toHaveURL('/student/face-registration');
    await page.check('#privacy-consent-checkbox');
    await page.getByRole('button', { name: /Continue to Facial Scan/i }).click();
    await page.getByRole('button', { name: /Capture & Extract Face Template/i }).click();
    await expect(page.getByText('Development fixture enrollment')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /Go to Daily Attendance/i }).click();
    await expect(page).toHaveURL('/student/attendance');
    await page.getByRole('button', { name: /Submit Attendance for CLIN401/i }).click();
    await expect(page.getByText(/Attendance recorded successfully for CLIN401/i)).toBeVisible({ timeout: 5000 });
  });

  test('student biometric enrollment remains fail-closed when providers are disabled', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'student-token' }) });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 400, login_email: 'student@bicol-u.edu.ph', display_name: 'Student', role: 'student' }) });
    });
    await page.goto('/login');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await page.click('a[href="/student/face-registration"]');
    await expect(page.getByText(/Facial enrollment is not configured/i)).toBeVisible();
  });

  test('secretary session prototype uses the stable inside-location fixture', async ({ page }) => {
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ENABLED_RUNTIME_CONFIG, providers: { ...ENABLED_RUNTIME_CONFIG.providers, identity: { primary: 'password', development_mock_enabled: false }, biometrics: { active: 'disabled' } } }) });
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
