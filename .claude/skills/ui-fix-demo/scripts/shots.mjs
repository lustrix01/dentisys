// Real-app screenshots for a Before/After demo: one full viewport shot + one close-up per target,
// plus a meta JSON that verify.py uses to prove the shot shows the right thing.
// usage (from the project root, app running):
//   node <skill>/scripts/shots.mjs <app.json> <targets.json> <outDir> <before|after|A|B|C>
// writes <outDir>/<mode>/{vp,crop,meta}/<id>-<Device>-<theme>.{png,json}
// app.json accounts: role => [email, password, optional dev TOTP secret; with it the 2FA code step is filled in].
// app.json login.paths: role => sign-in page, when it is not login.path.
// endsOn: the page a flow is meant to end on when it is not the route (verify.py checks it instead of route).
// target fields: id, device (a name from audit/devices.json, a tier "quick"|"core"|"full" = every device in it,
//   a Playwright profile or "Desktop 1440 900"), role, route, mock?, tab?, fill?, upload?, click?, steps?, sel?, text? (regex),
//   select? ([selector, option label]), stepsAfter? (steps run after select), closest? (CSS selector to frame), up? (parent hops), theme? ("light"|"dark"), full?, expect? ("same"),
//   noScroll? (no scrolling, viewport shot: open menus/popovers that close on scroll), print? (print view: window.print stubbed, print media, full page)
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve Playwright from the project, not from the skill folder.
const { chromium, devices } = createRequire(join(process.cwd(), 'x.js'))('@playwright/test');
const [appFile, targetFile, outDir, mode] = process.argv.slice(2);
if (!/^(before|after|[A-Z])$/.test(mode ?? '')) throw new Error('usage: shots.mjs app.json targets.json outDir before|after|A|B|C');
const APP = JSON.parse(readFileSync(appFile, 'utf8'));
// Shared device list (same as audit:devices); tiers nest: quick < core < full.
const SPECS = JSON.parse(readFileSync(join(process.cwd(), 'audit', 'devices.json'), 'utf8')).devices;
const TIERS = ['quick', 'core', 'full'];
const T = JSON.parse(readFileSync(targetFile, 'utf8')).flatMap(t => TIERS.includes(t.device)
  ? SPECS.filter(s => TIERS.indexOf(s.tier) <= TIERS.indexOf(t.device)).map(s => ({ ...t, device: s.name }))
  : [t]);
const dirs = Object.fromEntries(['vp', 'crop', 'meta'].map(d => [d, join(outDir, mode, d)]));
Object.values(dirs).forEach(d => mkdirSync(d, { recursive: true }));

const spec = name => SPECS.find(s => s.name === name);
const dev = name => spec(name) ? (s => s.profile ? dev(s.profile)
    : { viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr ?? 1, isMobile: !!s.mobile, hasTouch: !!s.mobile })(spec(name))
  : /^Desktop \d/.test(name)
  ? { viewport: { width: +name.split(' ')[1], height: +(name.split(' ')[2] ?? 900) } }
  : (({ defaultBrowserType, ...o }) => o)(devices[name] ?? (() => { throw new Error('unknown device ' + name); })());

let totpLastStep = Math.floor(Date.now() / 30000);
/** RFC 6238 code (SHA-1, 6 digits, 30 s) for a base32 secret; dev accounts only (app.json accounts[role][2]). */
function totp(secret) {
  const bits = secret.replace(/=+$/, '').toUpperCase().split('').map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

const browser = await chromium.launch();
const groups = new Map();
for (const t of T) { const k = t.device + '|' + t.role; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
let failed = 0;
for (const [k, list] of groups) {
  const [device, role] = k.split('|');
  const opts = dev(device);
  const ctx = await browser.newContext({ ...opts, baseURL: APP.baseURL, colorScheme: 'light' });
  await ctx.addInitScript(() => { window.print = () => {}; }); // print views stay rendered for print: true targets
  const page = await ctx.newPage();
  let pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message)); // a crashed page screenshots as blank: fail the target instead
  if (role !== 'public') {
    const [email, password, totpSecret] = APP.accounts[role];
    await page.goto(APP.login.paths?.[role] ?? APP.login.path); // 12.8: the Superadmin has its own sign-in page
    await page.fill(APP.login.email, email);
    await page.fill(APP.login.password, password);
    await page.click(APP.login.submit);
    if (totpSecret) { // seeded dev account with authenticator 2FA (the Superadmin): type a code from a fresh step
      await page.waitForURL(u => /^\/2fa\/verify/.test(u.pathname), { timeout: 20000 });
      // The server accepts each 30-second step once; wait for a step no earlier sign-in (this run or another) used.
      while (Math.floor(Date.now() / 30000) <= totpLastStep) await page.waitForTimeout(1000);
      totpLastStep = Math.floor(Date.now() / 30000);
      await page.fill('input[inputmode="numeric"]', totp(totpSecret));
      await page.click('button[type="submit"]');
    }
    await page.waitForURL(u => !new RegExp(APP.login.notAfter).test(u.pathname), { timeout: 20000 });
  }
  for (const t of list) {
    const theme = t.theme ?? 'light';
    const name = `${t.id}-${device.replace(/\W+/g, '')}-${theme}`;
    const meta = { ...t, theme, mode, viewport: page.viewportSize(), dpr: opts.deviceScaleFactor ?? 1, isMobile: !!opts.isMobile };
    try {
      pageErrors = [];
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      // mock: [{url: glob, json: body}] answers an API call with a fixed body, for states the seed data cannot reach
      for (const m of t.mock ?? []) await page.route(m.url, route => route.fulfill({ json: m.json }));
      await page.goto(t.route); await page.waitForLoadState('networkidle').catch(() => {});
      await page.evaluate(([cls, on]) => document.documentElement.classList.toggle(cls, on), [APP.darkClass ?? 'dark', theme === 'dark']);
      await page.waitForTimeout(APP.settleMs ?? 900); // let colour transitions finish
      if (t.tab) { const tabRe = new RegExp('^\\s*' + t.tab), asTab = page.getByRole('tab', { name: tabRe }); await ((await asTab.count()) ? asTab : page.getByRole('button', { name: tabRe })).first().click(); await page.waitForTimeout(800); }
      if (t.fill) { await page.fill(t.fill[0], t.fill[1]); await page.waitForTimeout(500); } // [selector, value], typed before click      // steps: [{role?, name?} | {css, text?}, nth?, wait?] clicked in order before select/click, for states several clicks deep
      for (const s of t.steps ?? []) {
        const l = s.role ? page.getByRole(s.role, { name: new RegExp(s.name, 'i') }) : page.locator(s.css, s.text ? { hasText: new RegExp(s.text) } : undefined);
        await l.nth(s.nth ?? 0).click(); await page.waitForTimeout(s.wait ?? 900);
      }
      // fillAfter: [[selector, value], ...] typed after steps, for fields inside a dialog a step opened
      for (const [sel, val] of t.fillAfter ?? []) { await page.locator(sel).filter({ visible: true }).first().fill(val); await page.waitForTimeout(400); }
      // upload: [file input selector, absolute path or paths], after steps so a dialog opened by a step can take the file
      if (t.upload) { await page.setInputFiles(t.upload[0], t.upload[1]); await page.waitForTimeout(1500); }
      // select: [selector, option label]; skipped when the control exists on one side only (a new filter)
      if (t.select) { const s = page.locator(t.select[0]).filter({ visible: true, has: page.locator('option', { hasText: t.select[1] }) }); if (await s.count()) { await s.first().selectOption({ label: t.select[1] }); await page.waitForTimeout(1200); } else meta.selectSkipped = true; }
      // stepsAfter: like steps, but after select (a filter that must be set before the click it leads to)
      for (const s of t.stepsAfter ?? []) {
        const l = s.role ? page.getByRole(s.role, { name: new RegExp(s.name, 'i') }) : page.locator(s.css, s.text ? { hasText: new RegExp(s.text) } : undefined);
        await l.nth(s.nth ?? 0).click(); await page.waitForTimeout(s.wait ?? 900);
      }
      if (t.click) { await page.locator('button', { hasText: new RegExp(t.click, 'i') }).filter({ visible: true }).first().click(); await page.waitForTimeout(800); }
      // then: [[selector, value] (fill) | {click: regex} | {check: selector}, ...] after click, for flows that continue on the next page
      for (const s of t.then ?? []) {
        if (Array.isArray(s)) await page.locator(s[0]).filter({ visible: true }).first().fill(s[1]);
        else if (s.check) await page.locator(s.check).filter({ visible: true }).first().check();
        else await page.locator('button', { hasText: new RegExp(s.click, 'i') }).filter({ visible: true }).first().click();
        await page.waitForTimeout(800);
      }
      meta.url = new URL(page.url()).pathname + new URL(page.url()).search;
      if (pageErrors.length) throw new Error(`page error: ${pageErrors[0]} (a mock object missing fields? copy it whole)`);
      if (t.print) { await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(500); }
      if ((t.text || t.sel) && !t.noScroll && !t.print) {
        const loc = page.locator(t.sel ?? 'button, a, input, select, span, p, h1, h2, h3, h4, label, td', { hasText: t.text ? new RegExp(t.text) : undefined }).filter({ visible: true });
        meta.matchCount = await loc.count();
        if (!meta.matchCount) throw new Error(`nothing visible matches ${t.sel ?? ''} /${t.text ?? ''}/`);
        const el = loc.first();
        await el.scrollIntoViewIfNeeded();
        const info = await el.evaluate((e, up) => {
          let n = e;
          if (up.closest) n = e.closest(up.closest) ?? e;
          else {
            for (let i = 0; i < up.up && n.parentElement; i++) n = n.parentElement;
            for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) { // nearest card
              const s = getComputedStyle(p);
              if (parseFloat(s.borderLeftWidth) > 0 || s.backgroundColor !== 'rgba(0, 0, 0, 0)') { n = p; break; }
            }
          }
          n.scrollIntoView({ block: 'center' });
          const r = n.getBoundingClientRect(), er = e.getBoundingClientRect();
          return { matched: e.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '', frameText: n.innerText?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? '',
            box: { x: r.left, y: r.top, w: r.width, h: r.height }, el: { x: er.left, y: er.top, w: er.width, h: er.height } };
        }, { up: t.up ?? 0, closest: t.closest });
        Object.assign(meta, info);
        await page.waitForTimeout(700); // smooth-scroll pages are still moving right after scrollIntoView
        const vp = page.viewportSize(), b = info.box;
        const x = Math.max(0, b.x - 12), y = Math.max(0, b.y - 12);
        meta.clip = { x, y, width: Math.min(vp.width - x, b.w + 24), height: Math.min(vp.height - y, b.h + 24) };
        await page.screenshot({ path: join(dirs.crop, name + '.png'), clip: meta.clip });
      } else {
        meta.matchCount = null;
        // printTop: N frames a print close-up on the page's first N px (header, counts, first rows); the vp shot keeps the full page
        const top = t.print && t.printTop ? { clip: { x: 0, y: 0, width: page.viewportSize().width, height: t.printTop } } : {};
        await page.screenshot({ path: join(dirs.crop, name + '.png'), fullPage: !!(t.full || t.print), ...top });
      }
      await page.screenshot({ path: join(dirs.vp, name + '.png'), fullPage: !!t.print });
      if (t.print) await page.emulateMedia({ media: 'screen' });
      writeFileSync(join(dirs.meta, name + '.json'), JSON.stringify(meta, null, 1));
      console.log('ok  ', name, meta.matchCount > 1 ? `(${meta.matchCount} matches: check framing)` : '');
    } catch (e) { failed++; console.log('FAIL', name, String(e.message).split('\n')[0]); }
  }
  await ctx.close();
}
await browser.close();
process.exitCode = failed ? 1 : 0;
