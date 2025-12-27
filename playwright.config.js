import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Tests run against live dev environment: https://optio-dev-frontend.onrender.com
 * No local setup required - tests actual deployed application
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Maximum time one test can run for
  timeout: 60 * 1000,

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // No retries while debugging tests - faster feedback
  retries: 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html'],
    ['list'],
    ['github'] // GitHub Actions annotations
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for tests
    baseURL: process.env.BASE_URL || 'https://optio-dev-frontend.onrender.com',

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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // WebKit-specific settings for auth issues
        actionTimeout: 20 * 1000, // Longer timeout for WebKit
        navigationTimeout: 40 * 1000, // Longer navigation timeout
      },
      // Retry WebKit tests due to known auth persistence issues
      retries: 2,
    },

    // Test against mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        // WebKit-specific settings for auth issues
        actionTimeout: 20 * 1000, // Longer timeout for WebKit
        navigationTimeout: 40 * 1000, // Longer navigation timeout
      },
      // Retry Mobile Safari tests due to known auth persistence issues
      retries: 2,
    },
  ],

  // Run your local dev server before starting the tests
  // (Not needed since we test against deployed dev environment)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  // },
});
