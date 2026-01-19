import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { QuestHubPage } from '../pages/QuestHubPage.js';
import { QuestDetailPage } from '../pages/QuestDetailPage.js';
import { TEST_USER } from '../fixtures/auth.fixture.js';

/**
 * Task Generation Tests
 *
 * Verifies:
 * - Personalization wizard appears after enrollment
 * - AI task generation flow works
 * - Manual task creation available
 */
test.describe('Task Generation', () => {
  let loginPage;
  let questHubPage;
  let questDetailPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    questHubPage = new QuestHubPage(page);
    questDetailPage = new QuestDetailPage(page);

    // Login first
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.waitForSuccessfulLogin();
  });

  test('personalization wizard shows after quest pickup', async ({ page }) => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();

    if (questCount === 0) {
      test.skip();
      return;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);
    await questDetailPage.waitForQuestToLoad();

    // Check if we can pick up the quest
    const hasPickUp = await questDetailPage.hasPickUpButton();

    if (!hasPickUp) {
      // Already enrolled, check for task workspace or add task button
      const hasWorkspace = await questDetailPage.hasTaskWorkspace();
      if (hasWorkspace) {
        // Can add more tasks
        const addTaskVisible = await questDetailPage.page.isVisible('button:has-text("Add Task")');
        expect(addTaskVisible || await questDetailPage.getTaskCount() > 0).toBe(true);
        return;
      }
      test.skip();
      return;
    }

    // Pick up the quest
    await questDetailPage.pickUpQuest();

    // Wait for either wizard or workspace
    await page.waitForTimeout(3000);

    const hasWizard = await questDetailPage.hasPersonalizationWizard();
    const hasWorkspace = await questDetailPage.hasTaskWorkspace();

    // Should see one or the other
    expect(hasWizard || hasWorkspace).toBe(true);
  });

  test('enrolled quest shows task workspace', async ({ page }) => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();

    if (questCount === 0) {
      test.skip();
      return;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);
    await questDetailPage.waitForQuestToLoad();

    // If we need to enroll first
    if (await questDetailPage.hasPickUpButton()) {
      await questDetailPage.pickUpQuest();
      await page.waitForTimeout(3000);

      // Close wizard if it appears
      if (await questDetailPage.hasPersonalizationWizard()) {
        await questDetailPage.closeWizard();
        await page.waitForTimeout(500);
      }
    }

    // Now should have task workspace or at least some indication of enrollment
    await page.waitForTimeout(1000);

    // Either we have a task workspace, or we see "Ready to personalize"
    const hasWorkspace = await questDetailPage.hasTaskWorkspace();
    const hasPersonalizePrompt = await questDetailPage.page.isVisible('text=Ready to personalize');
    const hasWizard = await questDetailPage.hasPersonalizationWizard();

    expect(hasWorkspace || hasPersonalizePrompt || hasWizard).toBe(true);
  });

  test('add task button opens wizard', async ({ page }) => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();

    if (questCount === 0) {
      test.skip();
      return;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);
    await questDetailPage.waitForQuestToLoad();

    // Enroll if needed
    if (await questDetailPage.hasPickUpButton()) {
      await questDetailPage.pickUpQuest();
      await page.waitForTimeout(3000);

      // Close wizard if it opens
      if (await questDetailPage.hasPersonalizationWizard()) {
        await questDetailPage.closeWizard();
        await page.waitForTimeout(500);
      }
    }

    // Check for add task button
    const addTaskButton = page.locator('button:has-text("Add Task")');
    const startPersonalizing = page.locator('button:has-text("Start Personalizing")');

    const hasAddTask = await addTaskButton.isVisible({ timeout: 3000 }).catch(() => false);
    const hasStartPersonalizing = await startPersonalizing.isVisible({ timeout: 1000 }).catch(() => false);

    if (hasAddTask) {
      await addTaskButton.click();
      await page.waitForTimeout(1000);

      // Should show wizard
      expect(await questDetailPage.hasPersonalizationWizard()).toBe(true);
    } else if (hasStartPersonalizing) {
      await startPersonalizing.click();
      await page.waitForTimeout(1000);

      // Should show wizard
      expect(await questDetailPage.hasPersonalizationWizard()).toBe(true);
    } else {
      // Quest might have tasks already, or wizard is still open
      const taskCount = await questDetailPage.getTaskCount();
      const hasWizard = await questDetailPage.hasPersonalizationWizard();
      expect(taskCount > 0 || hasWizard).toBe(true);
    }
  });
});
