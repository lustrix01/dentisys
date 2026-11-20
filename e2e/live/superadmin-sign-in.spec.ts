import { test, expect } from '@playwright/test';
import { nextCode, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './superadminSignIn';

// Backlog 12.8 against the real backend and the dev seed: the Superadmin is refused on the shared /login (one counted failure,
// cleared by the next good sign-in) and reaches the 2FA step on /superadmin/sign-in. Each code step may wait up to 30 s.
test.describe.configure({ timeout: 120_000 });

test('the Superadmin is refused on /login and reaches 2FA on /superadmin/sign-in', async ({ page }) => {
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
