import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS, OUT, PARTS_DIR, wantedDevices, wantedRoles, type Role } from './common';

// Read-only sweep: only navigates, scrolls, opens the modals listed below and presses Escape.
// Never submits, saves, deletes or clicks Start/End/Revoke/Approve.

// Routes per role: App.tsx route table + sidebar nav in components/Layout.tsx (admin/faculty/
// secretary/student nav lists). Detail pages that need an id are left out.
const ROUTES: Record<Role, string[]> = {
  public: ['/landing', '/login'],
  admin: ['/', '/admin/faculty-invite', '/admin/faculty-approval', '/admin/retention-criteria', '/admin/reports',
    '/admin/audit-trail', '/admin/users', '/admin/audit', '/admin/profile', '/admin/settings', '/admin/rules'],
  faculty: ['/', '/classes', '/students', '/grades', '/retention', '/attendance', '/reports', '/email-management',
    '/faculty/audit-trail', '/attendance?tab=activity','/faculty/profile', '/faculty/settings'],
  secretary: ['/', '/secretary/start-session', '/secretary/attendance', '/secretary/override', '/secretary/audit-trail',
    '/secretary/profile', '/secretary/settings', '/student/attendance', '/student/classes'],
  student: ['/student/dashboard', '/student/attendance', '/student/attendance-logs', '/student/face-registration',
    '/student/classes', '/student/retention', '/student/profile'],
};

// Modals opened (and closed with Escape). Explicit and small:
//  1. Landing "Browse FAQ" button (LandingPage.tsx FAQ modal)
//  2. Phone/tablet hamburger in the Layout header (sidebar drawer), on the dashboard pages only
//  3. One safe button per signed-in page whose whole label is View / Details / Help / FAQ / How to ...
const SAFE_MODAL_BUTTON = /^(view|details|help|faq|how to\b.*)$/i;
// Tab buttons found next to set*Tab(...) calls in pages/ (labels may carry a count badge after them).
const TAB_LABEL = /^\s*(Archived Classes|Enrolled Student Roster|Assessments Manager|Grade Weights Editor|Grade Summar\w*|Import Grade Sheets|Retention Watch Lists|Attendance Registers|Interactive Analytics|Remedials|Midterm Watchlist|Remedial Exams|Midterm Advisory|Past Courses|Archived|Upcoming Sessions)\b/i;

const themes = (process.env.AUDIT_THEMES ?? 'light,dark').split(',').map(s => s.trim()).filter(Boolean);
const routeFilter = process.env.AUDIT_ROUTES;

type Finding = { kind: string; severity: 'high' | 'medium' | 'low'; selector: string; text: string; rect: number[] };

// Runs in the page. Returns raw findings for the current scroll position.
function inPageCheck(): Finding[] {
  const out: Finding[] = [];
  const W = window.innerWidth, H = window.innerHeight;
  const css = (e: Element) => getComputedStyle(e);
  const path = (e: Element) => {
    const parts: string[] = [];
    for (let n: Element | null = e; n && parts.length < 3 && n !== document.body; n = n.parentElement) {
      const cls = typeof n.className === 'string'
        ? n.className.trim().split(/\s+/).filter(c => c && !/[:\[\]\/]/.test(c)).slice(0, 2).join('.') : '';
      parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls ? '.' + cls : ''));
    }
    return parts.join(' > ');
  };
  const add = (kind: string, severity: Finding['severity'], e: Element, r: DOMRect) => {
    const text = ((e as HTMLElement).innerText || e.getAttribute('aria-label') || (e as HTMLInputElement).value || '')
      .replace(/\s+/g, ' ').trim().slice(0, 60);
    out.push({ kind, severity, selector: path(e), text, rect: [r.left, r.top, r.width, r.height].map(Math.round) });
  };
  const isClip = (v: string) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip';
  // Visible and not clipped away by an ancestor scroller at its centre point.
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    for (let n: Element | null = e; n; n = n.parentElement) {
      const s = css(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || n.getAttribute('aria-hidden') === 'true') return false;
    }
    if (r.right <= 0 || r.bottom <= 0 || r.left >= W) return false; // drawers translated out of view
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = css(n);
      if (isClip(s.overflowX) || isClip(s.overflowY)) {
        const p = n.getBoundingClientRect();
        if (cx < p.left || cx > p.right || cy < p.top || cy > p.bottom) return false;
      }
    }
    return true;
  };
  const inXClip = (e: Element) => {
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) if (isClip(css(n).overflowX)) return true;
    return false;
  };
  const all = Array.from(document.body.querySelectorAll('*'));

  // 1. page horizontal overflow
  const de = document.documentElement;
  if (de.scrollWidth > W + 1) {
    add('page-overflow', 'high', de, new DOMRect(0, 0, de.scrollWidth, de.scrollHeight));
    let n = 0;
    for (const e of all) {
      if (n >= 4) break;
      const r = e.getBoundingClientRect();
      const p = e.parentElement;
      if (r.right > W + 1 && visible(e) && !inXClip(e) && css(e).position !== 'fixed' &&
        !(p && p.getBoundingClientRect().right > W + 1 && visible(p) && !inXClip(p))) {
        add('overflow-element', 'high', e, r); n++;
      }
    }
  }

  // 2. text overflow in controls / chips
  for (const e of document.querySelectorAll('button, a, [role=button], label, span.inline-flex')) {
    const s = css(e);
    if (s.display === 'inline' || s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
    if (e.scrollWidth > e.clientWidth + 1 && visible(e)) {
      const ell = s.textOverflow === 'ellipsis';
      add(ell ? 'truncated' : 'text-overflow', ell ? 'low' : 'medium', e, e.getBoundingClientRect());
    }
  }

  const interactive = Array.from(document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex="-1"])'))
    .filter(e => !(e as HTMLInputElement).disabled && (e as HTMLInputElement).type !== 'hidden' && visible(e));
  for (const e of interactive) {
    const r = e.getBoundingClientRect();
    // 3. small targets (inline text links are exempt)
    if ((r.width < 24 || r.height < 24) && !(e.tagName === 'A' && css(e).display === 'inline')) add('small-target', 'medium', e, r);
    // 4. covered controls
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx <= W && cy <= H) {
      const top = document.elementFromPoint(cx, cy);
      const label = (e as HTMLInputElement).labels?.[0];
      if (top && !(e.contains(top) || top.contains(e) || (label && (label.contains(top) || top.contains(label))))) {
        // Scrolled under a sticky/fixed bar is normal scrolling, so it is only a low 'under-bar' note.
        let bar = false;
        for (let n: Element | null = top; n; n = n.parentElement) if (/fixed|sticky/.test(css(n).position)) bar = true;
        add(bar ? 'under-bar' : 'covered', bar ? 'low' : 'high', e, r);
        out[out.length - 1].text += ' <- ' + path(top).slice(-60);
      }
    }
  }

  // 5. fixed/sticky overlaps
  const fx = all.filter(e => {
    const s = css(e);
    return (s.position === 'fixed' || s.position === 'sticky') && s.pointerEvents !== 'none' && visible(e);
  }).filter(e => { const r = e.getBoundingClientRect(); return !(r.width >= W * 0.95 && r.height >= H * 0.95); }).slice(0, 60);
  for (let i = 0; i < fx.length; i++) for (let j = i + 1; j < fx.length; j++) {
    if (fx[i].contains(fx[j]) || fx[j].contains(fx[i])) continue;
    const a = fx[i].getBoundingClientRect(), b = fx[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 4 && h > 4) add('fixed-overlap', 'medium', fx[i], a);
  }

  // 7. content escaping its card (the Face Registration miss): a control or text leaf whose box pokes
  //    past the nearest bordered/filled ancestor, with no horizontal scroller in between.
  const boxed = (n: Element) => {
    const s = css(n);
    return parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0 ||
      (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent');
  };
  const leaves = all.filter(e => {
    if (!visible(e)) return false;
    if (e.matches('button, a, input, select, textarea, img, svg, [role=button]')) return true;
    return Array.from(e.childNodes).some(c => c.nodeType === 3 && c.textContent!.trim().length > 1);
  });
  for (const e of leaves) {
    if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
    const s = css(e);
    if (s.position === 'absolute' || s.position === 'fixed') continue; // badges/dots placed on purpose
    const r = e.getBoundingClientRect();
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const ns = css(n);
      if (ns.overflowX === 'auto' || ns.overflowX === 'scroll') break;
      if (ns.position === 'fixed' && n.getBoundingClientRect().width >= W * 0.95) break; // overlay backdrops
      if (!boxed(n)) continue;
      const p = n.getBoundingClientRect();
      if (p.width < 40) break;
      const over = Math.max(p.left - r.left, r.right - p.right);
      if (over > 2) add(isClip(ns.overflowX) ? 'clipped-by-card' : 'escapes-card', 'high', e, r);
      break;
    }
  }

  // 8. text cut off inside a clipping element (no ellipsis, no line clamp)
  for (const e of leaves) {
    const s = css(e);
    if (!isClip(s.overflowX) && !isClip(s.overflowY)) continue;
    if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && s.webkitLineClamp !== '') continue;
    if (e.matches('input, select, textarea, img, svg')) continue;
    if ((isClip(s.overflowX) && e.scrollWidth > e.clientWidth + 2) || (isClip(s.overflowY) && s.overflowY !== 'auto' && s.overflowY !== 'scroll' && e.scrollHeight > e.clientHeight + 2))
      add('clipped-text', 'medium', e, e.getBoundingClientRect());
  }

  // 9. text leaves drawn on top of each other
  const texts = leaves.filter(e => !e.matches('img, svg, input, select, textarea') && css(e).opacity !== '0')
    .map(e => ({ e, r: e.getBoundingClientRect() })).filter(t => t.r.bottom > 0 && t.r.top < H).slice(0, 700);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 6 && h > 6) { add('text-overlap', 'high', a.e, a.r); out[out.length - 1].text += ' x ' + ((b.e as HTMLElement).innerText || '').slice(0, 30); }
  }

  // 10. a single word broken across two lines (e.g. "ATTENDAN / CE RATE")
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let splits = 0;
  for (let t = walker.nextNode(); t && splits < 40; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || !visible(el)) continue;
    const s = t.textContent!;
    for (const m of s.matchAll(/[A-Za-z0-9.%]{3,}/g)) {
      const range = document.createRange();
      range.setStart(t, m.index!); range.setEnd(t, m.index! + m[0].length);
      const lines = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)));
      if (lines.size > 1) { add('word-split', 'medium', el, el.getBoundingClientRect()); out[out.length - 1].text = m[0]; splits++; break; }
    }
  }

  // 12. short buttons / chips whose label wraps onto two lines ("Add / Student", "DENT101- / 1A")
  for (const e of document.querySelectorAll('button, a, [role=button], span, label')) {
    const label = (e as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '';
    if (!label || label.length > 30 || !visible(e)) continue;
    const s = css(e);
    const chip = e.matches('button, a, [role=button]') || parseFloat(s.borderLeftWidth) > 0 ||
      (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent');
    if (!chip) continue;
    // text nodes only (icons sit at a different height); a new line = a text box starting >= 1 line-height lower
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const boxes: DOMRect[] = [];
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent!.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      boxes.push(...Array.from(range.getClientRects()).filter(r => r.width > 1));
    }
    if (boxes.length > 1 && boxes.some(b => b.top >= boxes[0].bottom - 2)) add('squeezed-label', 'medium', e, e.getBoundingClientRect());
  }

  // 11. low text contrast (WCAG ratio < 3) against the nearest painted background
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const rgba = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
  for (const e of leaves) {
    if (e.matches('img, svg, input, select, textarea') || !(e as HTMLElement).innerText?.trim()) continue;
    const s = css(e);
    if (parseFloat(s.opacity) < 1 || e.closest('[disabled], [aria-disabled=true]')) continue;
    const fg = rgba(s.color);
    if (fg.length > 3 && fg[3] < 0.5) continue;
    let bg: number[] | null = null;
    for (let n: Element | null = e; n; n = n.parentElement) {
      const b = css(n);
      if (b.backgroundImage !== 'none') { bg = null; break; } // gradients/images: skip
      const c = rgba(b.backgroundColor);
      if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) { bg = c; break; }
    }
    if (!bg) continue;
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    if (ratio < 3) { add('low-contrast', ratio < 2 ? 'high' : 'medium', e, e.getBoundingClientRect()); out[out.length - 1].text += ` (${ratio.toFixed(1)}:1)`; }
  }

  // 6. modals taller than the viewport that cannot scroll
  const overlays = new Set<Element>(document.querySelectorAll('[role=dialog], [aria-modal=true]'));
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (css(e).position === 'fixed' && r.width >= W * 0.95 && r.height >= H * 0.95 && e.firstElementChild) overlays.add(e);
  }
  for (const o of overlays) {
    if (!visible(o)) continue;
    const panel = (o.matches('[role=dialog], [aria-modal=true]') ? o : o.firstElementChild) as HTMLElement;
    if (!panel || panel.getBoundingClientRect().height < 1) continue;
    const tall = panel.getBoundingClientRect().height > H + 1 || panel.scrollHeight > panel.clientHeight + 1;
    let scrolls = false;
    for (let n: Element | null = panel; n; n = n.parentElement) {
      const v = css(n).overflowY;
      if (v === 'auto' || v === 'scroll') scrolls = true;
      if (n === o) break;
    }
    if (tall && !scrolls) add('modal-no-scroll', 'high', panel, panel.getBoundingClientRect());
  }
  return out;
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.waitForFunction(() => !document.querySelector('.animate-pulse:not(.rounded-full)'), null, { timeout: 4_000 }).catch(() => {});
}

async function scrollAll(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (const e of document.querySelectorAll('*')) {
      const v = getComputedStyle(e).overflowY;
      if ((v === 'auto' || v === 'scroll') && e.scrollHeight > e.clientHeight + 1) e.scrollTop = e.scrollHeight;
    }
  });
  await page.waitForTimeout(300);
}

function dedupe(list: Finding[]) {
  const seen = new Set<string>();
  return list.filter(f => { const k = `${f.kind}|${f.selector}|${f.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const slug = (s: string) => (s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'root');

for (const device of wantedDevices()) for (const role of wantedRoles()) {
  const routes = ROUTES[role].filter(r => !routeFilter || routeFilter.split(',').some(f => r.includes(f.trim())));
  if (!routes.length) continue;
  test(`${device.name} / ${role}`, async ({ browser }) => {
    const context = await browser.newContext({
      ...device.options,
      baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:5173',
    });
    const page = await context.newPage();
    // Refresh tokens are single-use (reuse revokes the session), so a saved storageState cannot be
    // shared between contexts: sign in once per device x role through the real /login page.
    if (role !== 'public') {
      const { email, password } = ACCOUNTS[role];
      await page.goto('/login');
      await page.fill('input[inputmode="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForURL(u => !/^\/(login|2fa|mfa)/.test(u.pathname), { timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    }
    const entries: unknown[] = [];

    const record = async (theme: string, label: string, extra: Finding[] = []) => {
      const findings = [...extra];
      await page.evaluate(t => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      await page.waitForTimeout(150);
      findings.push(...await page.evaluate(inPageCheck));
      await scrollAll(page);
      findings.push(...await page.evaluate(inPageCheck));
      const shot = `${OUT}/${device.name.replace(/\s+/g, '-')}/${role}/${theme}/${slug(label)}.png`;
      mkdirSync(shot.replace(/\/[^/]+$/, ''), { recursive: true });
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      entries.push({ device: device.name, viewport: device.viewport, role, theme, route: label, url: page.url(), screenshot: shot, findings: dedupe(findings) });
    };

    // The account theme is re-applied after load, so the app's own 'dark' class is forced after settling.
    for (const theme of themes) for (const route of routes) {
      const problems: Finding[] = [];
      const err = (text: string) => problems.push({ kind: 'load-error', severity: 'high', selector: 'page', text: text.slice(0, 60), rect: [0, 0, 0, 0] });
      try {
        const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
        if (res && !res.ok()) err(`HTTP ${res.status()}`);
        await settle(page);
        const path = new URL(page.url()).pathname;
        if (role !== 'public' && /^\/(login|landing)/.test(path)) err(`redirected to ${path}`);
        if (await page.getByText(/something went wrong|page not found/i).first().isVisible().catch(() => false)) err('error page text visible');
      } catch (e) {
        err(String((e as Error).message).split('\n')[0]);
      }
      await record(theme, route, problems);

      // Modals (read-only: open, check, Escape).
      const tryModal = async (label: string, open: () => Promise<boolean>) => {
        try {
          if (!(await open())) return;
          await page.waitForTimeout(500);
          await record(theme, `${route}#${label}`);
        } catch { /* modal not available at this size */ }
        await page.keyboard.press('Escape').catch(() => {});
      };
      if (route === '/landing') {
        await tryModal('faq', async () => { await page.getByRole('button', { name: /browse faq/i }).click({ timeout: 3000 }); return true; });
      }
      if (role !== 'public' && (route === '/' || route === '/student/dashboard')) {
        await tryModal('menu', async () => {
          const b = page.locator('header button:has(svg.lucide-menu)').first();
          if (!(await b.isVisible())) return false;
          await b.click({ timeout: 3000 });
          return true;
        });
      }
      // In-page tabs: state switches only, never saves.
      if (role !== 'public' && !process.env.AUDIT_NO_TABS) {
        const tabs = page.getByRole('button', { name: TAB_LABEL });
        const n = await tabs.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const t = tabs.nth(i);
          const name = ((await t.innerText().catch(() => '')) || 'tab').split('\n')[0].slice(0, 30);
          try {
            if (!(await t.isVisible())) continue;
            await t.click({ timeout: 3000 });
            await settle(page);
            await record(theme, `${route}#tab-${name}`);
          } catch { /* tab gone */ }
        }
      }
      if (role !== 'public') {
        const before = page.url();
        await tryModal('view-button', async () => {
          const buttons = page.getByRole('button', { name: SAFE_MODAL_BUTTON });
          if (!(await buttons.count())) return false;
          await buttons.first().click({ timeout: 3000 });
          await page.waitForTimeout(300);
          if (page.url() !== before) { await page.goBack().catch(() => {}); return false; }
          return await page.locator('[role=dialog], [aria-modal=true]').first().isVisible().catch(() => false);
        });
      }
    }
    await context.close();
    writeFileSync(`${PARTS_DIR}/${randomUUID()}.json`, JSON.stringify(entries));
  });
}
