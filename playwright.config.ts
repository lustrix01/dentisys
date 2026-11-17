import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: /[\\/]live[\\/]/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One local retry: a test that passes only on retry is reported as "flaky" (with a trace) instead of failing the
  // gate. Known flaky tests are listed in docs/PRODUCT_BACKLOG.md; fix them, never let the list grow silently.
  retries: process.env.CI ? 2 : 1,
  // Half the CPU cores (8 on a 16-core PC): the API is mocked per test, so workers share no state.
  workers: '50%',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:15174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
