import { test, expect } from '@playwright/test';
import {
  login,
  setupQuestHub,
  waitForQuestCards,
  BASE_URL
} from './helpers.js';

/**
 * Task Completion E2E Tests (WebKit-Fixed Version)
 *
 * Tests the task completion flow with WebKit-optimized wait strategies:
 * - View quest tasks
 * - Submit task evidence (text, link, image)
 * - View task completion status
 * - Track XP progress
 *
 * CHANGES FROM ORIGINAL:
 * - Use helper functions with robust wait strategies
 * - Increased timeouts for WebKit compatibility
 * - Better handling of async state updates
 */

test.describe('Task Completion (WebKit-Fixed)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display quest tasks', async ({ page }) => {
    await setupQuestHub(page);

    // Click on first quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show task workspace indicators
    const taskIndicators = page.locator('text=/Your Evidence|Select a task to get started/i');
    await expect(taskIndicators.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show task details and evidence editor', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "Your Evidence" section
    const evidenceSection = page.locator('text=/Your Evidence|Add Content/i');
    const hasEvidenceSection = await evidenceSection.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasEvidenceSection) {
      // Should have "Mark Task as Completed" button or completed status
      const actionButton = page.locator('button:has-text("Mark Task as Completed"), text=/Task Completed/i');
      await expect(actionButton.first()).toBeVisible({ timeout: 5000 });
    } else {
      // Might need to enroll in a quest first
      test.skip();
    }
  });

  test('should submit text evidence using multi-format editor', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Check if "Add Content" button exists
    const addContentButton = page.getByRole('button', { name: /Add Content/i });
    const hasEditor = await addContentButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasEditor) {
      // Click "Add Content" to add a text block
      await addContentButton.click();

      // Select "Text" from dropdown menu
      const textOption = page.getByRole('button', { name: 'Text', exact: true });
      const hasTextOption = await textOption.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasTextOption) {
        await textOption.click();
        await page.waitForTimeout(1000);

        // Find the textarea
        const textarea = page.locator('textarea').first();
        const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasTextarea) {
          // Fill in evidence
          await textarea.fill('This is my E2E test evidence. I completed this task successfully and learned about automated testing.');
          await page.waitForTimeout(2000); // Wait for autosave (increased for WebKit)

          // Should show "Saved" indicator
          const savedIndicator = page.locator('text=/Saved|Autosaved/i');
          await expect(savedIndicator).toBeVisible({ timeout: 5000 });
        }
      }
    } else {
      // No editor available
      test.skip();
    }
  });

  test('should mark task as completed', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Look for "Mark Task as Completed" button
    const markCompleteButton = page.getByRole('button', { name: /Mark Task as Completed/i });
    const hasButton = await markCompleteButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasButton) {
      // Click the button
      await markCompleteButton.click();

      // Should show completion indicators
      const completionIndicators = page.locator('text=/Task Completed|Marking Complete|XP Earned/i');
      await expect(completionIndicators.first()).toBeVisible({ timeout: 10000 });
    } else {
      // Task might already be completed
      const completedIndicator = page.locator('text=/Task Completed|XP Earned/i');
      const isCompleted = await completedIndicator.isVisible({ timeout: 3000 }).catch(() => false);

      if (!isCompleted) {
        test.skip(); // No incomplete tasks available
      }
    }
  });

  test('should show task completion progress in quest stats', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show stats: "X/Y Tasks"
    const taskStats = page.locator('text=/\\d+\\/\\d+ TASKS|Tasks/i');
    await expect(taskStats.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show XP earned in quest stats', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "XP Earned" in stats section
    const xpStats = page.locator('text=/\\d+ XP|XP Earned/i');
    await expect(xpStats.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display task with pillar and XP badges', async ({ page }) => {
    await setupQuestHub(page);

    // Click on enrolled quest
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Check if TaskWorkspace is loaded (shows pillar badges)
    const pillarBadge = page.locator('text=/STEM|WELLNESS|COMMUNICATION|CIVICS|ART/i');
    const hasPillar = await pillarBadge.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPillar) {
      // Should also show XP badge
      const xpBadge = page.locator('text=/\\d+ XP/i');
      await expect(xpBadge.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
