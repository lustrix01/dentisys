// Run a measurement snippet on one page at several widths (fast loop while fitting a layout).
// usage (project root): node <skill>/scripts/measure.mjs <app.json> <role> <route> <tab|-> <snippet.js> <width>...
// snippet.js is an expression evaluated in the page, e.g.
//   [...document.querySelectorAll('button')].filter(b => /Add Student/.test(b.innerText)).map(b => b.getClientRects().length)
// Git Bash: prefix with MSYS_NO_PATHCONV=1 so "/route" is not turned into a Windows path.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = createRequire(join(process.cwd(), 'x.js'))('@playwright/test');
const [appFile, role, route, tab, fnFile, ...ws] = process.argv.slice(2);
const APP = JSON.parse(readFileSync(appFile, 'utf8'));
const fn = readFileSync(fnFile, 'utf8');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, baseURL: APP.baseURL })).newPage();
if (role !== 'public') {
  await p.goto(APP.login.path);
  await p.fill(APP.login.email, APP.accounts[role][0]); await p.fill(APP.login.password, APP.accounts[role][1]);
  await p.click(APP.login.submit);
  await p.waitForURL(u => !new RegExp(APP.login.notAfter).test(u.pathname));
}
for (const w of ws) {
  await p.setViewportSize({ width: +w, height: 900 }); await p.goto(route); await p.waitForTimeout(1200);
  if (tab !== '-') { const re = new RegExp('^\\s*' + tab), asTab = p.getByRole('tab', { name: re }); await ((await asTab.count()) ? asTab : p.getByRole('button', { name: re })).first().click(); await p.waitForTimeout(700); }
  console.log(w, JSON.stringify(await p.evaluate(fn)));
}
await b.close();
