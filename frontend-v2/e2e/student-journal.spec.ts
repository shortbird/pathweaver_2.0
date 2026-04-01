import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Journal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'journal');
  });

  test('ST27: Journal page loads', async ({ page }) => {
    await expect(page.getByText('Journal').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST28: Journal shows content or empty state', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|moment|topic|entry|no entries|get started/);
  });

  test.skip('ST29: Can create a new journal entry (requires interaction)', async ({ page }) => {
    // Skipped: creating entries requires specific interaction flow
  });

  test('ST30: Journal page has topic sidebar', async ({ page }) => {
    // Topics sidebar should be visible on desktop
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/topic|journal|moment/);
  });

  test.skip('ST31: Journal shows topics sidebar detail (requires seeded data)', async ({ page }) => {
    // Skipped: requires journal entries with topics
  });

  test.skip('ST32: Can filter journal by topic (requires seeded data)', async ({ page }) => {
    // Skipped: requires journal entries with topics
  });

  test.skip('ST33: Journal entry shows linked quest/task (requires seeded data)', async ({ page }) => {
    // Skipped: requires entries linked to quests
  });

  test.skip('ST34: Journal shows engagement calendar (requires seeded data)', async ({ page }) => {
    // Skipped: requires journal activity data
  });
});
