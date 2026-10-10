import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

// Person names cannot contain digits, so unique suffixes are spelled with letters.
const nameSafe = (value: string) => value.replace(/[0-9]/g, digit => 'abcdefghij'[Number(digit)]);

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@bicol-u.edu.ph';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!';
const facultyEmail = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';
const secretaryEmail = process.env.E2E_SECRETARY_EMAIL ?? 'secretary@bicol-u.edu.ph';
const secretaryPassword = process.env.E2E_SECRETARY_PASSWORD ?? 'Secretary123!';
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? 'Student123!';
const mailpitBaseUrl = process.env.E2E_MAILPIT_BASE_URL ?? 'http://127.0.0.1:18025';

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

function currentAssignedClass(classesPayload: {
  currentSchoolYear?: string;
  classes?: Array<Record<string, unknown>>;
}) {
  const currentSchoolYear = String(classesPayload.currentSchoolYear ?? '').trim();
  const currentClass = (classesPayload.classes ?? []).find(candidate =>
    String(candidate.schoolYear ?? '').trim().toLowerCase() === currentSchoolYear.toLowerCase()
    && String(candidate.status ?? '').trim().toLowerCase() === 'active'
  );
  expect(currentSchoolYear).not.toBe('');
  expect(currentClass, `No active assigned class found for ${currentSchoolYear}`).toBeTruthy();
  return currentClass as Record<string, unknown>;
}

function manilaSessionWindow() {
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(timeParts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(timeParts.find(part => part.type === 'minute')?.value ?? '0');
  const currentMinute = hour * 60 + minute;
  const formatTime = (totalMinutes: number) =>
    `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

  if (currentMinute <= 21 * 60) {
    return {
      openingTime: '00:00',
      presentCutoff: formatTime(currentMinute + 60),
      lateCutoff: formatTime(currentMinute + 120),
    };
  }

  return { openingTime: '00:00', presentCutoff: '23:56', lateCutoff: '23:58' };
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

test('authenticator enrollment requires an authenticated profile session', async ({ request }) => {
  const response = await request.post('/api/auth/mfa/enroll/start', {
    headers: { Authorization: 'Bearer invalid-access-token' },
  });
  expect(response.status()).toBe(401);
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
  // Owner decision 2026-09-27 (D5): token-rotation events are stored but hidden from the audit trail.
  // The audit trail is paged: { logs, total, page, pageSize, statusCounts, modules }.
  expect(Array.isArray(auditPayload.logs)).toBeTruthy();
  expect(auditPayload.logs.some((event: { action?: string }) => event.action === 'refresh_rotation')).toBeFalsy();

  // Stop the mounted application before logging out; otherwise a background
  // UI request (notifications, session refresh) racing the logout reports
  // the expected post-logout 401 as a browser console error.
  await page.goto('about:blank');
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
  const targetClass = currentAssignedClass(classesPayload);
  const classId = String(targetClass.id ?? targetClass.csId);

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

  const mailpit = await page.request.get(`${mailpitBaseUrl}/api/v1/messages`);
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
  const targetClass = currentAssignedClass(classesPayload);
  const classId = String(targetClass.id ?? targetClass.csId);
  const suffix = Date.now().toString(36);
  const email = `p03.student.${suffix}@bicol-u.edu.ph`;

  const create = await page.request.post('/api/faculty/students', {
    headers: { Authorization: `Bearer ${facultyCredentials.access_token}` },
    data: {
      studentNumber: `P03-${suffix}`,
      firstName: 'Probe',
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

  const mailpitMessages = await page.request.get(`${mailpitBaseUrl}/api/v1/messages`);
  const mailpitPayload = await jsonResponse(mailpitMessages);
  const activationMessage = (mailpitPayload.messages as Array<{ ID: string; Subject: string; To?: Array<{ Address?: string }> }>).find(message =>
    message.Subject === 'DentiSys Student Invitation'
    && message.To?.some(recipient => recipient.Address?.toLowerCase() === email.toLowerCase())
  );
  expect(activationMessage).toBeTruthy();
  const messageDetail = await page.request.get(`${mailpitBaseUrl}/api/v1/message/${activationMessage!.ID}`);
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
  await expect(page.getByText('Resolving active attendance session status...')).toHaveCount(0, { timeout: 15000 });

  // 4. Verify initial state: form is present, no active session banner
  await expect(page.getByRole('heading', { name: /Start Class Session & Attendance Control/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible({ timeout: 15000 });

  // Verify assigned class is shown (CLINIC-4B)
  await expect(page.locator('form').getByText('CLINIC-4B', { exact: true })).toBeVisible();

  // Verify localStorage has no active session key
  const localSessionBefore = await page.evaluate(() => localStorage.getItem('dentisys_active_class_session'));
  expect(localSessionBefore).toBeNull();

  // 5. Start class session
  const startPromise = page.waitForResponse(
    response => response.url().includes('/api/secretary/attendance/session') && response.request().method() === 'POST'
  );
  await page.getByText('Enforce GPS Geofence Verification').click();
  const sessionWindow = manilaSessionWindow();
  const openingTimeInput = page.getByLabel('Opening Time', { exact: true });
  const presentCutoffInput = page.getByLabel('Present Cutoff', { exact: true });
  const lateCutoffInput = page.getByLabel('Late Cutoff', { exact: true });
  await expect(openingTimeInput).toHaveCount(1);
  await expect(presentCutoffInput).toHaveCount(1);
  await expect(lateCutoffInput).toHaveCount(1);
  await openingTimeInput.fill(sessionWindow.openingTime);
  await presentCutoffInput.fill(sessionWindow.presentCutoff);
  await lateCutoffInput.fill(sessionWindow.lateCutoff);
  // Open the session in the past while keeping its same-day end time ahead.
  await page.getByLabel('Class End Time').fill('23:59');
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
  await page.getByRole('link', { name: 'Attendance Monitoring', exact: true }).click();
  await page.goto('/secretary/start-session');
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
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible({ timeout: 15000 });

  // 11. Refresh browser again to confirm inactive state persists
  await page.reload();
  await expect(page.getByText(/LIVE SESSION ACTIVE/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start Class Session Now/i })).toBeVisible({ timeout: 15000 });

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
  const targetClass = currentAssignedClass(classesPayload);
  const targetCourseId = String(targetClass.courseId);
  const targetCsId = String(targetClass.id ?? targetClass.csId);

  // 3. Create a fresh enrolled student in this section to guarantee an unrecorded attendance row
  const suffix = Date.now().toString(36);
  const create = await page.request.post('/api/faculty/students', {
    headers: { Authorization: `Bearer ${facultyCreds.access_token}` },
    data: {
      studentNumber: `ATT-${suffix}`,
      firstName: 'LiveAttendance',
      lastName: `Student-${nameSafe(suffix)}`,
      email: `attendance.${suffix}@bicol-u.edu.ph`,
      yearLevel: 1,
      classId: targetCsId,
    },
  });
  const createdData = await jsonResponse(create);
  expect(createdData.status).toBe('ok');
  const studentFullName = `LiveAttendance Student-${nameSafe(suffix)}`;

  // 4. Navigate directly to /attendance
  await page.goto('/attendance');
  await page.getByRole('tab', { name: 'Roll call', exact: true }).click();

  // Verify header and initial empty worksheet state
  await expect(page.getByRole('main').getByRole('heading', { name: /Attendance Monitoring/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Please select an Assigned Course and Class Section/i)).toBeVisible();

  // Clear any legacy localStorage to verify Attendance Monitoring does not write to it
  await page.evaluate(() => localStorage.removeItem('dentisys_attendance'));

  // 5. Select Course and Section
  const courseSelect = page.getByLabel('Assigned course', { exact: true });
  await courseSelect.selectOption(targetCourseId);

  const sectionSelect = page.getByLabel('Class section', { exact: true });
  await sectionSelect.selectOption(targetCsId);

  // Wait for worksheet to load from PostgreSQL
  await expect(page.getByText(/Please select an Assigned Course and Class Section/i)).toHaveCount(0);
  const studentRow = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRow).toBeVisible();

  // Initial state: student status is 'Not recorded'
  await expect(studentRow.getByTestId('attendance-status').getByText('Not recorded')).toBeVisible();

  // 6. Initial Entry: click Present
  const initialOverridePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/attendance/override') && response.request().method() === 'POST'
  );
  await studentRow.getByRole('button', { name: 'Override', exact: true }).click();
  await page.locator('form').getByRole('button', { name: 'present', exact: true }).click();
  await page.getByRole('button', { name: 'Save Override', exact: true }).click();

  const initialOverrideRes = await initialOverridePromise;
  expect(initialOverrideRes.status()).toBe(200);
  const initialOverrideData = await initialOverrideRes.json();
  expect(initialOverrideData.status).toBe('ok');
  expect(initialOverrideData.operation).toBe('created');
  expect(initialOverrideData.recordId).toBeTruthy();

  // Toast appears and row status updates to Present
  await expect(page.getByText(new RegExp(`Attendance updated for ${studentFullName}`, 'i'))).toBeVisible();
  await expect(studentRow.getByTestId('attendance-status').getByText('Present', { exact: true })).toBeVisible();

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
  await page.getByLabel('Assigned course', { exact: true }).selectOption(targetCourseId);
  await page.getByLabel('Class section', { exact: true }).selectOption(targetCsId);

  // Verify row still displays Present from PostgreSQL
  const studentRowAfterReload = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRowAfterReload).toBeVisible();
  await expect(studentRowAfterReload.getByTestId('attendance-status').getByText('Present', { exact: true })).toBeVisible();

  // 8. Correction workflow: change status to Late
  await studentRowAfterReload.getByRole('button', { name: 'Override', exact: true }).click();
  await page.locator('form').getByRole('button', { name: 'late', exact: true }).click();

  // Modal appears
  await expect(page.getByRole('heading', { name: 'Manual Attendance Override' })).toBeVisible();
  await expect(page.getByText(/PRESENT → LATE/i)).toBeVisible();

  // Submitting without reason triggers in-app validation error
  await page.getByRole('button', { name: 'Save Override' }).click();
  await expect(page.getByText(/justification reason is required/i)).toBeVisible();

  // Enter valid reason and submit correction
  const correctionReason = 'Traffic delay verified by instructor';
  await page.fill('textarea', correctionReason);

  const correctionPromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/attendance/override') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save Override' }).click();

  const correctionRes = await correctionPromise;
  expect(correctionRes.status()).toBe(200);
  const correctionData = await correctionRes.json();
  expect(correctionData.status).toBe('ok');
  expect(correctionData.operation).toBe('updated');

  // Modal closes, toast appears, row status updates to Late
  await expect(page.getByRole('heading', { name: 'Manual Attendance Override' })).toHaveCount(0);
  await expect(page.getByText(new RegExp(`Attendance corrected for ${studentFullName}`, 'i'))).toBeVisible();
  await expect(studentRowAfterReload.getByTestId('attendance-status').getByText('Late', { exact: true })).toBeVisible();

  // 9. Refresh browser again to confirm correction persists in PostgreSQL
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByLabel('Assigned course', { exact: true }).selectOption(targetCourseId);
  await page.getByLabel('Class section', { exact: true }).selectOption(targetCsId);

  const studentRowAfterCorrectionReload = page.locator('tbody tr').filter({ hasText: studentFullName });
  await expect(studentRowAfterCorrectionReload.getByTestId('attendance-status').getByText('Late', { exact: true })).toBeVisible();

  // 10. No-op verification: clicking Late again does NOT invoke override endpoint
  let overrideCalledAgain = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/faculty/attendance/override')) {
      overrideCalledAgain = true;
    }
  });
  await studentRowAfterCorrectionReload.getByRole('button', { name: 'Override', exact: true }).click();
  await page.getByRole('button', { name: 'Save Override', exact: true }).click();
  await expect(page.getByText('Choose a different attendance status.')).toBeVisible();
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
  // Grade Computation only lists current-school-year classes.
  const activeClass = currentAssignedClass(classesData) as any;
  const normalizeOfferingPart = (value: unknown) => String(value ?? '').trim().toLowerCase();
  const offeringClassIds = new Set((classesData.classes ?? [])
    .filter((candidate: any) => String(candidate.courseId) === String(activeClass.courseId)
      && normalizeOfferingPart(candidate.semester) === normalizeOfferingPart(activeClass.semester)
      && normalizeOfferingPart(candidate.schoolYear) === normalizeOfferingPart(activeClass.schoolYear)
      && normalizeOfferingPart(candidate.status) === 'active')
    .map((candidate: any) => String(candidate.id ?? candidate.csId)));
  const isOfferingConfigGet = (response: any) => response.url().includes('/api/faculty/grading-config?')
    && response.url().includes(`courseId=${activeClass.courseId}&`)
    && response.request().method() === 'GET';
  const selectOfferingCourse = async () => {
    await page.getByRole('main').locator('select').first().selectOption(String(activeClass.courseCode));
    await expect(page.getByText('Editing schema for:')).toContainText(String(activeClass.courseCode));
  };

  const checkConfigRes = await page.request.get(
    `/api/faculty/grading-config?courseId=${activeClass.courseId}&semester=${encodeURIComponent(activeClass.semester)}&schoolYear=${encodeURIComponent(activeClass.schoolYear)}`,
    { headers: { Authorization: `Bearer ${credentials.access_token}` } }
  );
  const checkConfigData = await jsonResponse(checkConfigRes);
  let unlinkedAssessments: any[] = [];
  if (checkConfigData.configuration === null) {
    const assessmentsRes = await page.request.get('/api/faculty/assessments', {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    });
    const assessmentsPayload = await jsonResponse(assessmentsRes);
    const existingAssessments = Array.isArray(assessmentsPayload)
      ? assessmentsPayload
      : (assessmentsPayload.assessments ?? []);
    unlinkedAssessments = existingAssessments.filter((assessment: any) =>
      offeringClassIds.has(String(assessment.classId))
      && !assessment.gradingCategoryId
      && String(assessment.status ?? 'Active').toLowerCase() !== 'archived'
    );
  }

  // 3. Navigate to Grade Weights Editor
  const initialConfigPromise = page.waitForResponse(isOfferingConfigGet, { timeout: 15000 });
  await page.goto('/grades?tab=components');
  await expect(page.getByRole('main').locator('select').first()).toBeVisible({ timeout: 15000 });
  await selectOfferingCourse();

  // 4. Wait for configuration to load
  await initialConfigPromise;

  // Check if categories already exist or if it's unconfigured
  await expect(page.locator('input[placeholder*="Category name"]').first()).toBeVisible();

  const isUnsavedPreset = await page.getByText(/Suggested starting preset — unsaved/i).first().isVisible();
  const isLegacyCombinedPeriod = checkConfigData.configuration?.schemaMode === 'periods'
    && checkConfigData.configuration?.componentMode !== 'lecture_laboratory';

  if (isLegacyCombinedPeriod) {
    const originalCategories = (checkConfigData.configuration.categories ?? [])
      .filter((category: any) => Number(category.id) > 0)
      .map((category: any) => ({ id: Number(category.id), weight: Number(category.weight) }));
    let recomputeCalls = 0;
    page.on('request', request => {
      if (request.url().includes('/api/faculty/grades/compute') && request.method() === 'POST') recomputeCalls += 1;
    });

    await expect(page.getByText('Saved combined period grading', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Convert to Lecture/Laboratory', exact: true }).click();

    const assignCurrentPeriodCategoriesToLecture = async () => {
      const componentSelects = page.getByTestId('unassigned-component-categories').getByRole('combobox');
      while (await componentSelects.count()) await componentSelects.first().selectOption('Lecture');
    };
    const addLaboratoryCategoryForCurrentPeriod = async (period: 'Midterm' | 'Final') => {
      await page.getByRole('tab', { name: 'Laboratory Categories', exact: true }).click();
      await page.getByRole('button', {
        name: period === 'Midterm' ? 'Add Midterm Category' : 'Add Finals Category', exact: true,
      }).click();
      const names = page.locator('input[placeholder*="Category name"]');
      const weights = page.locator('input[placeholder="0"]');
      const newIndex = (await names.count()) - 1;
      await names.nth(newIndex).fill('Laboratory Exercises');
      await weights.nth(newIndex).fill('100');
    };

    await assignCurrentPeriodCategoriesToLecture();
    await addLaboratoryCategoryForCurrentPeriod('Midterm');
    await page.getByRole('button', { name: /Finals Categories/i }).click();
    await assignCurrentPeriodCategoriesToLecture();
    await addLaboratoryCategoryForCurrentPeriod('Final');
    await page.getByRole('tab', { name: 'Lecture Categories', exact: true }).click();

    const conversionPromise = page.waitForResponse(
      response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /Save Grade Weights/i }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    const conversionResponse = await conversionPromise;
    expect(conversionResponse.status()).toBe(200);
    const conversionPayload = await conversionResponse.json();
    expect(conversionPayload.status).toBe('ok');
    expect(conversionPayload.configuration.componentMode).toBe('lecture_laboratory');
    expect(conversionPayload.configuration.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
    const convertedCategories = conversionPayload.configuration.categories ?? [];
    for (const originalCategory of originalCategories) {
      const preserved = convertedCategories.find((category: any) => Number(category.id) === originalCategory.id);
      expect(preserved).toBeTruthy();
      expect(Number(preserved.weight)).toBe(originalCategory.weight);
    }
    expect((conversionPayload.configuration.categories ?? []).filter((category: any) =>
      category.component === 'Laboratory' && category.name === 'Laboratory Exercises'
    ).map((category: any) => Number(category.weight))).toEqual([100, 100]);
    expect(recomputeCalls).toBe(0);
    await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
    await page.getByRole('tab', { name: 'Lecture Categories', exact: true }).click();
  }

  if (!isLegacyCombinedPeriod && isUnsavedPreset) {
    // Assert the split syllabus defaults appear automatically as an unsaved draft.
    const initialNameInputs = page.locator('input[placeholder*="Category name"]');
    await expect(initialNameInputs.nth(0)).toHaveValue('Term Exam');
    await expect(page.locator('#period-component-mode')).toHaveCount(0);
    await expect(page.getByLabel('Lecture contribution (%)')).toHaveValue('60');
    await expect(page.getByLabel('Laboratory contribution (%)')).toHaveValue('40');
    await expect(page.locator('#midterm-ratio-input')).toHaveValue('30');
    await expect(page.locator('#final-ratio-input')).toHaveValue('70');

    if (unlinkedAssessments.length > 0) {
      // The live fixture supplies unlinked records before configuration; mapping is explicit per assessment.
      expect(unlinkedAssessments.some((assessment: any) => String(assessment.type ?? '').toLowerCase() === 'quiz'))
        .toBeTruthy();
      const firstSaveFailPromise = page.waitForResponse(
        response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
      );
      await page.getByRole('button', { name: /Save Initial Schema/i }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();

      const failRes = await firstSaveFailPromise;
      expect(failRes.status()).toBe(422);
      const failData = await failRes.json();
      expect(failData.code).toBe('GRADING_COMPONENT_MAPPING_REQUIRED');
      expect(failData.assessments.length).toBeGreaterThan(0);
      expect(failData.assessments.some((assessment: any) => String(assessment.legacyType).toLowerCase() === 'quiz'))
        .toBeTruthy();

      await expect(page.getByText('Existing Assessments Require Category Mappings', { exact: true })).toBeVisible();
      for (const assessment of failData.assessments) {
        const normalizedType = String(assessment.legacyType ?? '').toLowerCase();
        const isActivity = normalizedType === 'activity';
        const isLaboratory = normalizedType === 'laboratory' || isActivity;
        const component = isLaboratory ? 'Laboratory' : 'Lecture';
        const category = normalizedType === 'quiz'
          ? 'Quiz'
          : normalizedType === 'laboratory'
            ? 'Practical Exam'
            : isActivity
              ? 'Laboratory Exercises'
              : 'Term Exam';
        const period = assessment.gradingPeriod === 'Final' ? 'Final' : 'Midterm';
        const optionLabel = assessment.gradingPeriod
          ? `${component} · ${category}`
          : `${period} · ${component} · ${category}`;
        const assessmentRow = page.getByRole('row').filter({
          has: page.getByRole('cell', { name: String(assessment.assessmentId), exact: true }),
        });
        await expect(assessmentRow).toHaveCount(1);
        await assessmentRow.getByLabel(`Category for ${assessment.title}`).selectOption({ label: optionLabel });
      }

      const scrubExpected422 = () => {
        const errs = (page as any).__liveErrors;
        if (Array.isArray(errs)) {
          const kept = errs.filter((e: string) => !e.includes('status of 422'));
          errs.length = 0;
          errs.push(...kept);
        }
      };
      scrubExpected422();
      await expect(initialNameInputs.nth(0)).toHaveValue('Term Exam');
    }

    // Fill attendance date ranges
    await page.locator('#midterm-start-date').fill('2026-08-01');
    await page.locator('#midterm-end-date').fill('2026-10-15');
    await page.locator('#final-start-date').fill('2026-10-20');
    await page.locator('#final-end-date').fill('2026-12-15');

    // Save Initial Schema successfully
    const savePromise = page.waitForResponse(
      response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: /Save Initial Schema/i }).click();
    // Saving asks for confirmation first.
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    const saveRes = await savePromise;
    expect([200, 201]).toContain(saveRes.status());
    const saveData = await saveRes.json();
    expect(saveData.status).toBe('ok');
    expect(saveData.configuration.version).toBe(1);
    expect(saveData.configuration.schemaMode).toBe('periods');
    expect(saveData.configuration.componentMode).toBe('lecture_laboratory');
    expect(saveData.configuration.componentWeights).toEqual({ lecture: 60, laboratory: 40 });
    expect(saveData.configuration.termRatio).toEqual({ midterm: 30, final: 70 });
    expect(saveData.configuration.categories.length).toBeGreaterThanOrEqual(16);
    expect(saveData.configuration.attendanceDateRanges).toEqual({
      midterm: {
        startDate: '2026-08-01',
        endDate: '2026-10-15',
      },
      final: {
        startDate: '2026-10-20',
        endDate: '2026-12-15',
      },
    });

    await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();
    await expect(page.getByText(/Version 1/i)).toBeVisible();
  }

  // Rename an existing Lecture category and re-save after setup or conversion.
  const nameInputs = page.locator('input[placeholder*="Category name"]');
  const initialFirstName = await nameInputs.nth(0).inputValue();
  const updatedFirstName = initialFirstName.startsWith('Updated ') ? initialFirstName.replace('Updated ', '') : `Updated ${initialFirstName}`;

  await nameInputs.nth(0).fill(updatedFirstName);

  const updatePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  await page.getByRole('button', { name: /Save Grade Weights/i }).click();
  // Saving asks for confirmation first.
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  const updateRes = await updatePromise;
  expect(updateRes.status()).toBe(200);
  const updateData = await updateRes.json();
  expect(updateData.status).toBe('ok');
  const updateMidtermCats = (updateData.configuration.midtermCategories ?? updateData.configuration.categories.filter((c: any) => c.gradingPeriod === 'Midterm'))
    .filter((category: any) => category.component === 'Lecture')
    .sort((left: any, right: any) => left.sortOrder - right.sortOrder);
  expect(updateMidtermCats[0].name).toBe(updatedFirstName);

  await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

  // 6. Hard reload with cleared localStorage to verify PostgreSQL persistence
  await page.evaluate(() => localStorage.clear());
  const persistenceConfigPromise = page.waitForResponse(isOfferingConfigGet);
  await page.reload();

  await selectOfferingCourse();
  await persistenceConfigPromise;

  const reloadedFirstName = await page.locator('input[placeholder*="Category name"]').nth(0).inputValue();
  expect(reloadedFirstName).toBe(updatedFirstName);

  // 7. Reorder categories and verify persistence in PostgreSQL
  const reorderNameInputs = page.locator('input[placeholder*="Category name"]');
  const firstCatNameBefore = await reorderNameInputs.nth(0).inputValue();
  const secondCatNameBefore = await reorderNameInputs.nth(1).inputValue();

  // Move row 0 down: row 0 becomes secondCatNameBefore, row 1 becomes firstCatNameBefore
  await page.locator('button[aria-label*="down"]').first().click();
  await expect(reorderNameInputs.nth(0)).toHaveValue(secondCatNameBefore);
  await expect(reorderNameInputs.nth(1)).toHaveValue(firstCatNameBefore);

  const reorderSavePromise = page.waitForResponse(
    response => response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  await page.getByRole('button', { name: /Save Grade Weights/i }).click();
  // Saving asks for confirmation first.
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  const reorderSaveRes = await reorderSavePromise;
  expect(reorderSaveRes.status()).toBe(200);
  const reorderSaveData = await reorderSaveRes.json();
  expect(reorderSaveData.status).toBe('ok');
  const reorderMidtermCats = (reorderSaveData.configuration.midtermCategories ?? reorderSaveData.configuration.categories.filter((c: any) => c.gradingPeriod === 'Midterm'))
    .filter((category: any) => category.component === 'Lecture')
    .sort((left: any, right: any) => left.sortOrder - right.sortOrder);
  expect(reorderMidtermCats[0].name).toBe(secondCatNameBefore);
  expect(reorderMidtermCats[0].sortOrder).toBe(1);
  expect(reorderMidtermCats[1].name).toBe(firstCatNameBefore);
  expect(reorderMidtermCats[1].sortOrder).toBe(2);

  await expect(page.getByText(/Grade weights saved successfully/i)).toBeVisible();

  // 8. Hard reload with cleared localStorage to verify PostgreSQL persistence of reordered sortOrder
  await page.evaluate(() => localStorage.clear());
  const reloadGetPromise = page.waitForResponse(isOfferingConfigGet);
  await page.reload();

  await selectOfferingCourse();
  const reloadGetRes = await reloadGetPromise;
  const reloadGetData = await reloadGetRes.json();
  const reloadMidtermCats = (reloadGetData.configuration.midtermCategories ?? reloadGetData.configuration.categories.filter((c: any) => c.gradingPeriod === 'Midterm'))
    .filter((category: any) => category.component === 'Lecture')
    .sort((left: any, right: any) => left.sortOrder - right.sortOrder);
  expect(reloadMidtermCats[0].name).toBe(secondCatNameBefore);
  expect(reloadMidtermCats[0].sortOrder).toBe(1);
  expect(reloadMidtermCats[1].name).toBe(firstCatNameBefore);
  expect(reloadMidtermCats[1].sortOrder).toBe(2);

  const postReloadInputs = page.locator('input[placeholder*="Category name"]');
  await expect(postReloadInputs.nth(0)).toHaveValue(secondCatNameBefore);
  await expect(postReloadInputs.nth(1)).toHaveValue(firstCatNameBefore);

  const scrubErrs = (page as any).__liveErrors;
  if (Array.isArray(scrubErrs)) {
    const kept = scrubErrs.filter((e: string) => !e.includes('status of 422'));
    scrubErrs.length = 0;
    scrubErrs.push(...kept);
  }

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
  const activeClass = currentAssignedClass(classesData) as any;

  // 3. Ensure Grade Weights configuration exists for that offering
  const configRes = await page.request.get(
    `/api/faculty/grading-config?courseId=${activeClass.courseId}&semester=${encodeURIComponent(activeClass.semester)}&schoolYear=${encodeURIComponent(activeClass.schoolYear)}`,
    {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    }
  );
  const configData = await jsonResponse(configRes);
  let existingConfig = configData.configuration;
  if (!existingConfig) {
    const defaults = configData.defaults;
    expect(defaults).toEqual(expect.objectContaining({
      schemaMode: 'periods',
      componentMode: 'lecture_laboratory',
      componentWeights: { lecture: 60, laboratory: 40 },
      termRatio: { midterm: 30, final: 70 },
    }));
    const periodCategoryPayload = (categories: any[], gradingPeriod: 'Midterm' | 'Final') => categories.map(category => ({
      name: category.name,
      weight: String(category.weight),
      sortOrder: category.sortOrder,
      gradingPeriod,
      sourceKind: category.sourceKind,
      component: category.component,
    }));
    const savePayload: any = {
      courseId: activeClass.courseId,
      semester: activeClass.semester,
      schoolYear: activeClass.schoolYear,
      schemaMode: 'periods',
      componentMode: defaults.componentMode,
      componentWeights: defaults.componentWeights,
      termRatio: defaults.termRatio,
      midtermCategories: periodCategoryPayload(defaults.midtermCategories, 'Midterm'),
      finalCategories: periodCategoryPayload(defaults.finalCategories, 'Final'),
      attendanceDateRanges: defaults.attendanceDateRanges,
    };
    if (existingConfig?.version !== undefined && existingConfig.version !== null) {
      savePayload.version = existingConfig.version;
    }
    const saveRes = await page.request.put('/api/faculty/grading-config', {
      headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
      data: savePayload,
    });
    const saved = await jsonResponse(saveRes);
    if (!saveRes.ok()) {
      expect(saveRes.status()).toBe(422);
      expect(['GRADING_COMPONENT_MAPPING_REQUIRED', 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED']).toContain(saved.code);
      const unmappedAssessments = saved.assessments ?? saved.details?.assessments;
      expect(unmappedAssessments.length).toBeGreaterThan(0);
      const assignments = unmappedAssessments.map((assessment: any) => {
        const gradingPeriod = assessment.gradingPeriod === 'Final' ? 'Final' : 'Midterm';
        const assessmentType = String(assessment.legacyType ?? '').toLowerCase();
        const component = assessmentType === 'laboratory' || assessmentType === 'activity' ? 'Laboratory' : 'Lecture';
        const categoryName = assessmentType === 'quiz'
          ? 'Quiz'
          : assessmentType === 'laboratory'
            ? 'Practical Exam'
            : assessmentType === 'activity'
              ? 'Laboratory Exercises'
              : 'Term Exam';
        const categories = gradingPeriod === 'Final' ? defaults.finalCategories : defaults.midtermCategories;
        const category = categories.find((candidate: any) => candidate.name === categoryName && candidate.component === component);
        expect(category, `A default ${gradingPeriod} ${component} ${categoryName} category is required to map ${assessment.title}.`).toBeTruthy();
        return {
          assessmentId: Number(assessment.assessmentId),
          categoryName,
          gradingPeriod,
          component,
        };
      });
      savePayload.assessmentAssignments = assignments;
      const mappedSaveRes = await page.request.put('/api/faculty/grading-config', {
        headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
        data: savePayload,
      });
      const mappedSaved = await jsonResponse(mappedSaveRes);
      expect(mappedSaveRes.ok(), JSON.stringify(mappedSaved)).toBeTruthy();
      expect(mappedSaved.status).toBe('ok');
      existingConfig = mappedSaved.configuration;
    } else {
      expect(saveRes.status()).toBe(201);
      expect(saved.status).toBe('ok');
      existingConfig = saved.configuration;
    }
    expect(existingConfig).toEqual(expect.objectContaining({
      schemaMode: 'periods',
      componentMode: 'lecture_laboratory',
      componentWeights: { lecture: 60, laboratory: 40 },
      termRatio: { midterm: 30, final: 70 },
    }));
  }

  expect(existingConfig.categories.length).toBeGreaterThanOrEqual(2);
  const eligibleCategories = existingConfig.categories.filter((c: any) => c.sourceKind !== 'attendance' && (c.gradingPeriod === 'Midterm' || !c.gradingPeriod));
  expect(eligibleCategories.length).toBeGreaterThanOrEqual(2);
  const firstCategory = eligibleCategories[0];
  const secondCategory = eligibleCategories[1];
  const isTargetOfferingConfigRequest = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url());
    return request.method() === 'GET'
      && url.pathname.endsWith('/api/faculty/grading-config')
      && url.searchParams.get('courseId') === String(activeClass.courseId)
      && url.searchParams.get('semester') === String(activeClass.semester)
      && url.searchParams.get('schoolYear') === String(activeClass.schoolYear);
  };
  const assertSavedOfferingConfigRead = async (requestPromise: Promise<any>) => {
    const request = await requestPromise;
    const response = await request.response();
    expect(response?.status()).toBe(200);
    const payload = await response!.json();
    expect(payload.configuration?.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstCategory.id, name: firstCategory.name }),
      expect.objectContaining({ id: secondCategory.id, name: secondCategory.name }),
    ]));
  };

  // 4. Navigate to Assessments Tab
  await page.goto('/grades?tab=assessments');
  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('main').locator('select').first().selectOption(String(activeClass.courseCode));
  await page.getByRole('main').locator('select').nth(1).selectOption(String(activeClass.id));
  await expect(page.getByRole('button', { name: 'Add Assessment' })).toBeEnabled();

  // 5. Open Create Assessment Modal
  const testTitle = `Live Assessment ${Date.now()}`;
  const createConfigRequest = page.waitForRequest(isTargetOfferingConfigRequest);
  await page.getByRole('button', { name: 'Add Assessment' }).click();
  await assertSavedOfferingConfigRead(createConfigRequest);

  const modalForm = page.locator('form').last();
  await expect(page.getByRole('heading', { name: 'Create New Assessment activity' })).toBeVisible();

  // 6. Check category dropdown contains dynamic categories from PostgreSQL
  const categorySelect = modalForm.locator('select').filter({ has: page.locator(`option[value="${firstCategory.id}"]`) });
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
  const editConfigRequest = page.waitForRequest(isTargetOfferingConfigRequest);
  await row.getByRole('button', { name: 'Edit' }).click();
  await assertSavedOfferingConfigRead(editConfigRequest);
  await expect(page.getByRole('heading', { name: 'Edit Assessment Spec' })).toBeVisible();
  const editModalForm = page.locator('form').last();
  const editCategorySelect = editModalForm.locator('select').filter({ has: page.locator(`option[value="${firstCategory.id}"]`) });
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
  const reloadedConfigPromise = page.waitForResponse(response => isTargetOfferingConfigRequest(response.request()));
  await page.reload();
  const reloadedConfigResponse = await reloadedConfigPromise;
  expect(reloadedConfigResponse.status()).toBe(200);
  const reloadedConfigData = await reloadedConfigResponse.json();
  const persistedCategory = reloadedConfigData.configuration.categories.find((category: any) =>
    String(category.id) === String(secondCategory.id)
  );
  expect(persistedCategory?.name).toBe(secondCategory.name);

  const persistedAssessmentsRes = await page.request.get('/api/faculty/assessments', {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });
  const persistedAssessments = await jsonResponse(persistedAssessmentsRes);
  const persistedEditedAssessment = persistedAssessments.find((assessment: any) => assessment.title === testTitle);
  expect(String(persistedEditedAssessment?.gradingCategoryId)).toBe(String(secondCategory.id));

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
