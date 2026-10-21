import { defineConfig } from '@playwright/test';

// Dev-only device sweep. Not part of any gate: `npm run audit:devices`.
export default defineConfig({
  testDir: './audit',
  testMatch: /device-audit\.spec\.ts/,
  globalSetup: './audit/global-setup.ts',
  globalTeardown: './audit/global-teardown.ts',
  fullyParallel: true,
  retries: 0,
  workers: 2,
  timeout: 15 * 60 * 1000,
  reporter: 'list',
  use: { baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:5173' },
});
