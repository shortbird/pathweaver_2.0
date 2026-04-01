import { test, expect } from '@playwright/test';

const BASE_URL = 'https://optio-dev-v2-frontend.onrender.com';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || '';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || '';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'test-results/01-initial-load.png' });

    // Wait for login page
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.screenshot({ path: 'test-results/02-login-page.png' });

    // Fill login form - React Native Web uses div[role="textbox"] not <input>
    await page.getByPlaceholder('you@email.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter password').fill(STUDENT_PASSWORD);
    await page.screenshot({ path: 'test-results/03-filled-form.png' });

    // Click sign in - RNW Button renders as div[role="button"], not <button>
    await page.locator('[role="button"]:has-text("Sign In")').first().click();

    // Verify dashboard loads
    await page.waitForSelector('text=Welcome back', { timeout: 20000 });
    await page.screenshot({ path: 'test-results/04-dashboard.png' });

    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });
});
