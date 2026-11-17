import { expect, test, type Page } from '@playwright/test';

const facultyEmail = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? 'Student123!';
const mailpitBaseUrl = process.env.E2E_MAILPIT_BASE_URL ?? 'http://127.0.0.1:18025';

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password } });
  const payload = await response.json();
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  return payload as { access_token: string };
}

// Production bug: the enrolment upload (30 JPEG frames) has a fixed 30 s client timeout, so on a slow phone
// uplink the browser aborts the request and the Student never gets a server answer. Retrying fails the same way.
test('Student enrolment upload over a slow uplink is not aborted by the client', async ({ page }) => {
  test.setTimeout(150_000);

  // Create and activate a fresh Student (same path as live.spec.ts).
  const faculty = await login(page, facultyEmail, facultyPassword);
  const auth = { Authorization: `Bearer ${faculty.access_token}` };
  const classes = await (await page.request.get('/api/faculty/classes', { headers: auth })).json();
  const currentYear = String(classes.currentSchoolYear ?? '').trim().toLowerCase();
  const targetClass = (classes.classes ?? []).find((c: Record<string, unknown>) =>
    String(c.schoolYear ?? '').trim().toLowerCase() === currentYear
    && String(c.status ?? '').trim().toLowerCase() === 'active' && !c.archivedAt);
  expect(targetClass, 'no active assigned class').toBeTruthy();
  const classId = String(targetClass.id ?? targetClass.csId);
  const suffix = Date.now().toString(36);
  const email = `live.slowupload.${suffix}@bicol-u.edu.ph`;
  const created = await page.request.post('/api/faculty/students', {
    headers: auth,
    data: { studentNumber: `SLW-${suffix}`, firstName: 'Slow', lastName: 'Uplink', email, yearLevel: 1, classId },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const invitation = await page.request.post('/api/faculty/student-invitations', {
    headers: auth,
    data: { studentId: String((await created.json()).student.id), classId },
  });
  expect(invitation.ok(), await invitation.text()).toBeTruthy();
  const messages = await (await page.request.get(`${mailpitBaseUrl}/api/v1/messages`)).json();
  const message = (messages.messages as Array<{ ID: string; Subject: string; To?: Array<{ Address?: string }> }>).find(m =>
    m.Subject === 'DentiSYS Student Invitation' && m.To?.some(r => r.Address?.toLowerCase() === email));
  expect(message, 'invitation email').toBeTruthy();
  const detail = await (await page.request.get(`${mailpitBaseUrl}/api/v1/message/${message!.ID}`)).json();
  const token = JSON.stringify(detail).match(/activate-student\?token=([A-Za-z0-9_-]{43})/)?.[1];
  expect(token).toBeTruthy();
  const activation = await page.request.post('/api/auth/student/activate', { data: { token, password: studentPassword } });
  expect(activation.ok(), await activation.text()).toBeTruthy();

  // Sign in as the Student; the app restores the session from the cookie.
  await login(page, email, studentPassword);
  await page.goto('/student/classes');
  await expect(page.getByRole('main')).toBeVisible({ timeout: 15000 });

  // Throttle only the upload, right before the call: ~150 kbps with 100 ms latency.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 100, downloadThroughput: -1, uploadThroughput: 19_000,
  });

  const result = await page.evaluate(async () => {
    const api = await import(/* @vite-ignore */ '/src/services/apiClient.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const frames: Blob[] = [];
    let totalBytes = 0;
    for (let i = 0; i < 30; i++) {
      const img = ctx.createImageData(640, 480);
      for (let p = 0; p < img.data.length; p += 4) {
        const noise = Math.random() * 10;
        const x = (p / 4) % 640;
        const y = Math.floor(p / 4 / 640);
        img.data[p] = 120 + noise + (x % 64);
        img.data[p + 1] = 100 + noise + (y % 48);
        img.data[p + 2] = 90 + noise;
        img.data[p + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85));
      totalBytes += blob.size;
      frames.push(blob);
    }
    const fd = new FormData();
    fd.append('challengeId', 'slow-upload-probe');
    fd.append('challenge_id', 'slow-upload-probe');
    fd.append('challengeToken', 'slow-upload-probe-token');
    fd.append('challenge_token', 'slow-upload-probe-token');
    fd.append('idempotencyKey', 'slow-upload-probe-key');
    fd.append('idempotency_key', 'slow-upload-probe-key');
    frames.forEach((blob, idx) => fd.append('frames[]', blob, `sample_${idx}.jpg`));

    const started = performance.now();
    try {
      await api.submitBiometricEnrollment(fd);
      return { status: 200, message: 'ok', elapsedMs: Math.round(performance.now() - started), totalBytes };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      return { status: e.status ?? -1, message: String(e.message ?? err), elapsedMs: Math.round(performance.now() - started), totalBytes };
    }
  });

  console.log(`slow upload: ${JSON.stringify(result)}`);
  expect(
    result.status,
    `client aborted the upload (status ${result.status}, "${result.message}") after ${result.elapsedMs} ms for ${result.totalBytes} bytes; a server answer should reach the app`,
  ).not.toBe(0);
});
