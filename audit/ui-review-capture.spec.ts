import { test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { OUT, pickOptions, signIn, TAB_LABEL, wantedDevices, type Role } from './common';

// Capture for the ui-review agent: every state of ONE page (each tab, and what each control opens
// or changes inside it), every state shot in light AND dark from the same DOM.
// Server-safe: after sign-in every request that is not GET/HEAD/OPTIONS (except the token refresh)
// is aborted, so no click can save, delete or send anything. Sign-out, export, download and print
// controls are never clicked (a menu button that only opens their menu is). Hover and focus are not captured.
// Run: UR_ROLE=faculty UR_ROUTE=/reports [UR_SELECT=CLINIC-4A] npm run audit:ui-review

const role = (process.env.UR_ROLE ?? '') as Role;
const route = process.env.UR_ROUTE ?? '';
// Option text to choose in the page's selects first (e.g. a seeded class that has rows).
const picks = (process.env.UR_SELECT ?? '').split(',').map(s => s.trim()).filter(Boolean);
const MAX = Number(process.env.UR_MAX ?? 60); // controls clicked per tab
const SKIP = /sign ?out|log ?out|export|download|print|excel|\bpdf\b|\bcsv\b/i;
process.env.AUDIT_DEVICES ??= 'Desktop 1920,iPhone 393';

const slug = (s: string) => s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'root';
const OUT_DIR = `${OUT}/ui-review/${role}-${slug(route)}`;

type Control = { ur: number; key: string; tag: string; type: string; role: string; label: string; disabled: boolean; view: boolean; popup: boolean; options?: string[]; selected?: string };
type Log = { view: string; control: string; result: string; state?: string };

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.querySelector('.animate-pulse:not(.rounded-full)'), null, { timeout: 4_000 }).catch(() => {});
  // Recharts animates in JavaScript (not a CSS transition): give bars and pies time to finish.
  if (await page.locator('.recharts-wrapper').count().catch(() => 0)) await page.waitForTimeout(1_800);
}

// Tags each visible control in <main> (and in any open dialog) with data-ur and describes it.
// key = tag|label|n-th with that tag and label, stable across reloads.
const listControls = (page: Page) => page.evaluate((tabSrc) => {
  const TAB = new RegExp(tabSrc, 'i');
  const vis = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n: Element | null = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
  };
  const root = document.querySelector('main') ?? document.body;
  const sel = 'button, a[href], select, input:not([type=hidden]), textarea, [role=button], [role=tab], [role=switch], [role=checkbox], summary, [aria-haspopup]';
  const seen = new Map<string, number>();
  document.querySelectorAll('[data-ur]').forEach(e => e.removeAttribute('data-ur'));
  return Array.from(root.querySelectorAll(sel)).filter(vis).map((e, ur) => {
    e.setAttribute('data-ur', String(ur));
    const h = e as HTMLInputElement;
    const label = (e.getAttribute('aria-label') || (e as HTMLElement).innerText || h.placeholder || e.getAttribute('title') || h.name || '')
      .replace(/\s+/g, ' ').trim().slice(0, 70);
    const tag = e.tagName.toLowerCase();
    const k = `${tag}|${label}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const s = e as HTMLSelectElement;
    return {
      ur, key: `${k}|${n}`, tag, type: h.type ?? '', role: e.getAttribute('role') ?? '', label,
      disabled: !!h.disabled || e.getAttribute('aria-disabled') === 'true',
      view: e.getAttribute('role') === 'tab' || TAB.test(label),
      popup: !!e.getAttribute('aria-haspopup') && e.getAttribute('aria-haspopup') !== 'false',
      options: tag === 'select' ? Array.from(s.options).map(o => o.text) : undefined,
      selected: tag === 'select' ? s.selectedOptions[0]?.text : undefined,
    };
  });
}, TAB_LABEL.source) as Promise<Control[]>;

// What the user sees: URL, all visible text, open overlays. Two states with the same print look the same.
const print = async (page: Page) => createHash('sha1').update(await page.evaluate(() => {
  const open = Array.from(document.querySelectorAll('[role=dialog], [aria-modal=true], [role=menu], [role=listbox]'))
    .filter(e => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed').length;
  const checks = Array.from(document.querySelectorAll('input[type=checkbox], [aria-checked], [aria-expanded], [aria-pressed]'))
    .map(e => (e as HTMLInputElement).checked + (e.getAttribute('aria-checked') ?? '') + (e.getAttribute('aria-expanded') ?? '') + (e.getAttribute('aria-pressed') ?? '')).join('');
  return `${location.pathname}${location.search}|${open}|${checks}|${document.body.innerText}`;
})).digest('hex');

const isSearch = (c: Control) => c.tag === 'input' && (c.type === 'search' || /search|filter|find/i.test(c.label));

for (const device of wantedDevices()) test(device.name, async ({ browser }) => {
  test.skip(!role || !route, 'Set UR_ROLE and UR_ROUTE');
  const dir = `${OUT_DIR}/${device.name.replace(/\s+/g, '-')}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ ...device.options, baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:5173' });
  await context.addInitScript(() => { window.print = () => {}; });
  const page = await context.newPage();
  await signIn(page, role);
  const blocked: string[] = [];
  await context.route('**/*', r => {
    const q = r.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(q.method()) && !/\/auth\/refresh/.test(q.url())) {
      blocked.push(`${q.method()} ${new URL(q.url()).pathname}`);
      return r.abort();
    }
    return r.continue();
  });

  const states: { id: string; name: string; view: string; control: string; light: string; dark: string; url: string; focus?: number }[] = [];
  const logs: Log[] = [];
  const views: { name: string; controls: Control[] }[] = [];
  const shotPrints = new Map<string, string>();

  // One state, two shots: same DOM, only the theme class differs.
  // fullPage resizes the viewport, which closes menus that close on scroll or resize (ExportMenu):
  // states opened by a popup button are shot as the visible screen instead.
  const shoot = async (name: string, view: string, control: string, screenOnly = false, focusLoc?: ReturnType<Page["locator"]>) => {
    // Where the clicked control sits in the shot (0 = top, 1 = bottom), so the review page can scroll a thumbnail to it.
    const focus = focusLoc ? await focusLoc.evaluate((e, screen) => {
      const r = e.getBoundingClientRect();
      return screen ? (r.top + r.height / 2) / innerHeight : (r.top + scrollY + r.height / 2) / document.documentElement.scrollHeight;
    }, screenOnly).catch(() => undefined) : undefined;
    const p = await print(page);
    if (shotPrints.has(p)) return `same as state ${shotPrints.get(p)}`;
    const id = String(states.length + 1).padStart(2, '0');
    const base = `${dir}/${id}-${slug(name).slice(0, 60)}`;
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      await page.waitForTimeout(150);
      await page.waitForFunction(() => !document.getAnimations().some(a => a instanceof CSSTransition && a.playState === 'running'),
        null, { timeout: 3_000 }).catch(() => {});
      await page.screenshot({ path: `${base}-${theme}.png`, fullPage: !screenOnly });
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    states.push({ id, name, view, control, light: `${base}-light.png`, dark: `${base}-dark.png`, url: page.url(), focus });
    shotPrints.set(p, id);
    return `state ${id}`;
  };

  const applyPicks = async () => { if (await pickOptions(page, picks)) await settle(page); };
  const clickKey = async (key: string) => {
    const c = (await listControls(page)).find(x => x.key === key);
    if (!c) throw new Error(`control gone: ${key}`);
    await page.locator(`[data-ur="${c.ur}"]`).click({ timeout: 3_000 });
    await settle(page);
  };
  const restore = async (viewKey?: string) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await applyPicks();
    if (viewKey) await clickKey(viewKey);
  };

  await restore();
  const top = await listControls(page);
  const viewKeys: (string | undefined)[] = [undefined, ...top.filter(c => c.view && !c.disabled).map(c => c.key)];
  for (const viewKey of viewKeys) {
    const viewName = viewKey ? `tab ${viewKey.split('|')[1]}` : 'page as opened';
    try { await restore(viewKey); } catch (e) { logs.push({ view: viewName, control: '-', result: `error: ${(e as Error).message.split('\n')[0]}` }); continue; }
    logs.push({ view: viewName, control: '-', result: await shoot(viewName, viewName, '-') });
    const basePrint = await print(page);
    const baseUrl = page.url();
    const controls = await listControls(page);
    views.push({ name: viewName, controls });
    let clicked = 0;
    for (const c of controls) {
      const name = `${c.tag}${c.type && c.tag === 'input' ? `[${c.type}]` : ''} "${c.label}"`;
      const skip = c.view ? 'tab: own view' : c.disabled ? 'disabled' : c.tag === 'select' ? `select, options listed; selected "${c.selected}"`
        : SKIP.test(c.label) && !c.popup ? 'not clicked: sign-out/export/download/print'
        : (c.tag === 'textarea' || (c.tag === 'input' && !isSearch(c) && !['checkbox', 'radio'].includes(c.type))) ? 'input: not typed'
        : ++clicked > MAX ? `over UR_MAX (${MAX})` : '';
      if (skip) { logs.push({ view: viewName, control: name, result: skip }); continue; }
      try {
        if ((await print(page)) !== basePrint || page.url() !== baseUrl) await restore(viewKey);
        const live = (await listControls(page)).find(x => x.key === c.key);
        if (!live) { logs.push({ view: viewName, control: name, result: 'not found after reload' }); continue; }
        const loc = page.locator(`[data-ur="${live.ur}"]`);
        if (isSearch(c)) await loc.fill('zzqx-no-match'); else await loc.click({ timeout: 3_000 });
        await settle(page);
        if (new URL(page.url()).pathname !== new URL(baseUrl).pathname) {
          logs.push({ view: viewName, control: name, result: `navigates to ${new URL(page.url()).pathname}` });
          continue;
        }
        if ((await print(page)) === basePrint) { logs.push({ view: viewName, control: name, result: 'no visible change' }); continue; }
        const what = isSearch(c) ? `search "zzqx-no-match"` : `click ${name}`;
        logs.push({ view: viewName, control: name, result: await shoot(`${viewName} - ${what}`, viewName, what, c.popup, loc) });
        await page.keyboard.press('Escape').catch(() => {});
        await settle(page);
      } catch (e) {
        logs.push({ view: viewName, control: name, result: `error: ${(e as Error).message.split('\n')[0].slice(0, 120)}` });
      }
    }
  }
  await context.close();

  const manifest = { device: device.name, viewport: device.viewport, role, route, picks, states, views, logs, blocked };
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  const md = [
    `# ${role} ${route} on ${device.name} (${device.viewport.width}x${device.viewport.height})`, '',
    `Selects set to: ${picks.join(', ') || 'page defaults'}. States: ${states.length} (each in light and dark). Server writes blocked: ${blocked.length ? blocked.join(', ') : 'none attempted'}.`, '',
    '## States (open both shots of every row)', '', '| id | state | light | dark |', '|---|---|---|---|',
    ...states.map(s => `| ${s.id} | ${s.name} | ${s.light} | ${s.dark} |`), '',
    '## Every control and what happened', '', '| view | control | result |', '|---|---|---|',
    ...logs.map(l => `| ${l.view} | ${l.control.replace(/\|/g, '/')} | ${l.result.replace(/\|/g, '/')} |`), '',
    '## Select options', '',
    ...views.flatMap(v => v.controls.filter(c => c.tag === 'select').map(c => `- ${v.name}, "${c.label}": ${c.options?.map(o => (o === c.selected ? `**${o}**` : o)).join(' / ')}`)),
    '', 'Not captured: hover and focus states, native select lists drawn open, typed input other than search.', '',
  ];
  writeFileSync(`${dir}/manifest.md`, md.join('\n'));
});
