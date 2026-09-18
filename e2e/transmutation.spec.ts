import { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function login(page: Page, role: 'admin' | 'faculty') {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ type: 'direct_login', access_token: `mock-${role}-token` }),
    });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: role === 'admin' ? 100 : 200,
        login_email: `${role}@bicol-u.edu.ph`,
        display_name: role === 'admin' ? 'Dr. Dean Admin' : 'Prof. Jane Doe',
        role,
      }),
    });
  });
  await page.goto('/login');
  await page.fill('input[type="email"]', `${role}@bicol-u.edu.ph`);
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

test.describe('Assessment transmutation UI coverage', () => {
  test('faculty saves raw assessment scores without showing false success on API error', async ({ page }) => {
    let postedScorePayload: Record<string, any> | null = null;
    let computeRequestCount = 0;
    let failScoreSave = false;
    const persistedScores: Record<string, Array<{ id: string; studentId: string; score: number; remarks: string; submittedAt: string }>> = {
      'assessment-1': [],
    };
    const scoreGetAssessmentIds: string[] = [];

    await page.route('**/api/faculty/settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', settings: { theme: 'light', transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } } }),
      });
    });
    await page.route('**/api/faculty/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', classes: [{ id: '7', csId: 7, csName: 'CLINIC-4A', courseCode: 'CLIN401', status: 'Active' }] }),
      });
    });
    await page.route('**/api/faculty/students', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '24', studentId: 'STU-24', name: 'Bea Alonzo', email: 'bea@example.test', yearLevel: 4,
            status: 'active', faceEnrolled: false, consentStatus: 'pending', classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: '24' }],
            enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true,
              components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: '24' }],
          },
          {
            id: '25', studentId: 'STU-25', name: 'Carlo Reyes', email: 'carlo@example.test', yearLevel: 4,
            status: 'active', faceEnrolled: false, consentStatus: 'pending', classSections: [{ classId: '7', className: 'CLINIC-4A', enrollmentId: '25' }],
            enrolledSubjects: [{ code: 'CLIN401', name: 'Clinical Dentistry I', units: 3, isClinical: true,
              components: { quizzes: 0, exams: 0, practicum: 0, attendance: 0 }, grade: 0, hasRemedial: false, classId: '7', enrollmentId: '25' }],
          },
        ]),
      });
    });
    await page.route('**/api/faculty/attendance', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [] }) });
    });
    await page.route('**/api/faculty/assessments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'assessment-1', title: 'Raw score save regression', type: 'Quiz', subjectCode: 'CLIN401', classId: '7',
            gradingPeriod: 'Midterm', maxScore: 50, dueDate: '2026-09-19', status: 'Active', transmutationEnabled: true,
            transmutationMinimumPercentage: 50, transmutationMaximumPercentage: 100,
            attendanceSessionDate: '2026-09-18', attendanceSessionCode: 'REG-1', createdAt: '2026-09-18',
          },
          {
            id: 'assessment-2', title: 'Score GET isolation regression', type: 'Quiz', subjectCode: 'CLIN401', classId: '7',
            gradingPeriod: 'Midterm', maxScore: 50, dueDate: '2026-09-20', status: 'Active', transmutationEnabled: true,
            transmutationMinimumPercentage: 50, transmutationMaximumPercentage: 100,
            attendanceSessionDate: '2026-09-18', attendanceSessionCode: 'REG-1', createdAt: '2026-09-18',
          },
        ]),
      });
    });
    await page.route('**/api/faculty/scores**', async (route) => {
      if (route.request().method() !== 'POST') {
        const assessmentId = new URL(route.request().url()).searchParams.get('assessmentId') || '';
        scoreGetAssessmentIds.push(assessmentId);
        if (assessmentId === 'assessment-2') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'error', message: 'Score GET unavailable for this assessment.' }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', assessmentId, scores: persistedScores[assessmentId] || [] }),
        });
        return;
      }
      const payload = route.request().postDataJSON() as { assessmentId: string; scores: Array<{ studentId: string; score: number; remarks?: string }> };
      postedScorePayload = payload;
      if (failScoreSave) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', message: 'A server error occurred. Please try again later.' }),
        });
        return;
      }
      persistedScores[payload.assessmentId] = payload.scores.map(score => ({
        id: `score-${score.studentId}`,
        studentId: score.studentId,
        score: score.score,
        remarks: score.remarks || '',
        submittedAt: '2026-09-19T08:00:00Z',
      }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', savedCount: 1 }) });
    });
    await page.route('**/api/faculty/grades/compute', async (route) => {
      computeRequestCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', results: [{ status: 'computed' }] }) });
    });

    await login(page, 'faculty');
    await page.getByRole('link', { name: 'Grade Computation' }).click();
    await expect(page.getByRole('heading', { name: 'Bea Alonzo' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Enable Auto-Save on score input blur').uncheck();
    const scoreInput = page.getByRole('spinbutton').nth(0);
    await scoreInput.fill('25');
    await page.getByRole('button', { name: 'Save Scores Sheet' }).click();
    await expect.poll(() => postedScorePayload).not.toBeNull();
    await expect.poll(() => computeRequestCount).toBe(1);
    expect(persistedScores['assessment-1']).toEqual([{
      id: 'score-24',
      studentId: '24',
      score: 25,
      remarks: '',
      submittedAt: '2026-09-19T08:00:00Z',
    }]);
    expect(postedScorePayload).toEqual({
      assessmentId: 'assessment-1',
      scores: [{ studentId: '24', score: 25, remarks: '' }],
    });
    await expect(scoreInput).toHaveValue('25');

    await page.reload();
    await login(page, 'faculty');
    await page.getByRole('link', { name: 'Grade Computation' }).click();
    await expect(page).toHaveURL('/grades');
    await expect(page.getByRole('heading', { name: 'Bea Alonzo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Carlo Reyes' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const reloadedScoreInput = page.getByRole('spinbutton').nth(0);
    const ungradedStudentScoreInput = page.getByRole('spinbutton').nth(1);
    await expect(reloadedScoreInput).toHaveValue('25');
    await expect(ungradedStudentScoreInput).toHaveValue('');
    expect(scoreGetAssessmentIds).toContain('assessment-1');
    expect(scoreGetAssessmentIds).toContain('assessment-2');

    failScoreSave = true;
    await page.getByLabel('Enable Auto-Save on score input blur').uncheck();
    await reloadedScoreInput.fill('30');
    await page.getByRole('button', { name: 'Save Scores Sheet' }).click();
    await expect(page.getByText('A server error occurred. Please try again later.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scores Saved Successfully!' })).toHaveCount(0);
    await expect(reloadedScoreInput).toHaveValue('30');
    expect(computeRequestCount).toBe(1);
  });

  test('admin renders and saves transmutation defaults from API values', async ({ page }) => {
    await login(page, 'admin');

    let postedSettings: Record<string, any> | null = null;
    await page.route('**/api/admin/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            settings: {
              theme: 'light',
              retentionThreshold: 2.5,
              weights: { quizzes: 20, exams: 30, practicum: 40, attendance: 10 },
              transmutationDefaults: { minimumPercentage: 42, maximumPercentage: 88 },
            },
          }),
        });
        return;
      }
      postedSettings = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', message: 'Saved' }) });
    });

    await page.click('a[href="/admin/settings"]');
    await expect(page).toHaveURL('/admin/settings');
    const minimum = page.locator('label').filter({ hasText: 'Minimum percentage' }).locator('input');
    const maximum = page.locator('label').filter({ hasText: 'Maximum percentage' }).locator('input');
    await expect(minimum).toHaveValue('42');
    await expect(maximum).toHaveValue('88');
    await minimum.fill('45');
    await maximum.fill('95');
    await page.getByRole('button', { name: /Save system settings/i }).click();
    await expect.poll(() => postedSettings).not.toBeNull();
    expect(postedSettings?.transmutationDefaults).toEqual({ minimumPercentage: 45, maximumPercentage: 95 });
  });

  test('faculty assessment modal uses defaults and rejects missing deterministic linkage', async ({ page }) => {
    await login(page, 'faculty');

    let postedAssessment: Record<string, any> | null = null;
    let persistedAssessments: Record<string, any>[] = [];
    await page.route('**/api/faculty/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok', settings: { theme: 'light', transmutationDefaults: { minimumPercentage: 42, maximumPercentage: 88 } } }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });
    await page.route('**/api/faculty/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          classes: [
            { id: '7', csId: 7, csName: 'CLINIC-4A', courseCode: 'CLIN401', status: 'Active' },
            { id: '8', csId: 8, csName: 'CLINIC-4B', courseCode: 'CLIN402', status: 'Active' },
          ],
        }),
      });
    });
    await page.route('**/api/faculty/students', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/faculty/attendance', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', records: [] }) });
    });
    await page.route('**/api/faculty/assessments', async (route) => {
      if (route.request().method() === 'POST') {
        const [assessment] = route.request().postDataJSON() as Record<string, any>[];
        postedAssessment = assessment;
        const id = 'ui-assessment-7';
        persistedAssessments = [{
          ...assessment,
          id,
          classId: '7',
          subjectCode: 'CLIN401',
          createdAt: '2026-09-18',
        }];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'ok',
            message: 'Assessment persisted successfully.',
            assessments: [{ id, classId: '7', title: assessment.title }],
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(persistedAssessments) });
    });

    await page.click('a[href="/grades"]');
    await expect(page).toHaveURL('/grades');
    await page.getByRole('button', { name: 'Assessments Manager' }).click();
    await expect(page.locator('select').nth(1)).toHaveValue('7');
    await page.getByRole('button', { name: 'Add Assessment' }).click();
    await page.getByPlaceholder('e.g. Molar Crown Prep quiz').fill('Disabled assessment survives refresh');
    const targetClasses = await page.locator('select').nth(2).evaluate(select =>
      Array.from((select as HTMLSelectElement).options).map(option => ({ value: option.value, label: option.textContent?.trim() })),
    );
    expect(targetClasses).toEqual([{ value: '7', label: 'CLINIC-4A' }]);
    const toggle = page.getByRole('checkbox', { name: /Enable attendance-linked transmutation/i });
    await expect(toggle).toBeVisible();
    await toggle.check();
    await expect(page.locator('label').filter({ hasText: 'Minimum percentage' }).locator('input')).toHaveValue('42');
    await expect(page.locator('label').filter({ hasText: 'Maximum percentage' }).locator('input')).toHaveValue('88');
    await expect(page.getByLabel('Attendance session date')).toBeVisible();
    await expect(page.getByLabel('Attendance session code')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Assessment' }).click();
    await expect(page.getByRole('heading', { name: 'Create New Assessment activity' })).toBeVisible();
    expect(postedAssessment).toBeNull();

    await toggle.uncheck();
    await page.getByRole('button', { name: 'Confirm Assessment' }).click();
    await expect(page.getByText('Assessment persisted successfully.')).toBeVisible();
    await expect.poll(() => postedAssessment).not.toBeNull();
    expect(postedAssessment).toMatchObject({
      title: 'Disabled assessment survives refresh',
      classId: '7',
      transmutationEnabled: false,
      attendanceSessionDate: null,
      attendanceSessionCode: null,
    });
    await expect(page.getByRole('row').filter({ hasText: 'Disabled assessment survives refresh' })).toBeVisible();

    await page.reload();
    await login(page, 'faculty');
    await page.getByRole('link', { name: 'Grade Computation' }).click();
    await page.getByRole('button', { name: 'Assessments Manager' }).click();
    await expect(page.locator('select').nth(1)).toHaveValue('7');
    const persistedRow = page.getByRole('row').filter({ hasText: 'Disabled assessment survives refresh' });
    await expect(persistedRow).toBeVisible();
    await persistedRow.getByRole('button', { name: 'Edit' }).click();
    const assessmentForm = page.locator('form').last();
    await expect(page.getByRole('heading', { name: 'Edit Assessment Spec' })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Molar Crown Prep quiz')).toHaveValue('Disabled assessment survives refresh');
    await expect(assessmentForm.locator('input[type="number"]').first()).toHaveValue('50');
    await expect(assessmentForm.locator('input[type="date"]')).toHaveValue(String(postedAssessment?.dueDate));
    await expect(assessmentForm.locator('select').nth(1)).toHaveValue('Quiz');
    await expect(assessmentForm.locator('select').nth(2)).toHaveValue('Midterm');
    await expect(assessmentForm.getByRole('checkbox', { name: /Enable attendance-linked transmutation/i })).not.toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Student Scores Entry' }).click();
    await expect(page.locator('select').last().locator('option[value="ui-assessment-7"]')).toHaveText(/Disabled assessment survives refresh/);

    await page.locator('select').first().selectOption('CLIN402');
    await expect(page.locator('select').nth(1)).toHaveValue('8');
    await page.getByRole('button', { name: 'Assessments Manager' }).click();
    await page.getByRole('button', { name: 'Add Assessment' }).click();
    const classEightTargets = await page.locator('select').nth(2).evaluate(select =>
      Array.from((select as HTMLSelectElement).options).map(option => ({ value: option.value, label: option.textContent?.trim() })),
    );
    expect(classEightTargets).toEqual([{ value: '8', label: 'CLINIC-4B' }]);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
