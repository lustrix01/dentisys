import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const GOOGLE_RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  allowed_email_domains: ['bicol-u.edu.ph'],
  providers: {
    identity: {
      password: { enabled: true },
      google: { enabled: true, client_id: 'client.apps.googleusercontent.com' },
      development_mock: { enabled: false },
    },
    email: { active: 'mailpit' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: false },
};

async function installMockGoogleIdentityServices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { callback: null as null | ((response: { credential: string }) => void) };
    (window as unknown as { __mockGoogle: typeof state }).__mockGoogle = state;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        id: {
          initialize: (options: { callback: (response: { credential: string }) => void }) => {
            state.callback = options.callback;
          },
          renderButton: (element: HTMLElement) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue with Google';
            button.onclick = () => state.callback?.({ credential: 'mock-google-credential' });
            element.appendChild(button);
          },
        },
      },
    };
  });
}

test.describe('Auth Module E2E Tests', () => {
  test('login page renders correctly with brand title and form elements', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/DentiSys/i);
    await expect(page.locator('h1')).toContainText('DentiSYS');
    await expect(page.locator('h2')).toContainText('Login to Your Account');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    const unavailableGoogle = page.getByRole('button', { name: 'Continue with Google' });
    await expect(unavailableGoogle).toBeVisible();
    await expect(unavailableGoogle).toBeDisabled();
    await expect(page.getByText('Google Sign-In is not configured in this environment.')).toBeVisible();
  });

  test('all legacy signup URLs redirect to login with an invitation-required notice', async ({ page }) => {
    for (const path of ['/signup', '/register', '/signup/student']) {
      await page.goto(path);
      await expect(page).toHaveURL('/login?invitationRequired=1');
      await expect(page.getByText(/accounts are created through invitations/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /create account|request activation/i })).toHaveCount(0);
    }
  });

  test('Faculty invitation acceptance inspects identity, scrubs the token, and activates with a password', async ({ page }) => {
    let acceptedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/auth/faculty/invitation**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', invitation: { name: 'Dr. Test Faculty', email: 'test.faculty@bicol-u.edu.ph', expiresAt: '2026-09-25T00:00:00Z' },
      }) });
    });
    await page.route('**/api/auth/faculty/activate', async route => {
      acceptedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Faculty account activated.' }) });
    });
    await page.goto('/activate-faculty?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await expect(page).toHaveURL('/activate-faculty');
    await expect(page.getByText('Dr. Test Faculty')).toBeVisible();
    await expect(page.getByText('test.faculty@bicol-u.edu.ph')).toBeVisible();
    await page.getByLabel(/^Password$/i).fill('FacultyPass123!');
    await page.getByLabel(/Confirm password/i).fill('FacultyPass123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page).toHaveURL('/login?activated=1');
    expect(acceptedPayload).toEqual({ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', password: 'FacultyPass123!' });
  });

  test('Faculty invitation acceptance may verify Google and preserves the invitation on a mismatch', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/faculty/invitation**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', invitation: { name: 'Dr. Test Faculty', email: 'test.faculty@bicol-u.edu.ph', expiresAt: '2026-09-25T00:00:00Z' },
      }) });
    });
    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/auth/faculty/activate', async route => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Google identity does not match the invited Faculty email.' }) });
    });
    await page.goto('/activate-faculty?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByLabel(/^Password$/i).fill('FacultyPass123!');
    await page.getByLabel(/Confirm password/i).fill('FacultyPass123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page.getByRole('alert')).toContainText(/does not match the invited Faculty email/i);
    await expect(page).toHaveURL('/activate-faculty');
    expect(submittedPayload).toMatchObject({ credential: 'mock-google-credential', token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
  });

  test('Faculty invitation acceptance can complete with matching optional Google verification and password', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/faculty/invitation**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'ok', invitation: { name: 'Dr. Test Faculty', email: 'test.faculty@bicol-u.edu.ph', expiresAt: '2026-09-25T00:00:00Z' },
      }) });
    });
    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/auth/faculty/activate', async route => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Faculty account activated.' }) });
    });
    await page.goto('/activate-faculty?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.getByLabel(/^Password$/i).fill('FacultyPass123!');
    await page.getByLabel(/Confirm password/i).fill('FacultyPass123!');
    await page.getByRole('button', { name: /Accept invitation and activate/i }).click();
    await expect(page).toHaveURL('/login?activated=1');
    expect(submittedPayload).toEqual({
      token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      password: 'FacultyPass123!',
      credential: 'mock-google-credential',
    });
  });

  test('Admin Faculty invitation screen creates and reissues invitations using server state', async ({ page }) => {
    const invitations: Array<{ id: string; name: string; email: string; status: string; invitedAt: string; expiresAt: string }> = [];
    let reissuePayload: Record<string, unknown> | null = null;
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'admin-access-token', user: { user_id: 1 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_id: 1, login_email: 'admin@bicol-u.edu.ph', display_name: 'Admin', role: 'admin', authentication_source: 'password' }) });
    });
    await page.route('**/api/admin/faculty-invitations', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', invitations }) });
        return;
      }
      const body = route.request().postDataJSON() as { name: string; email: string };
      if (body.name.includes(',')) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ status: 'error', code: 'VALIDATION_ERROR', message: 'Validation failed.', errors: [{ field: 'name', message: 'Name can only contain letters, spaces, hyphens, apostrophes, and periods.' }] }) });
        return;
      }
      const existing = invitations.find(invitation => invitation.email === body.email);
      if (existing) existing.invitedAt = new Date().toISOString();
      else invitations.push({ id: '17', name: body.name, email: body.email, status: 'Pending', invitedAt: new Date().toISOString(), expiresAt: '2026-09-26T00:00:00Z' });
      const invitation = invitations.find(item => item.email === body.email);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', delivery_status: 'Sent', invitation }) });
    });
    await page.route('**/api/admin/faculty-invitations/reissue', async route => {
      const body = route.request().postDataJSON() as { id: string };
      reissuePayload = body;
      const existing = invitations.find(invitation => invitation.id === body.id);
      if (!existing) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'This Faculty account cannot be re-invited.' }) });
        return;
      }
      existing.invitedAt = new Date().toISOString();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', delivery_status: 'Sent', invitation: existing }) });
    });
    await page.goto('/admin/faculty-invite');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Faculty Invitations' })).toBeVisible();
    await page.getByLabel('Faculty name').fill('Dr. Invalid, DMD');
    await page.getByLabel('Institutional email').fill('invalid.faculty@bicol-u.edu.ph');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByRole('alert')).toContainText(/Name can only contain letters/i);
    await page.getByLabel('Faculty name').fill('Dr. Test Faculty');
    await page.getByLabel('Institutional email').fill('test.faculty@bicol-u.edu.ph');
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('test.faculty@bicol-u.edu.ph')).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();
    await page.getByRole('button', { name: 'Reissue' }).click();
    await expect(page.getByText(/Invitation sent to test.faculty@bicol-u.edu.ph/)).toBeVisible();
    expect(reissuePayload).toEqual({ id: '17' });
  });

  test('Faculty roster invite sends canonical Student and class identifiers to the server', async ({ page }) => {
    await page.route('**/api/auth/refresh', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'faculty-access-token', user: { user_id: 7 } }) });
    });
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_id: 7, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Faculty', role: 'faculty', authentication_source: 'password' }) });
    });
    await page.route('**/api/faculty/classes', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', classes: [{ id: '77', csId: 77, csName: 'CLIN401-A', courseId: 1, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', units: 3, schoolYear: '2026-2027', semester: '1st Semester', yearLevel: 4, block: 'A', schedule: 'TBA', enrolledCount: 1, instructorName: 'Faculty', status: 'Active' }] }) });
    });
    await page.route('**/api/faculty/courses', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', courses: [] }) });
    });
    await page.route('**/api/faculty/students', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '42', studentId: 'P03-42', name: 'Test Student', email: 'student@bicol-u.edu.ph', yearLevel: 4, status: 'active', faceEnrolled: false, consentStatus: 'pending', classSections: [{ classId: '77', className: 'CLIN401-A', enrollmentId: '88' }] }]) });
    });
    let submittedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/faculty/student-invitations', async route => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Student invitation issued and sent.' }) });
    });
    await page.goto('/classes');
    await page.getByRole('button', { name: /Enrolled Student Roster/i }).click();
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(page.getByText('Student invitation issued and sent.')).toBeVisible();
    expect(submittedPayload).toEqual({ studentId: '42', classId: '77' });
  });

  test('activate secretary page loads correctly', async ({ page }) => {
    await page.goto('/activate-secretary');
    await expect(page.locator('body')).toContainText(/Class Secretary|Invitation|Activate/i);
  });

  test('forgot password page loads correctly', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('body')).toContainText(/Password/i);
  });

  test('forgot password flow presents development reset link on submit', async ({ page }) => {
    await page.route('**/api/auth/password/reset-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          token: 'mocktoken123456789012345678901234',
          reset_link: 'http://localhost:5173/reset-password?token=mocktoken123456789012345678901234',
          message: 'If an account exists with that email address, password reset instructions have been issued.',
        }),
      });
    });

    await page.goto('/forgot-password');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.click('button[type="submit"]');

    await expect(page.locator('body')).toContainText(/Check your email/i);
    await expect(page.locator('body')).toContainText(/Development Mode Reset Link/i);

    const resetBtn = page.locator('a', { hasText: /Reset Password Now/i });
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toHaveAttribute('href', /\/reset-password\?token=/);
  });

  test('forgot password flow hides development reset link when reset_link is null', async ({ page }) => {
    await page.route('**/api/auth/password/reset-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          token: null,
          reset_link: null,
          message: 'If an account exists with that email address, password reset instructions have been issued.',
        }),
      });
    });

    await page.goto('/forgot-password');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.click('button[type="submit"]');

    await expect(page.locator('body')).toContainText(/Check your email/i);
    await expect(page.locator('body')).not.toContainText(/Development Mode Reset Link/i);
  });

  test('login flow redirects user to dashboard when authenticated', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-access-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          login_email: 'faculty@bicol-u.edu.ph',
          display_name: 'Dr. Faculty User',
          role: 'faculty',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'faculty@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
  });

  test('login with 2FA enrolled goes directly to authenticator verification before a session is issued', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'two_factor_required',
          two_factor_required: true,
          two_factor_enrolled: true,
          two_factor_challenge_token: 'mock-two-factor-session-123456',
          expires_in: 300,
        }),
      });
    });

    await page.route('**/api/auth/mfa/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'mock-mfa-verified-access-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          login_email: 'mfa_user@bicol-u.edu.ph',
          display_name: 'Dr. MFA User',
          role: 'faculty',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'mfa_user@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/2fa/verify');
    await expect(page.locator('body')).toContainText(/Two-Factor Authentication/i);

    // Enter 6-digit code and submit
    await page.fill('input[placeholder="000000"]', '123456');
    await page.click('button[type="submit"]');

    // Should proceed to dashboard home upon successful TOTP verification
    await expect(page).toHaveURL('/');
  });

test('mocked Google direct login completes normal authentication', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/google', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-google-access-token' }),
      });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 20, user_id: 20, login_email: 'google@bicol-u.edu.ph', display_name: 'Google Faculty', role: 'faculty', authentication_source: 'google' }),
      });
    });

    await page.goto('/login');
    const googleButton = page.getByRole('button', { name: 'Continue with Google' });
    await expect(googleButton).toBeVisible();
    await googleButton.click();
    await expect(page).toHaveURL('/');
  });

  test('mocked Google first-time linking prompts for DentiSys password and completes login', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/google', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'account_link_required', account_link_required: true, email: 'faculty@bicol-u.edu.ph', link_challenge_token: 'mock-link-challenge' }),
      });
    });
    await page.route('**/api/auth/google/link', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-linked-google-access-token' }),
      });
    });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 21, user_id: 21, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Linked Faculty', role: 'faculty', authentication_source: 'google' }),
      });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText('Confirm your DentiSys password to link this Google account.')).toBeVisible();
    await page.getByPlaceholder('DentiSys password').fill('Faculty123!');
    await page.getByRole('button', { name: 'Confirm and link Google' }).click();
    await expect(page).toHaveURL('/');
  });

  test('mocked Google domain policy error is surfaced to the user', async ({ page }) => {
    await installMockGoogleIdentityServices(page);
    await page.route('**/api/runtime-config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
    });
    await page.route('**/api/auth/google', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', code: 'GOOGLE_DOMAIN_NOT_ALLOWED', message: 'Google Workspace domain is not allowed.' }),
      });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText('Google Workspace domain is not allowed.')).toBeVisible();
  });

  test('password reset and login lifecycle remains available', async ({ page }) => {
    const testEmail = 'testfaculty_reset@bicol-u.edu.ph';
    const testPassword = 'NewFacultyPass123!';
    const mockToken = 'testresettoken9876543210987654';
    const resetUrl = `http://localhost:5173/reset-password?token=${mockToken}`;

    // 2. Intercept Password Reset Request API
    await page.route('**/api/auth/password/reset-request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          token: mockToken,
          reset_link: resetUrl,
          message: 'Password reset instructions have been issued.',
        }),
      });
    });

    // Navigate to /forgot-password and submit reset request
    await page.goto('/forgot-password');
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    // Assert development reset link is displayed
    await expect(page.locator('body')).toContainText(/Development Mode Reset Link/i);
    const resetBtn = page.locator('a', { hasText: /Reset Password Now/i });
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toHaveAttribute('href', resetUrl);

    // 3. Intercept Password Reset Confirm API
    await page.route('**/api/auth/password/reset-confirm', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          message: 'Password reset successfully!',
        }),
      });
    });

    // Follow the reset link to /reset-password?token=...
    await page.goto(`/reset-password?token=${mockToken}`);
    await page.fill('input[id="password"]', testPassword);
    await page.fill('input[id="confirm-password"]', testPassword);
    await page.click('button[type="submit"]');

    // 4. Intercept Login API & Auth Me API for testing login with new password
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-new-password-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 99,
          login_email: testEmail,
          display_name: 'Test Faculty',
          role: 'faculty',
        }),
      });
    });

    // Assert redirection to /login or navigate to /login and verify logging in with new password
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Login to Your Account');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Verify redirected to dashboard home
    await expect(page).toHaveURL('/');
  });

  test('authenticator enrollment requires an authenticated profile session', async ({ request }) => {
    const response = await request.post('/api/auth/mfa/enroll/start', {
      headers: {
        'Authorization': 'Bearer invalid-access-token',
      },
    });
    expect([401, 502]).toContain(response.status());
  });
});

test('configured Google Sign-In reports GIS script load failure without blocking password login', async ({ page }) => {
  await page.route('**/api/runtime-config', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GOOGLE_RUNTIME_CONFIG) });
  });
  await page.route('**/gsi/client', async (route) => {
    await route.abort();
  });

  await page.goto('/login');
  await expect(page.getByRole('alert')).toContainText('Google Sign-In could not be loaded.');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
