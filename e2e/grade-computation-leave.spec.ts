import { test, expect } from './fixtures';

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function openGradesWithTwoClasses(
  page: import('@playwright/test').Page,
  class2: {
    courseStructure: 'lecture' | 'lecture_laboratory';
    componentMode: 'combined' | 'lecture_laboratory' | 'lecture';
    termRatio?: { midterm: number; final: number };
    midtermCategories: Array<Record<string, unknown>>;
    finalCategories: Array<Record<string, unknown>>;
  },
  path = '/grades',
) {
  await page.route('**/api/auth/login', route =>
    route.fulfill(json({ type: 'direct_login', access_token: 'mock-faculty-token' })),
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill(json({ id: 200, login_email: 'faculty@bicol-u.edu.ph', display_name: 'Prof. Jane Doe', role: 'faculty' })),
  );
  await page.route('**/api/faculty/classes', route =>
    route.fulfill(
      json({
        status: 'ok',
        currentSchoolYear: '2026-2027',
        classes: [
          {
            id: '7',
            csId: 7,
            csName: 'CLINIC-4A',
            courseId: 101,
            courseCode: 'CLIN401',
            courseName: 'Clinical Dentistry I',
            semester: '1ST',
            schoolYear: '2026-2027',
            isCurrentSchoolYear: true,
            status: 'Active',
          },
          {
            id: '8',
            csId: 8,
            csName: 'DENT-2A',
            courseId: 102,
            courseCode: 'DENT201',
            courseName: 'Oral Anatomy',
            semester: '1ST',
            schoolYear: '2026-2027',
            isCurrentSchoolYear: true,
            status: 'Active',
          },
        ],
      }),
    ),
  );
  await page.route('**/api/faculty/students', route =>
    route.fulfill(
      json([
        {
          id: '24',
          studentId: '2023-5510',
          name: 'Owhie Santillan Lumbang',
          email: 'owhie@bicol-u.edu.ph',
          yearLevel: 4,
          status: 'active',
          classSections: [
            { classId: '7', className: 'CLINIC-4A', enrollmentId: '24' },
            { classId: '8', className: 'DENT-2A', enrollmentId: '25' },
          ],
          enrolledSubjects: [
            { code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: '24' },
            { code: 'DENT201', name: 'Oral Anatomy', units: 3, isClinical: false, components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '8', enrollmentId: '25' },
          ],
        },
      ]),
    ),
  );
  await page.route('**/api/faculty/assessments', route =>
    route.fulfill(
      json([
        { id: 'ass-1', title: 'Midterm Exam', type: 'Term Exam', subjectCode: 'CLIN401', classId: '7', gradingPeriod: 'Midterm', gradingCategoryId: 71, maxScore: 100, status: 'Active', dueDate: '2026-09-15', createdAt: '2026-08-10' },
        { id: 'ass-2', title: 'Quiz 1', type: 'Quiz', subjectCode: 'DENT201', classId: '8', gradingPeriod: 'Midterm', gradingCategoryId: 81, maxScore: 50, status: 'Active', dueDate: '2026-09-15', createdAt: '2026-08-10' },
      ]),
    ),
  );
  await page.route('**/api/faculty/scores**', route => {
    const assessmentId = new URL(route.request().url()).searchParams.get('assessmentId');
    const class1Score = { id: 's-1', assessmentId: 'ass-1', studentId: '24', score: 85, remarks: '', submittedAt: '2026-09-15T00:00:00Z' };
    if (!assessmentId) {
      return route.fulfill(json({ status: 'ok', scores: [class1Score] }));
    }
    return route.fulfill(json({ status: 'ok', assessmentId, scores: assessmentId === 'ass-1' ? [class1Score] : [] }));
  });
  await page.route('**/api/faculty/grading-config?*', route => {
    const courseId = new URL(route.request().url()).searchParams.get('courseId');
    if (courseId === '102') {
      return route.fulfill(
        json({
          status: 'ok',
          courseStructure: class2.courseStructure,
          courseUnits: class2.courseStructure === 'lecture' ? { lecture: 3, laboratory: 0 } : { lecture: 2, laboratory: 1 },
          configuration: {
            id: 'cfg-8',
            course: { id: 102, code: 'DENT201', name: 'Oral Anatomy' },
            semester: '1ST',
            schoolYear: '2026-2027',
            version: 1,
            schemaMode: 'periods',
            componentMode: class2.componentMode,
            ...(class2.componentMode === 'lecture_laboratory' ? { componentWeights: { lecture: 60, laboratory: 40 } } : {}),
            termRatio: class2.termRatio ?? { midterm: 40, final: 60 },
            categories: [],
            midtermCategories: class2.midtermCategories,
            finalCategories: class2.finalCategories,
          },
        }),
      );
    }
    return route.fulfill(
      json({
        status: 'ok',
        courseStructure: 'lecture_laboratory',
        courseUnits: { lecture: 2, laboratory: 1 },
        configuration: {
          id: 'cfg-7',
          course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
          semester: '1ST',
          schoolYear: '2026-2027',
          version: 1,
          schemaMode: 'periods',
          componentMode: 'lecture_laboratory',
          componentWeights: { lecture: 60, laboratory: 40 },
          termRatio: { midterm: 50, final: 50 },
          categories: [],
          midtermCategories: [
            { id: 71, name: 'Term Exam', weight: '60', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture' },
            { id: 72, name: 'Quiz', weight: '40', sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture' },
            { id: 73, name: 'Lab Work', weight: '100', sortOrder: 3, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Laboratory' },
          ],
          finalCategories: [
            { id: 74, name: 'Term Exam', weight: '60', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture' },
            { id: 75, name: 'Quiz', weight: '40', sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture' },
            { id: 76, name: 'Lab Work', weight: '100', sortOrder: 3, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Laboratory' },
          ],
        },
      }),
    );
  });
  await page.route('**/api/faculty/grades/compute', route => route.fulfill(json({ status: 'ok', preview: true, results: [] })));
  await page.route('**/api/faculty/dashboard-kpis**', route => route.fulfill(json({ status: 'ok' })));
  await page.route('**/api/notifications**', route => route.fulfill(json({ status: 'ok', notifications: [], unread_count: 0 })));

  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  if (path === '/grades') {
    await page.locator('aside a[href="/grades"]').first().click();
    await expect(page).toHaveURL('/grades');
  } else {
    await page.goto(path);
  }
}

const combinedToLectureClass2 = {
  courseStructure: 'lecture' as const,
  componentMode: 'combined' as const,
  termRatio: { midterm: 40, final: 60 },
  midtermCategories: [
    { id: 81, name: 'Quiz', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' },
  ],
  finalCategories: [
    { id: 82, name: 'Quiz', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' },
  ],
};

test('after switching class with no edits, clicking a sidebar link leaves /grades with no confirmation dialog', async ({ page }) => {
  await openGradesWithTwoClasses(page, combinedToLectureClass2);
  const picker = page.getByRole('main').getByLabel(/^Class:/);
  await expect(picker).toHaveValue('7');

  const configLoaded = page.waitForResponse(
    resp => resp.url().includes('/api/faculty/grading-config') && resp.url().includes('courseId=102') && resp.status() === 200,
  );
  await picker.selectOption('8');
  await configLoaded;
  await expect(picker).toHaveValue('8');
  await expect(page.getByRole('status').filter({ hasText: 'Set up this class' })).toBeVisible();

  await page.locator('aside a[href="/"]').first().click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toHaveCount(0);
});

test('after switching class with no edits, beforeunload does not prompt when closing the page', async ({ page }) => {
  await openGradesWithTwoClasses(page, {
    courseStructure: 'lecture',
    componentMode: 'lecture_laboratory',
    termRatio: { midterm: 50, final: 50 },
    midtermCategories: [
      { id: 81, name: 'Quiz', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Lecture' },
      { id: 82, name: 'Lab', weight: '100', sortOrder: 2, gradingPeriod: 'Midterm', sourceKind: 'assessment', component: 'Laboratory' },
    ],
    finalCategories: [
      { id: 83, name: 'Quiz', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Lecture' },
      { id: 84, name: 'Lab', weight: '100', sortOrder: 2, gradingPeriod: 'Final', sourceKind: 'assessment', component: 'Laboratory' },
    ],
  });
  const picker = page.getByRole('main').getByLabel(/^Class:/);
  await expect(picker).toHaveValue('7');

  const configLoaded = page.waitForResponse(
    resp => resp.url().includes('/api/faculty/grading-config') && resp.url().includes('courseId=102') && resp.status() === 200,
  );
  await picker.selectOption('8');
  await configLoaded;
  await expect(picker).toHaveValue('8');
  await expect(page.getByRole('status').filter({ hasText: 'Set up this class' })).toBeVisible();

  const dialogs: string[] = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.type());
    await dialog.accept().catch(() => {});
  });

  const closed = page.waitForEvent('close');
  await page.close({ runBeforeUnload: true });
  await closed;
  expect(dialogs).toEqual([]);
});

test('with an unsaved grade-weight edit, clicking a sidebar link asks to discard and Cancel stays on /grades', async ({ page }) => {
  await openGradesWithTwoClasses(page, combinedToLectureClass2, '/grades?tab=components');
  const picker = page.getByRole('main').getByLabel(/^Class:/);
  await expect(picker).toHaveValue('7');

  const weightInput = page.locator('input[placeholder="0"]').first();
  await expect(weightInput).toHaveValue('60');
  await weightInput.fill('55');

  await page.locator('aside a[href="/"]').first().click();
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/grades/);
});
