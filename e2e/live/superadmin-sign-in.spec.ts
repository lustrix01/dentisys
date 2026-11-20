import { test, expect } from '@playwright/test';
import { nextCode, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './superadminSignIn';

// Backlog 12.8 against the real backend and the dev seed: the Superadmin is refused on the shared /login (one counted failure,
// cleared by the next good sign-in) and reaches the 2FA step on /superadmin/sign-in. Each code step may wait up to 30 s.
test.describe.configure({ timeout: 120_000 });

// demo-test.ps1 sets E2E_FACULTY_EMAIL from demo.env, which holds no Superadmin login, so the demo runs only the Faculty test.
const onDemo = Boolean(process.env.E2E_FACULTY_EMAIL);
const FACULTY_EMAIL = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const FACULTY_PASSWORD = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

test('a Faculty account is refused on /superadmin/sign-in and still signs in on /login', async ({ page }) => {
  await page.goto('/superadmin/sign-in');
  await expect(page.getByRole('heading', { name: 'Superadmin Sign In' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByLabel('Remember me for 7 days')).toHaveCount(0);
  await page.locator('input[inputmode="email"]').fill(FACULTY_EMAIL);
  await page.locator('input[type="password"]').fill(FACULTY_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('The university email or password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL('/superadmin/sign-in');

  // The good sign-in clears the one counted failure.
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(FACULTY_EMAIL);
  await page.locator('input[type="password"]').fill(FACULTY_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
});

test('the Superadmin is refused on /login and reaches 2FA on /superadmin/sign-in', async ({ page }) => {
  test.skip(onDemo, 'demo.env holds no Superadmin login');
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(SUPERADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('The university email or password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL('/login');

  await page.goto('/superadmin/sign-in');
  await expect(page.getByRole('heading', { name: 'Superadmin Sign In' })).toBeVisible();
  await page.locator('input[inputmode="email"]').fill(SUPERADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/2fa\/verify/);
  await page.locator('input[inputmode="numeric"]').fill(await nextCode());
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page).toHaveURL('/superadmin/overview');
});
