import { test, expect } from '@playwright/test';

const BASE_URL = 'https://optio-dev-v2-frontend.onrender.com';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || '';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || '';

/**
 * React Native Web renders Pressable/Button as <div> without role="button".
 * Standard Playwright button selectors don't work. Use this helper to find
 * and click elements by their exact visible text.
 */
async function clickByText(page: any, text: string) {
  await page.evaluate((t: string) => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent?.trim() === t && (el as HTMLElement).offsetHeight > 0) {
        (el as HTMLElement).click();
        return;
      }
    }
    throw new Error(`Element with text "${t}" not found`);
  }, text);
}

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for login page
    await page.waitForSelector('text=Welcome Back', { timeout: 30000 });

    // Fill login form
    await page.getByPlaceholder('you@email.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter password').fill(STUDENT_PASSWORD);

    // Click sign in
    await clickByText(page, 'Sign In');

    // Verify dashboard loads
    await page.waitForSelector('text=Welcome back', { timeout: 20000 });
    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });
});
