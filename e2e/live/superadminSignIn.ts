import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// The dev-seeded Superadmin (database/seeds/generate_development_demo.py): password plus authenticator code (13.9).
export const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? 'superadmin@bicol-u.edu.ph';
export const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? 'Superadmin123!';
export const SUPERADMIN_TOTP_SECRET = process.env.E2E_SUPERADMIN_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238: six digits, 30-second steps, SHA-1. */
export function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}

// Start at the current step: an earlier process (the PHP suite, another run) may already have used it, and the server
// accepts each 30-second step once, so even the first sign-in waits for a fresh step (at most 30 s).
let lastStep = Math.floor(Date.now() / 30_000);
/** The server accepts each 30-second step once, so a second sign-in in the same step waits for the next one. */
async function nextCode(): Promise<string> {
  let step = Math.floor(Date.now() / 30_000);
  while (step <= lastStep) {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    step = Math.floor(Date.now() / 30_000);
  }
  lastStep = step;
  return totp(SUPERADMIN_TOTP_SECRET, step);
}

/** Signs in through the real form: password, then the authenticator code. Lands on the Overview. */
export async function signInSuperadmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[inputmode="email"]').fill(SUPERADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/2fa\/verify/);
  await page.locator('input[inputmode="numeric"]').fill(await nextCode());
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page).toHaveURL('/superadmin/overview');
}
