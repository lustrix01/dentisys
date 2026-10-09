import { test, expect } from '@playwright/test';

test('Dean term dates persist and Faculty selects only current-year Dean terms', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill('admin@bicol-u.edu.ph');
  await page.locator('input[type="password"]').fill('Admin123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('/');
  await page.locator('a[href="/admin/settings"]').click();
  const section = page.locator('#academic-terms');
  await section.getByRole('button', { name: 'Add term', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('School year').fill('2097-2098');
  await dialog.getByLabel('Start date').fill('2097-08-01');
  await dialog.getByLabel('End date').fill('2097-12-31');
  await dialog.getByRole('button', { name: 'Save term', exact: true }).click();
  const row = section.getByTestId('2097-2098-1ST');
  await expect(row).toContainText('2097-08-01 – 2097-12-31');
  await page.reload();
  await expect(row).toContainText('2097-08-01 – 2097-12-31');
  await row.getByRole('button', { name: 'Edit dates' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('End date').fill('2098-01-31');
  await dialog.getByRole('button', { name: 'Save term', exact: true }).click();
  await expect(row).toContainText('2098-01-31');
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete term' }).click();
  await expect(row).toHaveCount(0);

  // A fresh browser context clears the Dean session before Faculty login.
  const facultyContext = await page.context().browser()!.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:15173' });
  const facultyPage = await facultyContext.newPage();
  try {
    await facultyPage.goto('/login');
    await facultyPage.locator('input[inputmode="email"]').fill('faculty@bicol-u.edu.ph');
    await facultyPage.locator('input[type="password"]').fill('Faculty123!');
    await facultyPage.locator('button[type="submit"]').click();
    await expect(facultyPage).toHaveURL('/');
    await facultyPage.locator('a[href="/classes"]').click();
    await facultyPage.getByRole('button', { name: 'Create Class', exact: true }).first().click();
    const dropdown = facultyPage.getByLabel('Academic term *');
    await expect(dropdown).toBeEnabled();
    await expect(dropdown).toContainText('1ST 2026-2027');
    await expect(dropdown).toContainText('2ND 2026-2027');
    await expect(dropdown).toContainText('Summer 2026-2027');
    await expect(dropdown).not.toContainText('2087-2088');
    await dropdown.selectOption({ label: await dropdown.locator('option').filter({ hasText: 'Summer 2026-2027' }).innerText() });
    await expect(dropdown).not.toHaveValue('');
  } finally { await facultyContext.close(); }
});
