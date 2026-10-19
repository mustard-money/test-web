import { defineConfig } from '@playwright/test';

/**
 * End-to-end UI tests. ./run.sh runs them in Docker against a throwaway stack
 * (Postgres, the backend, the web app and a stand-in AI model); BASE_URL is
 * where the web app is served (the backend is proxied under /api/).
 */
export default defineConfig({
  testDir: './tests',
  // The tests walk through one user's journey in order, each continuing from
  // the data the last one left on the "device".
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:18081',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
