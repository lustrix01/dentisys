import { test, expect } from '@playwright/test';
import { makeClassListPdf } from '../officialClassListPdf';

// Uses a made-up class list in the Dean's layout (never a real file). The class it creates stays as test data.
test('class list for a class that does not exist creates the class and enrolls the students', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill(process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!');
  const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
  await page.locator('button[type="submit"]').click();
  const credentials = await (await loginResponse).json();
  await expect(page).toHaveURL('/');
  const auth = { Authorization: `Bearer ${credentials.access_token}` };
  const read = async () => (await (await page.request.get('/api/faculty/classes', { headers: auth })).json());
  const before = await read();
  const term = (before.academicTerms as Array<{ id: number | null; schoolYear: string; semester: string }>)
    .find(candidate => candidate.id !== null && candidate.schoolYear === before.currentSchoolYear && candidate.semester === '1ST');
  expect(term, 'the current school year needs a 1ST academic term').toBeTruthy();

  const suffix = Date.now().toString(36).toUpperCase();
  const code = `CL-${suffix}`;
  const ids = [1, 2, 3].map(n => `CL${suffix}-${n}`);
  const pdf = await makeClassListPdf(page, {
    ay: before.currentSchoolYear, semester: '1st Semester', code, section: 'DMD-1A', title: 'Made Up Perspectives', year: '1st Year',
    lectureUnits: '3.0', labUnits: '0.0', schedules: ['Mon (09:00 AM - 11:00 AM) | Lecture | CDM 1'],
    students: ids.map((id, i) => ({ id, name: `${['Alpha', 'Bravo', 'Charlie'][i]}, Student Test`, email: `cl.${suffix.toLowerCase()}.${i}@bicol-u.edu.ph` })),
  });

  await page.locator('a[href="/classes"]').click();
  await page.getByRole('button', { name: 'Import Roster', exact: true }).click();
  await page.getByLabel('Provisional roster file').setInputFiles({ name: 'made-up-class-list.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('Parsed Students (3)', { exact: true })).toBeVisible({ timeout: 45_000 }); // the PDF reader loads on first use
  await expect(page.getByText('✓ 3 of 3 students read')).toBeVisible();
  await expect(page.getByLabel('Target class section')).toHaveValue('-1');
  await expect(page.getByText('Picked from the file. Change it if this is wrong.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Course code', { exact: true })).toHaveValue(code);
  await expect(page.getByLabel('Course title', { exact: true })).toHaveValue('Made Up Perspectives');
  await expect(page.getByLabel('Section', { exact: true })).toHaveValue('DMD-1A');
  await expect(page.getByLabel('Lecture units')).toHaveValue('3');
  await expect(page.getByLabel('Laboratory units')).toHaveValue('0');
  await expect(page.getByLabel('Academic term')).toHaveValue(String(term!.id));
  await expect(page.getByLabel('Meeting 1 room')).toHaveValue('CDM 1');
  for (const id of ids) await page.getByLabel(`Include student ${id}`, { exact: true }).check();
  await page.getByRole('checkbox', { name: /I reviewed the source course/ }).check();
  await page.getByRole('button', { name: 'Create class and add 3 students' }).click();
  await expect(page.getByText('Provisional Student Roster Import', { exact: true })).not.toBeVisible();
  await expect(page.getByText(`Class ${code}-DMD-1A created and 3 students added.`).first()).toBeVisible();

  const after = await read();
  const made = after.classes.filter((candidate: Record<string, unknown>) => candidate.courseCode === code);
  expect(made).toHaveLength(1);
  expect(made[0]).toMatchObject({ csName: `${code}-DMD-1A`, block: 'DMD-1A', lectureUnits: 3, yearLevel: 1, enrolledCount: 3 });
  expect(Number(made[0].labUnits ?? 0)).toBe(0);
  expect(made[0].meetings).toEqual([{ component: 'Lecture', day: 'Mon', room: 'CDM 1', startTime: '09:00', endTime: '11:00' }]);
  const students = await (await page.request.get('/api/faculty/students', { headers: auth })).json();
  for (const id of ids) {
    const row = students.find((candidate: Record<string, unknown>) => candidate.studentId === id);
    expect(row, id).toBeTruthy();
    expect(row.classSections.some((section: { classId: string }) => String(section.classId) === String(made[0].csId))).toBe(true);
  }
});
