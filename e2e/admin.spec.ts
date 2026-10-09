import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const deanReportStudents = [
  {
    id: '101', studentId: '2023-0101', name: 'Alex Example', yearLevel: 4, status: 'warning',
    overallGWA: 2.25, faceEnrolled: false, classId: '21', className: 'CLINIC, "4A"\nSpecial',
    clinicHoursCompleted: 18, enrolledSubjects: [{ code: 'CLIN401', name: 'Oral Surgery', grade: 2.25, isClinical: true }],
    remedialExams: [{ status: 'pending' }],
  },
  {
    id: '102', studentId: '2023-0102', name: 'Missing Class Name', yearLevel: 3, status: 'active',
    overallGWA: null, faceEnrolled: false, classId: '22', className: null,
    clinicHoursCompleted: 5, enrolledSubjects: [], remedialExams: [],
  },
];

const deanReportAttendance = [
  { id: '201', studentId: '101', date: '2026-09-22', subjectCode: 'CLIN401-HISTORY', className: 'CLINIC-4A at attendance', status: 'present' },
  { id: '202', studentId: '102', date: '2026-09-21', subjectCode: 'CLIN402-HISTORY', className: null, status: 'absent' },
];

const deanReportFormulaStudents = [
  { id: '103', studentId: '2023-0103', name: 'Equals Formula', classId: '23', className: '=1+1' },
  { id: '104', studentId: '2023-0104', name: 'Plus Formula', classId: '24', className: '+SUM(1,1)' },
  { id: '105', studentId: '2023-0105', name: 'Minus Formula', classId: '25', className: '-1+1' },
  { id: '106', studentId: '2023-0106', name: 'At Formula', classId: '26', className: '@SUM(1,1)' },
  { id: '107', studentId: '2023-0107', name: 'Leading Tab Formula', classId: '27', className: '\t=1+1' },
  { id: '108', studentId: '2023-0108', name: 'Leading Control Formula', classId: '28', className: '\u0001@SUM(1,1)' },
].map(student => ({
  ...student,
  yearLevel: 4,
  status: 'active',
  overallGWA: 2.75,
  faceEnrolled: false,
  clinicHoursCompleted: 0,
  enrolledSubjects: [],
  remedialExams: [],
}));

const mockDeanReportSummary = async (page: Page, students = deanReportStudents) => {
  await page.route('**/api/admin/reports/summary**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      currentSchoolYear: '2026-2027',
      availableSchoolYears: ['2025-2026', '2026-2027'],
      reports: { students, attendance: deanReportAttendance },
    }),
  }));
};

const captureDeanReportCsv = async (page: Page) => page.evaluate(async () => {
  const blobs = (window as any).__deanReportCsvBlobs as Blob[];
  const blob = blobs[blobs.length - 1];
  if (!blob) throw new Error('No Dean report CSV was generated.');
  return blob.text();
});

test.describe('Admin (Dean) Module E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'direct_login', access_token: 'mock-admin-token' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 100,
          login_email: 'dean@bicol-u.edu.ph',
          display_name: 'Dr. Dean Admin',
          role: 'admin',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[inputmode="email"]', 'dean@bicol-u.edu.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });


  test('Academic terms groups missing dates, validates fields, confirms expiry, copies and deletes', async ({ page }) => {
    let terms = [
      { id: null as number | null, schoolYear: '2026-2027', semester: '1ST', startDate: null as string | null, endDate: null as string | null, classCount: 3 },
      { id: 2, schoolYear: '2025-2026', semester: 'Summer', startDate: '2026-04-01', endDate: '2026-06-01', classCount: 0 },
    ];
    let invalid = true;
    let saves = 0;
    const posted: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/academic-terms**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const data = route.request().method() === 'GET' ? {} : route.request().postDataJSON();
      posted.push({ path: pathname, ...data });
      let body: unknown = { status: 'ok' }; let status = 200;
      if (route.request().method() === 'GET') body = { status: 'ok', currentSchoolYear: '2026-2027', today: '2026-10-10', terms };
      else if (pathname.endsWith('/preview') && invalid) { status = 422; body = { status: 'error', code: 'VALIDATION_ERROR', message: 'Validation failed.', errors: [{ field: 'endDate', message: 'End date must be after start date.' }] }; invalid = false; }
      else if (pathname.endsWith('/preview')) body = { status: 'ok', confirmationRequired: !!data.id && data.endDate < '2026-10-10', expiringEnrollments: !!data.id && data.endDate < '2026-10-10' ? 3 : 0 };
      else if (pathname.endsWith('/copy')) { body = { status: 'ok', schoolYear: '2027-2028', created: 1 }; terms = [...terms, { id: 3, schoolYear: '2027-2028', semester: '1ST', startDate: '2027-08-01', endDate: '2027-12-31', classCount: 0 }]; }
      else if (pathname.endsWith('/delete')) terms = terms.filter(term => term.id !== data.id);
      else { saves++; terms = terms.map(term => term.schoolYear === data.schoolYear && term.semester === data.semester ? { ...term, id: 1, startDate: data.startDate, endDate: data.endDate } : term); body = { status: 'ok', confirmationRequired: false, id: 1 }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.click('a[href="/admin/settings"]');
    const section = page.locator('#academic-terms');
    const row = section.getByTestId('2026-2027-1ST');
    await expect(row).toContainText('Dates not set');
    await expect(row).toContainText('3 classes');
    await row.getByRole('button', { name: 'Set dates' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Start date').fill('2026-08-01');
    await dialog.getByLabel('End date').fill('2026-07-01');
    await dialog.getByRole('button', { name: 'Save term' }).click();
    await expect(dialog.getByLabel('End date')).toHaveAttribute('aria-invalid', 'true');
    expect(saves).toBe(0);
    await dialog.getByLabel('End date').fill('2026-12-31');
    await dialog.getByRole('button', { name: 'Save term' }).click();
    await expect(row).toContainText('2026-08-01 – 2026-12-31');
    await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await row.getByRole('button', { name: 'Edit dates' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('School year')).toHaveAttribute('readonly', '');
    await expect(dialog.getByLabel('Semester')).toBeDisabled();
    await dialog.getByLabel('End date').fill('2026-10-10');
    await dialog.getByRole('button', { name: 'Save term' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toContainText('2026-10-10');
    expect(saves).toBe(2);
    expect(posted.some(data => data.confirmedExpiringEnrollments !== undefined)).toBe(false);
    await row.getByRole('button', { name: 'Edit dates' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('End date').fill('2026-10-09');
    await dialog.getByRole('button', { name: 'Save term' }).click();
    await expect(dialog).toContainText('3 unexpired biometric enrollments will expire');
    expect(saves).toBe(2);
    await dialog.getByRole('button', { name: 'Confirm and save' }).click();
    await expect(row).toContainText('2026-10-09');
    expect(posted.some(data => data.confirmedExpiringEnrollments === 3)).toBe(true);
    await section.getByRole('button', { name: 'Copy previous school year' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Copy terms', exact: true }).click();
    await expect(section).toContainText('Review and adjust their dates.');
    const copied = section.getByTestId('2027-2028-1ST');
    await expect(copied).toBeVisible();
    await copied.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete term', exact: true }).click();
    await expect(copied).toHaveCount(0);
  });

  test('Academic-term dashboard reminder links to Settings', async ({ page }) => {
    await page.route('**/api/admin/dashboard/kpis**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', kpis: {}, academicTermReminder: { semester: '2ND', schoolYear: '2026-2027', endDate: '2026-10-20' } }) }));
    await page.reload();
    await expect(page.getByRole('status')).toContainText('Add dates for 2ND 2026-2027');
    await page.getByRole('button', { name: 'Open Academic terms' }).click();
    await expect(page).toHaveURL('/admin/settings#academic-terms');
    await expect(page.getByText('Academic terms', { exact: true })).toBeVisible();
  });

  test('admin dashboard renders user info and role panel', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Dean|Office of the Dean|Dashboard/i);
  });

  test('admin can navigate to the Faculty Invitation page', async ({ page }) => {
    await page.click('a[href="/admin/faculty-invite"]');
    await expect(page).toHaveURL('/admin/faculty-invite');
    await expect(page.locator('body')).toContainText(/Faculty Invitation|Invite|Pending/i);
  });

  test('admin can reach reports from the retained retention-criteria redirect', async ({ page }) => {
    await page.click('a[href="/admin/reports"]');
    await expect(page).toHaveURL('/admin/reports');
    await expect(page.locator('body')).toContainText(/Report|System|Analytics/i);
  });

  test('admin can navigate to System Audit Reports page', async ({ page }) => {
    await page.click('a[href="/admin/reports"]');
    await expect(page).toHaveURL('/admin/reports');
    await expect(page.locator('body')).toContainText(/Report|Audit|System/i);
  });

  test('Dean report tables show supplied class names and preserve class filtering and report values', async ({ page }) => {
    await mockDeanReportSummary(page);
    await page.goto('/admin/reports');

    const studentTable = page.getByRole('table');
    const alexSummaryRow = studentTable.getByRole('row').filter({ hasText: '2023-0101' });
    await expect(alexSummaryRow.getByRole('cell').nth(0)).toHaveText('2023-0101');
    await expect(alexSummaryRow.getByRole('cell').nth(2)).toHaveText('CLINIC, "4A" Special');
    await expect(alexSummaryRow.getByRole('cell').nth(4)).toHaveText('2.25');
    await expect(alexSummaryRow.getByRole('cell').nth(5)).toContainText('warning');
    const missingNameSummaryRow = studentTable.getByRole('row').filter({ hasText: '2023-0102' });
    await expect(missingNameSummaryRow.getByRole('cell').nth(2)).toHaveText('—');
    await expect(missingNameSummaryRow.getByRole('cell').nth(4)).toHaveText('—');

    const classFilter = page.locator('select').first();
    await expect(classFilter.locator('option[value="21"]')).toContainText('CLINIC, "4A"');
    await classFilter.selectOption('21');
    await expect(studentTable.getByRole('row')).toHaveCount(2);
    await expect(studentTable).toContainText('Alex Example');
    await expect(studentTable).not.toContainText('Missing Class Name');
    await classFilter.selectOption('all');

    await page.getByRole('button', { name: 'Retention Reports' }).click();
    const retentionTable = page.getByRole('table');
    const alexRetentionRow = retentionTable.getByRole('row').filter({ hasText: 'Alex Example' });
    await expect(alexRetentionRow.getByRole('cell').nth(1)).toHaveText('CLINIC, "4A" Special');
    await expect(alexRetentionRow.getByRole('cell').nth(2)).toHaveText('2.25');
    await expect(alexRetentionRow.getByRole('cell').nth(3)).toContainText('warning');
    await expect(alexRetentionRow.getByRole('cell').nth(4)).toHaveText('18h');
    await expect(alexRetentionRow.getByRole('cell').nth(5)).toContainText('1 Pending');
    const missingNameRetentionRow = retentionTable.getByRole('row').filter({ hasText: 'Missing Class Name' });
    await expect(missingNameRetentionRow.getByRole('cell').nth(1)).toHaveText('—');
    await expect(missingNameRetentionRow.getByRole('cell').nth(2)).toHaveText('—');
    await expect(missingNameRetentionRow.getByRole('cell').nth(3)).toContainText('active');

    await page.getByRole('button', { name: 'Attendance Reports' }).click();
    const attendanceTable = page.getByRole('table');
    const historicalAttendanceRow = attendanceTable.getByRole('row').filter({ hasText: 'CLIN401-HISTORY' });
    await expect(historicalAttendanceRow.getByRole('cell').nth(0)).toHaveText('2026-09-22');
    await expect(historicalAttendanceRow.getByRole('cell').nth(1)).toHaveText('Alex Example');
    await expect(historicalAttendanceRow.getByRole('cell').nth(2)).toHaveText('CLINIC-4A at attendance');
    await expect(historicalAttendanceRow.getByRole('cell').nth(2)).not.toContainText('CLINIC, "4A"');
    await expect(historicalAttendanceRow.getByRole('cell').nth(4)).toContainText('present');
    const missingNameAttendanceRow = attendanceTable.getByRole('row').filter({ hasText: 'CLIN402-HISTORY' });
    await expect(missingNameAttendanceRow.getByRole('cell').nth(2)).toHaveText('—');
    await expect(missingNameAttendanceRow.getByRole('cell').nth(4)).toContainText('absent');
  });

  test('Dean Student Summary and Retention CSVs escape readable class names and preserve report values', async ({ page }) => {
    await mockDeanReportSummary(page, [...deanReportStudents, ...deanReportFormulaStudents]);
    await page.goto('/admin/reports');
    await expect(page.getByRole('table').getByRole('row').filter({ hasText: '2023-0101' })).toBeVisible();
    await page.evaluate(() => {
      (window as any).__deanReportCsvBlobs = [];
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        (window as any).__deanReportCsvBlobs.push(blob);
        return createObjectURL(blob);
      };
    });

    await page.getByRole('button', { name: 'Export CSV' }).click();
    const summaryCsv = await captureDeanReportCsv(page);
    expect(summaryCsv).toContain('2023-0101,"Alex Example","CLINIC, ""4A""\nSpecial",4,2.25,warning,No');
    expect(summaryCsv).toContain('2023-0102,"Missing Class Name","—",3,N/A,active,No');
    const escapedFormulaClassFields = [
      '2023-0103,"Equals Formula","\'=1+1"',
      '2023-0104,"Plus Formula","\'+SUM(1,1)"',
      '2023-0105,"Minus Formula","\'-1+1"',
      '2023-0106,"At Formula","\'@SUM(1,1)"',
      '2023-0107,"Leading Tab Formula","\'\t=1+1"',
      '2023-0108,"Leading Control Formula","\'\u0001@SUM(1,1)"',
    ];
    for (const classField of escapedFormulaClassFields) expect(summaryCsv).toContain(classField);

    await page.getByRole('button', { name: 'Retention Reports' }).click();
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const retentionCsv = await captureDeanReportCsv(page);
    expect(retentionCsv).toContain('2023-0101,"Alex Example","CLINIC, ""4A""\nSpecial",2.25,warning,1');
    expect(retentionCsv).toContain('2023-0102,"Missing Class Name","—",N/A,active,0');
    for (const classField of escapedFormulaClassFields) expect(retentionCsv).toContain(classField);
  });

  test('admin can navigate to Audit Trail page', async ({ page }) => {
    await page.click('a[href="/admin/audit-trail"]');
    await expect(page).toHaveURL('/admin/audit-trail');
    await expect(page.locator('body')).toContainText(/Audit Trail|Activity Log/i);
  });

  test('admin can view Profile page', async ({ page }) => {
    await page.click('a[href="/admin/profile"]');
    await expect(page).toHaveURL('/admin/profile');
    await expect(page.locator('body')).toContainText(/Profile|Dean/i);
  });

  test('admin can view Settings page', async ({ page }) => {
    await page.click('a[href="/admin/settings"]');
    await expect(page).toHaveURL('/admin/settings');
    await expect(page.locator('body')).toContainText(/Settings/i);
  });
  test('Dean Dashboard shows server charts and the latest audit events', async ({ page }) => {
    await page.route('**/api/admin/dashboard/kpis**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok', currentSchoolYear: '2026-2027', schoolYearFilter: '2026-2027', availableSchoolYears: ['2026-2027'],
          kpis: { totalStudents: 10, totalFaculty: 3, goodStanding: 7, atRisk: 3, remedialCount: 1, attendanceRate: 91 },
          gwaBuckets: [{ range: '1.0–1.5', count: 2, color: '#000' }, { range: '3.0+', count: 1, color: '#000' }],
          statusCounts: { active: 7, warning: 1, critical: 1, remedial: 1 },
          classAttendance: [{ name: 'CLINIC-4A', rate: 92 }],
          recentAuditEvents: [
            { id: '1', occurredAt: '2026-09-30T01:00:00Z', actorName: 'Dr. Roberto Santos', actorEmail: 'faculty@bicol-u.edu.ph', actorRole: 'faculty', module: 'grading', action: 'grades_recomputed', description: 'Recomputed grades: 30 computed, 0 not computed.', status: 'Success' },
          ],
        }),
      });
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Grade distribution' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Standing breakdown' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Attendance by class' })).toBeVisible();
    const events = page.getByRole('region', { name: 'Latest audit events' });
    await expect(events).toContainText('Dr. Roberto Santos');
    await expect(events).toContainText('faculty@bicol-u.edu.ph');
    await expect(events).toContainText('Recomputed grades: 30 computed');
  });
});
