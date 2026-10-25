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

// iPhone SE / Galaxy S9+ profiles are 320px wide; Galaxy S24 (360) and iPhone SE 3rd gen (375) cover today's small phones.
const phone = ['iPhone SE', 'Galaxy S24', 'iPhone SE (3rd gen)', 'iPhone 13', 'iPhone 14 Pro Max', 'Pixel 7', 'Galaxy S9+', 'iPhone 13 landscape',
  'Pixel 7 landscape', 'iPad Mini', 'iPad Pro 11', 'iPad Mini landscape'];
const desktop = [[1280, 800], [1440, 900], [1920, 1080]];

export type AuditDevice = { name: string; options: Record<string, unknown>; viewport: { width: number; height: number } };

export function wantedDevices(): AuditDevice[] {
  const all: AuditDevice[] = [
    ...phone.map(name => {
      // Run every profile in Chromium (only browser installed); keep viewport/UA/touch/scale.
      const { defaultBrowserType: _ignored, ...options } = devices[name] as Record<string, unknown>;
      return { name, options, viewport: (options.viewport as AuditDevice['viewport']) };
    }),
    ...desktop.map(([width, height]) => ({
      name: `Desktop ${width}`, options: { viewport: { width, height } }, viewport: { width, height },
    })),
  ];
  const f = pick('AUDIT_DEVICES');
  return all.filter(d => !f.length || f.includes(d.name));
}
