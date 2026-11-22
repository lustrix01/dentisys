import { test, expect, signInAs } from './fixtures';
import type { Page } from '@playwright/test';

const ENABLED_RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  allowed_email_domains: ['bicol-u.edu.ph'],
  providers: {
    identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
    email: { active: 'mailpit' },
    biometrics: { active: 'sidecar' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: true },
};

async function signInMockStudent(page: Page, studentId = 41) {
  await page.route('**/api/runtime-config', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ENABLED_RUNTIME_CONFIG) }),
  );
  await page.route('**/api/auth/refresh', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'mock-student-token', user: { user_id: studentId } }) }),
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: studentId,
        login_email: 'student.129@bicol-u.edu.ph',
        display_name: 'Maria Santos',
        role: 'student',
        session_uuid: 'student-129-session',
        authentication_source: 'password',
        student: { student_id: studentId, student_number: '2024-0129', status: 'active' },
      }),
    }),
  );
}

test.describe('Backlog 12.9 Face revocation approval, mismatch blocks, and repeat-revoke flagging', () => {
  test('Student Step 1 consent disclosure describes Superadmin revocation review', async ({ page }) => {
    await signInMockStudent(page);
    await page.route('**/api/student/biometric/profile', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          consentGranted: false,
          enrollmentStatus: 'not_enrolled',
          enrolledAt: null,
          expiresAt: null,
          usableSampleCount: 0,
          requiredUsableSamples: 20,
          manualFallbackAvailable: true,
          pendingRevokeRequest: null,
          latestRejectedRevokeRequest: null,
        }),
      }),
    );

    await page.goto('/student/face-registration');
    await expect(
      page.getByText(/Enrolled Students submit a revocation request with a reason on this page for Superadmin review/i),
    ).toBeVisible();
  });

  test('Student submits revoke request with validation, sees pending banner, and can cancel it', async ({ page }) => {
    await signInMockStudent(page);
    let pending: { requestId: number; reason: string; status: 'pending'; createdAt: string } | null = null;
    const postedReasons: string[] = [];
    let cancelledCount = 0;

    const profileBody = () => ({
      status: 'ok',
      consentGranted: true,
      enrollmentStatus: 'active',
      enrolledAt: '2026-10-01T08:00:00+08:00',
      expiresAt: '2026-12-20',
      usableSampleCount: 25,
      requiredUsableSamples: 20,
      manualFallbackAvailable: true,
      pendingRevokeRequest: pending,
      latestRejectedRevokeRequest: null,
    });

    await page.route('**/api/student/biometric/profile', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profileBody()) }),
    );
    await page.route('**/api/student/biometrics/revoke-request', async route => {
      if (route.request().method() === 'POST') {
        const { reason } = route.request().postDataJSON() as { reason: string };
        postedReasons.push(reason);
        pending = { requestId: 91, reason, status: 'pending', createdAt: '2026-10-12T09:15:00+08:00' };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', request: pending, biometric: profileBody(), ...profileBody() }),
        });
        return;
      }
      cancelledCount += 1;
      pending = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', biometric: profileBody(), ...profileBody() }),
      });
    });

    await page.goto('/student/face-registration');
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'Revoke registration' })).toHaveCount(0);
    await main.getByRole('button', { name: 'Request revocation' }).click();

    const dialog = page.locator('body > div.fixed.inset-0');
    await expect(dialog.getByRole('heading', { name: 'Request Face Revocation' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Submit revocation request' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a reason of 8 to 240 characters.');
    expect(postedReasons).toHaveLength(0);

    await dialog.getByLabel(/Reason/).fill('short');
    await dialog.getByRole('button', { name: 'Submit revocation request' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a reason of 8 to 240 characters.');
    expect(postedReasons).toHaveLength(0);

    await dialog.getByLabel(/Reason/).fill('Replaced my phone and cannot pass check-in reliably.');
    await dialog.getByRole('button', { name: 'Submit revocation request' }).click();
    await expect.poll(() => postedReasons.length).toBe(1);

    await expect(main.getByText('Revocation request pending')).toBeVisible();
    await expect(main.getByText('Replaced my phone and cannot pass check-in reliably.')).toBeVisible();
    await expect(
      main.getByText('Your face registration stays active for attendance check-in until the Superadmin approves this request.'),
    ).toBeVisible();
    await expect(main.getByRole('button', { name: 'Request revocation' })).toHaveCount(0);

    await main.getByRole('button', { name: 'Cancel request' }).click();
    await expect(dialog.getByRole('heading', { name: 'Cancel Revocation Request?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel request' }).click();
    await expect.poll(() => cancelledCount).toBe(1);
    await expect(main.getByText('Revocation request pending')).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Request revocation' })).toBeVisible();
  });

  test('Student sees latest rejection banner and Update my face cancels pending request before capture', async ({ page }) => {
    await signInMockStudent(page);
    let pending: { requestId: number; reason: string; status: 'pending'; createdAt: string } | null = {
      requestId: 92,
      reason: 'Want to re-register in better lighting.',
      status: 'pending',
      createdAt: '2026-10-12T09:15:00+08:00',
    };
    let cancelCalls = 0;

    const profileBody = () => ({
      status: 'ok',
      consentGranted: true,
      enrollmentStatus: 'active',
      enrolledAt: '2026-10-01T08:00:00+08:00',
      expiresAt: '2026-12-20',
      usableSampleCount: 25,
      requiredUsableSamples: 20,
      manualFallbackAvailable: true,
      pendingRevokeRequest: pending,
      latestRejectedRevokeRequest: null,
    });

    await page.route('**/api/student/biometric/profile', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profileBody()) }),
    );
    await page.route('**/api/student/biometrics/revoke-request', route => {
      cancelCalls += 1;
      pending = null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', biometric: profileBody() }) });
    });

    await page.goto('/student/face-registration');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Update my face' }).click();
    const dialog = page.locator('body > div.fixed.inset-0');
    await expect(dialog.getByRole('heading', { name: 'Cancel Pending Revocation Request?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue to update' }).click();
    await expect.poll(() => cancelCalls).toBe(1);
    await expect(main.getByRole('heading', { name: 'Facial Alignment & Active Liveness' })).toBeVisible();

    // Also verify rejected banner when latestRejectedRevokeRequest is set.
    await page.unroute('**/api/student/biometric/profile');
    await page.route('**/api/student/biometric/profile', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...profileBody(),
          pendingRevokeRequest: null,
          latestRejectedRevokeRequest: {
            requestId: 90,
            reason: 'Want to switch devices.',
            reviewNote: 'Please verify your ID at the Dental Office first.',
            reviewedAt: '2026-10-11T14:20:00+08:00',
          },
        }),
      }),
    );
    await page.goto('/student/face-registration');
    await expect(main.getByText('Previous revocation request rejected')).toBeVisible();
    await expect(main.getByText('Please verify your ID at the Dental Office first.')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Request revocation' })).toBeVisible();
  });

  test('Update my face 409 face_update_mismatch keeps registration active and displays server message', async ({ page }) => {
    await page.addInitScript(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 320, 240);
      }
      const stream = canvas.captureStream(15);
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => stream,
          enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'mock-cam', label: 'Mock Camera' }],
        },
      });
    });

    await signInMockStudent(page);
    await page.route('**/api/student/biometric/profile', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          consentGranted: true,
          enrollmentStatus: 'active',
          enrolledAt: '2026-10-01T08:00:00+08:00',
          expiresAt: '2026-12-20',
          usableSampleCount: 25,
          requiredUsableSamples: 20,
          manualFallbackAvailable: true,
          pendingRevokeRequest: null,
          latestRejectedRevokeRequest: null,
        }),
      }),
    );
    await page.route('**/api/student/biometric/liveness/challenge', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          challengeId: '77',
          challengeToken: 'mock-challenge-token',
          actions: ['blink', 'turn_left'],
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        }),
      }),
    );
    let guidanceCalls = 0;
    await page.route('**/api/student/biometric/liveness/guidance', route => {
      guidanceCalls += 1;
      let detectedAction: 'blink' | 'turn_left' | null = null;
      if (guidanceCalls === 11) detectedAction = 'blink';
      else if (guidanceCalls === 22) detectedAction = 'turn_left';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ faceDetected: true, usable: true, detectedAction, issue: null }),
      });
    });
    await page.route('**/api/student/biometric/enrollment', route =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          code: 'face_update_mismatch',
          message: 'Your face could not be matched to your current registration. If this is you, please request a revocation instead.',
        }),
      }),
    );

    await page.goto('/student/face-registration');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Update my face' }).click();
    const startBtn = main.getByRole('button', { name: 'Start face capture' });
    await expect(startBtn).toBeEnabled({ timeout: 10_000 });
    await startBtn.click();

    await expect(main.getByText('Your face is registered for attendance')).toBeVisible({ timeout: 15_000 });
    await expect(main.getByRole('alert')).toContainText(
      'Your face could not be matched to your current registration. If this is you, please request a revocation instead.',
    );
  });

  test('Superadmin Overview, /superadmin/face-flags redirect, Revoke Requests (Approve/Reject), and Flags (F2/F3)', async ({ page }) => {
    await signInAs(page, 'superadmin');

    const requests = [
      {
        requestId: 301,
        status: 'pending',
        reason: 'Switched to a new mobile device and old face check fails.',
        reviewNote: null,
        schoolYear: '2026-2027',
        semester: '1ST',
        createdAt: '2026-10-12T08:00:00+08:00',
        reviewedAt: null,
        cancelledAt: null,
        reviewedBy: null,
        student: { studentId: 7, userId: 71, name: 'Juan Dela Cruz', studentNo: '2024-0007' },
        classes: [{ csId: 1, label: 'CLIN401-A', current: true }],
        approvedThisTermCount: 2,
      },
      {
        requestId: 302,
        status: 'pending',
        reason: 'Want to re-enroll under brighter lighting.',
        reviewNote: null,
        schoolYear: '2026-2027',
        semester: '1ST',
        createdAt: '2026-10-12T08:30:00+08:00',
        reviewedAt: null,
        cancelledAt: null,
        reviewedBy: null,
        student: { studentId: 8, userId: 72, name: 'Ana Reyes', studentNo: '2024-0008' },
        classes: [{ csId: 1, label: 'CLIN401-A', current: true }],
        approvedThisTermCount: 0,
      },
    ];
    const flags = [
      {
        flagId: 401,
        kind: 'F2',
        status: 'open',
        student: { studentId: 9, userId: 73, name: 'Carlo Mendoza', studentNo: '2024-0009' },
        classes: [{ csId: 1, label: 'CLIN401-A', current: true }],
        detail: { attemptedAt: '2026-10-12T09:00:00+08:00' },
        createdAt: '2026-10-12T09:00:00+08:00',
        updatedAt: '2026-10-12T09:00:00+08:00',
        closedAt: null,
        closedBy: null,
        closedNote: null,
      },
      {
        flagId: 402,
        kind: 'F3',
        status: 'open',
        student: { studentId: 10, userId: 74, name: 'Liza Aquino', studentNo: '2024-0010' },
        classes: [{ csId: 1, label: 'CLIN401-A', current: true }],
        detail: { approvedCount: 3, semester: '1ST', schoolYear: '2026-2027', latestApprovedAt: '2026-10-11T16:00:00+08:00' },
        createdAt: '2026-10-11T16:00:00+08:00',
        updatedAt: '2026-10-11T16:00:00+08:00',
        closedAt: null,
        closedBy: null,
        closedNote: null,
      },
    ];

    const approveCalls: Array<{ requestId: number; note?: string }> = [];
    const rejectCalls: Array<{ requestId: number; note: string }> = [];

    await page.route('**/api/admin/overview', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          faceFlagsOpen: 2,
          faceRevokeRequestsPending: 2,
          attention: {
            expiredInvitations: { faculty: 0, students: 0 },
            facultyWithoutClasses: 0,
            inactive30: { faculty: 0, students: 0 },
            nextTermMissing: false,
            faceRevokeRequestsPending: 2,
          },
          accounts: { faculty: { active: 2, invited: 0, deactivated: 0 }, students: { active: 10, invited: 0, deactivated: 0 } },
          signIns: [],
          security: { twoFactor: { faculty: { on: 2, total: 2 }, students: { on: 0, total: 10 } }, failedSignIns: [] },
          yearLevels: [],
          sectionsByCourse: [],
          setup: { currentTerm: { semester: '1ST', schoolYear: '2026-2027', endDate: '2026-12-18' }, courses: { active: 5, retired: 0 }, rooms: { active: 4, retired: 0 } },
          recentAuditEvents: [],
        }),
      }),
    );
    await page.route('**/api/admin/face-revoke-requests**', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/approve')) {
        const body = route.request().postDataJSON() as { requestId: number; note?: string };
        approveCalls.push(body);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', request: { ...requests[0], status: 'approved' }, flagged: true }) });
      }
      if (url.pathname.endsWith('/reject')) {
        const body = route.request().postDataJSON() as { requestId: number; note: string };
        rejectCalls.push(body);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', request: { ...requests[1], status: 'rejected', reviewNote: body.note } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', requests, total: requests.length, page: 1, pageSize: 50, pendingCount: 2 }) });
    });
    await page.route('**/api/admin/face-flags**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', flags, total: flags.length, page: 1, pageSize: 50, openCount: 2 }) }),
    );

    await page.goto('/superadmin/overview');
    await expect(page.getByRole('button', { name: /Face Enrolments: 4, 2 pending · 2 flags/ })).toBeVisible();
    await expect(page.getByText('Face revocation requests awaiting review')).toBeVisible();
    await page.getByText('Face revocation requests awaiting review').click();
    await expect(page).toHaveURL('/superadmin/face-enrolments');

    // Old /superadmin/face-flags redirects cleanly to /superadmin/face-enrolments.
    await page.goto('/superadmin/face-flags');
    await expect(page).toHaveURL('/superadmin/face-enrolments');

    // Revoke Requests is the default tab.
    await expect(page.getByRole('tab', { name: /Revoke Requests/ })).toHaveAttribute('aria-selected', 'true');
    const juanRow = page.locator('tr', { hasText: 'Juan Dela Cruz' });
    await expect(juanRow).toContainText('2 this term');
    await juanRow.getByRole('button', { name: 'Actions for Juan Dela Cruz' }).click();
    await page.getByRole('menuitem', { name: 'Approve & delete face' }).click();

    const dialog = page.locator('body > div.fixed.inset-0');
    await expect(dialog.getByRole('heading', { name: 'Approve Face Revocation' })).toBeVisible();
    await expect(dialog.getByText('Switched to a new mobile device and old face check fails.')).toBeVisible();
    await expect(dialog.getByText(/Approving this request makes 3 approved revocations this term/)).toBeVisible();
    await dialog.getByLabel(/Note/).fill('short');
    await dialog.getByRole('button', { name: 'Approve & delete face' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a note of 8 to 240 characters, or leave blank.');
    expect(approveCalls).toHaveLength(0);

    await dialog.getByLabel(/Note/).fill('');
    await dialog.getByRole('button', { name: 'Approve & delete face' }).click();
    await expect.poll(() => approveCalls.length).toBe(1);
    expect(approveCalls[0]).toEqual({ requestId: 301 });

    // Reject modal requires an 8–240 character reason.
    const anaRow = page.locator('tr', { hasText: 'Ana Reyes' });
    await anaRow.getByRole('button', { name: 'Actions for Ana Reyes' }).click();
    await page.getByRole('menuitem', { name: 'Reject' }).click();
    await expect(dialog.getByRole('heading', { name: 'Reject Revocation Request' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Reject request' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter a reason of 8 to 240 characters.');
    expect(rejectCalls).toHaveLength(0);

    await dialog.getByLabel(/Reason/).fill('Verify identity at the clinic office first.');
    await dialog.getByRole('button', { name: 'Reject request' }).click();
    await expect.poll(() => rejectCalls.length).toBe(1);
    expect(rejectCalls[0]).toEqual({ requestId: 302, note: 'Verify identity at the clinic office first.' });

    // Flags tab renders F2 & F3 labels and details, and Status filter includes Revoked.
    await page.getByRole('tab', { name: /Flags/ }).click();
    await expect(page).toHaveURL('/superadmin/face-enrolments?tab=flags');
    await expect(page.locator('tr', { hasText: 'Carlo Mendoza' })).toContainText('Blocked mismatched face update');
    await expect(page.locator('tr', { hasText: 'Carlo Mendoza' })).toContainText('Blocked mismatched update on Oct 12');
    await expect(page.locator('tr', { hasText: 'Liza Aquino' })).toContainText('Repeated approved revocations');
    await expect(page.locator('tr', { hasText: 'Liza Aquino' })).toContainText('3 approved revocations (1st Semester, S.Y. 2026–2027), latest Oct 11');
    await expect(page.getByLabel('Status').locator('option[value="revoked"]')).toHaveText('Revoked');
  });
});
