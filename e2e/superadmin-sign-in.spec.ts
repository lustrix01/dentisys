import { test, expect, openAccountMenu } from './fixtures';
import type { Page } from '@playwright/test';

// Backlog 12.8: the Superadmin signs in at /superadmin/sign-in. The server side (401 on the wrong page, the lock, the audit row,
// sign_in_path) is covered by tests/backend and tests/database; this checks the page and what the browser sends.

const BOX = 'Remember me for 7 days';

async function captureLogin(page: Page, response: { status: number; body: Record<string, unknown> }): Promise<Array<Record<string, unknown>>> {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/auth/login', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
  });
  return bodies;
}

async function submit(page: Page): Promise<void> {
  await page.fill('input[inputmode="email"]', 'superadmin@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
}

test.describe('Superadmin sign-in page', () => {
  test('shows its own heading, no Remember me box and a noindex meta; /login keeps the box and the Login heading', async ({ page }) => {
    await page.goto('/superadmin/sign-in');
    await expect(page.getByRole('heading', { name: 'Superadmin Sign In' })).toBeVisible();
    await expect(page.getByLabel(BOX)).toHaveCount(0);
    await expect(page).toHaveTitle('Superadmin Sign In · DentiSYS');
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByLabel(BOX)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0); // the noindex meta is removed again
    await expect(page).not.toHaveTitle('Superadmin Sign In · DentiSYS');
  });

  test('the request carries sign_in_page "superadmin" and never remember; /login sends no sign_in_page', async ({ page }) => {
    const superBodies = await captureLogin(page, { status: 200, body: { type: 'two_factor_required', two_factor_required: true, two_factor_challenge_token: 'mock-challenge', expires_in: 300 } });
    await page.goto('/superadmin/sign-in');
    await submit(page);
    await expect(page).toHaveURL(/\/2fa\/verify/);
    expect(superBodies).toHaveLength(1);
    expect(superBodies[0].sign_in_page).toBe('superadmin');
    expect(superBodies[0].remember).toBe(false);

    await page.unroute('**/api/auth/login');
    const loginBodies = await captureLogin(page, { status: 200, body: { type: 'two_factor_required', two_factor_required: true, two_factor_challenge_token: 'mock-challenge', expires_in: 300 } });
    await page.goto('/login');
    await submit(page);
    await expect(page).toHaveURL(/\/2fa\/verify/);
    expect(loginBodies).toHaveLength(1);
    expect('sign_in_page' in loginBodies[0]).toBe(false);
  });

  test('a 401 shows the usual credentials error and stays on the page', async ({ page }) => {
    await captureLogin(page, { status: 401, body: { status: 'error', message: 'Invalid credentials.' } });
    await page.goto('/superadmin/sign-in');
    await submit(page);
    await expect(page.getByText('The university email or password is incorrect.')).toBeVisible();
    await expect(page).toHaveURL('/superadmin/sign-in');
  });

  test('Forgot password carries ?from=superadmin, and Back returns to /superadmin/sign-in; from /login it returns to /login', async ({ page }) => {
    await page.goto('/superadmin/sign-in');
    const forgot = page.getByRole('link', { name: 'Forgot password?' });
    await expect(forgot).toHaveAttribute('href', '/forgot-password?from=superadmin');
    await forgot.click();
    await expect(page).toHaveURL('/forgot-password?from=superadmin');
    await expect(page.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/superadmin/sign-in');
    await page.getByRole('link', { name: 'Back to login' }).click();
    await expect(page).toHaveURL('/superadmin/sign-in');

    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    await page.goto('/forgot-password');
    await expect(page.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login');
  });

  test('the invitation banner shows on /login but not on the Superadmin page', async ({ page }) => {
    const banner = page.getByText('DentiSYS accounts are created through invitations.');
    await page.goto('/login?invitationRequired=1');
    await expect(banner).toBeVisible();
    await page.goto('/superadmin/sign-in?invitationRequired=1');
    await expect(page.getByRole('heading', { name: 'Superadmin Sign In' })).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('signing out as the Superadmin returns to /superadmin/sign-in', async ({ page }) => {
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }));
    await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-superadmin-token' }) }));
    await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 100, user_id: 100, login_email: 'superadmin@bicol-u.edu.ph', display_name: 'Sam Superadmin', role: 'superadmin' }) }));
    await page.goto('/superadmin/sign-in');
    await submit(page);
    await expect(page).toHaveURL('/superadmin/overview');
    await page.evaluate(() => sessionStorage.getItem('dentisys.signInPage')).then(v => expect(v).toBe('superadmin'));
    await openAccountMenu(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/superadmin/sign-in');
  });
});
