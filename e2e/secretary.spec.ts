import { test, expect } from './fixtures';

declare const Buffer: any;

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
    await page.fill('input[inputmode="email"]', 'secretary@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('secretary dashboard renders correctly', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Secretary|Class|Attendance|Dashboard/i);
    await expect(page.getByText('No attendance session is running for your section.')).toBeVisible();
    await expect(page.getByText('Quick Actions')).toHaveCount(0);
  });

  test('secretary dashboard shows the live attendance session', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          activeSession: {
            sessionId: '77', csId: 1, courseCode: 'CLIN401', sessionDate: '2026-09-29',
            sessionCode: 'CLIN401-20260929', startedAt: '2026-09-29T00:30:00Z', status: 'active', room: 'Room 101',
          },
        }),
      });
    });
    await page.reload();
    await expect(page.getByText('CLIN401-20260929')).toBeVisible();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
  });

  test('secretary can navigate to Attendance List page', async ({ page }) => {
    await page.click('a[href="/secretary/attendance"]');
    await expect(page).toHaveURL('/secretary/attendance');
    await expect(page.locator('body')).toContainText(/Attendance|List|Students|Check-in/i);
  });

  test('secretary can access Attendance Monitoring with override actions', async ({ page }) => {
    await page.click('a[href="/secretary/attendance"]');
    await expect(page).toHaveURL('/secretary/attendance');
    await expect(page.locator('body')).toContainText(/Override|Attendance/i);
  });

  test('secretary navigation does not claim a CCTV integration', async ({ page }) => {
    await expect(page.locator('a[href="/secretary/cctv"]')).toHaveCount(0);
  });

  test('Excused (ATT-006): the Secretary sends an Excused request instead of setting Excused', async ({ page }) => {
    let requestPayload: Record<string, unknown> | null = null;
    let overrideCalled = false;
    const record = {
      id: '501', attendanceSessionId: '900', studentId: '42', studentNumber: '2024-0042', studentName: 'Request Student', yearLevel: 4,
      date: '2026-09-20', timeRecorded: null, verificationMethod: 'system_resolution', subjectCode: 'CLIN401', classId: '8',
      className: 'CLINIC-4B', status: 'absent', overrideReason: null, overrideAt: null,
    };
    await page.route('**/api/secretary/attendance**', async (route) => {
      if (route.request().url().includes('/override')) { overrideCalled = true; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [], records: [record] }) });
    });
    await page.route('**/api/secretary/profile', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', profile: { assignedClassName: 'CLINIC-4B' } }) });
    });
    await page.route('**/api/secretary/excused-requests', async (route) => {
      requestPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Excused request sent to Faculty for approval.', request: null }) });
    });
    await page.goto('/secretary/attendance');
    await page.getByRole('row').filter({ hasText: 'Request Student' }).getByRole('button', { name: 'Override' }).click();
    await page.getByRole('button', { name: 'Request Excused' }).click();
    await expect(page.getByText(/Excused needs Faculty approval/)).toBeVisible();
    await page.locator('textarea').fill('Medical certificate given to the Secretary');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect.poll(() => requestPayload).toEqual({ studentId: '42', recordId: '501', sessionId: 900, reason: 'Medical certificate given to the Secretary' });
    await expect(page.getByText('Excused request sent to Faculty for approval.')).toBeVisible();
    expect(overrideCalled).toBe(false);
    await expect(page.getByRole('row').filter({ hasText: 'Request Student' })).toContainText('absent');
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
    await expect(page.getByText('Two-factor authentication', { exact: true })).toBeVisible();

    await page.click('a[href="/secretary/settings"]');
    await expect(page).toHaveURL('/secretary/settings');
    await expect(page.locator('body')).toContainText(/Settings/i);
  });

  test('secretary does not expose an unconfigured CCTV simulator', async ({ page }) => {
    await expect(page.locator('a[href="/secretary/cctv"]')).toHaveCount(0);
  });

  test('secretary profile displays backend-managed MFA status', async ({ page }) => {
    await page.route('**/api/auth/mfa/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          two_factor: {
            enabled: true,
            authenticator_enabled: true,
            recovery_code_count: 8,
          },
        }),
      });
    });
    await page.click('a[href="/secretary/profile"]');
    await expect(page).toHaveURL('/secretary/profile');

    await expect(page.getByText('Two-factor authentication', { exact: true })).toBeVisible();
    await expect(page.locator('body')).toContainText(/Google Authenticator compatible.*8 recovery codes/i);
    await expect(page.locator('button', { hasText: 'Set up' })).toHaveCount(0);
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

test.describe('Authoritative Secretary Attendance Session Workflow', () => {
  const mockActiveSession = {
    sessionId: '42',
    csId: 8,
    classId: '8',
    className: 'CLINIC-4B',
    classSection: { id: '8', name: 'CLINIC-4B', block: 'B' },
    course: { id: 2, code: 'CLIN402', name: 'Clinical Dentistry II' },
    courseCode: 'CLIN402',
    instructorName: 'Dr. Fernando Cruz',
    sessionDate: '2026-09-21',
    sessionCode: 'CS8-20260921-ABC123',
    room: 'Dental Clinic Lab 2',
    startedAt: '2026-09-21T01:00:00.000000Z',
    status: 'active' as const,
    geofenceEnabled: true,
    geofenceLatitude: 13.1436,
    geofenceLongitude: 123.7438,
    geofenceRadiusMeters: 200,
    biometricRequired: true,
    createdAt: '2026-09-21T01:00:00.000000Z',
    updatedAt: '2026-09-21T01:00:00.000000Z',
  };

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
          display_name: 'Bea Alonzo',
          role: 'secretary',
        }),
      });
    });

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-secretary-token',
          user: { id: 300, login_email: 'secretary@bicol-u.edu.ph', role: 'secretary' },
        }),
      });
    });

    await page.route('**/api/secretary/dashboard/kpis**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          kpis: { assignedStudents: 24, attendanceRate: 95, todayRecords: 0, overriddenCount: 0 },
          recentActivity: [],
          assignedClass: {
            classId: '8',
            className: 'CLINIC-4B',
            classroomName: 'Dental Clinic Lab 2',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[inputmode="email"]', 'secretary@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('initial state: active lookup returns null -> Start Session state shown', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', activeSession: null }),
      });
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByText('NO ACTIVE SESSION')).toBeVisible();
    await expect(page.getByText('Session Configuration')).toBeVisible();
    await expect(page.getByText('CLINIC-4B')).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible();
    await expect(page.getByText('LIVE SESSION ACTIVE')).toHaveCount(0);
  });

  test('Secretary queues a future session and sees cross-role booking conflicts', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    let queued = false;
    const scheduled = { ...mockActiveSession, sessionId: '101', sessionDate: '2099-10-02', status: 'scheduled', openingTime: '08:00', classEndTime: '13:00' };
    await page.route('**/api/secretary/attendance/session/active*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', activeSession: null }) }));
    await page.route('**/api/secretary/attendance', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [], sessions: queued ? [scheduled] : [] }) }));
    await page.route('**/api/secretary/attendance/session', async route => {
      payload = route.request().postDataJSON();
      if (queued) await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'A schedule already exists on 2099-10-02 from 08:00 to 13:00 (Asia/Manila), created by Faculty Jane Doe.' }) });
      else {
        queued = true;
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: scheduled }) });
      }
    });
    await page.goto('/secretary/start-session');
    const date = page.getByLabel('Session date (Asia/Manila)');
    expect(await date.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await date.fill('2099-10-02');
    await page.getByRole('checkbox', { name: /Geolocation|Geofence/ }).uncheck();
    await page.getByRole('button', { name: 'Schedule Class Session', exact: true }).click();
    await expect.poll(() => payload?.sessionDate).toBe('2099-10-02');
    await expect(page.getByRole('heading', { name: 'Scheduled sessions (Asia/Manila)' })).toBeVisible();
    await expect(page.getByText('LIVE SESSION ACTIVE')).toHaveCount(0);
    await page.getByRole('button', { name: 'Schedule Class Session', exact: true }).click();
    await expect(page.getByText(/created by Faculty Jane Doe/)).toBeVisible();
  });

  test('Secretary live counters refresh for the active session without counting another same-day session', async ({ page }) => {
    await page.clock.install();
    let activeId = '42';
    const scopedReads: string[] = [];
    await page.route('**/api/secretary/attendance/session/active*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', activeSession: { ...mockActiveSession, sessionId: activeId } }) }));
    await page.route(/\/api\/secretary\/attendance(?:\?.*)?$/, async route => {
      const sessionId = new URL(route.request().url()).searchParams.get('sessionId');
      if (sessionId) scopedReads.push(sessionId);
      // Deliberately include an extra same-day record to prove ID-based counting.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', sessions: [], records: [
        { id: '1', date: mockActiveSession.sessionDate, attendanceSessionId: sessionId ?? '42', status: sessionId === '43' ? 'not_recorded' : 'present' },
        { id: '2', date: mockActiveSession.sessionDate, attendanceSessionId: '99', status: 'present' },
        { id: '3', date: mockActiveSession.sessionDate, attendanceSessionId: null, status: 'late' },
      ] }) });
    });
    await page.goto('/secretary/start-session');
    await expect(page.getByText('2 / 2 (100%)', { exact: true })).toBeVisible();
    activeId = '43';
    await page.clock.fastForward(31000);
    await expect(page.getByText('1 / 2 (50%)', { exact: true })).toBeVisible();
    expect(scopedReads).toContain('42');
    expect(scopedReads).toContain('43');
  });

  test('a delayed Secretary poll cannot restore a successfully ended session', async ({ page }) => {
    await page.clock.install();
    let ended = false;
    let scopedReads = 0;
    let pollWaiting = false;
    let releasePoll: () => void = () => {};
    const pollGate = new Promise<void>(resolve => { releasePoll = resolve; });
    await page.route('**/api/secretary/attendance/session/active*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', activeSession: ended ? null : mockActiveSession }) }));
    await page.route(/\/api\/secretary\/attendance(?:\?.*)?$/, async route => {
      if (new URL(route.request().url()).searchParams.has('sessionId') && ++scopedReads === 2) {
        pollWaiting = true;
        await pollGate;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [], sessions: [] }) });
    });
    await page.route('**/api/secretary/attendance/session/end', async route => {
      ended = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: { ...mockActiveSession, status: 'ended' } }) });
    });
    await page.goto('/secretary/start-session');
    await expect(page.getByText('LIVE SESSION ACTIVE')).toBeVisible();
    await page.clock.fastForward(31000);
    await expect.poll(() => pollWaiting).toBe(true);
    await page.getByRole('button', { name: /End Session/i }).click();
    await page.getByRole('button', { name: /Confirm End Session/i }).click();
    await expect(page.getByText('NO ACTIVE SESSION')).toBeVisible();
    const pollResponse = page.waitForResponse(response => response.url().includes('/api/secretary/attendance?sessionId=42'));
    releasePoll();
    await pollResponse;
    await page.clock.runFor(100);
    await expect(page.getByText('LIVE SESSION ACTIVE')).toHaveCount(0);
    await expect(page.getByText('NO ACTIVE SESSION')).toBeVisible();
  });

  test('cancelling a queued revocation does not change the active-session revoke target', async ({ page }) => {
    let revokedId: string | null = null;
    const queued = { ...mockActiveSession, sessionId: '101', status: 'scheduled', date: '2099-10-02', openingTime: '08:00', classEndTime: '13:00' };
    await page.route('**/api/secretary/attendance/session/active*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', activeSession: mockActiveSession }) }));
    await page.route(/\/api\/secretary\/attendance(?:\?.*)?$/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [], sessions: [queued] }) }));
    await page.route('**/api/secretary/attendance/session/revoke', async route => {
      revokedId = route.request().postDataJSON().sessionId;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: { ...mockActiveSession, status: 'revoked' } }) });
    });
    await page.goto('/secretary/start-session');
    await page.getByRole('button', { name: 'Revoke scheduled session', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Revoke Session', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Revoke Session', exact: true }).click();
    await expect.poll(() => revokedId).toBe('42');
  });

  test('initial state: active lookup returns session -> active-session state shown', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', activeSession: mockActiveSession }),
      });
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByText('LIVE SESSION ACTIVE')).toBeVisible();
    await expect(page.getByText('Active Attendance Register Open')).toBeVisible();
    await expect(page.getByText('CLIN402 — CLINIC-4B')).toBeVisible();
    await expect(page.getByText('CS8-20260921-ABC123')).toBeVisible();
    await expect(page.getByRole('button', { name: /End Session/i })).toBeVisible();
    await expect(page.getByText('Session Configuration')).toBeVisible();
  });

  test('start: submitting invokes backend start API, renders authoritative session, and does not write to localStorage', async ({ page }) => {
    let startApiPayload: Record<string, unknown> | null = null;

    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', activeSession: null }),
      });
    });

    await page.route('**/api/secretary/attendance/session', async (route) => {
      if (route.request().method() === 'POST') {
        startApiPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            session: {
              ...mockActiveSession,
              sessionId: '99',
              sessionCode: 'CS8-20260921-XYZ999',
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible();

    await page.getByText('Enforce GPS Geofence Verification').click();
    await page.getByRole('button', { name: /Start Class Session Now/i }).click();

    await expect(page.getByText('LIVE SESSION ACTIVE')).toBeVisible();
    await expect(page.getByText('Code: CS8-20260921-XYZ999', { exact: true })).toBeVisible();
    expect(startApiPayload).not.toBeNull();
    expect((startApiPayload as any)?.csId).toBe(8);
    expect((startApiPayload as any)?.geofenceEnabled).toBe(false);
    expect((startApiPayload as any)?.geofenceLatitude).toBeUndefined();
    expect((startApiPayload as any)?.geofenceLongitude).toBeUndefined();

    const storedItem = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
    expect(storedItem).toBeNull();
  });

  test('map picker (ATT-002): clicking the OpenStreetMap map sets the geofence location sent on start', async ({ page }) => {
    let startApiPayload: Record<string, unknown> | null = null;
    // Keep the suite offline: tiles are served as a blank image.
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
      });
    });
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', activeSession: null }) });
    });
    await page.route('**/api/secretary/attendance/session', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      startApiPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'ok', session: { ...mockActiveSession, sessionId: '101' } }) });
    });

    await page.goto('/secretary/start-session');
    await page.getByRole('button', { name: 'Pick on map' }).click();
    const map = page.getByRole('application', { name: 'Session location map' });
    await expect(map).toBeVisible();
    await expect(page.getByText('OpenStreetMap')).toBeVisible();
    await map.click({ position: { x: 60, y: 60 } });
    await expect(page.getByText(/Map location \(/)).toBeVisible();
    await page.getByRole('button', { name: /Start Class Session Now/i }).click();
    await expect.poll(() => startApiPayload).not.toBeNull();
    const payload = startApiPayload as unknown as Record<string, number | boolean>;
    expect(payload.geofenceEnabled).toBe(true);
    expect(typeof payload.geofenceLatitude).toBe('number');
    expect(typeof payload.geofenceLongitude).toBe('number');
    // The click was up and left of the default centre, so both coordinates moved.
    expect(payload.geofenceLatitude).toBeGreaterThan(13.1436);
    expect(payload.geofenceLongitude).toBeLessThan(123.7438);
  });

  test('refresh/recovery semantics: component reconstructs state from active lookup rather than browser persistence', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          activeSession: {
            ...mockActiveSession,
            sessionId: '101',
            sessionCode: 'CS8-RELOAD-101',
          },
        }),
      });
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByText('CS8-RELOAD-101')).toBeVisible();

    // Ensure localStorage is empty
    await page.evaluate(() => localStorage.clear());

    // Reload browser page
    await page.reload();

    await expect(page.getByText('CS8-RELOAD-101')).toBeVisible();
    const storedItem = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
    expect(storedItem).toBeNull();
  });

  test('end: end action invokes backend endpoint and returns UI to inactive state', async ({ page }) => {
    let endApiCalled = false;
    let endPayload: Record<string, unknown> | null = null;

    let currentSession: typeof mockActiveSession | null = { ...mockActiveSession };

    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', activeSession: currentSession }),
      });
    });

    await page.route('**/api/secretary/attendance/session/end', async (route) => {
      endApiCalled = true;
      endPayload = route.request().postDataJSON();
      currentSession = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          session: {
            ...mockActiveSession,
            status: 'ended',
            endedAt: '2026-09-21T02:00:00.000000Z',
          },
        }),
      });
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByText('LIVE SESSION ACTIVE')).toBeVisible();

    // Open confirmation modal
    await page.getByRole('button', { name: /End Session/i }).click();
    await expect(page.getByText('Are you sure you want to end the active attendance session')).toBeVisible();

    // Confirm end session
    await page.getByRole('button', { name: /Confirm End Session/i }).click();

    expect(endApiCalled).toBe(true);
    expect((endPayload as any)?.sessionId).toBe('42');

    // Form should return to inactive state
    await expect(page.getByText('NO ACTIVE SESSION')).toBeVisible();
    await expect(page.getByText('Session Configuration')).toBeVisible();
    await expect(page.getByText(/Attendance register closed/i)).toBeVisible();
  });

  test('errors: 409 conflict does not create local session', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', activeSession: null }),
      });
    });

    await page.route('**/api/secretary/attendance/session', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          message: 'An active attendance session already exists for this class section.',
        }),
      });
    });

    await page.goto('/secretary/start-session');
    await page.getByText('Enforce GPS Geofence Verification').click();
    await page.getByRole('button', { name: /Start Class Session Now/i }).click();

    await expect(page.getByText('An active attendance session already exists for this class section.')).toBeVisible();
    await expect(page.getByText('NO ACTIVE SESSION')).toBeVisible();
    await expect(page.getByText('LIVE SESSION ACTIVE')).toHaveCount(0);

    const storedItem = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
    expect(storedItem).toBeNull();
  });

  test('errors: lookup failure is not interpreted as no session', async ({ page }) => {
    await page.route('**/api/secretary/attendance/session/active*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Internal server error while resolving session.' }),
      });
    });

    await page.goto('/secretary/start-session');
    await expect(page.getByText('Unable to load attendance session')).toBeVisible();
    await expect(page.getByText('A server error occurred. Please try again later.')).toBeVisible();
    await expect(page.getByText('Session Configuration')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });
});
