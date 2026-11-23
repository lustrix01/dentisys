import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function signInFaculty(page: Page) {
  await page.route('**/api/auth/login', route =>
    route.fulfill(json({ type: 'direct_login', access_token: 'mock-faculty-token' })),
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill(
      json({
        id: 200,
        user_id: 200,
        login_email: 'faculty@bicol-u.edu.ph',
        display_name: 'Prof. Jane Doe',
        role: 'faculty',
        session_uuid: 'faculty-release-gates',
        authentication_source: 'password',
      }),
    ),
  );
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill('faculty@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/');
}

async function signInStudent(page: Page) {
  await page.route('**/api/runtime-config', route =>
    route.fulfill(
      json({
        status: 'ok',
        environment: 'test',
        allowed_email_domains: ['bicol-u.edu.ph'],
        providers: {
          identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
          email: { active: 'mailpit' },
          biometrics: { active: 'disabled' },
          location: { active: 'disabled' },
        },
        features: { student_auth_enabled: true, browser_attendance_prototype: false },
      }),
    ),
  );
  await page.route('**/api/auth/login', route =>
    route.fulfill(json({ type: 'direct_login', access_token: 'mock-student-token' })),
  );
  await page.route('**/api/auth/me', route =>
    route.fulfill(
      json({
        id: 301,
        user_id: 301,
        login_email: 'student@bicol-u.edu.ph',
        display_name: 'Juan Dela Cruz',
        role: 'student',
        session_uuid: 'student-release-gates',
        authentication_source: 'password',
        student: { student_id: 301, student_number: '2024-0011', status: 'active' },
      }),
    ),
  );
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill('student@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/student/dashboard');
}

const baseClass41 = {
  id: '41',
  csId: 41,
  csName: 'A',
  block: 'A',
  courseId: 101,
  courseCode: 'CLIN401',
  courseName: 'Clinical Dentistry I',
  courseTitle: 'Clinical Dentistry I',
  schoolYear: '2026-2027',
  semester: '1st Semester',
  status: 'Active',
  isArchived: false,
  isHistorical: false,
  isCurrentSchoolYear: true,
  gradesSubmitted: false,
  gradeDeadlineStatus: 'not_submitted',
  gradeChangeStatus: null,
  midtermPublished: false,
  midtermPublishedAt: null,
  midtermAdvisoryDirty: false,
  midtermAtRiskCount: 1,
};

const periodConfig = {
  id: 'cfg-41',
  course: { id: 101, code: 'CLIN401', name: 'Clinical Dentistry I' },
  semester: '1st Semester',
  schoolYear: '2026-2027',
  version: 1,
  schemaMode: 'periods',
  termRatio: { midterm: 40, final: 60 },
  midtermCategories: [{ id: 11, name: 'Quizzes', weight: '100', sortOrder: 1, gradingPeriod: 'Midterm', sourceKind: 'assessment' }],
  finalCategories: [{ id: 12, name: 'Exams', weight: '100', sortOrder: 1, gradingPeriod: 'Final', sourceKind: 'assessment' }],
};

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
}

test.describe('Grade release gates (Backlog 12.12 + 12.13)', () => {
  test('Grade Computation Midterm lifecycle: unpublished, publish modal, clean published, dirty update modal, unpublish, and no overflow on Desktop/iPhone', async ({ page }) => {
    let phase: 'unpublished' | 'published_clean' | 'published_dirty' = 'unpublished';
    const publishCalls: unknown[] = [];
    const unpublishCalls: unknown[] = [];

    const submissionPayload = () => {
      if (phase === 'unpublished') {
        return {
          status: 'not_submitted',
          deadlineStatus: 'not_submitted',
          deadline: null,
          submittedAt: null,
          graceUntil: null,
          missing: [],
          batch: null,
          retentionImpact: [],
          midterm: {
            eligible: true,
            schemaMode: 'periods',
            published: false,
            publishedAt: null,
            dirty: false,
            readyCount: 4,
            atRisk: [{ enrollmentId: 1042, name: 'Dela Cruz, Juan', studentNumber: '2024-0011', grade: 2.6, percentage: 83 }],
            missing: [{ name: 'Santos, Maria', studentNumber: '2024-0012', missingCount: 1 }],
            diff: { added: [], removed: [] },
          },
        };
      }
      if (phase === 'published_clean') {
        return {
          status: 'not_submitted',
          deadlineStatus: 'not_submitted',
          deadline: null,
          submittedAt: null,
          graceUntil: null,
          missing: [],
          batch: null,
          retentionImpact: [],
          midterm: {
            eligible: true,
            schemaMode: 'periods',
            published: true,
            publishedAt: '2026-10-15T14:20:00+08:00',
            dirty: false,
            readyCount: 4,
            atRisk: [{ enrollmentId: 1042, name: 'Dela Cruz, Juan', studentNumber: '2024-0011', grade: 2.6, percentage: 83 }],
            missing: [],
            diff: { added: [], removed: [] },
          },
        };
      }
      return {
        status: 'not_submitted',
        deadlineStatus: 'not_submitted',
        deadline: null,
        submittedAt: null,
        graceUntil: null,
        missing: [],
        batch: null,
        retentionImpact: [],
        midterm: {
          eligible: true,
          schemaMode: 'periods',
          published: true,
          publishedAt: '2026-10-15T14:20:00+08:00',
          dirty: true,
          readyCount: 5,
          atRisk: [{ enrollmentId: 1043, name: 'Reyes, Ana', studentNumber: '2024-0013', grade: 2.8, percentage: 79 }],
          missing: [{ name: 'Santos, Maria', studentNumber: '2024-0012', missingCount: 1 }],
          diff: {
            added: [{ enrollmentId: 1043, name: 'Reyes, Ana', studentNumber: '2024-0013', grade: 2.8 }],
            removed: [{ enrollmentId: 1042, name: 'Dela Cruz, Juan', studentNumber: '2024-0011', grade: 2.2 }],
          },
        },
      };
    };

    await page.route('**/api/faculty/classes', route =>
      route.fulfill(
        json({
          status: 'ok',
          currentSchoolYear: '2026-2027',
          classes: [
            {
              ...baseClass41,
              midtermPublished: phase !== 'unpublished',
              midtermPublishedAt: phase === 'unpublished' ? null : '2026-10-15T14:20:00+08:00',
              midtermAdvisoryDirty: phase === 'published_dirty',
            },
          ],
        }),
      ),
    );
    await page.route('**/api/faculty/grading-config**', route => route.fulfill(json({ status: 'ok', configuration: periodConfig })));
    await page.route('**/api/faculty/classes/grade-submission**', route => route.fulfill(json(submissionPayload())));
    await page.route('**/api/faculty/classes/midterm-advisory/publish', route => {
      publishCalls.push(route.request().postDataJSON());
      phase = 'published_clean';
      return route.fulfill(json(submissionPayload()));
    });
    await page.route('**/api/faculty/classes/midterm-advisory/unpublish', route => {
      unpublishCalls.push(route.request().postDataJSON());
      phase = 'unpublished';
      return route.fulfill(json(submissionPayload()));
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await signInFaculty(page);
    await page.goto('/grades');

    // Class-picker bar holds the Midterm advisory menu next to Submit grades; no separate Midterm bar (Owner 2026-11-23).
    const classSelect = page.getByLabel(/Class: course code, section, and course title/);
    const pickerCard = classSelect.locator('xpath=ancestor::div[contains(@class,"rounded-2xl") or contains(@class,"rounded-xl")][2]');
    await expect(pickerCard.getByRole('button', { name: 'Submit grades' })).toBeVisible();
    const advisoryTrigger = pickerCard.getByRole('button', { name: /^Midterm advisory/ });
    await expect(advisoryTrigger).toBeVisible();
    await expect(page.locator('.no-print[role="status"]').filter({ hasText: /Midterm/ })).toHaveCount(0);
    const openAdvisory = async () => { await advisoryTrigger.click(); return page.getByRole('menu'); };

    // 1. Not published: amber count on the trigger, status line in the menu, Publish modal
    await expect(advisoryTrigger.getByLabel('1 At-Risk, not published')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 393, height: 852 });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    let menu = await openAdvisory();
    await expect(menu).toContainText('Not published · 1 At‑Risk ready');
    await expect(menu.getByRole('menuitem', { name: /Update advisory|Unpublish/ })).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'Publish Midterm advisory' }).click();
    const publishDialog = page.getByRole('dialog');
    await expect(publishDialog.getByRole('heading', { name: 'Publish Midterm Advisory' })).toBeVisible();
    await expect(publishDialog).toContainText('At-Risk students (1):');
    await expect(publishDialog).toContainText('Dela Cruz, Juan (2024-0011) — 2.6');
    await expect(publishDialog).toContainText('1 student has missing Midterm scores:');
    await expect(publishDialog).toContainText('Santos, Maria (2024-0012) — 1 missing');

    await publishDialog.getByRole('button', { name: 'Publish Midterm advisory' }).click();
    await expect.poll(() => publishCalls.length).toBe(1);
    expect(publishCalls[0]).toEqual({ csId: 41 });

    // 2. Clean published: status says published; Update advisory is disabled with its reason
    menu = await openAdvisory();
    await expect(menu).toContainText('1 At‑Risk');
    await expect(menu).toContainText('Published');
    await expect(menu.getByRole('menuitem', { name: /Update advisory/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(menu).toContainText('No Midterm changes since published');
    await expect(menu.getByRole('menuitem', { name: 'Unpublish' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoHorizontalOverflow(page);

    // 3. Dirty state -> amber dot + status line with the diff, Update advisory modal showing added & cleared
    phase = 'published_dirty';
    await page.reload();
    await expect(advisoryTrigger.getByLabel('Scores changed since published')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 393, height: 852 });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    menu = await openAdvisory();
    await expect(menu).toContainText('Scores changed since published (+1 At‑Risk, 1 cleared)');
    await menu.getByRole('menuitem', { name: 'Update advisory' }).click();
    const updateDialog = page.getByRole('dialog');
    await expect(updateDialog.getByRole('heading', { name: 'Update Midterm Advisory' })).toBeVisible();
    await expect(updateDialog).toContainText('Newly added to At Risk (1):');
    await expect(updateDialog).toContainText('Reyes, Ana (2024-0013) — 2.8');
    await expect(updateDialog).toContainText('Cleared from At Risk (1):');
    await expect(updateDialog).toContainText('Dela Cruz, Juan (2024-0011) — 2.2');
    await updateDialog.getByRole('button', { name: 'Update advisory' }).click();
    await expect.poll(() => publishCalls.length).toBe(2);

    // 4. Unpublish flow
    menu = await openAdvisory();
    await menu.getByRole('menuitem', { name: 'Unpublish' }).click();
    const unpublishDialog = page.getByRole('dialog');
    await expect(unpublishDialog.getByRole('heading', { name: 'Unpublish Midterm Advisory' })).toBeVisible();
    await unpublishDialog.getByRole('button', { name: 'Unpublish' }).click();
    await expect.poll(() => unpublishCalls.length).toBe(1);
    expect(unpublishCalls[0]).toEqual({ csId: 41 });
    await expect(advisoryTrigger.getByLabel('1 At-Risk, not published')).toBeVisible();
  });

  test('Submit grades confirmation modal displays both missing scores and retentionImpact students', async ({ page }) => {
    let submitted = false;
    const submitCalls: unknown[] = [];

    await page.route('**/api/faculty/classes', route =>
      route.fulfill(
        json({
          status: 'ok',
          currentSchoolYear: '2026-2027',
          classes: [{ ...baseClass41, gradesSubmitted: submitted, gradeDeadlineStatus: submitted ? 'submitted' : 'not_submitted' }],
        }),
      ),
    );
    await page.route('**/api/faculty/grading-config**', route => route.fulfill(json({ status: 'ok', configuration: periodConfig })));
    await page.route('**/api/faculty/classes/grade-submission**', route => {
      if (route.request().method() === 'POST') {
        submitCalls.push(route.request().postDataJSON());
        submitted = true;
        return route.fulfill(
          json({
            status: 'submitted',
            deadlineStatus: 'submitted',
            deadline: null,
            submittedAt: '2026-12-01T09:00:00+08:00',
            graceUntil: '2099-12-02T09:00:00+08:00',
            missing: [],
            batch: null,
            retentionImpact: [],
          }),
        );
      }
      return route.fulfill(
        json({
          status: submitted ? 'submitted' : 'not_submitted',
          deadlineStatus: submitted ? 'submitted' : 'not_submitted',
          deadline: null,
          submittedAt: submitted ? '2026-12-01T09:00:00+08:00' : null,
          graceUntil: submitted ? '2099-12-02T09:00:00+08:00' : null,
          missing: [{ name: 'Santos, Maria', studentNumber: '2024-0012', missingCount: 2 }],
          batch: null,
          retentionImpact: [
            { enrollmentId: 1042, name: 'Dela Cruz, Juan', studentNumber: '2024-0011', grade: 2.8, outcome: 'remedial' },
            { enrollmentId: 1044, name: 'Lopez, Pedro', studentNumber: '2024-0014', grade: 5.0, outcome: 'irregular_reenrollment' },
          ],
        }),
      );
    });

    await signInFaculty(page);
    await page.goto('/grades');

    await page.getByRole('button', { name: 'Submit grades' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Submit Grades' })).toBeVisible();
    await expect(dialog).toContainText('1 student has missing scores:');
    await expect(dialog).toContainText('Santos, Maria (2 missing)');
    await expect(dialog).toContainText('2 students enter Retention Status:');
    await expect(dialog).toContainText('Dela Cruz, Juan (2024-0011) — 2.8 (Remedial)');
    await expect(dialog).toContainText('Lopez, Pedro (2024-0014) — 5.0 (Irregular reenrollment)');
    await expect(dialog).toContainText('Submitted grades activate Retention Status and notify Remedial students in-app.');

    await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => submitCalls.length).toBe(1);
    expect(submitCalls[0]).toEqual({ csId: 41 });
  });

  test('Retention Monitoring & Email Management show /grades signpost banners and disable Remedial controls when unsubmitted or open grade change', async ({ page }) => {
    const classes = [
      { ...baseClass41, id: '41', csId: 41, csName: 'CLIN401-A', gradesSubmitted: false, midtermPublished: false, gradeChangeStatus: null },
      { ...baseClass41, id: '42', csId: 42, csName: 'CLIN402-B', courseCode: 'CLIN402', courseName: 'Clinical Dentistry II', gradesSubmitted: true, midtermPublished: true, gradeChangeStatus: 'draft' },
    ];
    const retentionRecords = [
      {
        enrollmentId: '901',
        studentId: '10',
        studentNumber: '2024-0010',
        studentName: 'Unsubmitted Remedial',
        email: 'unsubmitted@bicol-u.edu.ph',
        classId: '41',
        className: 'CLIN401-A',
        subjectCode: 'CLIN401',
        percentage: 70,
        gwa: 2.8,
        state: 'remedial',
        remedial: null,
        schoolYear: '2026-2027',
        remedialEligible: true,
        gradesSubmitted: false,
        hasOpenGradeChange: false,
        remedialProgression: {
          stage: 'attempt_1_pending',
          attempts: [{ attemptNumber: 1, outcome: 'pending', scheduledDate: '2099-01-15', percentage: null, notes: null }],
          passedAttempt: null,
          legacyUnclassified: false,
        },
      },
      {
        enrollmentId: '902',
        studentId: '11',
        studentNumber: '2024-0011',
        studentName: 'Open Change Remedial',
        email: 'openchange@bicol-u.edu.ph',
        classId: '42',
        className: 'CLIN402-B',
        subjectCode: 'CLIN402',
        percentage: 72,
        gwa: 2.7,
        state: 'remedial',
        remedial: null,
        schoolYear: '2026-2027',
        remedialEligible: true,
        gradesSubmitted: true,
        hasOpenGradeChange: true,
        remedialProgression: {
          stage: 'attempt_2_available',
          attempts: [{ attemptNumber: 1, outcome: 'failed', scheduledDate: '2026-10-20', percentage: 60, notes: null }],
          passedAttempt: null,
          legacyUnclassified: false,
        },
      },
    ];

    await page.route('**/api/faculty/classes', route =>
      route.fulfill(json({ status: 'ok', currentSchoolYear: '2026-2027', classes })),
    );
    await page.route('**/api/faculty/retention', route =>
      route.fulfill(
        json({
          status: 'ok',
          currentSchoolYear: '2026-2027',
          retentionThreshold: 2.5,
          unpublishedMidtermClassCount: 1,
          unsubmittedFinalClassCount: 1,
          retention: retentionRecords,
        }),
      ),
    );
    await page.route('**/api/faculty/students', route => route.fulfill(json([])));

    await signInFaculty(page);
    await page.goto('/retention');

    // Retention Status tab signpost + disabled Remedial buttons
    const finalSignpost = page.locator('[role="status"]').filter({ hasText: 'Final grades and Retention Status appear after grades are submitted in Grade Computation.' });
    await expect(finalSignpost).toBeVisible();
    await expect(finalSignpost.getByRole('link', { name: 'Open Grade Computation' })).toHaveAttribute('href', '/grades');

    await expect(page.getByRole('row').filter({ hasText: 'Unsubmitted Remedial' }).getByRole('button', { name: 'Remedial' }).last()).toBeDisabled();
    await expect(page.getByRole('row').filter({ hasText: 'Open Change Remedial' }).getByRole('button', { name: 'Remedial' }).last()).toBeDisabled();

    // At-Risk Students tab signpost
    await page.getByRole('tab', { name: /At-Risk Students/ }).click();
    const midtermSignpost = page.locator('[role="status"]').filter({ hasText: 'Some active classes do not have a published Midterm advisory yet. Publish in Grade Computation to list At-Risk students.' });
    await expect(midtermSignpost).toBeVisible();
    await expect(midtermSignpost.getByRole('link', { name: 'Open Grade Computation' })).toHaveAttribute('href', '/grades');
    // 14.3: Send advisory only opens the Email Management tab; nothing is selected here
    await expect(page.getByRole('link', { name: 'Send advisory' })).toHaveAttribute('href', '/email-management?tab=midterm_advisory');

    // Remedials tab signpost + disabled Schedule / Grade controls; no row checkboxes (14.3)
    await page.getByRole('tab', { name: /^Remedials/ }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: 'Final grades and Retention Status appear after grades are submitted in Grade Computation.' })).toBeVisible();
    const row901 = page.getByRole('row').filter({ hasText: 'Unsubmitted Remedial' });
    await expect(row901.getByRole('button', { name: 'Grade attempt 1' })).toBeDisabled();
    await expect(row901.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Send remedial notices' })).toHaveAttribute('href', '/email-management?tab=remedial');
    const row902 = page.getByRole('row').filter({ hasText: 'Open Change Remedial' });
    await expect(row902.getByRole('button', { name: 'Schedule attempt 2' })).toBeDisabled();

    // Email Management signpost banners & disabled Remedial controls
    await page.goto('/email-management');
    await page.getByRole('tab', { name: /Midterm Advisory/ }).click();
    const emailMidtermBanner = page.locator('[role="status"]').filter({ hasText: 'Publish in Grade Computation to send Midterm advisory emails.' });
    await expect(emailMidtermBanner).toBeVisible();
    await expect(emailMidtermBanner.getByRole('link', { name: 'Open Grade Computation' })).toHaveAttribute('href', '/grades');

    await page.getByRole('tab', { name: /Remedial Notices/ }).click();
    const emailRemedialBanner = page.locator('[role="status"]').filter({ hasText: 'Final grades and Remedial notices become available after grades are submitted in Grade Computation.' });
    await expect(emailRemedialBanner).toBeVisible();
    await expect(emailRemedialBanner.getByRole('link', { name: 'Open Grade Computation' })).toHaveAttribute('href', '/grades');
    const emailRow901 = page.getByRole('row').filter({ hasText: 'Unsubmitted Remedial' });
    await expect(emailRow901.getByLabel('Select Unsubmitted Remedial for Remedial Notice')).toBeDisabled();
    await expect(emailRow901.getByRole('button', { name: 'Edit date' })).toBeDisabled();
  });

  test('Student Retention Monitoring & Dashboard show Pending/No grade yet/In progress (never Cleared or Waiting) for unpublished/unsubmitted grades', async ({ page }) => {
    await page.route('**/api/student/dashboard**', route =>
      route.fulfill(
        json({
          status: 'ok',
          currentSchoolYear: '2026-2027',
          availableSchoolYears: ['2026-2027'],
          student: { studentId: 301, studentNumber: '2024-0011', name: 'Juan Dela Cruz', status: 'active', yearLevel: 4 },
          summary: { classCount: 2, gwa: null, attendanceRate: 95, clinicalHoursCompleted: 10, retentionAlerts: 0 },
          classes: [
            {
              enrollmentId: '501',
              classId: '41',
              className: 'CLIN401-A',
              courseId: '101',
              courseCode: 'CLIN401',
              courseName: 'Clinical Dentistry I',
              units: 3,
              isClinical: true,
              grade: null,
              percentage: null,
              retentionState: 'remedial',
            },
          ],
        }),
      ),
    );
    await page.route('**/api/student/retention', route =>
      route.fulfill(
        json({
          status: 'ok',
          retention: {
            currentSchoolYear: '2026-2027',
            atRiskCount: 0,
            midtermAtRiskCount: 0,
            hasPendingGrades: true,
            records: [
              {
                enrollmentId: '501',
                classId: '41',
                className: 'CLIN401-A',
                courseId: '101',
                courseCode: 'CLIN401',
                courseName: 'Clinical Dentistry I',
                units: 3,
                isClinical: true,
                semester: '1st Semester',
                schoolYear: '2026-2027',
                yearLevel: 4,
                grade: null,
                percentage: null,
                retentionState: 'active',
                gradeComponents: null,
                remedial: null,
                clinicHoursCompleted: 0,
                dateEnrolled: null,
                isCurrent: true,
                isPast: false,
                midtermEvaluation: {
                  published: false,
                  complete: false,
                  percentage: null,
                  grade: null,
                  isAtRisk: false,
                  gradedCount: 0,
                  totalCount: 3,
                },
              },
              {
                enrollmentId: '502',
                classId: '42',
                className: 'CLIN402-A',
                courseId: '102',
                courseCode: 'CLIN402',
                courseName: 'Clinical Dentistry II',
                units: 2,
                isClinical: false,
                semester: '1st Semester',
                schoolYear: '2026-2027',
                yearLevel: 4,
                grade: null,
                percentage: null,
                retentionState: 'active',
                gradeComponents: null,
                remedial: null,
                clinicHoursCompleted: 0,
                dateEnrolled: null,
                isCurrent: true,
                isPast: false,
                midtermEvaluation: {
                  published: true,
                  complete: false,
                  percentage: null,
                  grade: null,
                  isAtRisk: false,
                  gradedCount: 1,
                  totalCount: 3,
                },
              },
            ],
          },
        }),
      ),
    );

    await signInStudent(page);
    // Dashboard standing chip must read "No grade yet" when grade === null, even if retentionState is set.
    const dashRow = page.getByRole('row').filter({ hasText: 'CLIN401' });
    await expect(dashRow).toContainText('No grade yet');
    await expect(dashRow).not.toContainText('Cleared');
    await expect(dashRow).not.toContainText('Remedial');

    await page.goto('/student/retention');
    await expect(page.getByText('No grade yet', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active standing · Cleared')).toHaveCount(0);

    const row401 = page.getByRole('row').filter({ hasText: 'CLIN401' });
    await expect(row401).toContainText('Pending');
    await expect(row401).toContainText('In progress');
    await expect(row401).not.toContainText('Cleared');

    await page.getByRole('tab', { name: /Midterm Advisory/ }).click();
    await expect(page.getByText(/Waiting for all midterm scores in CLIN401/)).toHaveCount(0);
    await expect(page.getByText('Waiting for all midterm scores in CLIN402 (1 of 3 graded).', { exact: true })).toBeVisible();
  });
});
