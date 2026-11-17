// Smoke-test a built demo page: no JS errors, picking a version and holding B flip the image, no sideways scroll on a phone, plus a screenshot to look at.
// usage (project root): node <skill>/scripts/smoke-demo.mjs <demo.html> <out.png>
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'x.js'))('@playwright/test');
const b = await chromium.launch();
const url = 'file:///' + process.argv[2].replace(/\\/g, '/');
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url, { waitUntil: 'domcontentloaded' });
const shown = () => p.locator('#device img.on').getAttribute('src');
const start = await shown();
await p.locator('.col').last().click();
const picked = await shown();
await p.keyboard.down('b'); const peek = await shown(); await p.keyboard.up('b');
const phone = await b.newPage({ viewport: { width: 360, height: 800 } });
await phone.goto(url, { waitUntil: 'domcontentloaded' });
const hscroll = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log(JSON.stringify({
  errs, title: await p.title(), h1: await p.textContent('h1'), versions: await p.locator('.col').count(),
  devs: await p.locator('.dv').allTextContents(), flipped: start !== picked || picked !== peek, peekWorks: peek !== picked,
  phoneSidewaysScroll: hscroll, rows: await p.locator('#changes tr').count(), checked: await p.locator('#checked li').count(),
}));
await p.screenshot({ path: process.argv[3] }); await b.close();
