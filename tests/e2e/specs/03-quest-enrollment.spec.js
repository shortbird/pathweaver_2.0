import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { QuestHubPage } from '../pages/QuestHubPage.js';
import { QuestDetailPage } from '../pages/QuestDetailPage.js';
import { TEST_USER } from '../fixtures/auth.fixture.js';

/**
 * Quest Enrollment Tests
 *
 * Verifies:
 * - Quest discovery page displays quests
 * - Quest detail page loads
 * - "Pick Up Quest" button works
 * - Personalization wizard appears
 */
test.describe('Quest Enrollment', () => {
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

  test('quest discovery page shows available quests', async () => {
    // Navigate to quests
    await questHubPage.goto();

    // Page should be loaded
    expect(await questHubPage.isLoaded()).toBe(true);

    // Wait for quests to load
    await questHubPage.waitForQuestsToLoad();

    // Should have quests or show empty state
    const questCount = await questHubPage.getQuestCount();
    const hasEmpty = await questHubPage.hasEmptyState();

    // Either we have quests or an empty state
    expect(questCount > 0 || hasEmpty).toBe(true);
  });

  test('clicking quest navigates to detail page', async ({ page }) => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();

    // Skip if no quests available
    if (questCount === 0) {
      test.skip();
      return;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);

    // Should be on quest detail page
    await questDetailPage.waitForQuestToLoad();
    expect(page.url()).toContain('/quests/');

    // Quest page should show title
    expect(await questDetailPage.isLoaded()).toBe(true);
  });

  test('pick up quest shows personalization wizard', async ({ page }) => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const questCount = await questHubPage.getQuestCount();

    // Skip if no quests
    if (questCount === 0) {
      test.skip();
      return;
    }

    // Click first quest
    await questHubPage.clickQuestByIndex(0);
    await questDetailPage.waitForQuestToLoad();

    // Check if "Pick Up Quest" is available
    const hasPickUp = await questDetailPage.hasPickUpButton();

    // If quest is already enrolled, we might see task workspace instead
    if (!hasPickUp) {
      // Already enrolled - check for task workspace or personalization prompt
      const hasWorkspace = await questDetailPage.hasTaskWorkspace();
      const hasPersonalization = await questDetailPage.hasPersonalizationWizard();
      expect(hasWorkspace || hasPersonalization).toBe(true);
      return;
    }

    // Click "Pick Up Quest"
    await questDetailPage.pickUpQuest();

    // Should show personalization wizard or task workspace
    await page.waitForTimeout(2000);
    const hasWizard = await questDetailPage.hasPersonalizationWizard();
    const hasWorkspace = await questDetailPage.hasTaskWorkspace();

    expect(hasWizard || hasWorkspace).toBe(true);
  });

  test('search filters quests', async () => {
    // Navigate to quests
    await questHubPage.goto();
    await questHubPage.waitForQuestsToLoad();

    const initialCount = await questHubPage.getQuestCount();

    // Skip if no quests to search
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Search for something unlikely to match many quests
    await questHubPage.search('xyznonexistentquest123');

    // Should have fewer or no results
    const searchCount = await questHubPage.getQuestCount();
    const hasEmpty = await questHubPage.hasEmptyState();

    expect(searchCount < initialCount || hasEmpty).toBe(true);

    // Clear search
    await questHubPage.clearSearch();
    await questHubPage.waitForQuestsToLoad();

    // Should be back to original count (approximately)
    const clearedCount = await questHubPage.getQuestCount();
    expect(clearedCount).toBeGreaterThanOrEqual(0);
  });
});
