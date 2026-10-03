import { test, expect } from './fixtures';

const studentUser = {
  id: 702,
  user_id: 702,
  login_email: 'live.grouped.student@bicol-u.edu.ph',
  display_name: 'Grouped Grading Student',
  role: 'student',
  session_uuid: 'grouped-student-session',
  authentication_source: 'password',
  student: { student_id: 702, student_number: 'GROUPED-STD-1', status: 'active' },
};

const component = (componentName: 'Lecture' | 'Laboratory', percentage: number) => ({
  component: componentName,
  status: 'computed',
  percentage,
  categories: [],
  incomplete: [],
});

const period = (name: 'Midterm' | 'Final', percentage: number, lecture: number, laboratory: number) => ({
  period: name,
  status: 'computed',
  percentage,
  categories: [],
  incomplete: [],
  attendanceDateRange: { startDate: null, endDate: null },
  components: { lecture: component('Lecture', lecture), laboratory: component('Laboratory', laboratory) },
});

const gradeComponents = (
  midterm: ReturnType<typeof period>,
  final: ReturnType<typeof period>,
  percentage: number,
  gwa: number,
) => ({
  calculationMode: 'authoritative_periods',
  termRatio: { midterm: 30, final: 70 },
  periods: { midterm, final },
  percentage,
  gwa,
  retentionState: 'active',
});

const groupedClass = (overrides: Record<string, unknown> = {}) => ({
  enrollmentId: '801',
  classId: '1',
  className: 'GROUPED-1A',
  courseId: '101',
  courseCode: 'INT-GROUPED',
  courseName: 'Integrated Grading Test',
  units: 1,
  isClinical: false,
  semester: '1st Semester',
  schoolYear: '2026-2027',
  yearLevel: 1,
  dateEnrolled: '2026-09-01',
  grade: 1.75,
  percentage: 85.4,
  gradeComponents: gradeComponents(period('Midterm', 84, 80, 90), period('Final', 86, 90, 80), 85.4, 1.75),
  gradingComponentMode: 'lecture_laboratory',
  retentionState: 'active',
  remedial: null,
  clinicHoursCompleted: 0,
  isCurrent: true,
  isPast: false,
  ...overrides,
});

test('Student class ledger reads saved grouped components and labels old combined breakdown as unavailable', async ({ page }) => {
  await page.route('**/api/runtime-config', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'ok', environment: 'test',
      allowed_email_domains: ['bicol-u.edu.ph'],
      providers: {
        identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
        email: { active: 'mailpit' }, biometrics: { active: 'disabled' }, location: { active: 'disabled' },
      },
      features: { browser_attendance_prototype: false, student_auth_enabled: true },
    }) });
  });
  await page.route('**/api/auth/refresh', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'grouped-student-refresh', user: { user_id: 702 } }) });
  });
  await page.route('**/api/auth/login', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'grouped-student-token' }) });
  });
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentUser) });
  });
  await page.route('**/api/student/classes', async route => {
    const archived = groupedClass({
      enrollmentId: '802', classId: '2', className: 'GROUPED-ARCHIVE', courseCode: 'OLD-GROUPED',
      courseName: 'Archived Grouped Course', schoolYear: '2025-2026', grade: 2.1, percentage: 82.2,
      gradeComponents: gradeComponents(period('Midterm', 63, 70, 60), period('Final', 90, 80, 95), 82.2, 2.1),
      isCurrent: false, isPast: true,
    });
    const oldCombined = groupedClass({
      enrollmentId: '803', classId: '3', className: 'OLD-COMBINED-1A', courseCode: 'OLD-COMBINED',
      courseName: 'Previously Combined Course', grade: 2.25, percentage: 81.5,
      gradeComponents: {
        calculationMode: 'authoritative_periods', termRatio: { midterm: 40, final: 60 },
        periods: {
          midterm: { period: 'Midterm', status: 'computed', percentage: 80, categories: [], incomplete: [] },
          final: { period: 'Final', status: 'computed', percentage: 82.5, categories: [], incomplete: [] },
        }, percentage: 81.5, gwa: 2.25, retentionState: 'active',
      },
    });
    const combinedAfterConversion = groupedClass({
      enrollmentId: '804', classId: '4', className: 'COMBINED-AFTER-CONVERSION', courseCode: 'GROUPED-HISTORY',
      courseName: 'Grouped Results After Combined Conversion', grade: 2.05, percentage: 84.7,
      gradeComponents: gradeComponents(period('Midterm', 81, 77, 92), period('Final', 86.3, 88, 83), 84.7, 2.05),
      gradingComponentMode: undefined,
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'ok', currentSchoolYear: '2026-2027', classes: [groupedClass(), oldCombined, combinedAfterConversion, archived],
    }) });
  });

  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(studentUser.login_email);
  await page.locator('input[type="password"]').fill('Student123!');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).toHaveURL('/student/dashboard');
  await page.goto('/student/classes');

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'My Enrolled Classes & Schedule' })).toBeVisible();
  await expect(main).toContainText('Midterm Lecture: 80.00%');
  await expect(main).toContainText('Midterm Laboratory: 90.00%');
  await expect(main).toContainText('Finals Lecture: 90.00%');
  await expect(main).toContainText('Finals Laboratory: 80.00%');
  await expect(main).toContainText('Score %: 85.40%');
  await expect(main.getByText('Unavailable (recompute required)', { exact: true })).toHaveCount(4);
  await expect(main.getByLabel('Lecture and Laboratory grade components')).toHaveCount(3);
  await expect(main.getByLabel('Lecture and Laboratory grade components').filter({ hasText: 'Midterm Lecture: 77.00%' })).toHaveCount(1);

  await main.getByRole('button', { name: /Archived Classes/ }).click();
  await expect(main).toContainText('Midterm Lecture: 70.00%');
  await expect(main).toContainText('Midterm Laboratory: 60.00%');
  await expect(main).toContainText('Finals Lecture: 80.00%');
  await expect(main).toContainText('Finals Laboratory: 95.00%');
});
