import { test, expect, type Page } from '@playwright/test';
import { signInSuperadmin } from './superadminSignIn';

// Superadmin Classes live checks (docs/contracts/superadmin-classes.md) against the real backend and the dev seed:
// the Superadmin moves DENT-1B from Dr. Del Rosario to Dr. Villanueva (an active Faculty member with no class); the new
// Faculty member signs in and sees the class, the previous one no longer does. A second move is not tried on the same stack:
// a moved class keeps its grade weights with the new owner, so moving it back to a Faculty member who still has her own is refused (D20).
test.describe.configure({ timeout: 180_000 });

const SECTION = 'DENT-1B';
const FROM_EMAIL = 'dr.delrosario@bicol-u.edu.ph';
const TO_EMAIL = 'dr.villanueva@bicol-u.edu.ph';
const FACULTY_PASSWORD = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

async function signInFaculty(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(email);
  await page.locator('input[type="password"]').fill(FACULTY_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/); // the Faculty home is /
  await expect(page.getByRole('navigation').first()).toBeVisible();
}

async function accessToken(page: Page): Promise<string> {
  return page.evaluate(async () => (await (await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })).json()).access_token as string);
}

test('the Superadmin moves a class to another Faculty member; the new Faculty member signs in and sees it', async ({ page }) => {
  await signInSuperadmin(page);
  await page.goto('/superadmin/classes');
  await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible();
  await expect(page.getByText(/Preview data/i)).toHaveCount(0);
  await page.getByPlaceholder(/Search course, section or Faculty/).fill(SECTION);
  const card = page.locator('article', { hasText: SECTION });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Del Rosario');

  // Class Details: the real roster and the Class Secretary row.
  await card.getByRole('button', { name: new RegExp(`View details for .*${SECTION}`) }).click();
  const details = page.getByRole('dialog', { name: 'Class Details' });
  await expect(details.getByText('Class Secretary')).toBeVisible();
  await expect(details.locator('tbody tr').first()).toBeVisible();
  await expect(details.getByText('Preview roster only')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);

  // Change Faculty.
  await card.getByRole('button', { name: new RegExp(`Change Faculty for .*${SECTION}`) }).click();
  const dialog = page.getByRole('dialog', { name: 'Change Faculty' });
  await expect(dialog).toBeVisible();
  const target = dialog.getByLabel('New Faculty').locator('option', { hasText: 'Villanueva' });
  await expect(target).toHaveCount(1);
  await dialog.getByLabel('New Faculty').selectOption((await target.getAttribute('value')) ?? '');
  await dialog.getByLabel('Reason').fill('Live test: the Faculty member is on leave.');
  await dialog.getByRole('button', { name: 'Change Faculty' }).click();
  await expect(page.getByText(/now belongs to .*Villanueva/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Change Faculty' })).toHaveCount(0);
  await expect(page.locator('article', { hasText: SECTION })).toContainText('Villanueva');

  // The server agrees: one audit row, Superadmin as the actor.
  const superToken = await accessToken(page);
  const audit = await (await page.request.get('/api/admin/audit-logs?q=' + encodeURIComponent(SECTION), { headers: { Authorization: `Bearer ${superToken}` } })).json();
  const moved = (audit.entries as Array<{ what?: string; who?: { role?: string } }>).filter(e => e.what === 'Class Faculty changed');
  expect(moved.length).toBeGreaterThanOrEqual(1);
  expect(moved[0].who?.role).toBe('superadmin');

  // The new Faculty member opens the class (Classes & Rosters and the API), the previous one no longer has it.
  await signInFaculty(page, TO_EMAIL);
  await page.goto('/faculty/classes');
  await expect(page.getByText(SECTION).first()).toBeVisible();
  const toToken = await accessToken(page);
  const toClasses = await (await page.request.get('/api/faculty/classes', { headers: { Authorization: `Bearer ${toToken}` } })).json();
  expect(JSON.stringify(toClasses)).toContain(SECTION);

  await signInFaculty(page, FROM_EMAIL);
  const fromToken = await accessToken(page);
  const fromClasses = await (await page.request.get('/api/faculty/classes', { headers: { Authorization: `Bearer ${fromToken}` } })).json();
  expect(JSON.stringify(fromClasses)).not.toContain(SECTION);
  await page.goto('/faculty/classes');
  await expect(page.getByText(SECTION)).toHaveCount(0);
});

test('Faculty and anonymous callers are refused the Classes routes on the real backend', async ({ page }) => {
  await signInFaculty(page, 'faculty@bicol-u.edu.ph');
  const token = await accessToken(page);
  const headers = { Authorization: `Bearer ${token}` };
  expect((await page.request.get('/api/admin/classes', { headers })).status()).toBe(403);
  expect((await page.request.get('/api/admin/classes/filters', { headers })).status()).toBe(403);
  expect((await page.request.post('/api/admin/classes/change-faculty', { headers, data: { csId: 1, toUserId: 2, reason: 'Not allowed.' } })).status()).toBe(403);
  expect((await page.request.get('/api/admin/classes')).status()).toBe(401);
});
