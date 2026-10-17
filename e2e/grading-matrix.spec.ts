import { test, expect } from './fixtures';

// Class-record grading matrix: Student info, Midterm and Tentative Final
// grouped by the saved Grade Weights categories, and server-calculated
// Total / Weighted / period totals / Final Grade.
test('grading matrix groups assessments by period and category and shows server totals', async ({ page }) => {
  let previewRequests = 0;
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-faculty-token' }) });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' }) });
  });
  await page.route('**/api/faculty/classes', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', classes: [
      { id: '7', csId: 7, csName: 'CLINIC-4A', courseId: 7, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', semester: '1ST', schoolYear: '2026-2027', isCurrentSchoolYear: true, status: 'Active' },
    ] }) });
  });
  await page.route('**/api/faculty/students', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: '24', studentId: '2023-5510', name: 'Owhie Santillan Lumbang', email: 'owhie@bicol-u.edu.ph', yearLevel: 4, status: 'active',
        classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: '24' }],
        enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: '24' }] },
    ]) });
  });
  await page.route('**/api/faculty/assessments', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'lo-1', title: 'LO 1', type: 'Quiz', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Midterm', gradingCategoryId: 71, maxScore: 50, status: 'Active', dueDate: '2026-08-20', createdAt: '2026-08-10' },
      { id: 'lo-2', title: 'LO 2', type: 'Quiz', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Midterm', gradingCategoryId: 71, maxScore: 50, status: 'Active', dueDate: '2026-08-27', createdAt: '2026-08-10' },
      { id: 'mid-exam', title: 'Midterm Exam', type: 'Midterm Exam', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Midterm', gradingCategoryId: 72, maxScore: 100, status: 'Active', dueDate: '2026-09-15', createdAt: '2026-08-10' },
      { id: 'fin-exam', title: 'Final Exam', type: 'Final Exam', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Final', gradingCategoryId: 73, maxScore: 100, status: 'Active', dueDate: '2026-12-10', createdAt: '2026-08-10' },
    ]) });
  });
  await page.route('**/api/faculty/scores**', async (route) => {
    const assessmentId = new URL(route.request().url()).searchParams.get('assessmentId') || '';
    const scores: Record<string, number> = { 'lo-1': 47, 'lo-2': 46.5, 'mid-exam': 91 };
    const body = scores[assessmentId] !== undefined
      ? [{ id: `s-${assessmentId}`, studentId: '24', score: scores[assessmentId], remarks: '', submittedAt: '2026-09-15T00:00:00Z' }]
      : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', assessmentId, scores: body }) });
  });
  await page.route('**/api/faculty/grading-config?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', configuration: {
      id: 'cfg-7', course: { id: 7, code: 'CLIN401', name: 'Clinical Dentistry I' }, semester: '1ST', schoolYear: '2026-2027', version: 1,
      schemaMode: 'periods', termRatio: { midterm: 40, final: 60 },
      categories: [],
      midtermCategories: [
        { id: 71, name: 'Learning Outputs', weight: '60', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
        { id: 72, name: 'Midterm Exam', weight: '40', sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
      ],
      finalCategories: [
        { id: 73, name: 'Final Exam', weight: '90', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' },
        { id: 74, name: 'Attendance', weight: '10', sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'attendance' },
      ],
    } }) });
  });
  await page.route('**/api/faculty/grades/compute', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.preview === true) previewRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', preview: true, results: [{
      status: 'incomplete_period', enrollmentId: '24', studentId: '24',
      periods: {
        midterm: { period: 'Midterm', status: 'computed', percentage: 92.46, incomplete: [], attendanceDateRange: { startDate: null, endDate: null }, categories: [
          { categoryId: 71, name: 'Learning Outputs', sourceKind: 'assessment', earnedPoints: 93.5, possiblePoints: 100, ratio: 0.935, weight: 60, contribution: 56.1 },
          { categoryId: 72, name: 'Midterm Exam', sourceKind: 'assessment', earnedPoints: 91, possiblePoints: 100, ratio: 0.91, weight: 40, contribution: 36.4 },
        ] },
        final: { period: 'Final', status: 'incomplete', percentage: null, attendanceDateRange: { startDate: null, endDate: null },
          categories: [{ categoryId: 74, name: 'Attendance', sourceKind: 'attendance', earnedPoints: 100, possiblePoints: 100, ratio: 1, weight: 10, contribution: 10 }],
          incomplete: [{ categoryId: 73, name: 'Final Exam', sourceKind: 'assessment', reason: 'missing_assessment_score' }] },
      },
      breakdown: {}, previouslyPersisted: false, previousPercentage: null, previousGwa: null,
    }] }) });
  });

  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await page.goto('/grades');
  await page.getByRole('button', { name: 'Student Scores Entry' }).click();
  await page.getByRole('button', { name: 'Full Matrix View' }).click();

  const table = page.locator('table').filter({ hasText: 'Student Info' });
  await expect(table.getByRole('columnheader', { name: 'Student Info' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Full Name' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Midterm', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Tentative Final Grade' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Learning Outputs (60%)' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Attendance (10%)' })).toBeVisible();

  const row = table.getByRole('row').filter({ hasText: 'Owhie Santillan Lumbang' });
  await expect(row).toContainText('2023-5510');
  await expect(row.getByLabel('LO 1 score for Owhie Santillan Lumbang')).toHaveValue('47');
  // Server values: Learning Outputs total and weighted, the Midterm total, the Final attendance category.
  await expect(row).toContainText('93.50');
  await expect(row).toContainText('56.10');
  await expect(row).toContainText('92.46');
  await expect(row).toContainText('10.00');
  expect(previewRequests).toBeGreaterThan(0);
});

// setup: extra routes registered last (they take precedence); wide: 3 students and 6 assessments for the Pin layout.
async function mockMatrixClass(page: import('@playwright/test').Page, scores: Record<string, number>, { setup, wide = false }: { setup?: () => Promise<void>; wide?: boolean } = {}) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/auth/login', route => route.fulfill(json({ type: 'direct_login', access_token: 'mock-faculty-token' })));
  await page.route('**/api/auth/me', route => route.fulfill(json({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' })));
  await page.route('**/api/faculty/classes', route => route.fulfill(json({ status: 'ok', classes: [
    { id: '7', csId: 7, csName: 'CLINIC-4A', courseId: 7, courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', semester: '1ST', schoolYear: '2026-2027', isCurrentSchoolYear: true, status: 'Active' },
  ] })));
  await page.route('**/api/faculty/students', route => route.fulfill(json([
    { id: '24', studentId: '2023-5510', name: 'Owhie Santillan Lumbang', email: 'owhie@bicol-u.edu.ph', yearLevel: 4, status: 'active',
      classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: '24' }],
      enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: '24' }] },
    ...(wide ? [['25', '2023-5511', 'Rosario Maria Cristina Dela Cruz-Villanueva'], ['26', '2023-5512', 'Paolo Reyes']] : []).map(([id, studentId, name]) => (
      { id, studentId, name, email: `${id}@bicol-u.edu.ph`, yearLevel: 4, status: 'active',
        classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: id }],
        enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: id }] }
    )),
  ])));
  await page.route('**/api/faculty/assessments', route => route.fulfill(json((wide ? ['lo-1', 'lo-2', 'lo-3', 'lo-4', 'lo-5', 'lo-6'] : ['lo-1', 'lo-2']).map((id, i) => (
    { id, title: `LO ${i + 1}`, type: 'Quiz', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Midterm', gradingCategoryId: 71, maxScore: 50, status: 'Active', dueDate: '2026-08-20', createdAt: '2026-08-10' }
  )))));
  await page.route('**/api/faculty/scores**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { batches?: Array<{ assessmentId: string; scores: Array<{ score: number | null }> }>; assessmentId: string; scores: Array<{ score: number | null }> };
      const batches = body.batches ?? [body];
      batches.forEach(batch => { if (batch.scores[0].score !== null) scores[batch.assessmentId] = batch.scores[0].score; });
      await route.fulfill(json({ status: 'ok', savedCount: batches.length }));
      return;
    }
    const assessmentId = new URL(route.request().url()).searchParams.get('assessmentId') || '';
    await route.fulfill(json({ status: 'ok', assessmentId, scores: assessmentId in scores
      ? [{ id: `s-${assessmentId}`, studentId: '24', score: scores[assessmentId], remarks: '', submittedAt: '2026-09-15T00:00:00Z' }] : [] }));
  });
  await page.route('**/api/faculty/grading-config?*', route => route.fulfill(json({ status: 'ok', configuration: {
    id: 'cfg-7', course: { id: 7, code: 'CLIN401', name: 'Clinical Dentistry I' }, semester: '1ST', schoolYear: '2026-2027', version: 1,
    schemaMode: 'periods', termRatio: { midterm: 40, final: 60 }, categories: [],
    midtermCategories: [{ id: 71, name: 'Learning Outputs', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' }],
    finalCategories: [],
  } })));
  await page.route('**/api/faculty/grades/compute', route => route.fulfill(json({ status: 'ok', preview: true, results: [] })));
  await setup?.();
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await page.goto('/grades');
  await page.getByRole('button', { name: 'Student Scores Entry' }).click();
}

test('single activity auto-save toggle is remembered across reloads', async ({ page }) => {
  await mockMatrixClass(page, {});
  const toggle = page.getByLabel('Enable Auto-Save');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Student Scores Entry' }).click();
  await expect(page.getByLabel('Enable Auto-Save')).not.toBeChecked();
  await page.getByLabel('Enable Auto-Save').check();
  await page.reload();
  await page.getByRole('button', { name: 'Student Scores Entry' }).click();
  await expect(page.getByLabel('Enable Auto-Save')).toBeChecked();
});

test('matrix keeps an invalid typed cell while other cells refresh from the server', async ({ page }) => {
  test.setTimeout(60000);
  const scores: Record<string, number> = {};
  await mockMatrixClass(page, scores);
  await page.getByRole('button', { name: 'Full Matrix View' }).click();
  const lo1 = page.getByLabel('LO 1 score for Owhie Santillan Lumbang');
  const lo2 = page.getByLabel('LO 2 score for Owhie Santillan Lumbang');
  await lo2.fill('99');
  await expect(lo2).toHaveValue('99');
  // A server score change from the Single Activity View (auto-saved) must reach the grid while LO 2 stays red.
  await page.getByRole('button', { name: 'Single Activity View' }).click();
  const single = page.getByRole('spinbutton').nth(0);
  await single.fill('30');
  // Auto-save fires 10 seconds after typing stops.
  await expect.poll(() => scores['lo-1'], { timeout: 20000 }).toBe(30);
  await page.getByRole('button', { name: 'Full Matrix View' }).click();
  await expect(lo1).toHaveValue('30');
  await expect(lo2).toHaveValue('99');
});

// Two students and a slow scores POST: a score typed while a save is in flight must survive and be sent.
async function mockTwoStudentsSlowSave(page: import('@playwright/test').Page) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const server: Record<string, number> = {};
  const posts: Array<Array<{ assessmentId: string; scores: Array<{ studentId: string; score: number | null }> }>> = [];
  await mockMatrixClass(page, {}, { setup: async () => {
    await page.route('**/api/faculty/students', route => route.fulfill(json([['24', 'Bea', 'Alvarez'], ['25', 'Carlo', 'Bautista']].map(([id, first, last]) => (
      { id, studentId: `2023-55${id}`, name: `${first} ${last}`, email: `${first}@bicol-u.edu.ph`, yearLevel: 4, status: 'active',
        classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: id }],
        enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: id }] }
    )))));
    await page.route('**/api/faculty/scores**', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { batches?: typeof posts[number]; assessmentId: string; scores: Array<{ studentId: string; score: number | null }> };
        const batches = body.batches ?? [body];
        posts.push(batches);
        await new Promise(resolve => setTimeout(resolve, 1500));
        batches.forEach(b => b.scores.forEach(e => { if (e.score !== null) server[`${b.assessmentId}|${e.studentId}`] = e.score; }));
        await route.fulfill(json({ status: 'ok', savedCount: batches.length }));
        return;
      }
      const assessmentId = new URL(route.request().url()).searchParams.get('assessmentId') || '';
      await route.fulfill(json({ status: 'ok', assessmentId, scores: ['24', '25'].filter(id => `${assessmentId}|${id}` in server)
        .map(id => ({ id: `s-${assessmentId}-${id}`, studentId: id, score: server[`${assessmentId}|${id}`], remarks: '', submittedAt: '2026-09-15T00:00:00Z' })) }));
    });
  } });
  return { server, posts };
}

test('single activity keeps and saves a score typed while another save is in flight', async ({ page }) => {
  test.setTimeout(90000);
  const { server, posts } = await mockTwoStudentsSlowSave(page);
  const bea = page.getByRole('spinbutton').nth(0);
  const carlo = page.getByRole('spinbutton').nth(1);
  await bea.fill('30');
  // The 10 second idle wait ends, then the slow save runs.
  await expect(page.getByText('Saving...')).toBeVisible({ timeout: 15000 });
  await carlo.fill('40');
  await expect(page.getByText('Saving...')).toBeVisible();
  // First save finishes: Carlo's 40 stays and the sheet is not reported as saved.
  await expect.poll(() => posts.length).toBe(1);
  await expect.poll(() => server['lo-1|24']).toBe(30);
  await expect(carlo).toHaveValue('40');
  await expect(page.getByText('All changes saved')).toHaveCount(0);
  await expect(page.getByText('Scores Saved Successfully!')).toHaveCount(0);
  await expect.poll(() => server['lo-1|25'], { timeout: 20000 }).toBe(40);
  await expect(carlo).toHaveValue('40');
  await expect(bea).toHaveValue('30');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(posts.flat().some(b => b.scores.some(e => e.studentId === '25' && e.score === 40))).toBe(true);
});

test('matrix keeps and saves a cell typed while another save is in flight', async ({ page }) => {
  test.setTimeout(90000);
  const { server, posts } = await mockTwoStudentsSlowSave(page);
  await page.getByRole('button', { name: 'Full Matrix View' }).click();
  const bea = page.getByLabel('LO 1 score for Bea Alvarez');
  const carlo = page.getByLabel('LO 1 score for Carlo Bautista');
  await bea.fill('30');
  await expect(page.getByText('Saving...')).toBeVisible({ timeout: 15000 });
  await carlo.fill('40');
  await expect.poll(() => server['lo-1|24']).toBe(30);
  await expect(carlo).toHaveValue('40');
  await expect(page.getByText('All changes saved')).toHaveCount(0);
  await expect.poll(() => server['lo-1|25'], { timeout: 20000 }).toBe(40);
  await expect(carlo).toHaveValue('40');
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(posts.flat().some(b => b.scores.some(e => e.studentId === '25' && e.score === 40))).toBe(true);
});

// The gate's Vite server runs without Tailwind, so this checks the Pin state and pinning classes;
// the pinned layout itself was verified on screenshots at 412/768 and desktop (1280+) stays unchanged.
test('Pin switches which student columns are pinned below xl and is hidden on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await mockMatrixClass(page, {}, { wide: true });
  await page.getByRole('button', { name: 'Full Matrix View' }).click();
  const pin = page.getByRole('group', { name: 'Pin student columns' });
  await expect(pin).toBeVisible();
  await expect(pin.locator('..')).toHaveClass(/(^|\s)xl:hidden(\s|$)/);
  const nameOnly = pin.getByRole('button', { name: 'Full Name', exact: true });
  const both = pin.getByRole('button', { name: 'ID Number + Full Name' });
  await expect(nameOnly).toHaveAttribute('aria-pressed', 'true');
  await expect(both).toHaveAttribute('aria-pressed', 'false');
  const box = page.locator('div.overflow-x-auto.overflow-y-auto');
  const idCell = box.getByRole('cell', { name: '2023-5510', exact: true });
  const nameCell = box.getByRole('cell', { name: 'Owhie Santillan Lumbang', exact: true });
  const sticky = /(^|\s)max-xl:sticky(\s|$)/;
  await expect(nameCell).toHaveClass(sticky);
  await expect(nameCell).toHaveClass(/max-xl:left-0/);
  await expect(idCell).not.toHaveClass(sticky);
  await both.click();
  await expect(both).toHaveAttribute('aria-pressed', 'true');
  await expect(nameOnly).toHaveAttribute('aria-pressed', 'false');
  await expect(idCell).toHaveClass(sticky);
  await expect(idCell).toHaveClass(/max-xl:left-0/);
  await expect(nameCell).toHaveClass(/max-xl:left-\[104px\]/);
  // Both columns keep their own cells: ID Number and Full Name are never merged.
  await expect(idCell).toHaveText('2023-5510');
  await expect(nameCell).toHaveText('Owhie Santillan Lumbang');
});
