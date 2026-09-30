import { test, expect } from './fixtures';

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
    await page.fill('input[inputmode="email"]', 'dean@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('admin dashboard renders user info and role panel', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Dean|Office of the Dean|Dashboard/i);
  });

  test('admin can navigate to the Faculty Invitation page', async ({ page }) => {
    await page.click('a[href="/admin/faculty-invite"]');
    await expect(page).toHaveURL('/admin/faculty-invite');
    await expect(page.locator('body')).toContainText(/Faculty Invitation|Invite|Pending/i);
  });

  test('admin can reach reports from the retained retention-criteria redirect', async ({ page }) => {
    await page.click('a[href="/admin/reports"]');
    await expect(page).toHaveURL('/admin/reports');
    await expect(page.locator('body')).toContainText(/Report|System|Analytics/i);
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
  test('Dean Dashboard shows server charts and the latest audit events', async ({ page }) => {
    await page.route('**/api/admin/dashboard/kpis**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', currentSchoolYear: '2026-2027', schoolYearFilter: '2026-2027', availableSchoolYears: ['2026-2027'],
          kpis: { totalStudents: 10, totalFaculty: 3, goodStanding: 7, atRisk: 3, remedialCount: 1, attendanceRate: 91 },
          gwaBuckets: [{ range: '1.0–1.5', count: 2, color: '#000' }, { range: '3.0+', count: 1, color: '#000' }],
          statusCounts: { active: 7, warning: 1, critical: 1, remedial: 1 },
          classAttendance: [{ name: 'CLINIC-4A', rate: 92 }],
          recentAuditEvents: [
            { id: '1', occurredAt: '2026-09-30T01:00:00Z', actorName: 'Dr. Roberto Santos', actorEmail: 'faculty@bicol-u.edu.ph', actorRole: 'faculty', module: 'grading', action: 'grades_recomputed', description: 'Recomputed grades: 30 computed, 0 not computed.', status: 'Success' },
          ],
        }),
      });
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Grade distribution' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Standing breakdown' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Attendance by class' })).toBeVisible();
    const events = page.getByRole('region', { name: 'Latest audit events' });
    await expect(events).toContainText('Dr. Roberto Santos');
    await expect(events).toContainText('faculty@bicol-u.edu.ph');
    await expect(events).toContainText('Recomputed grades: 30 computed');
  });
});
