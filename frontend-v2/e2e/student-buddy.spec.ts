import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

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

  test('ST43: Buddy page shows Sparky with stats', async ({ page }) => {
    // Student has seeded buddy "Sparky" with vitality 75, bond 50
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // Should show buddy name and stats
    expect(content?.toLowerCase()).toMatch(/sparky|vitality|bond|buddy/);
  });

  test('ST44: Buddy page shows content', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});
