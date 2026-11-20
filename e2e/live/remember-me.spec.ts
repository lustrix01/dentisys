import { test, expect, type Page } from '@playwright/test';

// Backlog 9.26 "Remember me for 7 days" against the real backend and the dev seed: the refresh cookie is a 7-day cookie when the box is
// ticked and a browser-session cookie when it is not. The seeded Faculty account has no 2FA, so the password step signs in directly.
const EMAIL = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const PASSWORD = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

async function signIn(page: Page, tick: boolean): Promise<void> {
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const box = page.getByLabel('Remember me for 7 days');
  await expect(box).not.toBeChecked();
  if (tick) await box.check();
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page: Page): Promise<void> {
  await page.locator('header button:has(.lucide-chevron-down)').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function refreshCookie(page: Page) {
  const cookie = (await page.context().cookies()).find(c => c.name === 'refresh_token');
  expect(cookie, 'refresh_token cookie is set').toBeTruthy();
  return cookie!;
}

test('a ticked sign-in keeps a 7-day refresh cookie and /me reports remembered', async ({ page }) => {
  await signIn(page, true);
  const cookie = await refreshCookie(page);
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires).toBeGreaterThan(0);
  const secondsLeft = cookie.expires - Date.now() / 1000;
  expect(secondsLeft).toBeGreaterThan(7 * 86400 - 600);
  expect(secondsLeft).toBeLessThanOrEqual(7 * 86400 + 60);
  expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_remembered'))).not.toBeNull();
  await signOut(page);
  expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_remembered'))).toBeNull();
});

test('an unticked sign-in keeps a session cookie with no expiry', async ({ page }) => {
  await signIn(page, false);
  const cookie = await refreshCookie(page);
  expect(cookie.expires).toBe(-1);
  expect(await page.evaluate(() => localStorage.getItem('dentisys_auth_remembered'))).toBeNull();
  await signOut(page);
});
