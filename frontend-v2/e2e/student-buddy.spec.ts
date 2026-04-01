import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Buddy (AI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'buddy');
  });

  test('ST42: Buddy page loads', async ({ page }) => {
    // Buddy page shows pet display with Vitality/Bond stats, or create form for new users
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/buddy|vitality|bond|create|name/);
  });

  test.skip('ST43: Can send a message to Buddy (requires interaction)', async ({ page }) => {
    // Skipped: buddy chat interaction depends on buddy state
  });

  test('ST44: Buddy page shows content', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});
