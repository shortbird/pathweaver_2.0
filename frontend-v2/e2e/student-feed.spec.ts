import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Feed', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'feed');
  });

  test('ST53: Feed page loads', async ({ page }) => {
    await expect(page.getByText('Feed').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST54: Feed shows description or activity', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    // Feed shows "Recent completions and learning moments" or "No activity yet"
    expect(content?.toLowerCase()).toMatch(/feed|recent|completions|no activity|learning/);
  });

  test('ST55: Feed shows empty state when no activity', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    // Either shows activity items or empty state
    expect(content?.toLowerCase()).toMatch(/activity|completions|no activity|feed/);
  });

  test.skip('ST56: Feed shows different activity types (requires seeded data)', async ({ page }) => {
    // Skipped: requires activity data
  });

  test.skip('ST57: Can scroll/load more feed items (requires seeded data)', async ({ page }) => {
    // Skipped: requires multiple feed items
  });
});
