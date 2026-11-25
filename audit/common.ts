import { createHmac } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, type Page } from '@playwright/test';

export const OUT = 'audit-output';
export const PARTS_DIR = `${OUT}/.parts`;

export const ALL_ROLES = ['public', 'superadmin', 'admin', 'faculty', 'secretary', 'student'] as const;
export type Role = (typeof ALL_ROLES)[number];

// Local seeded dev accounts only (docs/demo-accounts.md, database/seeds/development-demo.sql).
// totp: the seeded dev authenticator secret (development-demo.sql 1b); the Superadmin must pass 2FA.
// signInPath: the Superadmin signs in at its own page (12.8); everyone else uses /login.
export const ACCOUNTS: Record<Exclude<Role, 'public'>, { email: string; password: string; totp?: string; signInPath?: string }> = {
  superadmin: { email: 'superadmin@bicol-u.edu.ph', password: 'Superadmin123!', totp: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', signInPath: '/superadmin/sign-in' },
  admin: { email: 'admin@bicol-u.edu.ph', password: 'Admin123!' },
  faculty: { email: 'faculty@bicol-u.edu.ph', password: 'Faculty123!' },
  secretary: { email: 'secretary@bicol-u.edu.ph', password: 'Secretary123!' },
  student: { email: 'student@bicol-u.edu.ph', password: 'Student123!' },
};

const pick = (name: string) => (process.env[name] ?? '').split(',').map(s => s.trim()).filter(Boolean);
export const wantedRoles = (): Role[] => {
  const f = pick('AUDIT_ROLES');
  return ALL_ROLES.filter(r => !f.length || f.includes(r));
};

export type AuditDevice = { name: string; options: Record<string, unknown>; viewport: { width: number; height: number }; tier: string };

// Device list shared with the ui-fix-demo screenshots: audit/devices.json (tiers quick < core < full).
type Spec = { name: string; tier: 'quick' | 'core' | 'full'; profile?: string; w?: number; h?: number; dpr?: number; mobile?: boolean };
const SPECS: Spec[] = JSON.parse(readFileSync(join(__dirname, 'devices.json'), 'utf8')).devices;
const TIERS = ['quick', 'core', 'full'];

export function wantedDevices(): AuditDevice[] {
  const all: AuditDevice[] = SPECS.map(s => {
    // Run every profile in Chromium (only browser installed); keep viewport/UA/touch/scale.
    const { defaultBrowserType: _ignored, ...options } = s.profile
      ? (devices[s.profile] as Record<string, unknown>) ?? (() => { throw new Error(`Unknown Playwright profile: ${s.profile}`); })()
      : { viewport: { width: s.w!, height: s.h! }, deviceScaleFactor: s.dpr ?? 1, isMobile: !!s.mobile, hasTouch: !!s.mobile };
    return { name: s.name, options, viewport: options.viewport as AuditDevice['viewport'], tier: s.tier };
  });
  const f = pick('AUDIT_DEVICES');
  const tier = TIERS.indexOf(process.env.AUDIT_TIER ?? 'full');
  if (tier < 0) throw new Error('AUDIT_TIER must be quick, core or full');
  return all.filter(d => (!f.length || f.includes(d.name)) && TIERS.indexOf(d.tier) <= tier);
}

// Tab buttons found next to set*Tab(...) calls in pages/ (labels may carry a count badge after them).
export const TAB_LABEL = /^\s*(Archived Classes|Enrolled Student Roster|Assessments Manager|Grade Weights Editor|Grade Summar\w*|Import Grade Sheets|Retention Watch Lists|Retention & Remedials|Attendance Registers|Interactive Analytics|Remedials|Midterm Watchlist|Remedial Exams|Midterm Advisory|Past Courses|Archived|Upcoming Sessions)\b/i;

// Refresh tokens are single-use (reuse revokes the session), so a saved storageState cannot be
// shared between contexts: sign in once per context through the real sign-in page.
export async function signIn(page: Page, role: Role) {
  if (role === 'public') return;
  const { email, password, totp, signInPath } = ACCOUNTS[role];
  await page.goto(signInPath ?? '/login');
  await page.fill('input[inputmode="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  if (totp) {
    await page.waitForURL(u => /^\/2fa\/verify/.test(u.pathname), { timeout: 20_000 });
    await page.fill('input[inputmode="numeric"]', await freshTotp(totp));
    await page.click('button[type="submit"]');
  }
  await page.waitForURL(u => !/^\/(login|superadmin\/sign-in|2fa|mfa)/.test(u.pathname), { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
}

// The server accepts each 30-second step once, and tests run in parallel workers: claim a step no other
// sign-in of this run used (an exclusive file per step), waiting for the next step when it is taken.
export async function freshTotp(secret: string): Promise<string> {
  const dir = `${OUT}/.totp-steps`;
  mkdirSync(dir, { recursive: true });
  for (;;) {
    const step = Math.floor(Date.now() / 30000);
    try { closeSync(openSync(`${dir}/${step}`, 'wx')); return totp(secret, step); } catch { /* taken */ }
    await new Promise(r => setTimeout(r, (step + 1) * 30000 - Date.now() + 200));
  }
}

// RFC 6238 code (SHA-1, 6 digits) for a base32 secret; same as ui-fix-demo shots.mjs.
function totp(secret: string, step: number): string {
  const bits = secret.replace(/=+$/, '').toUpperCase().split('')
    .map(ch => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}
