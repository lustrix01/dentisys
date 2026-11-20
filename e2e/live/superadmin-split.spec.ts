import { test, expect } from '@playwright/test';
import { signInSuperadmin, SUPERADMIN_EMAIL } from './superadminSignIn';

// Backlog 13.9 live checks against the real backend and the dev seed.
// Each Superadmin sign-in may wait up to 30 s for a fresh authenticator step, so the tests get more than the 30 s default.
test.describe.configure({ timeout: 120_000 });
test('Superadmin signs in with password and authenticator code, sees its own pages and no switcher', async ({ page }) => {
  await signInSuperadmin(page);
  for (const p of ['/superadmin/overview', '/superadmin/people', '/superadmin/classes', '/superadmin/course-catalog', '/superadmin/terms', '/superadmin/rooms', '/superadmin/face-flags', '/superadmin/audit-trail']) {
    await expect(page.locator(`a[href="${p}"]`).first()).toBeAttached();
  }
  await expect(page.locator('[aria-label="Account view"]')).toHaveCount(0);
  await page.goto('/admin/reports'); // a Dean page
  await expect(page).toHaveURL('/superadmin/overview'); // the Superadmin goes back to its own home
  await page.reload();
  await expect(page).toHaveURL('/superadmin/overview'); // the session survives a reload
});

test('Superadmin cannot turn 2FA off and the Dean routes refuse it', async ({ page }) => {
  await signInSuperadmin(page);
  const token = await page.evaluate(async () => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return (await response.json()).access_token as string;
  });
  const headers = { Authorization: `Bearer ${token}` };
  expect((await page.request.get('/api/admin/dashboard/kpis', { headers })).status()).toBe(403);
  const revoke = await page.request.post('/api/auth/mfa/settings/revoke', { headers, data: { code: '000000' } });
  expect(revoke.status()).toBe(403);
  expect((await revoke.json()).code).toBe('two_factor_required');
  const me = await page.request.get('/api/auth/me', { headers });
  expect((await me.json()).login_email ?? SUPERADMIN_EMAIL).toBe(SUPERADMIN_EMAIL);
});

test('Dean My Activity shows only rows the Dean account did', async ({ page }) => {
  // live.spec.ts turns on the Dean's 2FA earlier in the run; the Superadmin resets it from People & Accounts (D14) so the Dean
  // can sign in with the password here.
  await signInSuperadmin(page);
  const superToken = await page.evaluate(async () => (await (await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })).json()).access_token as string);
  const superHeaders = { Authorization: `Bearer ${superToken}` };
  // Search by the Dean's email: the integration suite adds Faculty accounts that can push the Dean off page 1.
  const deanEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@bicol-u.edu.ph';
  const people = await (await page.request.get(`/api/admin/people?kind=faculty&status=all&page=1&q=${encodeURIComponent(deanEmail)}`, { headers: superHeaders })).json();
  const dean = (people.people as Array<{ userId: number; isDean?: boolean; twoFactor: boolean }>).find(p => p.isDean);
  expect(dean).toBeTruthy();
  if (dean!.twoFactor) {
    const reset = await page.request.post('/api/admin/people/reset-2fa', { headers: superHeaders, data: { userId: dean!.userId, reason: 'Live test resets the Dean 2FA' } });
    expect(reset.status()).toBe(200);
  }
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill(process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/');
  const token = await page.evaluate(async () => (await (await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })).json()).access_token as string);
  const response = await page.request.get('/api/admin/audit-logs?signins=1', { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  const body = await response.json();
  // A "Dean role handed over" row that targets the Dean shows in the Dean's own list whoever did it (contract section 7).
  const emails = new Set<string>((body.entries as Array<{ what?: string; who?: { email?: string } }>)
    .filter(e => e.what !== 'Dean role handed over').map(e => e.who?.email ?? '').filter(Boolean));
  expect([...emails]).toEqual(emails.size === 0 ? [] : [process.env.E2E_ADMIN_EMAIL ?? 'admin@bicol-u.edu.ph']);
  expect(body.attention ?? {}).toEqual({});
  await page.goto('/admin/audit-trail');
  await expect(page.getByRole('heading', { level: 1, name: 'My Activity' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Audit views' })).toHaveCount(0);
});
