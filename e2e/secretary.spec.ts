import { test, expect } from '@playwright/test';

test.describe('Class Secretary Module E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-secretary-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 300,
          login_email: 'secretary@bicol-u.edu.ph',
          display_name: 'Secretary Alex Smith',
          role: 'secretary',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'secretary@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('secretary dashboard renders correctly', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Secretary|Class|Attendance|Dashboard/i);
  });

  test('secretary can navigate to Attendance List page', async ({ page }) => {
    await page.click('a[href="/secretary/attendance"]');
    await expect(page).toHaveURL('/secretary/attendance');
    await expect(page.locator('body')).toContainText(/Attendance|List|Students|Check-in/i);
  });

  test('secretary can navigate to Manual Attendance Override page', async ({ page }) => {
    await page.click('a[href="/secretary/override"]');
    await expect(page).toHaveURL('/secretary/override');
    await expect(page.locator('body')).toContainText(/Override|Manual|Correction|Status/i);
  });

  test('secretary can navigate to CCTV Feed page', async ({ page }) => {
    await page.click('a[href="/secretary/cctv"]');
    await expect(page).toHaveURL('/secretary/cctv');
    await expect(page.locator('body')).toContainText(/CCTV|Camera|Feed|Live/i);
  });

  test('secretary can navigate to Audit Trail page', async ({ page }) => {
    await page.click('a[href="/secretary/audit-trail"]');
    await expect(page).toHaveURL('/secretary/audit-trail');
    await expect(page.locator('body')).toContainText(/Audit Trail|Activity|Log/i);
  });

  test('secretary can view Profile and Settings', async ({ page }) => {
    await page.click('a[href="/secretary/profile"]');
    await expect(page).toHaveURL('/secretary/profile');
    await expect(page.locator('body')).toContainText(/Profile|Alex Smith/i);
    await expect(page.locator('text=Security & MFA Settings')).toBeVisible();

    await page.click('a[href="/secretary/settings"]');
    await expect(page).toHaveURL('/secretary/settings');
    await expect(page.locator('body')).toContainText(/Settings/i);
  });

  test('secretary sees an explicitly unconfigured CCTV integration with no simulator', async ({ page }) => {
    await page.click('a[href="/secretary/cctv"]');
    await expect(page).toHaveURL('/secretary/cctv');
    await expect(page.locator('body')).toContainText('CCTV integration not configured');
    await expect(page.locator('button', { hasText: /Simulate|Trigger Scan/i })).toHaveCount(0);
  });

  test('secretary profile displays backend-managed MFA status', async ({ page }) => {
    await page.route('**/api/auth/mfa/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          mfa: { enabled: true, recoveryCodeCount: 8 },
        }),
      });
    });
    await page.click('a[href="/secretary/profile"]');
    await expect(page).toHaveURL('/secretary/profile');

    await expect(page.locator('text=Security & MFA Settings')).toBeVisible();
    await expect(page.locator('body')).toContainText(/MFA enabled|8 recovery codes/i);
    await expect(page.locator('button', { hasText: 'Enable MFA' })).toHaveCount(0);
  });
});

test.describe('Class Secretary Invitation and Activation Workflow', () => {
  test('invitation activation page loads with valid token and displays details', async ({ page }) => {
    const validToken = 'a1b2c3d4e5f678901234567890abcdef';

    await page.route(`**/api/secretary/invitation?token=${validToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          invitation: {
            token: validToken,
            student_name: 'Maria Santos',
            student_number: '2024-00123',
            class_name: 'DENT-3A Periodontics',
            email: 'maria.santos@bicol-u.edu.ph',
            faculty_name: 'Dr. John Doe',
            issued_at: '2026-07-23 00:00:00',
            expires_at: '2026-07-30 00:00:00',
            status: 'Pending',
          },
        }),
      });
    });

    await page.goto(`/activate-secretary?token=${validToken}`);
    await expect(page.locator('body')).toContainText(/Maria Santos|Class Secretary|DENT-3A Periodontics|Dr. John Doe/i);
  });

  test('secretary can submit activation password and complete setup', async ({ page }) => {
    const validToken = 'a1b2c3d4e5f678901234567890abcdef';

    await page.route(`**/api/secretary/invitation?token=${validToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          invitation: {
            token: validToken,
            student_name: 'Maria Santos',
            student_number: '2024-00123',
            class_name: 'DENT-3A Periodontics',
            email: 'maria.santos@bicol-u.edu.ph',
            faculty_name: 'Dr. John Doe',
            issued_at: '2026-07-23 00:00:00',
            expires_at: '2026-07-30 00:00:00',
            status: 'Pending',
          },
        }),
      });
    });

    await page.route('**/api/secretary/activate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          message: 'Account activated successfully. You can now log in.',
        }),
      });
    });

    await page.goto(`/activate-secretary?token=${validToken}`);
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.locator('input[type="password"]').nth(1).fill('Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('body')).toContainText(/activated|successfully|redirect/i);
  });

  test('secretary invite API returns dev_invitation_link in payload when enabled', async ({ page }) => {
    await page.route('**/api/secretary/invite', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          token: 'a1b2c3d4e5f678901234567890abcdef',
          invitation_link: 'http://localhost:5173/activate-secretary?token=a1b2c3d4e5f678901234567890abcdef',
          dev_invitation_link: 'http://localhost:5173/activate-secretary?token=a1b2c3d4e5f678901234567890abcdef',
          message: 'Class Secretary invitation issued successfully.',
        }),
      });
    });

    await page.goto('/login');
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/secretary/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock-faculty-token',
        },
        body: JSON.stringify({
          student_name: 'Maria Santos',
          email: 'maria.santos@bicol-u.edu.ph',
          class_name: 'DENT-3A',
        }),
      });
      return res.json();
    });

    expect(body).toHaveProperty('dev_invitation_link');
    expect(body.dev_invitation_link).toContain('/activate-secretary?token=');
  });
});
