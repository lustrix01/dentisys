import { test, expect, signInAs } from './fixtures';
import type { Page } from '@playwright/test';

// Superadmin Classes (docs/contracts/superadmin-classes.md): live cards, filters, Class Details, Change Faculty dialog.
// The API is mocked per test; the server rules (D5, D6, D20 ...) are tested in tests/database/superadmin_classes_integration.php.
type Row = Record<string, unknown>;
const classRow = (csId: number, over: Row = {}): Row => ({
  csId, courseCode: 'DENT 101', courseTitle: 'Dental Anatomy', section: `CDM-${csId}A`, schoolYear: '2026-2027', semester: '1ST', yearLevel: 1,
  faculty: { userId: 11, name: 'Dr. Reyes' }, schedule: [{ day: 'Mon', start: '08:00', end: '10:00' }], rooms: { lecture: 'Room 101', laboratory: null },
  studentCount: 2, secretary: { name: 'Sam Secretary' }, archiveReason: null, archivedAt: null, current: true, canChangeFaculty: true, ...over,
});
const ACTIVE = [classRow(41), classRow(42, { courseCode: 'DENT 202', courseTitle: 'Oral Pathology', secretary: null, faculty: { userId: 12, name: 'Dr. Lim' } })];
const ARCHIVED = [
  classRow(43, { section: 'CDM-OLD', schoolYear: '2025-2026', archiveReason: 'completed', current: false, canChangeFaculty: false }),
  classRow(44, { section: 'CDM-CANCELLED', archiveReason: 'cancelled', archivedAt: '2026-10-01T09:00:00+08:00', canChangeFaculty: false }),
];
const FILTERS = {
  schoolYears: ['2026-2027', '2025-2026'], currentSchoolYear: '2026-2027',
  courses: [{ courseId: 1, courseCode: 'DENT 101', title: 'Dental Anatomy' }, { courseId: 2, courseCode: 'DENT 202', title: 'Oral Pathology' }],
  faculty: [{ userId: 11, name: 'Dr. Reyes', status: 'active' }, { userId: 12, name: 'Dr. Lim', status: 'active' }, { userId: 77, name: 'Dr. Ana Cruz', status: 'active' }, { userId: 13, name: 'Dr. Gone', status: 'deactivated' }],
};
const ROSTER = [
  { studentNo: '2024-0001', name: 'Ana Student', email: 'ana@bicol-u.edu.ph', yearLevel: 1, status: 'Active' },
  { studentNo: '2024-0002', name: 'Ben Student', email: 'ben@bicol-u.edu.ph', yearLevel: 1, status: 'Active' },
];

async function mockClasses(page: Page, seen: URLSearchParams[] = []) {
  await page.route('**/api/admin/classes/filters', route => route.fulfill({ json: { status: 'ok', ...FILTERS } }));
  await page.route('**/api/admin/classes/detail**', route => {
    const csId = Number(new URL(route.request().url()).searchParams.get('csId'));
    const row = [...ACTIVE, ...ARCHIVED].find(r => r.csId === csId) ?? ACTIVE[0];
    return route.fulfill({ json: { status: 'ok', class: row, roster: ROSTER } });
  });
  await page.route('**/api/admin/classes?**', route => {
    const params = new URL(route.request().url()).searchParams;
    seen.push(params);
    const archived = params.get('view') === 'archived';
    let rows = archived ? ARCHIVED : ACTIVE;
    const q = (params.get('q') ?? '').toLowerCase();
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    if (params.get('facultyId')) rows = rows.filter(r => String((r.faculty as { userId: number }).userId) === params.get('facultyId'));
    return route.fulfill({ json: { status: 'ok', classes: rows, total: rows.length, page: 1, pageSize: 50, counts: { active: ACTIVE.length, archived: ARCHIVED.length } } });
  });
}

test.describe('Superadmin Classes', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'superadmin'); });

  test('lists the classes from the API as cards; no preview data, no Create Class, no Edit/Archive/Restore', async ({ page }) => {
    await mockClasses(page);
    await page.goto('/superadmin/classes');
    await expect(page.getByRole('heading', { name: 'Oral Pathology' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dental Anatomy' })).toBeVisible();
    await expect(page.locator('article', { hasText: 'Dr. Reyes' })).toBeVisible();
    await expect(page.getByText('2 students').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Active Classes/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /Archived Classes/ })).toContainText('2');
    await expect(page.getByText(/Preview data/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Create Class/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Edit|Archive|Restore)/ })).toHaveCount(0);
  });

  test('search and the Faculty filter go to the API; the Faculty filter marks a deactivated member; Clear filters resets', async ({ page }) => {
    const seen: URLSearchParams[] = [];
    await mockClasses(page, seen);
    await page.goto('/superadmin/classes');
    await expect(page.getByRole('heading', { name: 'Oral Pathology' })).toBeVisible();
    await page.getByPlaceholder(/Search course, section or Faculty/).fill('Oral');
    await expect(page.getByRole('heading', { name: 'Dental Anatomy' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Oral Pathology' })).toBeVisible();
    expect(seen.some(p => p.get('q') === 'Oral')).toBe(true);
    const facultyFilter = page.getByRole('combobox', { name: 'Faculty', exact: true });
    await expect(facultyFilter.locator('option', { hasText: 'Dr. Gone (deactivated)' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('heading', { name: 'Dental Anatomy' })).toBeVisible();
    await facultyFilter.selectOption({ label: 'Dr. Lim' });
    await expect.poll(() => seen.some(p => p.get('facultyId') === '12')).toBe(true);
    await expect(page.getByRole('heading', { name: 'Dental Anatomy' })).toHaveCount(0);
  });

  test('?facultyId= from People & Accounts opens the page filtered to that Faculty member (D16)', async ({ page }) => {
    const seen: URLSearchParams[] = [];
    await mockClasses(page, seen);
    await page.goto('/superadmin/classes?facultyId=12');
    await expect(page.getByRole('heading', { name: 'Oral Pathology' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dental Anatomy' })).toHaveCount(0);
    expect(seen.some(p => p.get('facultyId') === '12')).toBe(true);
  });

  test('Class Details shows the roster and the Class Secretary row, read-only', async ({ page }) => {
    await mockClasses(page);
    await page.goto('/superadmin/classes');
    await page.getByRole('button', { name: /View details for DENT 101/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Class Details' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Ana Student')).toBeVisible();
    await expect(dialog.getByText('2024-0002')).toBeVisible();
    await expect(dialog.getByText('ben@bicol-u.edu.ph')).toBeVisible();
    await expect(dialog.getByText('Class Secretary')).toBeVisible();
    await expect(dialog.getByText('Sam Secretary')).toBeVisible();
    await expect(dialog.getByText('Preview roster only')).toHaveCount(0);
  });

  test('the Archived view lists Completed and Cancelled, and no card has a Change Faculty button (D17)', async ({ page }) => {
    await mockClasses(page);
    await page.goto('/superadmin/classes');
    await expect(page.getByRole('button', { name: /Change Faculty for/ })).toHaveCount(2); // the two active, current classes
    await page.getByRole('tab', { name: /Archived Classes/ }).click();
    await expect(page.locator('article', { hasText: 'CDM-OLD' })).toContainText('Completed');
    await expect(page.locator('article', { hasText: 'CDM-CANCELLED' })).toContainText('Cancelled');
    await expect(page.getByRole('button', { name: /Change Faculty for/ })).toHaveCount(0);
  });

  test('Change Faculty: the dialog lists active Faculty only, needs a reason, posts {csId, toUserId, reason} and shows the new owner', async ({ page }) => {
    await mockClasses(page);
    const posted: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/classes/change-faculty', route => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: 'ok', message: 'DENT 101 (CDM-41A) now belongs to Dr. Ana Cruz.', class: classRow(41, { faculty: { userId: 77, name: 'Dr. Ana Cruz' } }) } });
    });
    await page.goto('/superadmin/classes');
    await page.getByRole('button', { name: /Change Faculty for DENT 101/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Change Faculty' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('DENT 101')).toBeVisible();
    await expect(dialog.getByText(/Current Faculty: Dr\. Reyes/)).toBeVisible();
    const options = await dialog.getByLabel('New Faculty').locator('option').allTextContents();
    expect(options).toContain('Dr. Ana Cruz');
    expect(options).toContain('Dr. Lim');
    expect(options).not.toContain('Dr. Reyes'); // the current owner is not a choice
    expect(options.join('|')).not.toContain('Dr. Gone'); // a deactivated member is not a choice (D6)
    await dialog.getByRole('button', { name: 'Change Faculty' }).click();
    await expect(dialog.getByText('Enter a reason.')).toBeVisible();
    expect(posted).toHaveLength(0);
    await dialog.getByLabel('New Faculty').selectOption({ label: 'Dr. Ana Cruz' });
    await dialog.getByLabel('Reason').fill('abc');
    await dialog.getByRole('button', { name: 'Change Faculty' }).click();
    await expect(dialog.getByText('Enter a reason.')).toBeVisible(); // under 5 characters (D8)
    expect(posted).toHaveLength(0);
    await dialog.getByLabel('Reason').fill('Dr. Reyes is on leave for the rest of the semester.');
    await dialog.getByRole('button', { name: 'Change Faculty' }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toEqual({ csId: 41, toUserId: 77, reason: 'Dr. Reyes is on leave for the rest of the semester.' });
    await expect(page.getByRole('dialog', { name: 'Change Faculty' })).toHaveCount(0);
    await expect(page.getByText('DENT 101 (CDM-41A) now belongs to Dr. Ana Cruz.')).toBeVisible();
  });

  test('a refusal from the server is shown inside the dialog and the dialog stays open', async ({ page }) => {
    await mockClasses(page);
    await page.route('**/api/admin/classes/change-faculty', route => route.fulfill({
      status: 409, json: { status: 'error', code: 'session_open', message: 'End the open attendance session first, or wait until it ends at 10:00 AM.' },
    }));
    await page.goto('/superadmin/classes');
    await page.getByRole('button', { name: /Change Faculty for DENT 101/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Change Faculty' });
    await dialog.getByLabel('New Faculty').selectOption({ label: 'Dr. Ana Cruz' });
    await dialog.getByLabel('Reason').fill('Dr. Reyes is on leave for the rest of the semester.');
    await dialog.getByRole('button', { name: 'Change Faculty' }).click();
    await expect(dialog.getByText('End the open attendance session first, or wait until it ends at 10:00 AM.')).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test('a grading_weights_clash refusal reads as the server message in the dialog', async ({ page }) => {
    await mockClasses(page);
    const message = 'Dr. Ana Cruz already has grade weights for DENT 101, 1st Semester 2026-2027. Choose another Faculty member.';
    await page.route('**/api/admin/classes/change-faculty', route => route.fulfill({ status: 409, json: { status: 'error', code: 'grading_weights_clash', message } }));
    await page.goto('/superadmin/classes');
    await page.getByRole('button', { name: /Change Faculty for DENT 101/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Change Faculty' });
    await dialog.getByLabel('New Faculty').selectOption({ label: 'Dr. Ana Cruz' });
    await dialog.getByLabel('Reason').fill('Dr. Reyes is on leave for the rest of the semester.');
    await dialog.getByRole('button', { name: 'Change Faculty' }).click();
    await expect(dialog.getByText(message)).toBeVisible();
  });

  test('a failed list load shows an error with Retry', async ({ page }) => {
    await page.route('**/api/admin/classes/filters', route => route.fulfill({ json: { status: 'ok', ...FILTERS } }));
    let failing = true;
    await page.route('**/api/admin/classes?**', route => {
      if (failing) return route.fulfill({ status: 500, json: { status: 'error', message: 'Unable to load or change classes.' } });
      return route.fulfill({ json: { status: 'ok', classes: ACTIVE, total: 2, page: 1, pageSize: 50, counts: { active: 2, archived: 0 } } });
    });
    await page.goto('/superadmin/classes');
    await expect(page.getByRole('alert')).toBeVisible();
    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Oral Pathology' })).toBeVisible();
  });
});

test.describe('Other roles', () => {
  test('the Dean has no Classes page (D4): /superadmin/classes and /admin/classes go to the Dashboard', async ({ page }) => {
    await signInAs(page, 'admin');
    for (const p of ['/superadmin/classes', '/admin/classes']) {
      await page.goto(p);
      await expect(page).toHaveURL('/');
    }
    await expect(page.locator('a[href="/superadmin/classes"]')).toHaveCount(0);
  });
});
