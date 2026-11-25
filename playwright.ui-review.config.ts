import { defineConfig } from '@playwright/test';

// Dev-only capture for the ui-review agent. Not part of any gate: `npm run audit:ui-review`.
export default defineConfig({
  testDir: './audit',
  testMatch: /ui-review-capture\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 2,
  timeout: 20 * 60 * 1000,
  reporter: 'list',
  use: { baseURL: process.env.AUDIT_BASE_URL ?? 'http://localhost:5173' },
});
