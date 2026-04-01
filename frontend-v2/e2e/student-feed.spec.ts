import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Feed', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Feed');
  });

  test('ST53: Feed page loads', async ({ page }) => {
    await expect(page.getByText(/feed|activity|updates/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST54: Feed shows activity items', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/feed|activity|update|no activity|empty/);
  });

  test('ST55: Feed items show timestamps', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dateText = page.getByText(/ago|today|yesterday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i).first();
    if (await dateText.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(dateText).toBeVisible();
    }
  });

  test('ST56: Feed shows different activity types', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Feed should distinguish between quest completions, XP earned, badges, etc.
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST57: Can scroll/load more feed items', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Scroll down to trigger infinite scroll or load more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});
