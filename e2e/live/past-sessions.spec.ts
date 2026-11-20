import { test, expect } from '@playwright/test';

// Backlog 13.6 Past Sessions tab against a real backend (read-only): the Faculty opens Sessions for a class that has
// ended sessions, picks Past Sessions, sees counts, and a card opens that session's roll call.
const EMAIL = process.env.E2E_FACULTY_EMAIL ?? 'faculty@bicol-u.edu.ph';
const PASSWORD = process.env.E2E_FACULTY_PASSWORD ?? 'Faculty123!';

test('Faculty opens a past roll call from the Past Sessions tab', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('form button[type="submit"]').last().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  await page.goto('/attendance');
  const sessionsButtons = page.getByRole('button', { name: 'Sessions', exact: true });
  await expect(sessionsButtons.first()).toBeVisible({ timeout: 20_000 });

  // Find a class whose Past Sessions tab lists at least one session with counts.
  const total = await sessionsButtons.count();
  let card = null;
  for (let i = 0; i < total && !card; i++) {
    await sessionsButtons.nth(i).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Past Sessions/ }).click();
    // Wait for the list to settle: either the empty text or a card with its counts.
    await expect(dialog.getByText(/No past sessions yet\.|\d+ Present/).first()).toBeVisible({ timeout: 15_000 });
    const first = dialog.locator('button').filter({ hasText: /\d+ Present/ }).first();
    if (await first.count()) {
      card = first;
    } else {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  }
  expect(card, 'a class with at least one past session').not.toBeNull();

  const date = (await card!.locator('span').first().innerText()).trim();
  await card!.click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const iso = new Date(`${date} 12:00`).toISOString().slice(0, 10);
  await expect(page.locator('input[type="date"]').first()).toHaveValue(iso);
});
