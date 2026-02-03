import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Local: Tests against localhost:3000 with Chromium only
 * CI: Tests against dev environment with all browsers
 */
const isCI = !!process.env.CI;

export default defineConfig({
  // Tests are in tests/e2e/specs/
  testDir: './tests/e2e/specs',

  // Maximum time one test can run for
  timeout: 60 * 1000,

  // Run tests sequentially locally, parallel in CI
  fullyParallel: isCI,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: isCI,

  // No retries locally (see failures immediately), retry in CI
  retries: isCI ? 2 : 0,

  // Single worker locally for predictability, multiple in CI
  workers: isCI ? undefined : 1,

  // Reporter to use
  reporter: [
    ['html'],
    ['list'],
    ...(isCI ? [['github']] : []),
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL - localhost for local dev, dev environment for CI
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Maximum time each action can take
    actionTimeout: 15 * 1000,

    // Navigation timeout
    navigationTimeout: 30 * 1000,
  },

  // Configure projects for major browsers
  projects: isCI
    ? [
        // CI: Test all browsers
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'firefox',
          use: {
            ...devices['Desktop Firefox'],
            actionTimeout: 20 * 1000,
            navigationTimeout: 40 * 1000,
          },
          retries: 2,
        },
        {
          name: 'webkit',
          use: {
            ...devices['Desktop Safari'],
            actionTimeout: 20 * 1000,
            navigationTimeout: 40 * 1000,
          },
          retries: 2,
        },
      ]
    : [
        // Local: Chromium only for faster feedback
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ],
});
