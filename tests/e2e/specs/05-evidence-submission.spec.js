import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { QuestHubPage } from '../pages/QuestHubPage.js';
import { QuestDetailPage } from '../pages/QuestDetailPage.js';
import { TEST_USER } from '../fixtures/auth.fixture.js';

/**
 * Evidence Submission Tests
 *
 * Verifies:
 * - Can select a task
 * - Evidence section displays
 * - Can add text evidence
 * - Can mark task complete
 * - XP awarded on completion
 */
test.describe('Evidence Submission', () => {
  let loginPage;
  let questHubPage;
  let questDetailPage;

  /**
   * Helper to navigate to a quest with tasks
   * Returns true if successful, false if should skip
   */
  async function navigateToQuestWithTasks(page) {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();
    if (questCount === 0) {
      return false;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);
    await questDetailPage.waitForQuestToLoad();

    // Enroll if needed
    if (await questDetailPage.hasPickUpButton()) {
      await questDetailPage.pickUpQuest();
      await page.waitForTimeout(2000);

      // Close wizard if it appears
      if (await questDetailPage.hasPersonalizationWizard()) {
        await questDetailPage.closeWizard();
        await page.waitForTimeout(500);
      }
    }

    // Wait for workspace to appear
    await page.waitForTimeout(1000);
    return await questDetailPage.hasTaskWorkspace();
  }

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    questHubPage = new QuestHubPage(page);
    questDetailPage = new QuestDetailPage(page);

    // Login first
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.waitForSuccessfulLogin();
  });

  test('can select a task from workspace', async ({ page }) => {
    const hasWorkspace = await navigateToQuestWithTasks(page);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Get task count
    const taskCount = await questDetailPage.getTaskCount();
    expect(taskCount).toBeGreaterThan(0);

    // Select first task
    await questDetailPage.selectTaskByIndex(0);
    await page.waitForTimeout(500);

    // Should see evidence section
    const hasEvidence = await questDetailPage.hasEvidenceSection();
    expect(hasEvidence).toBe(true);
  });

  test('evidence section displays for selected task', async ({ page }) => {
    const hasWorkspace = await navigateToQuestWithTasks(page);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Select a task
    await questDetailPage.selectTaskByIndex(0);
    await page.waitForTimeout(500);

    // Verify evidence section elements
    await expect(page.locator('text=My Evidence')).toBeVisible({ timeout: 5000 });

    // Should see Add Evidence button
    const addButton = page.locator('button:has-text("Add"), button[title="Add Evidence"]');
    await expect(addButton.first()).toBeVisible({ timeout: 3000 });
  });

  test('can add text evidence to task', async ({ page }) => {
    const hasWorkspace = await navigateToQuestWithTasks(page);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Select first incomplete task
    await questDetailPage.selectFirstIncompleteTask();
    await page.waitForTimeout(500);

    // Skip if task is already completed
    if (await questDetailPage.isTaskCompleted()) {
      test.skip();
      return;
    }

    // Click Add Evidence
    await questDetailPage.clickAddEvidence();

    // Modal should be visible
    const modal = page.locator('[role="dialog"], .fixed.inset-0.bg-black');
    await expect(modal.first()).toBeVisible({ timeout: 5000 });

    // Enter text evidence
    const textarea = page.locator('textarea');
    await textarea.first().fill('E2E Test Evidence: Automated test submission.');

    // Save evidence
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Add")').first();
    await saveButton.click();
    await page.waitForTimeout(1500);

    // Modal should close (or evidence should be visible)
    // Check for success by verifying modal is gone or evidence appears
    const modalStillVisible = await modal.first().isVisible().catch(() => false);
    const evidenceShown = await page.isVisible('text=E2E Test Evidence').catch(() => false);

    expect(!modalStillVisible || evidenceShown).toBe(true);
  });

  test('can mark task as complete', async ({ page }) => {
    const hasWorkspace = await navigateToQuestWithTasks(page);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Select first incomplete task
    await questDetailPage.selectFirstIncompleteTask();
    await page.waitForTimeout(500);

    // Check if already completed
    if (await questDetailPage.isTaskCompleted()) {
      test.skip();
      return;
    }

    // Click Mark Complete / Done button
    const doneButton = page.locator('button:has-text("Done")').first();
    const isVisible = await doneButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip();
      return;
    }

    await doneButton.click();

    // Wait for completion with confetti animation
    await page.waitForTimeout(3000);

    // Should show completed status or XP badge
    const completed = await questDetailPage.isTaskCompleted();
    const xpBadge = await page.isVisible('text=/\\+\\d+ XP/');

    expect(completed || xpBadge).toBe(true);
  });

  test('shows XP badge for tasks', async ({ page }) => {
    const hasWorkspace = await navigateToQuestWithTasks(page);

    if (!hasWorkspace) {
      test.skip();
      return;
    }

    // Select task
    await questDetailPage.selectTaskByIndex(0);
    await page.waitForTimeout(500);

    // Check for XP display - should show XP badge for task
    const xpBadge = page.locator('text=/\\d+ XP/');
    await expect(xpBadge.first()).toBeVisible({ timeout: 5000 });
  });
});
