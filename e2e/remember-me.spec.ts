import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Backlog 9.26 "Remember me for 7 days": the box on /login and the frontend idle tracker.
// The server side (stored flag, cookie, no idle expiry, audit) is covered by tests/backend, tests/database and e2e/live.

const BOX = 'Remember me for 7 days';

async function mockLogin(page: Page, remembered: boolean): Promise<Array<Record<string, unknown>>> {
  const loginBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/auth/login', route => {
    loginBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-remember-token' }) });
  });
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 2, user_id: 2, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Dr. Remember', role: 'faculty', remembered }),
  }));
  return loginBodies;
}

async function signIn(page: Page, tick: boolean): Promise<void> {
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  if (tick) await page.getByLabel(BOX).check();
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

test.describe('Remember me: sign-in box', () => {
  test('the box is unticked by default and sits between the password field and Login, with Forgot password on the same row', async ({ page }) => {
    await mockLogin(page, false);
    await page.goto('/login');
    const box = page.getByLabel(BOX);
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    const password = await page.locator('input[type="password"]').boundingBox();
    const tick = await box.boundingBox();
    const forgot = await page.getByRole('link', { name: 'Forgot password?' }).boundingBox();
    const login = await page.locator('button[type="submit"]').boundingBox();
    expect(password!.y + password!.height).toBeLessThanOrEqual(tick!.y + tick!.height);
    expect(tick!.y + tick!.height).toBeLessThanOrEqual(login!.y + 1);
    expect(Math.abs((forgot!.y + forgot!.height / 2) - (tick!.y + tick!.height / 2))).toBeLessThan(20);
  });

  test('signing in unticked sends remember false', async ({ page }) => {
    const bodies = await mockLogin(page, false);
    await signIn(page, false);
    expect(bodies).toEqual([{ email: 'faculty@bicol-u.edu.ph', password: 'Password123!', remember: false }]);
  });

  test('signing in ticked sends remember true', async ({ page }) => {
    const bodies = await mockLogin(page, true);
    await signIn(page, true);
    expect(bodies).toEqual([{ email: 'faculty@bicol-u.edu.ph', password: 'Password123!', remember: true }]);
  });
});

test.describe('Remember me: idle sign-out', () => {
  test('an unremembered session is signed out after 30 minutes without activity', async ({ page }) => {
    await page.clock.install();
    await mockLogin(page, false);
    await signIn(page, false);
    await page.clock.fastForward(31 * 60 * 1000);
    await page.clock.runFor(16000);
    // The idle sign-out leaves the logout marker that stops a reload from restoring the session.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('dentisys_auth_logged_out_at'))).not.toBeNull();
  });

  test('a remembered session stays signed in after 30 minutes without activity and stores the remembered marker', async ({ page }) => {
    await page.clock.install();
    await mockLogin(page, true);
    await signIn(page, true);
    expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_remembered'))).not.toBeNull();
    await page.clock.fastForward(31 * 60 * 1000);
    await page.clock.runFor(16000);
    await expect(page).toHaveURL('/');
    expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_logged_out_at'))).toBeNull();
  });

  test('an unremembered session leaves no remembered marker', async ({ page }) => {
    await mockLogin(page, false);
    await signIn(page, false);
    expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_remembered'))).toBeNull();
  });
});
