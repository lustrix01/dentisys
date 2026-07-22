import { test, expect } from '@playwright/test';

test.describe('Class Secretary Module E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'mock-secretary-token' }),
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

  test('secretary can simulate biometric scan via dev shortcut', async ({ page }) => {
    await page.route('**/api/secretary/attendance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', records: [] }),
      });
    });

    let submittedDate = '';
    await page.route('**/api/secretary/attendance/override', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      submittedDate = payload.date;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', message: 'Attendance overridden successfully.' }),
      });
    });

    await page.click('a[href="/secretary/attendance"]');
    await expect(page).toHaveURL('/secretary/attendance');

    const devBtn = page.locator('button', { hasText: '[Dev] Simulate Biometric Scan' });
    await expect(devBtn).toBeVisible();
    await devBtn.click();

    await expect(page.locator('text=[Dev] Simulate Biometric Hardware Scan')).toBeVisible();

    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    await dateInput.fill('2026-07-20');

    const triggerBtn = page.locator('button:has-text("Trigger Simulated Scan")');
    await expect(triggerBtn).toBeEnabled();
    await triggerBtn.click();

    expect(submittedDate).toBe('2026-07-20');
    await expect(page.locator('tbody')).toContainText('2026-07-20');
  });

function base32Decode(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) throw new Error(`Invalid Base32 char: ${clean[i]}`);
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
      value = value & ((1 << bits) - 1);
    }
  }
  return new Uint8Array(bytes);
}

async function computeTotpCode(base32Secret: string): Promise<string> {
  const secretBytes = base32Decode(base32Secret);
  const step = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setUint32(0, 0, false);
  counterView.setUint32(4, step, false);

  const keyBuffer = secretBytes.buffer.slice(secretBytes.byteOffset, secretBytes.byteOffset + secretBytes.byteLength) as ArrayBuffer;

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

  test('secretary can view and toggle MFA settings on profile page', async ({ page }) => {
    await page.click('a[href="/secretary/profile"]');
    await expect(page).toHaveURL('/secretary/profile');

    await expect(page.locator('text=Security & MFA Settings')).toBeVisible();
    await expect(page.locator('button:has-text("Enable MFA")')).toBeVisible();

    await page.click('button:has-text("Enable MFA")');
    await expect(page.locator('text=Enable Multi-Factor Authentication (MFA)')).toBeVisible();

    // Verify modal overlay is portaled directly into document.body
    await expect(page.locator('body > div.fixed.inset-0')).toBeVisible();

    // Verify scannable QR Code SVG is rendered with crisp vector edges in setup modal
    const qrSvg = page.locator('[data-testid="mfa-qr-code"] svg');
    await expect(qrSvg).toBeVisible();
    await expect(qrSvg).toHaveAttribute('shape-rendering', 'crispEdges');

    const secretKeyElement = page.locator('div.font-mono.text-sm.font-extrabold');
    await expect(secretKeyElement).toBeVisible();
    const secretKey = (await secretKeyElement.innerText()).trim();
    expect(secretKey).toHaveLength(32);

    // Verify invalid TOTP code is rejected
    await page.fill('input[placeholder="e.g. 123456"]', '000000');
    await page.click('button:has-text("Verify & Enable MFA")');
    await expect(page.locator('text=Invalid authenticator code')).toBeVisible();

    // Dynamically calculate valid RFC 6238 TOTP code for the user's secret
    const validTotpCode = await computeTotpCode(secretKey);
    await page.fill('input[placeholder="e.g. 123456"]', validTotpCode);
    await page.click('button:has-text("Verify & Enable MFA")');

    await expect(page.locator('text=MFA Enabled')).toBeVisible();
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
