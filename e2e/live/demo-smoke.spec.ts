import { expect, test } from '@playwright/test';

// Read-only smoke check for a deployed stack (run through scripts/demo-test.ps1).
// Signs in through the real login form for each role and checks the session survives a reload.
const roles = ['ADMIN', 'FACULTY', 'SECRETARY', 'STUDENT'] as const;

for (const role of roles) {
  test(`${role.toLowerCase()} signs in and stays signed in after reload`, async ({ page }) => {
    const email = process.env[`E2E_${role}_EMAIL`];
    const password = process.env[`E2E_${role}_PASSWORD`];
    test.skip(!email || !password, `E2E_${role}_EMAIL / E2E_${role}_PASSWORD not set`);

    await page.goto('/login');
    await page.locator('#login-email').fill(email!);
    await page.locator('#login-password').fill(password!);
    await page.locator('form button[type="submit"]').last().click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });
}
