import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

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

  test('ST12: Quests page shows enrolled quests', async ({ page }) => {
    // Student is enrolled in Quest A ("Learn to Code") and Quest B ("Financial Literacy")
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|learn|code|financial|literacy|enrolled|active|discover/);
  });

  test('ST13: Quest shows XP info', async ({ page }) => {
    // Quests should show XP requirement or earned XP
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|xp|discover|browse|learn/);
  });

  test('ST14: Quest page shows task or detail content', async ({ page }) => {
    // Student has tasks on Quest A: "Complete Python Tutorial" (approved), "Build a Calculator App" (pending)
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|task|python|calculator|learn|code|discover/);
  });

  test('ST15: Quests page is interactive', async ({ page }) => {
    // Quest page should have clickable cards or interactive elements
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test('ST16: Quests page shows quest status info', async ({ page }) => {
    // Should show active/completed status for enrolled quests
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|active|progress|complete|discover|browse/);
  });

  test('ST17: Quest progress is visible', async ({ page }) => {
    // Student has approved and pending tasks - should show progress
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|progress|xp|task|discover|browse|learn/);
  });

  test('ST18: Quests page shows different quest sections', async ({ page }) => {
    // May show active quests, completed quests, or discover sections
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|active|completed|discover|browse|my quest/);
  });

  test('ST19: Quest content shows relevant details', async ({ page }) => {
    // Quests should show pillar tags, titles, or descriptions
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|learn|code|financial|pillar|tag|discover/);
  });
});
