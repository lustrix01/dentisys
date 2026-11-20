import { test, expect, signInAs } from './fixtures';

// Backlog 13.9 (docs/contracts/dean-superadmin-split.md): the Superadmin is its own account; the Dean keeps four pages.
const SUPERADMIN_PAGES = ['/superadmin/overview', '/superadmin/people', '/superadmin/classes', '/superadmin/course-catalog', '/superadmin/terms', '/superadmin/rooms', '/superadmin/face-flags', '/superadmin/audit-trail'];

test.describe('Superadmin account', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'superadmin'); });

  test('DS16 the sidebar lists the eight pages, there is no Dean / Superadmin switcher, and every page opens', async ({ page }) => {
    for (const p of SUPERADMIN_PAGES) await expect(page.locator(`a[href="${p}"]`).first()).toBeAttached();
    await expect(page.locator('[aria-label="Account view"]')).toHaveCount(0);
    for (const p of [...SUPERADMIN_PAGES, '/superadmin/profile', '/superadmin/settings']) {
      await page.goto(p);
      await expect(page).toHaveURL(p);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('DS19 the Superadmin home is the Overview; old /admin setup paths redirect to the /superadmin pages', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/superadmin/overview');
    for (const [from, to] of [['/admin/terms', '/superadmin/terms'], ['/admin/rooms', '/superadmin/rooms'], ['/admin/course-catalog', '/superadmin/course-catalog'], ['/admin/classes', '/superadmin/classes'], ['/admin/academic-terms', '/superadmin/terms']]) {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    }
  });

  test('DS20 the Overview shows Latest Audit Events and the next-term row opens Academic Terms', async ({ page }) => {
    await page.route('**/api/admin/overview', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok', faceFlagsOpen: 0,
        attention: { expiredInvitations: { faculty: 0, students: 0 }, facultyWithoutClasses: 0, inactive30: { faculty: 0, students: 0 }, nextTermMissing: true },
        accounts: { faculty: { active: 0, invited: 0, deactivated: 0 }, students: { active: 0, invited: 0, deactivated: 0 } },
        signIns: [], security: { twoFactor: { faculty: { on: 0, total: 0 }, students: { on: 0, total: 0 } }, failedSignIns: [] },
        yearLevels: [], sectionsByCourse: [], setup: { currentTerm: null, courses: { active: 0, retired: 0 }, rooms: { active: 0, retired: 0 } },
        recentAuditEvents: [{ id: 'e:1', occurredAt: '2026-09-30T09:00:00+08:00', who: { name: 'Dr. Roberto Santos', email: 'faculty@bicol-u.edu.ph', role: 'faculty', roleLabel: 'Faculty' }, whoText: null, what: 'Recomputed grades', area: 'Grading', record: 'CLIN401 · CLINIC-4A', change: '30 computed', status: 'Success', batch: null, details: {} }],
      }),
    }));
    await page.goto('/superadmin/overview');
    const events = page.getByRole('region', { name: 'Latest Audit Events' });
    await expect(events).toContainText('Recomputed grades');
    await expect(page.getByText('The next term has no dates yet')).toBeVisible();
    await page.getByText('The next term has no dates yet').click();
    await expect(page).toHaveURL('/superadmin/terms');
  });

  test('DS21 People & Accounts: the Dean row has a Dean badge and the Hand Over Dean Role dialog sends the handover', async ({ page }) => {
    const person = (userId: number, name: string, extra: Record<string, unknown> = {}) => ({ userId, name, email: `p${userId}@bicol-u.edu.ph`, kind: 'faculty', status: 'active', disabledAt: null, twoFactor: false, lastActivityAt: null, classes: [], nameParts: { prefix: null, firstName: null, middleName: null, lastName: null, suffix: null }, ...extra });
    const people = [person(5, 'Dean Admin', { isDean: true }), person(6, 'Faculty Fiona'), person(7, 'Faculty Felix')];
    const posted: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/people?**', route => route.fulfill({ json: { status: 'ok', people, total: people.length, page: 1, pageSize: 50 } }));
    await page.route('**/api/admin/people/transfer-dean', route => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: 'ok', dean: { ...people[1], isDean: true }, formerDean: { ...people[0], isDean: false } } });
    });
    await page.goto('/superadmin/people');
    const deanRow = page.locator('tr', { hasText: 'Dean Admin' });
    await expect(deanRow).toContainText('Dean');
    await deanRow.getByRole('button', { name: 'Actions for Dean Admin' }).click();
    await expect(page.getByRole('menuitem', { name: /invitation/i })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Hand over Dean role' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hand Over Dean Role' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Hand over Dean role' }).click();
    await expect(dialog.getByText('Choose what happens to the current Dean.')).toBeVisible();
    expect(posted).toHaveLength(0); // no default for the outgoing Dean, reason required
    await dialog.getByLabel('New Dean').selectOption({ label: 'Faculty Fiona' });
    await dialog.getByRole('radio').first().check();
    await dialog.getByLabel(/^Reason/).fill('New Dean appointed');
    await dialog.getByRole('button', { name: 'Hand over Dean role' }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toEqual({ toUserId: 6, oldDean: 'faculty', reason: 'New Dean appointed' });
  });
});

test.describe('Dean account', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('DS17 the Dean sees Dashboard, Reports & Analytics, Grade Submissions, Faculty Invitations and My Activity only', async ({ page }) => {
    for (const p of ['/', '/admin/reports', '/admin/grade-submissions', '/admin/faculty-invite', '/admin/audit-trail']) await expect(page.locator(`a[href="${p}"]`).first()).toBeAttached();
    for (const p of [...SUPERADMIN_PAGES, '/admin/terms', '/admin/rooms', '/admin/course-catalog', '/admin/classes']) await expect(page.locator(`a[href="${p}"]`)).toHaveCount(0);
    await expect(page.locator('[aria-label="Account view"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'My Activity' }).first()).toBeVisible();
  });

  test('DS19 the moved pages and /superadmin/* send the Dean to the Dashboard', async ({ page }) => {
    for (const p of ['/superadmin/overview', '/superadmin/people', '/superadmin/terms', '/superadmin/rooms', '/admin/terms', '/admin/rooms', '/admin/course-catalog', '/admin/classes']) {
      await page.goto(p);
      await expect(page).toHaveURL('/');
    }
  });

  test('DS22 My Activity has no list switch and no role filter', async ({ page }) => {
    await page.goto('/admin/audit-trail');
    await expect(page.getByRole('heading', { level: 1, name: 'My Activity' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Audit views' })).toHaveCount(0);
  });

  test('DS5 the Dashboard no longer shows Latest Audit Events or the term reminder', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Latest Audit Events' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open academic terms' })).toHaveCount(0);
  });
});

test.describe('First sign-in of the Superadmin', () => {
  test('DS11, DS24 a Superadmin without 2FA lands on Set up 2FA, confirms a code, saves the codes and opens the Overview', async ({ page }) => {
    const bearers: string[] = [];
    await page.route('**/api/auth/login', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ type: 'two_factor_setup_required', two_factor_required: true, two_factor_enrolled: false, two_factor_setup_token: 'mock-setup-token', expires_in: 300 }),
    }));
    await page.route('**/api/auth/mfa/enroll/**', route => { bearers.push(route.request().headers()['authorization'] ?? ''); return route.fallback(); });
    await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 100, user_id: 100, login_email: 'superadmin@bicol-u.edu.ph', display_name: 'Sam Superadmin', role: 'superadmin' }) }));
    await page.goto('/superadmin/sign-in');
    await page.fill('input[inputmode="email"]', 'superadmin@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/2fa/setup');
    await expect(page.getByRole('heading', { name: 'Set up 2FA' })).toBeVisible();
    await expect(page.getByText('The Superadmin account needs 2FA. Scan the code with your authenticator app, then type the 6-digit code.')).toBeVisible();
    await page.locator('#mfa-setup-code').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText('AAAA-1111')).toBeVisible(); // the recovery codes are shown once
    expect(bearers.length).toBeGreaterThanOrEqual(2);
    expect(bearers.every(b => b === 'Bearer mock-setup-token')).toBe(true); // the setup token authorises both enrol calls
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL('/superadmin/overview');
  });

  test('Set up 2FA without a setup token goes back to the login page', async ({ page }) => {
    await page.goto('/2fa/setup');
    await expect(page).toHaveURL(/\/login/);
  });
});
