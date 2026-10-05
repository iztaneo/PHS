import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PHS_E2E_WEB_URL ?? 'http://127.0.0.1:5173',
    channel: process.env.PHS_E2E_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
