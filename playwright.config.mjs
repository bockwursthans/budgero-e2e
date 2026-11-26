import { defineConfig } from '@playwright/test';
import { BASE_URL } from './lib/instance.mjs';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  preserveOutput: 'always',
  globalSetup: './lib/global-setup.mjs',
  // One shared throwaway instance: run the walkthrough steps in order.
  workers: 1,
  fullyParallel: false,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
  },
});
