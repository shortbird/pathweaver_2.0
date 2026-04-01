import { test, expect } from '@playwright/test';

const BASE_URL = 'https://optio-dev-v2-frontend.onrender.com';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || '';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || '';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    // Navigate to app (redirects to login)
    await page.goto(BASE_URL);
    await page.waitForSelector('text=Welcome Back', { timeout: 30000 });

    // Fill login form
    await page.getByPlaceholder('you@email.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter password').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Verify dashboard loads
    await page.waitForSelector('text=Welcome back', { timeout: 20000 });
    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/dashboard.png' });
  });
});
