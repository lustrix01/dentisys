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
