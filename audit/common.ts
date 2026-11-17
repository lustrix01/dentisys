import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices } from '@playwright/test';

export const OUT = 'audit-output';
export const PARTS_DIR = `${OUT}/.parts`;

export const ALL_ROLES = ['public', 'admin', 'faculty', 'secretary', 'student'] as const;
export type Role = (typeof ALL_ROLES)[number];

// Local seeded dev accounts only (docs/demo-accounts.md, database/seeds/development-demo.sql).
export const ACCOUNTS: Record<Exclude<Role, 'public'>, { email: string; password: string }> = {
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
