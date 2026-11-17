// EXAMPLE (local dev stack only): Playwright checks of states that need data changes. Seeded dev passwords only; mail goes to Mailpit.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(process.cwd() + '/x.js')('@playwright/test');
const out = 'audit-output/openA/states';
const api = 'http://localhost:5173/api';
const browser = await chromium.launch();
const login = async (email, password) => (await (await fetch(api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
async function signIn(ctx, user, password) {
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/login');
  await page.fill('input[inputmode="email"]', user);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !/\/login/.test(u.pathname), { timeout: 20000 });
  return page;
}
const shot = async (page, name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

// A. New Faculty with no classes → first-steps card (Mailpit only; invite link shown in dev).
const admin = await login('admin@bicol-u.edu.ph', 'Admin123!');
const inv = await (await fetch(api + '/admin/faculty-invitations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + admin },
  body: JSON.stringify({ email: 'cara.testfirst@bicol-u.edu.ph', firstName: 'Cara', lastName: 'Testfirst' }) })).json();
const token = new URL(inv.invitation_link).searchParams.get('token');
const act = await (await fetch(api + '/auth/faculty/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'Faculty123!' }) })).json();
console.log('activate', act.status);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const cara = await signIn(ctx, 'cara.testfirst', 'Faculty123!');
await shot(cara, 'a-first-steps-card');

// B. Room clash inline (Ana's Create Class with a room already used Mon/Wed 08:00).
const ana = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }), 'ana.testcruz', 'Faculty123!');
await ana.goto('http://localhost:5173/classes');
await ana.getByRole('button', { name: /^\s*Create Class\s*$/ }).first().click();
await ana.getByPlaceholder('e.g. DENT 301').fill('CLASH 101');
await ana.getByPlaceholder('e.g. Restorative Dentistry I').fill('Clash check');
await ana.getByPlaceholder('e.g. 4B or Section 3-A').fill('9Z');
await ana.locator('select', { has: ana.locator('option', { hasText: 'Lecture Hall A' }) }).first().selectOption('Lecture Hall A');
await ana.getByRole('button', { name: 'Mon/Wed' }).first().click();
await ana.getByRole('button', { name: /Save Class Section/ }).click();
await ana.waitForTimeout(2500);
const clash = ana.getByText(/already uses/).last();
await clash.scrollIntoViewIfNeeded().catch(() => {});
await shot(ana, 'b-room-clash-inline');

// C. Academic Terms: end before start → how many copies of the error.
const dean = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }), 'admin', 'Admin123!');
await dean.goto('http://localhost:5173/admin/terms');
await dean.getByRole('button', { name: /Add term/ }).click();
await dean.locator('input[type=date]').nth(0).fill('2027-12-01');
await dean.locator('input[type=date]').nth(1).fill('2027-11-01');
await dean.getByRole('button', { name: /Save term/ }).click();
await dean.waitForTimeout(1500);
console.log('terms error copies', await dean.getByText('End date must be after start date.').count());
await shot(dean, 'c-terms-error');

// D. Approved Secretary request label on the Secretary roll call.
const sec = await signIn(await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined }), 'secretary', 'Secretary123!');
await sec.goto('http://localhost:5173/secretary/attendance');
await sec.getByRole('button', { name: /View Attendance/ }).first().click();
await sec.waitForTimeout(2500);
const lbl = sec.getByText(/approved by Faculty/).first();
await lbl.scrollIntoViewIfNeeded().catch(() => {});
console.log('approved label count', await sec.getByText(/Secretary \(approved by Faculty\)/).count());
await shot(sec, 'd-approved-label');
await browser.close();
