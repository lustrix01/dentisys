import { test, expect } from '@playwright/test';

test('provisional roster creates real records and repeat import preserves their identity and enrollment', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill(process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!');
  const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
  await page.locator('button[type="submit"]').click();
  const credentials = await (await loginResponse).json();
  await expect(page).toHaveURL('/');
  const auth = { Authorization: `Bearer ${credentials.access_token}` };
  const classes = await (await page.request.get('/api/faculty/classes', { headers: auth })).json();
  const target = classes.classes.find((candidate: Record<string, unknown>) => candidate.schoolYear === classes.currentSchoolYear && String(candidate.status).toLowerCase() === 'active');
  expect(target).toBeTruthy();
  const suffix = Date.now().toString(36);
  const number = `PROVISIONAL-${suffix}`;
  const csv = Buffer.from(`Student ID,First Name,Middle Name,Last Name,Email,Year Level,Gender,Contact #\n${number},Ana,Reyes,Peña,provisional.${suffix}@bicol-u.edu.ph,3,Female,00123456789`);
  await page.locator('a[href="/classes"]').click();
  const importFile = async () => {
    await page.getByRole('button', { name: 'Import Roster (Provisional)' }).click();
    await expect(page.getByText('Official format not confirmed.', { exact: true })).toBeVisible();
    await page.getByLabel('Target class section').selectOption(String(target.csId));
    await page.getByLabel('Provisional roster file').setInputFiles({ name: 'fictional-live.csv', mimeType: 'text/csv', buffer: csv });
    await expect(page.getByText('Parsed Students (1)', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
    await page.getByRole('button', { name: 'Confirm & Import (1) Students' }).click();
    await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  };
  await importFile();
  const read = async () => {
    const response = await page.request.get('/api/faculty/students', { headers: auth });
    expect(response.ok(), await response.text()).toBeTruthy();
    const records = await response.json();
    const matching = records.filter((row: Record<string, unknown>) => row.studentId === number);
    expect(matching).toHaveLength(1);
    return matching[0];
  };
  const before = await read();
  expect(before).toMatchObject({ studentId: number, firstName: 'Ana', middleName: 'Reyes', lastName: 'Peña', email: `provisional.${suffix}@bicol-u.edu.ph`, contact: '00123456789', sex: 'F', yearLevel: 3 });
  const targetEnrollment = before.classSections.find((section: { classId: string }) => String(section.classId) === String(target.csId));
  expect(Number(targetEnrollment.enrollmentId)).toBeGreaterThan(0);
  await importFile();
  const after = await read();
  expect(after.id).toBe(before.id);
  expect(after.classSections).toEqual(before.classSections);
  expect(after.firstName).toBe(before.firstName);
  expect(after.email).toBe(before.email);
});
