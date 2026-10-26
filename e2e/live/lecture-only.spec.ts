import { expect, test, type Page } from '@playwright/test';

// Live check for lecture-only courses (docs/contracts/lecture-only-grading.md).
// Creates one lecture-only class with one made-up student; it stays as test data (Owner, Q11).
const facultyEmail = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

type JsonRecord = Record<string, any>;

async function json(response: Awaited<ReturnType<Page['request']['get']>>) {
  const body = await response.text();
  expect(response.status(), body).toBeLessThan(500);
  return JSON.parse(body) as JsonRecord;
}

test('a lecture-only course is graded as Lecture only, end to end', async ({ page }) => {
  test.setTimeout(180_000);
  const login = await json(await page.request.post('/api/auth/login', { data: { email: facultyEmail, password: facultyPassword } }));
  expect(login.access_token).toEqual(expect.any(String));
  const headers = { Authorization: `Bearer ${login.access_token}` };
  const suffix = Date.now().toString(36).toUpperCase();

  // 1. Create the class through the app's own endpoint: Lecture 3 units, Laboratory 0.
  const before = await json(await page.request.get('/api/faculty/classes', { headers }));
  const term = (before.academicTerms ?? []).find((t: JsonRecord) => t.id !== null && t.schoolYear === before.currentSchoolYear);
  expect(term, 'the demo needs a Dean term for the current school year').toBeTruthy();
  const csName = `LIVE-LO-${suffix}`;
  const created = await page.request.post('/api/faculty/classes', {
    headers,
    data: { csName, academicTermId: term.id, courseCode: `LO-${suffix}`, courseName: 'Live lecture-only check', yearLevel: 1, block: 'A', lectureUnits: 3, labUnits: 0 },
  });
  const createdBody = await json(created);
  expect(created.status(), JSON.stringify(createdBody)).toBe(201);
  const csId = String(createdBody.csId);
  const classes = await json(await page.request.get('/api/faculty/classes', { headers }));
  const cls = classes.classes.find((c: JsonRecord) => String(c.csId ?? c.id) === csId);
  const configQuery = new URLSearchParams({ courseId: String(cls.courseId), semester: cls.semester, schoolYear: cls.schoolYear });

  // 2. The server reports the structure and lecture-only defaults.
  const defaults = await json(await page.request.get(`/api/faculty/grading-config?${configQuery}`, { headers }));
  expect(defaults.courseStructure).toBe('lecture');
  expect(defaults.courseUnits).toEqual({ lecture: 3, laboratory: 0 });
  expect(defaults.defaults?.componentMode).toBe('lecture');

  // 3. Grade Weights screen: approved wording, no Laboratory tab; save it.
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', facultyEmail);
  await page.fill('input[type="password"]', facultyPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !/\/(login|2fa|mfa)/.test(url.pathname));
  await page.goto('/grades?tab=components');
  await page.getByRole('main').getByLabel(/^Class:/).selectOption(csId);
  const main = page.getByRole('main');
  await expect(main.getByText('BU Dental Medicine Default Grade Weights: Lecture only • Midterm 30% / Final 70%')).toBeVisible();
  await expect(main.getByText("Lecture only, from this course's units (Lecture 3 · Laboratory 0). No Laboratory part.")).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Laboratory Categories' })).toHaveCount(0);
  const saved = page.waitForResponse(r => r.url().includes('/api/faculty/grading-config') && r.request().method() === 'PUT');
  await main.getByRole('button', { name: /Save Initial Schema/ }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  const config = (await json(await page.request.get(`/api/faculty/grading-config?${configQuery}`, { headers }))).configuration;
  expect(config.componentMode).toBe('lecture');
  expect(config.componentWeights).toBeUndefined();

  // 4. One made-up student, one assessment per category, Midterm 84 and Final 92.
  const student = await json(await page.request.post('/api/faculty/students', {
    headers,
    data: { studentNumber: `LO-${suffix}`, firstName: 'Live', lastName: 'Lectureonly', email: `live.lo.${suffix.toLowerCase()}@bicol-u.edu.ph`, yearLevel: 1, classId: csId },
  }));
  const studentId = String(student.student.id);
  const categories = [...config.midtermCategories, ...config.finalCategories];
  expect(categories.every((c: JsonRecord) => c.component === undefined || c.component === 'Lecture')).toBeTruthy();
  const assessments = await json(await page.request.post('/api/faculty/assessments', {
    headers,
    data: categories.map((c: JsonRecord) => ({
      title: `${c.name} ${c.gradingPeriod}`, type: 'Quiz', classId: csId, gradingPeriod: c.gradingPeriod, maxScore: 100, status: 'Active',
      transmutationEnabled: false, transmutationMinimumPercentage: 50, transmutationMaximumPercentage: 100, gradingCategoryId: Number(c.id),
    })),
  }));
  expect(assessments.assessments?.length, JSON.stringify(assessments)).toBe(categories.length);
  const periodOf = new Map(categories.map((c: JsonRecord) => [`${c.name} ${c.gradingPeriod}`, c.gradingPeriod]));
  const scores = await page.request.post('/api/faculty/scores', {
    headers,
    data: { batches: assessments.assessments.map((a: JsonRecord) => ({ assessmentId: String(a.id), scores: [{ studentId, score: periodOf.get(a.title) === 'Midterm' ? 84 : 92 }] })) },
  });
  expect(scores.ok(), await scores.text()).toBeTruthy();

  // 5. Server math: period grade = Lecture grade, course grade rounded once (89.6 -> 90 -> 1.9).
  const compute = await json(await page.request.post('/api/faculty/grades/compute', { headers, data: { classId: csId } }));
  const result = (compute.results ?? []).find((r: JsonRecord) => String(r.studentId) === studentId) ?? compute.results?.[0];
  expect(Number(result.periods.midterm.percentage)).toBe(84);
  expect(Number(result.periods.final.percentage)).toBe(92);
  expect(Number(result.percentage)).toBe(90);
  expect(Number(result.gwa)).toBe(1.9);

  // 6. Gradebook: one Lecture group, no Laboratory, hover shows the one-rounding steps.
  await page.goto('/grades?tab=scores');
  await page.getByRole('main').getByLabel(/^Class:/).selectOption(csId);
  await page.getByRole('button', { name: /Full Matrix View/ }).first().click();
  const table = page.locator('table').filter({ hasText: 'Student Info' }).first();
  await expect(table.locator('thead')).toContainText(/Lecture/i);
  await expect(table.locator('thead')).not.toContainText(/Laboratory/i);
  const finalGrade = table.locator('tbody tr').first().locator('td').last().locator('span').first();
  await finalGrade.scrollIntoViewIfNeeded();
  await finalGrade.hover();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('span')].some(s => s.textContent?.trim() === '84% × 30% + 92% × 70% = 89.6% → 90% → 1.9'))).toBe(true);
});
