import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/live',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:15173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-live', use: { ...devices['Desktop Chrome'] } }],
});
