import { test, expect } from './fixtures';

// Owner decision (2026-10-13): upright tablets (768-1023px) start with the sidebar collapsed
// unless the user has chosen before; other widths start as before.
async function signIn(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: 'mock-faculty-token' }) }));
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', 'faculty@bicol-u.edu.ph');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
}

for (const [width, height, collapsed] of [[768, 1024, true], [1023, 768, true], [1024, 768, false], [1440, 900, false]] as const) {
  test(`sidebar starts ${collapsed ? 'collapsed' : 'open'} at ${width}px when no choice is saved`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signIn(page);
    await expect(page.getByRole('button', { name: collapsed ? 'Expand sidebar' : 'Collapse sidebar' })).toBeVisible();
  });
}

test('a saved sidebar choice wins over the tablet default', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dentisys_sidebar_collapsed', 'false'));
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});
