import { test, expect, type Page } from '@playwright/test';
import { nextCode, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './superadminSignIn';

// Backlog 9.24 / AUTH-006 "Remember this device" against the real backend and the dev seed: tick the box, sign out, sign in again
// without a code. The seeded Superadmin is the account with a known authenticator secret. Each sign-in that needs a code may wait
// up to 30 s for a fresh authenticator step, so the test gets more than the default timeout.
test.describe.configure({ timeout: 180_000 });

async function passwordStep(page: Page): Promise<void> {
  await page.goto('/superadmin/sign-in'); // 12.8
  await page.locator('input[inputmode="email"]').fill(SUPERADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
}

/** Leaves the account with no remembered device, so later runs and scripts that expect the code step still get it. */
async function forgetTrustedDevices(page: Page): Promise<void> {
  await page.goto('about:blank');
  const login = await page.request.post('/api/auth/login', { data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, sign_in_page: 'superadmin' } });
  let body = await login.json();
  if (body.two_factor_required) {
    const verify = await page.request.post('/api/auth/mfa/verify', {
      headers: { Authorization: `Bearer ${body.two_factor_challenge_token}` },
      data: { code: await nextCode() },
    });
    body = await verify.json();
  }
  const token = body.access_token as string;
  expect(token, 'cleanup could not sign in').toBeTruthy();
  const forget = await page.request.post('/api/auth/mfa/trusted-devices/forget', { headers: { Authorization: `Bearer ${token}` } });
  expect(forget.status()).toBe(200);
  await page.request.post('/api/auth/logout', { headers: { Authorization: `Bearer ${token}` } });
}

test('a ticked device skips the code at the next sign-in until it is forgotten', async ({ page }) => {
  try {
    // 1. Password, then the code with the box ticked.
    await passwordStep(page);
    await expect(page).toHaveURL(/\/2fa\/verify/);
    const box = page.getByLabel('Remember this device for 30 days');
    await expect(box).not.toBeChecked();
    await page.locator('input[inputmode="numeric"]').fill(await nextCode());
    await box.check();
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page).toHaveURL('/superadmin/overview');

    // The browser now holds the cookie (HttpOnly: only its presence in the cookie jar can be seen).
    const cookies = await page.context().cookies();
    const trusted = cookies.find(c => c.name === 'trusted_device');
    expect(trusted, 'trusted_device cookie is set').toBeTruthy();
    expect(trusted!.httpOnly).toBe(true);
    expect(trusted!.sameSite).toBe('Lax');
    expect(trusted!.path).toBe('/api/auth');
    expect(trusted!.expires - Date.now() / 1000).toBeGreaterThan(29 * 86400);
    expect(trusted!.expires - Date.now() / 1000).toBeLessThanOrEqual(30 * 86400 + 60);

    // 2. Normal sign-out keeps the device remembered.
    await page.locator('header button:has(.lucide-chevron-down)').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/superadmin/sign-in');
    expect((await page.context().cookies()).some(c => c.name === 'trusted_device')).toBe(true);

    // 3. Password only: no code step, straight to the Overview.
    await passwordStep(page);
    await expect(page).toHaveURL('/superadmin/overview');
    await expect(page).not.toHaveURL(/\/2fa\/verify/);

    // 4. Forget (as the Profile button does), then the code step is back.
    await forgetTrustedDevices(page);
    await passwordStep(page);
    await expect(page).toHaveURL(/\/2fa\/verify/);
  } finally {
    await forgetTrustedDevices(page);
  }
});
