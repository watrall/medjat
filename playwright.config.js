import { defineConfig } from '@playwright/test';

// Run against a test-managed server so a running preview cannot supply stale headers.
const port = 8617;
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    headless: true,
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `python3 scripts/serve.py --port ${port}`,
    url: baseURL,
  },
});
