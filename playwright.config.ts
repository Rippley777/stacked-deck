import { defineConfig, devices } from '@playwright/test';
const remote = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  timeout: remote ? 120000 : 30000,
  expect: { timeout: remote ? 30000 : 5000 },
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: remote || 'http://127.0.0.1:5179', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5179',
        reuseExistingServer: false,
        env: {
          VITE_PORT: '5179',
          PORT: '3179',
          APP_ORIGIN: 'http://127.0.0.1:5179',
          DATABASE_PROVIDER: 'sqlite',
          DATABASE_PATH: './data/e2e.db',
        },
        timeout: 60000,
      },
});
