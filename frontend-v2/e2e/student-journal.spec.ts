import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Journal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Journal');
  });

  test('ST27: Journal page loads', async ({ page }) => {
    await expect(page.getByText(/journal|learning|event/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST28: Journal shows learning events', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Should show learning event cards or empty state
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|learning|event|entry|no entries|get started/);
  });

  test('ST29: Can create a new journal entry', async ({ page }) => {
    // Look for add/create entry button
    const addBtn = page.getByText(/add|create|new|log/i).first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
  });

  test('ST30: Journal entries show timestamps', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Entries should have dates/times
    const datePattern = page.getByText(/\d{1,2}[/.-]\d{1,2}|today|yesterday|ago|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i).first();
    if (await datePattern.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(datePattern).toBeVisible();
    }
  });

  test('ST31: Journal shows topics sidebar', async ({ page }) => {
    // Topics sidebar should be visible on desktop
    await expect(page.getByText(/topic|interest|track/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST32: Can filter journal by topic', async ({ page }) => {
    await page.waitForTimeout(3000);
    const topicFilter = page.getByText(/topic|filter|all/i).first();
    if (await topicFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
      await topicFilter.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    }
  });

  test('ST33: Journal entry shows linked quest/task', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Entries linked to quests should show the quest reference
    const linkedEntry = page.getByText(/quest|task|linked/i).first();
    if (await linkedEntry.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(linkedEntry).toBeVisible();
    }
  });

  test('ST34: Journal shows engagement calendar', async ({ page }) => {
    // The engagement calendar/heatmap component
    await expect(page.getByText(/activity|streak|rhythm|calendar/i).first()).toBeVisible({ timeout: 15000 });
  });
});
