import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function setup(page: Page, failEmail = '') {
  const creates: Array<Record<string, unknown>> = [];
  const enrolls: Array<Record<string, unknown>> = [];
  const targetClass = { id: '11', csId: 11, csName: 'TEST101 - A', courseId: 1, courseCode: 'TEST101', courseName: 'Fixture Course', schoolYear: '2099-2100', semester: '1ST', yearLevel: 4, block: 'A', schedule: '', enrolledCount: 0, instructorName: 'Fixture Faculty', status: 'Active' };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/login') return json({ type: 'direct_login', access_token: 'fixture-token' });
    if (path === '/api/auth/me') return json({ id: 200, login_email: 'fixture.faculty@bicol-u.edu.ph', display_name: 'Fixture Faculty', role: 'faculty' });
    if (path === '/api/faculty/classes') return json({ status: 'ok', currentSchoolYear: '2099-2100', classes: [targetClass, { ...targetClass, id: '12', csId: 12, schoolYear: '2098-2099', csName: 'Historical section' }] });
    if (path === '/api/faculty/courses') return json({ status: 'ok', courses: [] });
    if (path === '/api/faculty/students') {
      if (request.method() === 'GET') return json([{ id: '7001', studentId: '2099-1234-56789', name: 'Existing identity', email: 'canonical@bicol-u.edu.ph', classSections: [{ classId: '11' }] }]);
      const body = request.postDataJSON(); creates.push(body);
      if (body.email === failEmail) return json({ status: 'error', message: 'Email belongs to another identity.' }, 409);
      return json({ status: 'ok', message: 'Created', student: { id: '8001' } });
    }
    if (path === '/api/faculty/classes/available-students') return json({ status: 'ok', students: [{ id: '7001', studentId: '2099-1234-56789', name: 'Existing identity', email: 'canonical@bicol-u.edu.ph', status: 'active', yearLevel: 3 }] });
    if (path === '/api/faculty/classes/enroll') { enrolls.push(request.postDataJSON()); return json({ status: 'ok', message: 'Enrolled', enrolledCount: 1 }); }
    return route.fallback();
  });
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill('fixture.faculty@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill('FixturePassword123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/');
  await page.locator('a[href="/classes"]').click();
  await page.getByRole('button', { name: 'Import Roster (Provisional)' }).click();
  await expect(page.getByText('Official format not confirmed.', { exact: true })).toBeVisible();
  return { creates, enrolls };
}

test('provisional PDF keeps all rows unselected, flags marks, preserves fields and resolves existing server IDs', async ({ page }) => {
  const { creates, enrolls } = await setup(page);
  await page.getByLabel('Provisional roster file').setInputFiles('e2e/fixtures/provisional-roster.pdf');
  await expect(page.getByText('Parsed Students (3)', { exact: true })).toBeVisible();
  await expect(page.getByText('Possible crossed-out row', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Include student 2099-01-12345', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Include student 2099-1234-56789', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('First name for 2099-1234-56789', { exact: true })).toHaveValue('José Miguel Reyes');
  await expect(page.getByLabel('Email for 2099-1234-56789', { exact: true })).toHaveValue('actual.fixture@bicol-u.edu.ph');
  await expect(page.getByLabel('Year level for 2099-01-12345', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Target class section').locator('option')).toHaveCount(1);
  await expect(page.getByLabel('Target class section').locator('option')).toHaveText(/1ST, 2099-2100/);
  await page.getByLabel('First name for 2099-1234-56789', { exact: true }).fill('José Miguel');
  await page.getByLabel('Middle name for 2099-1234-56789', { exact: true }).fill('Reyes');
  await page.getByLabel('Include student 2099-1234-56789', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Confirm & Import (1) Students' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
  await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
  await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  expect(creates).toHaveLength(0);
  expect(enrolls).toEqual([{ csId: 11, studentIds: [7001] }]);
});

test('partial CSV failure remains visible and retry does not repeat successful rows or mask email conflicts', async ({ page }) => {
  const { creates, enrolls } = await setup(page, 'conflict@bicol-u.edu.ph');
  await page.getByLabel('Provisional roster file').setInputFiles({ name: 'fictional.csv', mimeType: 'text/csv', buffer: Buffer.from('Student ID,First Name,Last Name,Email,Year Level,Contact #,Gender\n2099-3333-44444,Ana,Reyes,ana.fixture@bicol-u.edu.ph,2,00123,Female\n2099-5555-66666,Bea,Santos,conflict@bicol-u.edu.ph,,,') });
  await expect(page.getByText('Parsed Students (2)', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
  await page.getByRole('button', { name: 'Confirm & Import (2) Students' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rows requiring correction' })).toContainText('2099-5555-66666');
  await expect(page.getByText('Parsed Students (1)', { exact: true })).toBeVisible();
  expect(enrolls).toHaveLength(0);
  expect(creates[0]).toMatchObject({ studentId: '2099-3333-44444', contact: '00123', yearLevel: 2, sex: 'F', classId: '11' });
  expect(creates[1]).not.toHaveProperty('yearLevel');
  await page.getByLabel('Email for 2099-5555-66666', { exact: true }).fill('bea.fixture@bicol-u.edu.ph');
  await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
  await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  expect(creates.filter(row => row.studentId === '2099-3333-44444')).toHaveLength(1);
  expect(creates).toHaveLength(3);
});

test('retry resolves a committed student after the creation response is lost', async ({ page }) => {
  const { creates, enrolls } = await setup(page);
  let committed = false;
  await page.route('**/api/faculty/students', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(committed ? [{ id: '8002', studentId: '2099-8888-99999', classSections: [{ classId: '11' }] }] : []) });
    creates.push(route.request().postDataJSON());
    if (!committed) { committed = true; return route.abort('failed'); }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Student number already exists.' }) });
  });
  await page.getByLabel('Target class section').selectOption('11');
  await page.getByLabel('Provisional roster file').setInputFiles({ name: 'fictional-retry.csv', mimeType: 'text/csv', buffer: Buffer.from('Student ID,First Name,Last Name,Institutional Email\n2099-8888-99999,Ana,Reyes,ana.retry@bicol-u.edu.ph') });
  await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
  await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rows requiring correction' })).toContainText('2099-8888-99999');
  expect(creates).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
  await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  expect(creates).toHaveLength(2);
  expect(enrolls).toEqual([{ csId: 11, studentIds: [8002] }]);
});

test('missing institutional email blocks saves until a valid allowed email is supplied', async ({ page }) => {
  const { creates, enrolls } = await setup(page);
  await page.getByLabel('Provisional roster file').setInputFiles({ name: 'fictional-missing-email.csv', mimeType: 'text/csv', buffer: Buffer.from('Student ID,First Name,Last Name,Institutional Email\n2099-2222-33333,Ana,Reyes,') });
  await expect(page.getByText('Institutional email is required before this row can be imported.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
  await expect(page.getByRole('button', { name: 'Confirm & Import (0) Students' })).toBeDisabled();
  await expect(page.getByLabel('Include student 2099-2222-33333', { exact: true })).toBeDisabled();
  expect(creates).toHaveLength(0);
  expect(enrolls).toHaveLength(0);
  await page.getByLabel('Email for 2099-2222-33333', { exact: true }).fill('ana@outside.edu');
  await expect(page.getByText('Email domain is not allowed by the server configuration.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm & Import (0) Students' })).toBeDisabled();
  await page.getByLabel('Email for 2099-2222-33333', { exact: true }).fill('ana.required@bicol-u.edu.ph');
  await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
  await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({ studentId: '2099-2222-33333', email: 'ana.required@bicol-u.edu.ph' });
});
