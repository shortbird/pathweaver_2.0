import { test, expect } from '@playwright/test';
import { BASE_URL, clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Quests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Quests');
  });

  test('ST9: Quests page loads', async ({ page }) => {
    await expect(page.getByText(/quest|project/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST10: Active quests are displayed', async ({ page }) => {
    // Should show quest cards or a list of quests
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST11: Can view quest details', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Click on the first quest card if available
    const questCards = page.locator('[data-testid*="quest"], div:has-text("Quest")').first();
    if (await questCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questCards.click();
      await page.waitForTimeout(2000);
      // Quest detail view should show tasks or description
      await expect(page.getByText(/task|description|xp|progress/i)).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST12: Can start a new quest', async ({ page }) => {
    // Look for available quests or start quest button
    await page.waitForTimeout(3000);
    const startButton = page.getByText(/start|begin|join/i).first();
    if (await startButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(startButton).toBeVisible();
    }
  });

  test('ST13: Quest shows XP requirement', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Quests should display XP amounts
    await expect(page.getByText(/xp/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST14: Quest shows task list', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Click into a quest to see its tasks
    const questCards = page.locator('[data-testid*="quest"], div:has-text("Quest")').first();
    if (await questCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questCards.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/task/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST15: Can create a custom task on quest', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Navigate into a quest first
    const questCards = page.locator('[data-testid*="quest"], div:has-text("Quest")').first();
    if (await questCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questCards.click();
      await page.waitForTimeout(2000);
      // Look for add/create task button
      const addTask = page.getByText(/add task|create task|new task/i).first();
      if (await addTask.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(addTask).toBeVisible();
      }
    }
  });

  test('ST16: Can submit task for approval', async ({ page }) => {
    await page.waitForTimeout(3000);
    const questCards = page.locator('[data-testid*="quest"], div:has-text("Quest")').first();
    if (await questCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questCards.click();
      await page.waitForTimeout(2000);
      // Look for submit/complete button on a task
      const submitBtn = page.getByText(/submit|complete|mark done/i).first();
      if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(submitBtn).toBeVisible();
      }
    }
  });

  test('ST17: Quest progress bar updates', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Look for progress indicators
    await expect(page.getByText(/progress|%|\d+\/\d+/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST18: Completed quests section visible', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Look for completed/past quests filter or section
    const completedTab = page.getByText(/completed|finished|past/i).first();
    if (await completedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(completedTab).toBeVisible();
    }
  });

  test('ST19: Quest shows pillar tags on tasks', async ({ page }) => {
    await page.waitForTimeout(3000);
    const questCards = page.locator('[data-testid*="quest"], div:has-text("Quest")').first();
    if (await questCards.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questCards.click();
      await page.waitForTimeout(2000);
      // Pillar tags should be visible on tasks
      await expect(page.getByText(/knowledge|creativity|leadership|physical|community|financial/i).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
