import { expect, test, type Page } from '@playwright/test';

// Live check for grade submission, 13.8 (docs/contracts/grade-submission.md): submit, view-only, withdraw.
// The 24-hour grace cannot be expired from a live spec (no database access), so Request grade change and the
// Dean's decision are covered by the mocked e2e/grade-submissions-dean.spec.ts.
// Creates one class with two made-up students and archives it as cancelled afterwards, pass or fail.
const facultyEmail = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

type JsonRecord = Record<string, any>;

async function json(response: Awaited<ReturnType<Page['request']['get']>>) {
  const body = await response.text();
  expect(response.status(), body).toBeLessThan(500);
  return JSON.parse(body) as JsonRecord;
}

let cleanup: { csId: string; headers: Record<string, string> } | null = null;
test.afterEach(async ({ request }) => {
  if (!cleanup) return;
  const { csId, headers } = cleanup;
  cleanup = null;
  // A submitted class refuses changes, so withdraw first (a no-op error when it is not submitted).
  await request.post('/api/faculty/classes/grade-submission/withdraw', { headers, data: { csId: Number(csId) } });
  await request.post('/api/faculty/classes/archive', { headers, data: { csId: Number(csId), reason: 'cancelled' } });
});

test('Faculty submit a class, see it view-only, and withdraw it', async ({ page }) => {
  test.setTimeout(180_000);
  const login = await json(await page.request.post('/api/auth/login', { data: { email: facultyEmail, password: facultyPassword } }));
  expect(login.access_token).toEqual(expect.any(String));
  const headers = { Authorization: `Bearer ${login.access_token}` };
  const suffix = Date.now().toString(36).toUpperCase();

  // Fixture: one class in the current school year, two students, one assessment scored for the first student only.
  const before = await json(await page.request.get('/api/faculty/classes', { headers }));
  const term = (before.academicTerms ?? []).find((t: JsonRecord) => t.id !== null && t.schoolYear === before.currentSchoolYear);
  expect(term, 'the demo needs a Dean term for the current school year').toBeTruthy();
  const csName = `GS-${suffix}-A`;
  const courseName = `Live grade submission ${suffix}`;
  const created = await page.request.post('/api/faculty/classes', {
    headers,
    data: { csName, academicTermId: term.id, courseCode: `GS-${suffix}`, courseName, yearLevel: 1, block: 'A', lectureUnits: 3, labUnits: 0 },
  });
  const createdBody = await json(created);
  expect(created.status(), JSON.stringify(createdBody)).toBe(201);
  const csId = String(createdBody.csId);
  cleanup = { csId, headers };
  const classes = await json(await page.request.get('/api/faculty/classes', { headers }));
  const cls = classes.classes.find((c: JsonRecord) => String(c.csId ?? c.id) === csId);
  expect(cls, 'the new class is listed').toBeTruthy();
  const configQuery = new URLSearchParams({ courseId: String(cls.courseId), semester: cls.semester, schoolYear: cls.schoolYear });
  // Sign in once through the screen.
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', facultyEmail);
  await page.fill('input[type="password"]', facultyPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !/\/(login|2fa|mfa)/.test(url.pathname));

  const main = page.getByRole('main');
  const dialog = page.getByRole('dialog');

  // A new class has only default weights; save them so the grading categories get real ids.
  await page.goto('/grades?tab=components');
  await main.getByLabel(/^Class:/).selectOption(csId);
  const saved = page.waitForResponse(r => r.url().includes('/api/faculty/grading-config') && r.request().method() === 'PUT');
  await main.getByRole('button', { name: /Save initial schema/ }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();

  const config = await json(await page.request.get(`/api/faculty/grading-config?${configQuery}`, { headers }));
  const categories = [...(config.configuration?.midtermCategories ?? [])];
  expect(categories.length, JSON.stringify(config).slice(0, 400)).toBeGreaterThan(0);

  const makeStudent = async (number: string, lastName: string) => {
    const body = await json(await page.request.post('/api/faculty/students', {
      headers,
      data: { studentNumber: number, firstName: 'Live', lastName, email: `live.gs.${number.toLowerCase()}@bicol-u.edu.ph`, yearLevel: 1, classId: csId },
    }));
    return String(body.student.id);
  };
  const scoredId = await makeStudent(`GS-${suffix}-1`, 'Scored');
  await makeStudent(`GS-${suffix}-2`, 'Unscored');
  const category = categories[0];
  const assessments = await json(await page.request.post('/api/faculty/assessments', {
    headers,
    data: [{
      title: `Live quiz ${suffix}`, type: 'Quiz', classId: csId, gradingPeriod: category.gradingPeriod ?? 'Midterm', maxScore: 100, status: 'Active',
      transmutationEnabled: false, transmutationMinimumPercentage: 50, transmutationMaximumPercentage: 100, gradingCategoryId: Number(category.id),
    }],
  }));
  expect(assessments.assessments?.length, JSON.stringify([assessments, category])).toBe(1);
  const scores = await page.request.post('/api/faculty/scores', {
    headers,
    data: { batches: [{ assessmentId: String(assessments.assessments[0].id), scores: [{ studentId: scoredId, score: 80 }] }] },
  });
  expect(scores.ok(), await scores.text()).toBeTruthy();

  const cardChip = async () => {
    await page.goto('/classes');
    const card = page.locator('div').filter({ has: page.getByRole('heading', { name: courseName }) }).last();
    return card.getByTestId('class-grade-status');
  };

  // Before: the class card reads Not submitted.
  await expect(await cardChip()).toHaveText('Not submitted');

  // Submit: the confirmation lists the student with a missing score and still allows submitting.
  await page.goto('/grades?tab=scores');
  await main.getByLabel(/^Class:/).selectOption(csId);
  await expect(main.getByRole('tab', { name: /Student Scores Entry/ })).toBeVisible();
  await main.getByRole('button', { name: 'Submit grades' }).click();
  await expect(dialog.getByRole('heading', { name: 'Submit Grades' })).toBeVisible();
  await expect(dialog).toContainText('1 student has missing scores');
  await expect(dialog).toContainText('Unscored');
  await expect(dialog).not.toContainText('Scored, Live (');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();

  // After: emerald banner with the withdraw window, view-only (no Scores tab), no Submit button.
  const banner = main.getByRole('status').filter({ hasText: 'Submitted. You can withdraw until' });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveClass(/emerald/);
  await expect(main.getByRole('tab', { name: /Student Scores Entry/ })).toHaveCount(0);
  await expect(main.getByRole('tab', { name: /Assessments Manager/ })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Submit grades' })).toHaveCount(0);

  // The server agrees and refuses a second submission.
  const state = await json(await page.request.get(`/api/faculty/classes/grade-submission?csId=${csId}`, { headers }));
  expect(state.status).toBe('submitted');
  expect(state.graceUntil).toEqual(expect.any(String));
  const again = await page.request.post('/api/faculty/classes/grade-submission', { headers, data: { csId: Number(csId) } });
  expect(again.status()).toBe(409);

  // The class card chip reads Submitted.
  await expect(await cardChip()).toHaveText('Submitted');

  // Withdraw: the confirmation, then the class is editable and the Submit button is back.
  await page.goto('/grades?tab=scores');
  await main.getByLabel(/^Class:/).selectOption(csId);
  await main.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Withdraw Submission' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(main.getByRole('button', { name: 'Submit grades' })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await expect(main.getByRole('tab', { name: /Student Scores Entry/ })).toBeVisible();
  await expect(await cardChip()).toHaveText('Not submitted');
});
