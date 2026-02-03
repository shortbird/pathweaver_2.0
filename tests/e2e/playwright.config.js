import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration - Fresh Start
 *
 * Simplified config focused on reliability:
 * - Chromium only (skip WebKit/Firefox complexity initially)
 * - Local dev server (http://localhost:3000)
 * - Sequential execution (no parallelism for predictability)
 * - No retries (see failures immediately during development)
 */
export default defineConfig({
  testDir: './specs',

  // Maximum time one test can run
  timeout: 60000,

  // Run tests sequentially for predictability
  fullyParallel: false,

  // Fail the build if test.only is left in
  forbidOnly: !!process.env.CI,

  // No retries - see failures immediately
  retries: 0,

  // Single worker for sequential execution
  workers: 1,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Test against local dev server
    baseURL: 'http://localhost:3000',

    // Trace and screenshot on first retry only
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Action timeouts
    actionTimeout: 15000,
    navigationTimeout: 20000,

    // Viewport
    viewport: { width: 1280, height: 720 },
  },

  // Chromium only for simplicity
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Output directory for test artifacts
  outputDir: 'test-results',
});
