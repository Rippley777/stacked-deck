import { defineConfig, devices } from '@playwright/test';
const remote = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  timeout: remote ? 120000 : 30000,
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: remote || 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
