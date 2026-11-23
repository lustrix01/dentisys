import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Backlog 14.5: Student Attendance Logs export (Excel and PDF) follows the rows shown.
const RUNTIME_CONFIG = {
  status: 'ok',
  environment: 'test',
  providers: {
    identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
    email: { active: 'mailpit' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: true },
};

const STUDENT = {
  user_id: 26,
  login_email: 'log.export@bicol-u.edu.ph',
  display_name: 'Export Student',
  role: 'student',
  session_uuid: 'log-export-session',
  authentication_source: 'password',
  student: { student_id: 26, student_number: 'P03-EXPORT', status: 'active' },
};

// Known API order: Nov 10 (DENT101), Nov 20 (DENT202), Nov 15 (DENT101).
const RECORDS = [
  { id: 1, courseCode: 'DENT101', courseName: 'Oral Anatomy', room: 'Room 101', instructorName: 'Dr. Reyes', date: '2026-11-10', time: '8:05 AM', status: 'present', verificationMethod: 'biometric' },
  { id: 2, courseCode: 'DENT202', courseName: 'Periodontics', room: 'Dental Clinic Lab 1', date: '2026-11-20', time: '9:10 AM', status: 'late', verificationMethod: 'faculty_manual' },
  { id: 3, courseCode: 'DENT101', courseName: 'Oral Anatomy', date: '2026-11-15', time: '', status: 'unresolved', verificationMethod: 'system_resolution' },
];

async function openLogs(page: Page): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/runtime-config', route => route.fulfill(json(RUNTIME_CONFIG)));
  await page.route('**/api/auth/refresh', route => route.fulfill(json({ access_token: 'log-export-refresh', user: { user_id: 26 } })));
  await page.route('**/api/auth/login', route => route.fulfill(json({ type: 'direct_login', access_token: 'log-export-token' })));
  await page.route('**/api/auth/me', route => route.fulfill(json(STUDENT)));
  await page.route('**/api/student/dashboard**', route => route.fulfill(json({
    status: 'ok',
    student: { studentId: 26, studentNumber: 'P03-EXPORT', name: 'Export Student', firstName: 'Export', lastName: 'Student', status: 'active', yearLevel: 4, account: { id: 26, email: STUDENT.login_email, role: 'student', status: 'Active' } },
    summary: { classCount: 0, gwa: null, attendanceRate: null, clinicalHoursCompleted: 0, retentionAlerts: 0 },
    classes: [],
  })));
  await page.route('**/api/student/attendance/logs**', route => route.fulfill(json({ status: 'ok', records: RECORDS, total: RECORDS.length })));
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(STUDENT.login_email);
  await page.locator('input[type="password"]').fill('Student123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('/student/dashboard');
  await page.goto('/student/attendance-logs');
  await expect(page.getByRole('heading', { level: 1, name: 'Attendance Logs' })).toBeVisible();
  await expect(page.getByText('Attendance Log Entries (3)')).toBeVisible();
}

const printRows = (page: Page) => page.locator('.print-only table tbody tr');

test.describe('Student Attendance Logs export (14.5)', () => {
  test('both export buttons are visible and enabled when rows exist', async ({ page }) => {
    await openLogs(page);
    await expect(page.getByRole('button', { name: 'Export attendance logs as Excel' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Export attendance logs as PDF' })).toBeEnabled();
  });

  test('Export Excel downloads Attendance_Log_<number>_<date>.xlsx', async ({ page }) => {
    await openLogs(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export attendance logs as Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^Attendance_Log_P03-EXPORT_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('a search that matches nothing disables both buttons with the empty title', async ({ page }) => {
    await openLogs(page);
    await page.getByLabel('Search attendance logs').fill('zzz-no-match');
    await expect(page.getByText('No attendance records found')).toBeVisible();
    for (const name of ['Export attendance logs as Excel', 'Export attendance logs as PDF']) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('title', 'No attendance logs to export');
    }
  });

  test('the print sheet lists the shown rows and follows the Date sort', async ({ page }) => {
    await openLogs(page);
    // API order, no sort: Nov 10, Nov 20, Nov 15.
    await expect(printRows(page)).toHaveCount(3);
    await expect(printRows(page).nth(0).locator('td').first()).toHaveText('Nov 10, 2026');
    await expect(printRows(page).nth(1).locator('td').first()).toHaveText('Nov 20, 2026');
    await expect(printRows(page).nth(2).locator('td').first()).toHaveText('Nov 15, 2026');
    await expect(printRows(page).nth(0)).toContainText('DENT101 · Oral Anatomy');
    await expect(printRows(page).nth(0)).toContainText('Biometric 1:1 Verification · By Dr. Reyes');
    await expect(printRows(page).nth(2)).toContainText('Pending');
    await expect(page.locator('.print-only')).toContainText('Attendance Log');

    // First click on Date sorts newest first.
    await page.getByRole('button', { name: /^Date/ }).first().click();
    await expect(printRows(page).nth(0).locator('td').first()).toHaveText('Nov 20, 2026');
    await expect(printRows(page).nth(1).locator('td').first()).toHaveText('Nov 15, 2026');
    await expect(printRows(page).nth(2).locator('td').first()).toHaveText('Nov 10, 2026');

    // Second click flips to oldest first.
    await page.getByRole('button', { name: /^Date/ }).first().click();
    await expect(printRows(page).nth(0).locator('td').first()).toHaveText('Nov 10, 2026');
    await expect(printRows(page).nth(2).locator('td').first()).toHaveText('Nov 20, 2026');
  });

  test('the print sheet follows the search', async ({ page }) => {
    await openLogs(page);
    await page.getByLabel('Search attendance logs').fill('DENT202');
    await expect(printRows(page)).toHaveCount(1);
    await expect(printRows(page).first()).toContainText('DENT202 · Periodontics');
    await expect(printRows(page).first()).toContainText('Dental Clinic Lab 1');
  });
});
