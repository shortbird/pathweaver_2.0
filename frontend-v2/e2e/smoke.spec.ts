import { test, expect } from '@playwright/test';

const BASE_URL = 'https://optio-dev-v2-frontend.onrender.com';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || '';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || '';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    // Navigate to app (redirects to login)
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'test-results/01-initial-load.png' });

    // Wait for login page
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.screenshot({ path: 'test-results/02-login-page.png' });

    // Fill login form
    const emailInput = page.getByPlaceholder('you@email.com');
    if (await emailInput.isVisible()) {
      await emailInput.fill(STUDENT_EMAIL);
    } else {
      // Try alternate placeholder
      await page.getByPlaceholder('Email address').fill(STUDENT_EMAIL);
    }

    const passwordInput = page.getByPlaceholder('Enter password');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(STUDENT_PASSWORD);
    } else {
      await page.getByPlaceholder('Password').fill(STUDENT_PASSWORD);
    }

    await page.screenshot({ path: 'test-results/03-filled-form.png' });

    // Click sign in - try multiple selectors
    const signInButton = page.locator('button:has-text("Sign In"), button:has-text("Sign in")').first();
    await signInButton.click();

    // Verify dashboard loads
    await page.waitForSelector('text=Welcome back', { timeout: 20000 });
    await page.screenshot({ path: 'test-results/04-dashboard.png' });

    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });
});
