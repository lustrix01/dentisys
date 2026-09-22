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
  await expect(page.getByRole('button', { name: /End Session/i })).toBeVisible();

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
  await expect(page.getByRole('button', { name: /End Session/i })).toBeVisible();

  // 8. Test navigation away and back
  await page.click('a[href="/"]');
  await expect(page).toHaveURL('/');
  await page.click('a[href="/secretary/start-session"]');
  await expect(page).toHaveURL('/secretary/start-session');

  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toBeVisible();
  await expect(page.getByText(authoritativeSessionCode).first()).toBeVisible();

  // 9. End active session
  await page.getByRole('button', { name: /End Session/i }).click();

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

test('faculty authoritative attendance monitoring workflow on live PostgreSQL stack', async ({ page }) => {
  // 1. Authenticate as faculty
  const facultyCreds = await login(page, facultyEmail, facultyPassword);

  // 2. Fetch classes from API to identify target class section
  const classesRes = await page.request.get('/api/faculty/classes', {
    headers: { Authorization: `Bearer ${facultyCreds.access_token}` },
  });
  const classesPayload = await jsonResponse(classesRes);
  expect(classesPayload.classes.length).toBeGreaterThan(0);
  const targetClass = classesPayload.classes[0];
  const targetCourseId = String(targetClass.courseId);
  const targetCsId = String(targetClass.id ?? targetClass.csId);

  // 3. Create a fresh enrolled student in this section to guarantee an unrecorded attendance row
  const suffix = Date.now().toString(36);
  const create = await page.request.post('/api/faculty/students', {
    headers: { Authorization: `Bearer ${facultyCreds.access_token}` },
    data: {
      studentNumber: `ATT-${suffix}`,
      firstName: 'LiveAttendance',
      lastName: `Student-${suffix}`,
      email: `attendance.${suffix}@bicol-u.edu.ph`,
      yearLevel: 1,
      classId: targetCsId,
    },
  });
  const createdData = await jsonResponse(create);
  expect(createdData.status).toBe('ok');
  const studentFullName = `LiveAttendance Student-${suffix}`;

  // 4. Navigate directly to /attendance
  await page.goto('/attendance');

  // Verify header and initial empty worksheet state
  await expect(page.getByRole('main').getByRole('heading', { name: /Attendance Monitoring/i })).toBeVisible();
  await expect(page.getByText(/Please select an Assigned Course and Class Section/i)).toBeVisible();

  // Clear any legacy localStorage to verify Attendance Monitoring does not write to it
  await page.evaluate(() => localStorage.removeItem('dentisys_attendance'));

  // 5. Select Course and Section
  const courseSelect = page.locator('select').first();
  await courseSelect.selectOption(targetCourseId);

  const sectionSelect = page.locator('select').nth(1);
  await sectionSelect.selectOption(targetCsId);

  // Wait for worksheet to load from PostgreSQL
  await expect(page.getByText(/Please select an Assigned Course and Class Section/i)).toHaveCount(0);
  const studentRow = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRow).toBeVisible();

  // Initial state: student status is 'Not recorded'
  await expect(studentRow.locator('td').nth(1).getByText('Not recorded')).toBeVisible();

  // 6. Initial Entry: click Present
  const initialOverridePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/attendance/override') && response.request().method() === 'POST'
  );
  await studentRow.getByRole('button', { name: 'Present' }).click();

  const initialOverrideRes = await initialOverridePromise;
  expect(initialOverrideRes.status()).toBe(200);
  const initialOverrideData = await initialOverrideRes.json();
  expect(initialOverrideData.status).toBe('ok');
  expect(initialOverrideData.operation).toBe('created');
  expect(initialOverrideData.recordId).toBeTruthy();

  // Toast appears and row status updates to Present
  await expect(page.getByText(new RegExp(`Recorded ${studentFullName} as present`, 'i'))).toBeVisible();
  await expect(studentRow.locator('td').nth(1).getByText('Present', { exact: true })).toBeVisible();

  // Verify localStorage does not store this student's attendance override
  const localData = await page.evaluate(() => localStorage.getItem('dentisys_attendance'));
  if (localData) {
    const parsed = JSON.parse(localData);
    expect(parsed.some((r: any) => r.studentName === studentFullName)).toBe(false);
  }

  // 7. Refresh/recovery semantics: reload browser and re-select section
  // Even if localStorage is cleared completely, state restores from PostgreSQL
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('select').first().selectOption(targetCourseId);
  await page.locator('select').nth(1).selectOption(targetCsId);

  // Verify row still displays Present from PostgreSQL
  const studentRowAfterReload = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRowAfterReload).toBeVisible();
  await expect(studentRowAfterReload.locator('td').nth(1).getByText('Present', { exact: true })).toBeVisible();

  // 8. Correction workflow: change status to Late
  await studentRowAfterReload.getByRole('button', { name: 'Late' }).click();

  // Modal appears
  await expect(page.getByRole('heading', { name: 'Attendance Correction' })).toBeVisible();
  await expect(page.getByText(/PRESENT → LATE/i)).toBeVisible();

  // Submitting without reason triggers in-app validation error
  await page.getByRole('button', { name: 'Save Correction' }).click();
  await expect(page.getByText(/justification reason is required/i)).toBeVisible();

  // Enter valid reason and submit correction
  const correctionReason = 'Traffic delay verified by instructor';
  await page.fill('textarea', correctionReason);

  const correctionPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/attendance/override') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save Correction' }).click();

  const correctionRes = await correctionPromise;
  expect(correctionRes.status()).toBe(200);
  const correctionData = await correctionRes.json();
  expect(correctionData.status).toBe('ok');
  expect(correctionData.operation).toBe('updated');

  // Modal closes, toast appears, row status updates to Late
  await expect(page.getByRole('heading', { name: 'Attendance Correction' })).toHaveCount(0);
  await expect(page.getByText(new RegExp(`Attendance corrected for ${studentFullName}`, 'i'))).toBeVisible();
  await expect(studentRowAfterReload.locator('td').nth(1).getByText('Late', { exact: true })).toBeVisible();

  // 9. Refresh browser again to confirm correction persists in PostgreSQL
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('select').first().selectOption(targetCourseId);
  await page.locator('select').nth(1).selectOption(targetCsId);

  const studentRowAfterCorrectionReload = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRowAfterCorrectionReload.locator('td').nth(1).getByText('Late', { exact: true })).toBeVisible();

  // 10. No-op verification: clicking Late again does NOT invoke override endpoint
  let overrideCalledAgain = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/faculty/attendance/override')) {
      overrideCalledAgain = true;
    }
  });
  await studentRowAfterCorrectionReload.getByRole('button', { name: 'Late' }).click();
  await page.waitForTimeout(500);
  expect(overrideCalledAgain).toBe(false);

  console.log('LIVE FACULTY ATTENDANCE MONITORING WORKFLOW VALIDATED SUCCESSFULLY FOR STUDENT:', studentFullName);
});

test('authoritative faculty grade weights: load offering, configure dynamic categories, verify version and PostgreSQL persistence across reload', async ({ page }) => {
  // 1. Authenticate as faculty
  const credentials = await login(page, facultyEmail, facultyPassword);
  expect(credentials.access_token).toBeTruthy();

  // 2. Fetch classes to determine active offering
  const classesRes = await page.request.get('/api/faculty/classes', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const classesData = await jsonResponse(classesRes);
  expect(classesData.status).toBe('ok');
  const activeClasses = (classesData.classes || []).filter((c: any) => (c.status || '').toLowerCase() === 'active');
  expect(activeClasses.length).toBeGreaterThan(0);

  // 3. Navigate to Grade Weights Editor
  await page.goto('/grades?tab=components');
  await expect(page.locator('#course-offering-select')).toBeVisible();

  // 4. Wait for configuration to load
  await page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'GET'
  );

  // Check if categories already exist or if it's unconfigured
  await expect(
    page.getByText(/Unconfigured Course Offering/i).or(page.locator('input[placeholder*="Category name"]').first())
  ).toBeVisible();

  const hasUnconfiguredBanner = await page.getByText(/Unconfigured Course Offering/i).isVisible();

  if (hasUnconfiguredBanner) {
    // Add 3 dynamic categories totaling 100%
    await page.getByRole('button', { name: /Add First Category/i }).click();
    const nameInputs = page.locator('input[placeholder*="Category name"]');
    const weightInputs = page.locator('input[placeholder="0"]');

    await nameInputs.nth(0).fill('Quizzes');
    await weightInputs.nth(0).fill('30');

    await page.getByRole('button', { name: /Add Category/i }).click();
    await nameInputs.nth(1).fill('Midterm Exam');
    await weightInputs.nth(1).fill('30');

    await page.getByRole('button', { name: /Add Category/i }).click();
    await nameInputs.nth(2).fill('Final Exam');
    await weightInputs.nth(2).fill('40');

    await expect(page.getByText(/Valid 100%/i)).toBeVisible();

    const savePromise = page.waitForResponse(
      response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: /Save Initial Schema/i }).click();

    const saveRes = await savePromise;
    expect([200, 201]).toContain(saveRes.status());
    const saveData = await saveRes.json();
    expect(saveData.status).toBe('ok');
    expect(saveData.configuration.version).toBe(1);
    expect(saveData.configuration.categories).toHaveLength(3);

    await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
    await expect(page.getByText(/Version 1/i)).toBeVisible();
  }

  // 5. Update existing configuration: rename a category and re-save
  const nameInputs = page.locator('input[placeholder*="Category name"]');
  const initialFirstName = await nameInputs.nth(0).inputValue();
  const updatedFirstName = initialFirstName.startsWith('Updated ') ? initialFirstName.replace('Updated ', '') : `Updated ${initialFirstName}`;

  await nameInputs.nth(0).fill(updatedFirstName);

  const updatePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  await page.getByRole('button', { name: /Save Grade Weights/i }).click();

  const updateRes = await updatePromise;
  expect(updateRes.status()).toBe(200);
  const updateData = await updateRes.json();
  expect(updateData.status).toBe('ok');
  expect(updateData.configuration.categories[0].name).toBe(updatedFirstName);

  await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

  // 6. Hard reload with cleared localStorage to verify PostgreSQL persistence
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#course-offering-select')).toBeVisible();
  await page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'GET'
  );

  const reloadedFirstName = await page.locator('input[placeholder*="Category name"]').nth(0).inputValue();
  expect(reloadedFirstName).toBe(updatedFirstName);

  // 7. Reorder categories and verify persistence in PostgreSQL
  const reorderNameInputs = page.locator('input[placeholder*="Category name"]');
  const firstCatNameBefore = await reorderNameInputs.nth(0).inputValue();
  const secondCatNameBefore = await reorderNameInputs.nth(1).inputValue();

  // Move row 0 down: row 0 becomes secondCatNameBefore, row 1 becomes firstCatNameBefore
  await page.locator('button[aria-label="Move category down"]').first().click();
  await expect(reorderNameInputs.nth(0)).toHaveValue(secondCatNameBefore);
  await expect(reorderNameInputs.nth(1)).toHaveValue(firstCatNameBefore);

  const reorderSavePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  await page.getByRole('button', { name: /Save Grade Weights/i }).click();

  const reorderSaveRes = await reorderSavePromise;
  expect(reorderSaveRes.status()).toBe(200);
  const reorderSaveData = await reorderSaveRes.json();
  expect(reorderSaveData.status).toBe('ok');
  expect(reorderSaveData.configuration.categories[0].name).toBe(secondCatNameBefore);
  expect(reorderSaveData.configuration.categories[0].sortOrder).toBe(1);
  expect(reorderSaveData.configuration.categories[1].name).toBe(firstCatNameBefore);
  expect(reorderSaveData.configuration.categories[1].sortOrder).toBe(2);

  await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

  // 8. Hard reload with cleared localStorage to verify PostgreSQL persistence of reordered sortOrder
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#course-offering-select')).toBeVisible();
  const reloadGetPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'GET'
  );
  const reloadGetRes = await reloadGetPromise;
  const reloadGetData = await reloadGetRes.json();
  expect(reloadGetData.configuration.categories[0].name).toBe(secondCatNameBefore);
  expect(reloadGetData.configuration.categories[0].sortOrder).toBe(1);
  expect(reloadGetData.configuration.categories[1].name).toBe(firstCatNameBefore);
  expect(reloadGetData.configuration.categories[1].sortOrder).toBe(2);

  const postReloadInputs = page.locator('input[placeholder*="Category name"]');
  await expect(postReloadInputs.nth(0)).toHaveValue(secondCatNameBefore);
  await expect(postReloadInputs.nth(1)).toHaveValue(firstCatNameBefore);

  console.log('LIVE FACULTY GRADE WEIGHTS WORKFLOW VALIDATED SUCCESSFULLY IN POSTGRESQL');
});

test('authoritative faculty assessment manager: create and edit assessments with stable grading category in PostgreSQL', async ({ page }) => {
  // 1. Authenticate as faculty
  const credentials = await login(page, facultyEmail, facultyPassword);
  expect(credentials.access_token).toBeTruthy();

  // 2. Fetch classes to determine active offering
  const classesRes = await page.request.get('/api/faculty/classes', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const classesData = await jsonResponse(classesRes);
  expect(classesData.status).toBe('ok');
  const activeClasses = (classesData.classes || []).filter((c: any) => (c.status || '').toLowerCase() === 'active');
  expect(activeClasses.length).toBeGreaterThan(0);

  const activeClass = activeClasses[0];

  // 3. Ensure Grade Weights configuration exists for that offering
  const configRes = await page.request.get(
    `/api/faculty/grading-config?courseId=${activeClass.courseId}&semester=${encodeURIComponent(activeClass.semester)}&schoolYear=${encodeURIComponent(activeClass.schoolYear)}`,
    {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    }
  );
  const configData = await jsonResponse(configRes);
  let existingConfig = configData.configuration;
  if (!existingConfig || !existingConfig.categories || existingConfig.categories.length < 2) {
    const savePayload: any = {
      courseId: activeClass.courseId,
      semester: activeClass.semester,
      schoolYear: activeClass.schoolYear,
      categories: [
        { name: 'Quizzes', weight: '30', sortOrder: 1 },
        { name: 'Midterm Exam', weight: '30', sortOrder: 2 },
        { name: 'Final Exam', weight: '40', sortOrder: 3 },
      ],
    };
    if (existingConfig?.version !== undefined && existingConfig.version !== null) {
      savePayload.version = existingConfig.version;
    }
    const saveRes = await page.request.put('/api/faculty/grading-config', {
      headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
      data: savePayload,
    });
    const saved = await jsonResponse(saveRes);
    existingConfig = saved.configuration;
  }

  expect(existingConfig.categories.length).toBeGreaterThanOrEqual(2);
  const firstCategory = existingConfig.categories[0];
  const secondCategory = existingConfig.categories[1];

  // 4. Navigate to Assessments Tab
  await page.goto('/grades?tab=assessments');
  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeEnabled();

  // 5. Open Create Assessment Modal
  const testTitle = `Live Assessment ${Date.now()}`;
  await page.getByRole('button', { name: 'Add Assessment' }).click();

  const modalForm = page.locator('form').last();
  await expect(page.getByRole('heading', { name: 'Create New Assessment activity' })).toBeVisible();

  // 6. Check category dropdown contains dynamic categories from PostgreSQL
  const categorySelect = modalForm.locator('select').nth(1);
  await expect(categorySelect).toContainText(firstCategory.name);
  await expect(categorySelect).toContainText(secondCategory.name);

  // Fill in title
  await modalForm.locator('input[type="text"]').first().fill(testTitle);
  // Select firstCategory
  await categorySelect.selectOption(String(firstCategory.id));

  // Save assessment
  const createPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments') && response.request().method() === 'POST'
  );
  const refreshPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments') && response.request().method() === 'GET'
  );
  await modalForm.getByRole('button', { name: 'Confirm Assessment' }).click();

  const createRes = await createPromise;
  expect(createRes.status()).toBe(200);
  await refreshPromise;

  // Wait for table to reflect new assessment
  const row = page.getByRole('row').filter({ hasText: testTitle });
  await expect(row).toBeVisible();
  // Category column renders the dynamic category name
  await expect(row.locator('td').nth(1)).toContainText(firstCategory.name);

  // 7. Verify in authoritative backend GET /api/faculty/assessments
  const verifyRes = await page.request.get('/api/faculty/assessments', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const allAssessments = await jsonResponse(verifyRes);
  const createdAss = allAssessments.find((a: any) => a.title === testTitle);
  expect(createdAss).toBeTruthy();
  expect(String(createdAss.gradingCategoryId)).toBe(String(firstCategory.id));
  expect(createdAss.type).toBe(firstCategory.name);

  // 8. Edit assessment to switch to secondCategory
  await row.getByRole('button', { name: 'Edit' }).click();
  const editModalForm = page.locator('form').last();
  const editCategorySelect = editModalForm.locator('select').nth(1);
  await expect(editCategorySelect).toHaveValue(String(firstCategory.id));

  await editCategorySelect.selectOption(String(secondCategory.id));

  const editPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments') && response.request().method() === 'POST'
  );
  const editRefreshPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments') && response.request().method() === 'GET'
  );
  await editModalForm.getByRole('button', { name: 'Confirm Assessment' }).click();

  const editRes = await editPromise;
  expect(editRes.status()).toBe(200);
  await editRefreshPromise;

  // Table updates with new category name
  await expect(row.locator('td').nth(1)).toContainText(secondCategory.name);

  // 9. Hard reload with cleared localStorage to verify PostgreSQL persistence and category name resolution
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeEnabled();

  const reloadedRow = page.getByRole('row').filter({ hasText: testTitle });
  await expect(reloadedRow).toBeVisible();
  await expect(reloadedRow.locator('td').nth(1)).toContainText(secondCategory.name);

  // 10. Clean up: Delete the test assessment to keep PostgreSQL database clean
  const deletePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments/delete') && response.request().method() === 'POST'
  );
  const deleteRefreshPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/assessments') && response.request().method() === 'GET'
  );
  await reloadedRow.getByRole('button', { name: 'Delete' }).click();

  // Confirmation modal: click Confirm
  await page.getByRole('button', { name: 'Confirm' }).click();

  const deleteRes = await deletePromise;
  expect(deleteRes.status()).toBe(200);
  await deleteRefreshPromise;

  // Verify removed from UI
  await expect(page.getByRole('row').filter({ hasText: testTitle })).toHaveCount(0);

  // Verify removed from PostgreSQL backend
  const postDeleteRes = await page.request.get('/api/faculty/assessments', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const postDeleteAssessments = await jsonResponse(postDeleteRes);
  expect(postDeleteAssessments.some((a: any) => a.title === testTitle)).toBe(false);

  console.log('LIVE FACULTY ASSESSMENT MANAGER WORKFLOW VALIDATED SUCCESSFULLY IN POSTGRESQL');
});
