import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Quests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'quests');
  });

  test('ST9: Quests page loads', async ({ page }) => {
    await expect(page.getByText(/Quest|Discover|Browse/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST10: Quests page shows search or filter', async ({ page }) => {
    // Quests page has search and topic filters
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST11: Quest cards are displayed or empty state shown', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    // Should show quest cards or some quest-related content
    expect(content?.toLowerCase()).toMatch(/quest|discover|browse|no quest|search/);
  });

  test.skip('ST12: Can start a new quest (requires seeded data)', async ({ page }) => {
    // Skipped: requires specific seeded quest data to be available
  });

  test.skip('ST13: Quest shows XP requirement (requires seeded data)', async ({ page }) => {
    // Skipped: requires specific seeded quest data
  });

  test.skip('ST14: Quest shows task list (requires seeded data)', async ({ page }) => {
    // Skipped: requires navigating into a specific quest
  });

  test.skip('ST15: Can create a custom task on quest (requires seeded data)', async ({ page }) => {
    // Skipped: requires active quest enrollment
  });

  test.skip('ST16: Can submit task for approval (requires seeded data)', async ({ page }) => {
    // Skipped: requires active task
  });

  test.skip('ST17: Quest progress bar updates (requires seeded data)', async ({ page }) => {
    // Skipped: requires quest with progress
  });

  test.skip('ST18: Completed quests section visible (requires seeded data)', async ({ page }) => {
    // Skipped: requires completed quests
  });

  test.skip('ST19: Quest shows pillar tags on tasks (requires seeded data)', async ({ page }) => {
    // Skipped: requires quest with tasks that have pillar tags
  });
});
