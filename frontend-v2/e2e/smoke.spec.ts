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

    // Fill login form
    await page.getByPlaceholder('you@email.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter password').fill(STUDENT_PASSWORD);
    await page.screenshot({ path: 'test-results/02-filled-form.png' });

    // Debug: log what's on the page
    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync('test-results/page-source.html', html);

    // Click sign in - try every possible selector
    const clicked = await page.evaluate(() => {
      // Find any element containing "Sign In" text
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent?.trim() === 'Sign In' && el.offsetHeight > 0) {
          (el as HTMLElement).click();
          return `Clicked: ${el.tagName} role=${el.getAttribute('role')} class=${el.className?.substring?.(0, 50)}`;
        }
      }
      return 'NOT FOUND';
    });
    console.log('Sign In click result:', clicked);

    // Verify dashboard loads
    await page.waitForSelector('text=Welcome back', { timeout: 20000 });
    await page.screenshot({ path: 'test-results/03-dashboard.png' });

    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });
});
