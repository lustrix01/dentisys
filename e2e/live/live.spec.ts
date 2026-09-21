import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@bicol-u.edu.ph';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!';
const facultyEmail = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';
const secretaryEmail = process.env.E2E_SECRETARY_EMAIL ?? 'secretary@bicol-u.edu.ph';
const secretaryPassword = process.env.E2E_SECRETARY_PASSWORD ?? 'Secretary123!';
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? 'Student123!';

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error(`Invalid base32 character: ${character}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function jsonResponse(response: Awaited<ReturnType<Page['request']['get']>>) {
  expect(response.status(), await response.text()).toBeLessThan(500);
  return response.json();
}

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password } });
  const payload = await jsonResponse(response);
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  expect(payload.type).toBe('direct_login');
  expect(payload.access_token).toEqual(expect.any(String));
  return payload as { access_token: string };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  (page as Page & { __liveErrors?: string[] }).__liveErrors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as Page & { __liveErrors?: string[] }).__liveErrors ?? [];
  expect(errors, errors.join('\n')).toEqual([]);
});

test('administrator login, auth/me, reload refresh, settings, and logout invalidation', async ({ page }) => {
  const credentials = await login(page, adminEmail, adminPassword);
  const me = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const mePayload = await jsonResponse(me);
  expect(mePayload.user_id).toBeTruthy();

  const initialRefresh = page.waitForResponse(
    response => response.url().endsWith('/api/auth/refresh') && response.request().method() === 'POST',
  );
  const initialMe = page.waitForResponse(
    response => response.url().endsWith('/api/auth/me') && response.request().method() === 'GET',
  );
  await page.goto('/');
  expect((await initialRefresh).ok()).toBeTruthy();
  expect((await initialMe).ok()).toBeTruthy();

  const reloadRefresh = page.waitForResponse(
    response => response.url().endsWith('/api/auth/refresh') && response.request().method() === 'POST',
  );
  const reloadMe = page.waitForResponse(
    response => response.url().endsWith('/api/auth/me') && response.request().method() === 'GET',
  );
  await page.reload();
  expect((await reloadRefresh).ok()).toBeTruthy();
  expect((await reloadMe).ok()).toBeTruthy();

  const settings = await page.request.get('/api/auth/mfa/settings', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const settingsPayload = await jsonResponse(settings);
  expect(settingsPayload.two_factor).toEqual(expect.objectContaining({
    authenticator_enabled: expect.any(Boolean),
    recovery_code_count: expect.any(Number),
  }));

  const audit = await page.request.get('/api/admin/audit-logs?query=refresh_rotation', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const auditPayload = await jsonResponse(audit);
  expect(auditPayload.some((event: { action?: string }) => event.action === 'refresh_rotation')).toBeTruthy();

  const logout = await page.request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  expect(logout.status()).toBeLessThan(500);
  const invalidated = await page.request.post('/api/auth/refresh');
  expect(invalidated.status()).toBe(401);
});

test('authenticator enrollment and TOTP verification contract', async ({ page }) => {
  const credentials = await login(page, adminEmail, adminPassword);
  const start = await page.request.post('/api/auth/mfa/enroll/start', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const started = await jsonResponse(start);
  expect(started.base32_secret).toEqual(expect.any(String));
  expect(started.confirmation_token).toEqual(expect.any(String));

  const confirm = await page.request.post('/api/auth/mfa/enroll/confirm', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    data: {
      confirmation_token: started.confirmation_token,
      code: totp(started.base32_secret),
    },
  });
  const confirmed = await jsonResponse(confirm);
  expect(confirmed.status).toBe('ok');
  expect(confirmed.recovery_codes).toHaveLength(8);

  const logout = await page.request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  expect(logout.ok(), await logout.text()).toBeTruthy();

  const challengedLogin = await page.request.post('/api/auth/login', {
    data: { email: adminEmail, password: adminPassword },
  });
  const challenge = await jsonResponse(challengedLogin);
  expect(challenge.type).toBe('two_factor_required');
  expect(challenge.two_factor_challenge_token).toEqual(expect.any(String));

  const recover = await page.request.post('/api/auth/mfa/recover', {
    headers: { Authorization: `Bearer ${challenge.two_factor_challenge_token}` },
    data: { code: confirmed.recovery_codes[0] },
  });
  const recovered = await jsonResponse(recover);
  expect(recovered.access_token).toEqual(expect.any(String));

  const recoveredMe = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${recovered.access_token}` },
  });
  expect((await jsonResponse(recoveredMe)).user_id).toBeTruthy();

  const recoveredSettings = await page.request.get('/api/auth/mfa/settings', {
    headers: { Authorization: `Bearer ${recovered.access_token}` },
  });
  expect((await jsonResponse(recoveredSettings)).two_factor.recovery_code_count).toBe(7);
});

test('faculty can create a student and enrollment with returned identifiers', async ({ page }) => {
  const credentials = await login(page, facultyEmail, facultyPassword);
  const classesResponse = await page.request.get('/api/faculty/classes', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const classesPayload = await jsonResponse(classesResponse);
  expect(classesPayload.classes.length).toBeGreaterThan(0);
  const classId = String(classesPayload.classes[0].id ?? classesPayload.classes[0].csId);

  const suffix = Date.now().toString(36);
  const create = await page.request.post('/api/faculty/students', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    data: {
      studentNumber: `INT-${suffix}`,
      firstName: 'Live',
      lastName: 'Integration',
      email: `live.${suffix}@bicol-u.edu.ph`,
      yearLevel: 1,
      classId,
    },
  });
  const created = await jsonResponse(create);
  expect(create.ok(), JSON.stringify(created)).toBeTruthy();
  expect(created.status).toBe('ok');
  expect(Number(created.student?.id)).toBeGreaterThan(0);
  expect(Number(created.student?.classSections?.[0]?.enrollmentId)).toBeGreaterThan(0);

  const subject = `Live outbox ${suffix}`;
  const delivery = await page.request.post('/api/faculty/send-email', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    data: {
      studentIds: [created.student.id],
      emailType: 'Other',
      subject,
      message: 'Live PostgreSQL email-outbox verification.',
    },
  });
  const deliveryPayload = await jsonResponse(delivery);
  expect(delivery.ok(), JSON.stringify(deliveryPayload)).toBeTruthy();
  expect(Number(deliveryPayload.deliveries?.[0]?.id)).toBeGreaterThan(0);
  expect(deliveryPayload.deliveries?.[0]?.status).toBe('Sent');

  const logs = await page.request.get('/api/faculty/email-logs', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const logsPayload = await jsonResponse(logs);
  expect(logsPayload.logs).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: `mail-${deliveryPayload.deliveries[0].id}`,
      subject,
      status: 'Sent',
    }),
  ]));

  const mailpit = await page.request.get('http://127.0.0.1:18025/api/v1/messages');
  const mailpitPayload = await jsonResponse(mailpit);
  expect(mailpitPayload.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ Subject: subject }),
  ]));

  const listed = await page.request.get('/api/faculty/students', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const students = await jsonResponse(listed);
  expect(students.some((student: { id: string }) => student.id === created.student.id)).toBeTruthy();
});

test('Faculty-issued Student invitation, Mailpit acceptance, password login, and exact identity shape', async ({ page }) => {
  const facultyCredentials = await login(page, facultyEmail, facultyPassword);
  const classesResponse = await page.request.get('/api/faculty/classes', {
    headers: { Authorization: `Bearer ${facultyCredentials.access_token}` },
  });
  const classesPayload = await jsonResponse(classesResponse);
  const classId = String(classesPayload.classes[0].id ?? classesPayload.classes[0].csId);
  const suffix = Date.now().toString(36);
  const email = `p03.student.${suffix}@bicol-u.edu.ph`;

  const create = await page.request.post('/api/faculty/students', {
    headers: { Authorization: `Bearer ${facultyCredentials.access_token}` },
    data: {
      studentNumber: `P03-${suffix}`,
      firstName: 'P03',
      lastName: 'Student',
      email,
      yearLevel: 1,
      classId,
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();

  const emailOnlyAttempt = await page.request.post('/api/auth/student/signup', { data: { email } });
  expect(emailOnlyAttempt.status()).toBe(404);

  const invitation = await page.request.post('/api/faculty/student-invitations', {
    headers: { Authorization: `Bearer ${facultyCredentials.access_token}` },
    data: { studentId: String((await jsonResponse(create)).student.id), classId },
  });
  expect(invitation.ok(), await invitation.text()).toBeTruthy();

  const mailpitMessages = await page.request.get('http://127.0.0.1:18025/api/v1/messages');
  const mailpitPayload = await jsonResponse(mailpitMessages);
  const activationMessage = (mailpitPayload.messages as Array<{ ID: string; Subject: string; To?: Array<{ Address?: string }> }>).find(message =>
    message.Subject === 'DentiSys Student Invitation'
    && message.To?.some(recipient => recipient.Address?.toLowerCase() === email.toLowerCase())
  );
  expect(activationMessage).toBeTruthy();
  const messageDetail = await page.request.get(`http://127.0.0.1:18025/api/v1/message/${activationMessage!.ID}`);
  const detailPayload = await jsonResponse(messageDetail);
  const activationToken = JSON.stringify(detailPayload).match(/activate-student\?token=([A-Za-z0-9_-]{43})/)?.[1];
  expect(activationToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const inspection = await page.request.get(`/api/auth/student/invitation?token=${activationToken}`);
  const invitationPayload = await jsonResponse(inspection);
  expect(invitationPayload.invitation).toEqual(expect.objectContaining({ email, className: expect.any(String) }));

  const activation = await page.request.post('/api/auth/student/activate', {
    data: { token: activationToken, password: studentPassword },
  });
  expect(activation.ok(), await activation.text()).toBeTruthy();

  const studentCredentials = await login(page, email, studentPassword);
  const me = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${studentCredentials.access_token}` },
  });
  const mePayload = await jsonResponse(me);
  expect(mePayload).toEqual(expect.objectContaining({
    role: 'student',
    login_email: email,
    authentication_source: 'password',
    student: expect.objectContaining({ status: 'active' }),
  }));
  expect(mePayload.student).toBeDefined();

  const logout = await page.request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${studentCredentials.access_token}` },
  });
  expect(logout.ok(), await logout.text()).toBeTruthy();
});

test('secretary authoritative session lifecycle on live PostgreSQL stack', async ({ page }) => {
  // 1. Authenticate as secretary
  await login(page, secretaryEmail, secretaryPassword);

  // 2. Navigate directly to /secretary/start-session
  await page.goto('/secretary/start-session');

  // Wait for initial active session resolution to finish loading
  await expect(page.getByText('Resolving active attendance session status...')).toHaveCount(0);

  // 4. Verify initial state: form is present, no active session banner
  await expect(page.getByRole('heading', { name: /Start Class Session & Attendance Control/i })).toBeVisible();
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible();

  // Verify assigned class is shown (CLINIC-4B)
  await expect(page.getByText('CLINIC-4B')).toBeVisible();

  // Verify localStorage has no active session key
  const localSessionBefore = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
  expect(localSessionBefore).toBeNull();

  // 5. Start class session
  const startPromise = page.waitForResponse(
    response => response.url().includes('/api/secretary/attendance/session') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Start Class Session Now/i }).click();

  const startResponse = await startPromise;
  expect(startResponse.status()).toBe(201);
  const startPayload = await startResponse.json();
  expect(startPayload.status).toBe('ok');
  expect(startPayload.session.sessionId).toBeTruthy();
  expect(startPayload.session.status).toBe('active');
  const authoritativeSessionId = String(startPayload.session.sessionId);
  const authoritativeSessionCode = startPayload.session.sessionCode;

  // 6. Verify UI transitions to active state
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toBeVisible();
  await expect(page.getByText(authoritativeSessionCode).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /End Class Session/i })).toBeVisible();

  // Verify localStorage was NOT used as authoritative storage
  const localSessionAfterStart = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
  expect(localSessionAfterStart).toBeNull();

  // 7. Test refresh/recovery semantics: reload browser
  const reloadLookupPromise = page.waitForResponse(
    response => response.url().includes('/api/secretary/attendance/session/active') && response.request().method() === 'GET'
  );
  await page.reload();
  const reloadResponse = await reloadLookupPromise;
  expect(reloadResponse.status()).toBe(200);
  const reloadPayload = await reloadResponse.json();
  expect(reloadPayload.activeSession).toBeTruthy();
  expect(String(reloadPayload.activeSession.sessionId)).toBe(authoritativeSessionId);

  // Active session card restored after reload
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toBeVisible();
  await expect(page.getByText(authoritativeSessionCode).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /End Class Session/i })).toBeVisible();

  // 8. Test navigation away and back
  await page.click('a[href="/"]');
  await expect(page).toHaveURL('/');
  await page.click('a[href="/secretary/start-session"]');
  await expect(page).toHaveURL('/secretary/start-session');

  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toBeVisible();
  await expect(page.getByText(authoritativeSessionCode).first()).toBeVisible();

  // 9. End active session
  await page.getByRole('button', { name: /End Class Session/i }).click();

  // Confirm modal is shown
  await expect(page.getByText(/End Attendance Session/i).first()).toBeVisible();
  await expect(page.getByText(/Are you sure you want to end the active attendance session/i)).toBeVisible();

  const endPromise = page.waitForResponse(
    response => response.url().includes('/api/secretary/attendance/session/end') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: /Confirm End Session/i }).click();

  const endResponse = await endPromise;
  expect(endResponse.status()).toBe(200);
  const endPayload = await endResponse.json();
  expect(endPayload.status).toBe('ok');
  expect(endPayload.session.status).toBe('ended');

  // 10. Verify UI returns to inactive state
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible();

  // 11. Refresh browser again to confirm inactive state persists
  await page.reload();
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible();

  console.log('LIVE BROWSER VALIDATION PASSED FOR SESSION ID:', authoritativeSessionId);
});
