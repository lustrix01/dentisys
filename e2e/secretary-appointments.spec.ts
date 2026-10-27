import { test, expect } from './fixtures';

// REG-006 (2026-10-18): a Student can be Class Secretary of several sections; the tab has one row per section.
test('Secretary tab shows one row per section and appoints / removes by section', async ({ page }) => {
  const appPage = await page.context().newPage();
  const invites: Array<Record<string, unknown>> = [];
  const removes: Array<Record<string, unknown>> = [];
  try {
    await appPage.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/auth/refresh') return json({ status: 'error', message: 'Authentication required.' }, 401);
      if (path === '/api/auth/login') return json({ type: 'direct_login', access_token: 'mock-faculty-token' });
      if (path === '/api/auth/me') return json({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' });
      if (path === '/api/runtime-config') return json({ status: 'ok', environment: 'test', allowed_email_domains: ['bicol-u.edu.ph'], providers: { identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } }, email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' } }, features: { browser_attendance_prototype: false, student_auth_enabled: false } });
      if (path === '/api/faculty/students') return json([{
        id: '42', studentId: 'P03-42', name: 'Two Section Student', email: 'student@bicol-u.edu.ph', yearLevel: 4, status: 'active', accountStatus: 'secretary',
        classSections: [
          { classId: '77', className: 'Section 4-A', enrollmentId: '88', isSecretary: true },
          { classId: '78', className: 'Section 4-B', enrollmentId: '89', isSecretary: false },
        ],
      }]);
      if (path === '/api/secretary/invitations') return json({ status: 'ok', invitations: [] });
      if (path === '/api/faculty/email-logs') return json({ status: 'ok', actions: [] });
      if (path === '/api/secretary/invite' && request.method() === 'POST') {
        invites.push(request.postDataJSON());
        return json({ status: 'ok', delivery_status: 'Appointed', message: 'ok' }, 201);
      }
      if (path === '/api/faculty/secretary-appointments/remove' && request.method() === 'POST') {
        removes.push(request.postDataJSON());
        return json({ status: 'ok', message: 'Class Secretary appointment removed.' });
      }
      return json(request.method() === 'GET' ? [] : { status: 'ok', message: 'ok' });
    });
    await appPage.goto('/login');
    await appPage.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
    await appPage.fill('input[type="password"]', 'Password123!');
    await appPage.click('button[type="submit"]');
    await expect(appPage).toHaveURL('/');
    await appPage.evaluate(() => { window.history.pushState({}, '', '/email-management'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await appPage.getByRole('button', { name: /Class Secretary Invitations/i }).click();

    const rows = appPage.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Section 4-A');
    await expect(rows.nth(0)).toContainText('Class Secretary');
    await expect(rows.nth(0).getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(rows.nth(1)).toContainText('Section 4-B');
    await expect(rows.nth(1)).not.toContainText('Class Secretary');
    // Their Secretary account is an account: the other section shows them as a Student with an account.
    await expect(rows.nth(1)).toContainText('Student (has account)');

    await rows.nth(1).locator('input[type="checkbox"]').check();
    await appPage.getByRole('button', { name: /Appoint Secretary \(1\)/i }).click();
    await expect.poll(() => invites.length).toBe(1);
    expect(invites[0]).toMatchObject({ cs_id: 78 });

    await rows.nth(0).getByRole('button', { name: 'Remove' }).click();
    await expect(appPage.getByText(/Class Secretary of Section 4-A/)).toBeVisible();
    await appPage.getByRole('button', { name: 'Remove', exact: true }).last().click(); // the in-app confirm's button
    await expect.poll(() => removes.length).toBe(1);
    expect(removes[0]).toEqual({ studentId: '42', csId: '77' });
  } finally {
    await appPage.close();
  }
});
