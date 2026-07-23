import { test, expect } from '@playwright/test';

test.describe('Admin (Dean) Module E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-admin-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 100,
          login_email: 'dean@bicol-u.edu.ph',
          display_name: 'Dr. Dean Admin',
          role: 'admin',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'dean@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('admin dashboard renders user info and role panel', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Dean|Office of the Dean|Dashboard/i);
  });

  test('admin can navigate to Faculty Approval page', async ({ page }) => {
    await page.click('a[href="/admin/faculty-approval"]');
    await expect(page).toHaveURL('/admin/faculty-approval');
    await expect(page.locator('body')).toContainText(/Faculty Approval|Registrations|Pending/i);
  });

  test('admin can navigate to Retention Criteria page', async ({ page }) => {
    await page.click('a[href="/admin/retention-criteria"]');
    await expect(page).toHaveURL('/admin/retention-criteria');
    await expect(page.locator('body')).toContainText(/Retention|Criteria|Policy/i);
  });

  test('admin can navigate to System Audit Reports page', async ({ page }) => {
    await page.click('a[href="/admin/reports"]');
    await expect(page).toHaveURL('/admin/reports');
    await expect(page.locator('body')).toContainText(/Report|Audit|System/i);
  });

  test('admin can navigate to Audit Trail page', async ({ page }) => {
    await page.click('a[href="/admin/audit-trail"]');
    await expect(page).toHaveURL('/admin/audit-trail');
    await expect(page.locator('body')).toContainText(/Audit Trail|Activity Log/i);
  });

  test('admin can view Profile page', async ({ page }) => {
    await page.click('a[href="/admin/profile"]');
    await expect(page).toHaveURL('/admin/profile');
    await expect(page.locator('body')).toContainText(/Profile|Dean/i);
  });

  test('admin can view Settings page', async ({ page }) => {
    await page.click('a[href="/admin/settings"]');
    await expect(page).toHaveURL('/admin/settings');
    await expect(page.locator('body')).toContainText(/Settings/i);
  });
});
