import { test, expect, openAccountMenu } from './fixtures';
import type { Page } from '@playwright/test';

// Backlog 9.24 / AUTH-006 "Remember this device": the box on the 2FA code step and the Profile "Forget my trusted devices" button.
// The server side (cookie, skip, revocations) is covered by tests/backend, tests/database and e2e/live.

const BOX = 'Remember this device for 30 days';

async function mockTwoFactorLogin(page: Page): Promise<{ verifyBodies: Array<Record<string, unknown>>; recoverBodies: Array<Record<string, unknown>> }> {
  const seen = { verifyBodies: [] as Array<Record<string, unknown>>, recoverBodies: [] as Array<Record<string, unknown>> };
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'two_factor_required', two_factor_required: true, two_factor_enrolled: true, two_factor_challenge_token: 'mock-two-factor-session-123456', expires_in: 300 }),
  }));
  await page.route('**/api/auth/mfa/verify', route => {
    seen.verifyBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-mfa-verified-access-token' }) });
  });
  await page.route('**/api/auth/mfa/recover', route => {
    seen.recoverBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-mfa-verified-access-token' }) });
  });
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 2, login_email: 'mfa_user@bicol-u.edu.ph', display_name: 'Dr. MFA User', role: 'faculty' }),
  }));
  return seen;
}

async function reachCodeStep(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'mfa_user@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/2fa/verify');
}

test.describe('Remember this device: 2FA sign-in step', () => {
  test('the box is unchecked by default, sits between the code field and Verify, and has no help text', async ({ page }) => {
    await mockTwoFactorLogin(page);
    await reachCodeStep(page);
    const box = page.getByLabel(BOX);
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    const code = await page.locator('input[placeholder="000000"]').boundingBox();
    const tick = await box.boundingBox();
    const verify = await page.getByRole('button', { name: 'Verify', exact: true }).boundingBox();
    expect(code!.y + code!.height).toBeLessThanOrEqual(tick!.y + 1);
    expect(tick!.y + tick!.height).toBeLessThanOrEqual(verify!.y + 1);
    await expect(page.locator('form')).toContainText(BOX);
    await expect(page.locator('form p')).toHaveCount(0);
  });

  test('verifying with the box unticked sends remember_device false', async ({ page }) => {
    const seen = await mockTwoFactorLogin(page);
    await reachCodeStep(page);
    await page.fill('input[placeholder="000000"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    expect(seen.verifyBodies).toEqual([{ code: '123456', remember_device: false }]);
  });

  test('verifying with the box ticked sends remember_device true', async ({ page }) => {
    const seen = await mockTwoFactorLogin(page);
    await reachCodeStep(page);
    await page.fill('input[placeholder="000000"]', '654321');
    await page.getByLabel(BOX).check();
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    expect(seen.verifyBodies).toEqual([{ code: '654321', remember_device: true }]);
  });

  test('the box is hidden on the recovery-code path and comes back unticked after switching back', async ({ page }) => {
    const seen = await mockTwoFactorLogin(page);
    await reachCodeStep(page);
    await page.getByLabel(BOX).check();
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
    await expect(page.getByLabel(BOX)).toHaveCount(0);
    await expect(page.getByText(BOX)).toHaveCount(0);
    await page.getByRole('button', { name: 'Use authenticator code instead' }).click();
    await expect(page.getByLabel(BOX)).toBeVisible();
    await expect(page.getByLabel(BOX)).not.toBeChecked();
    // And a recovery-code sign-in asks for no remembering.
    await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
    await page.locator('input[type="text"]').fill('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    expect(seen.recoverBodies).toHaveLength(1);
    expect(seen.recoverBodies[0]).not.toHaveProperty('remember_device');
    expect(seen.verifyBodies).toHaveLength(0);
  });
});

test.describe('Remember this device: Profile', () => {
  async function openFacultyProfile(page: Page, trustedDeviceCount: number): Promise<{ forgetCalls: () => number }> {
    let forgetCalls = 0;
    await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-faculty-token' }) }));
    await page.route('**/api/auth/me', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' }),
    }));
    await page.route('**/api/auth/mfa/settings', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', two_factor: { enabled: true, authenticator_enabled: true, recovery_code_count: 8, trusted_device_count: trustedDeviceCount } }),
    }));
    await page.route('**/api/auth/mfa/trusted-devices/forget', route => {
      forgetCalls += 1;
      expect(route.request().method()).toBe('POST');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ forgotten: trustedDeviceCount }) });
    });
    await page.goto('/login');
    await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await openAccountMenu(page);
    await page.click('a[href="/faculty/profile"] >> visible=true');
    await expect(page).toHaveURL('/faculty/profile');
    return { forgetCalls: () => forgetCalls };
  }

  test('shows the count and Forget my trusted devices is disabled at 0', async ({ page }) => {
    await openFacultyProfile(page, 0);
    await expect(page.getByText('Remembered devices: 0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forget my trusted devices' })).toBeDisabled();
  });

  test('Cancel keeps the devices; confirming forgets them, shows the success message and goes to 0', async ({ page }) => {
    const calls = await openFacultyProfile(page, 3);
    await expect(page.getByText('Remembered devices: 3')).toBeVisible();
    const forget = page.getByRole('button', { name: 'Forget my trusted devices' });
    await expect(forget).toBeEnabled();

    await forget.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText("Forget all remembered devices? You'll enter your code at the next sign-in on each one.");
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls.forgetCalls()).toBe(0);
    await expect(page.getByText('Remembered devices: 3')).toBeVisible();

    await forget.click();
    const request = page.waitForRequest(r => r.url().endsWith('/api/auth/mfa/trusted-devices/forget'));
    await page.getByRole('dialog').getByRole('button', { name: 'Forget devices' }).click();
    expect((await request).method()).toBe('POST');
    await expect(page.getByText('Remembered devices forgotten.')).toBeVisible();
    await expect(page.getByText('Remembered devices: 0')).toBeVisible();
    await expect(forget).toBeDisabled();
    expect(calls.forgetCalls()).toBe(1);
  });
});
