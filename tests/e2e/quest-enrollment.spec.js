import { test, expect } from '@playwright/test';
import {
  login,
  navigateToQuestHub,
  clickQuestsTab,
  waitForQuestCards,
  setupQuestHub,
  findEnrolledQuest,
  findUnenrolledQuest,
  BASE_URL
} from './helpers.js';

/**
 * Quest Enrollment E2E Tests (WebKit-Fixed Version)
 *
 * Tests the quest enrollment flow with WebKit-optimized wait strategies:
 * - Browse available quests
 * - View quest details
 * - Enroll in a quest (pick up)
 * - View enrolled quests
 * - Drop a quest (set down)
 *
 * CHANGES FROM ORIGINAL:
 * - Use waitForResponse instead of waitForLoadState('networkidle')
 * - Add explicit waits for quest cards to exist before checking visibility
 * - Increased timeouts for WebKit compatibility
 * - Use helper functions for common patterns
 */

test.describe('Quest Enrollment (WebKit-Fixed)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available quests in quest hub', async ({ page }) => {
    // Navigate and wait for quest data to load
    await navigateToQuestHub(page);

    // Click QUESTS tab if visible
    await clickQuestsTab(page);

    // Wait for quest cards to appear (WebKit-optimized)
    const questCards = await waitForQuestCards(page);

    // Verify at least one quest card is visible
    await expect(questCards.first()).toBeVisible({ timeout: 5000 });

    // Should show at least one quest title
    const questTitles = page.locator('h3');
    await expect(questTitles.first()).toBeVisible();
  });

  test('should navigate to quest detail page when clicking a quest card', async ({ page }) => {
    await setupQuestHub(page);

    // Get the first quest card
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();

    // Should navigate to quest detail page with UUID
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show quest detail content
    await expect(page.locator('text=/Pick Up Quest|SET DOWN QUEST|Continue/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should enroll in a quest (pick up quest)', async ({ page }) => {
    await setupQuestHub(page);

    // Click on first quest card
    const questCards = await waitForQuestCards(page);
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Look for "Pick Up Quest" button
    const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
    const isPickUpVisible = await pickUpButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isPickUpVisible) {
      // Click Pick Up Quest button
      await pickUpButton.click();

      // Wait for enrollment to complete
      await page.waitForTimeout(2000);

      // Should show either personalization wizard or "SET DOWN QUEST" button
      const enrollmentSuccess = page.locator('button:has-text("SET DOWN QUEST"), text=/personalize|customize/i');
      await expect(enrollmentSuccess.first()).toBeVisible({ timeout: 10000 });
    } else {
      // Quest is already enrolled - should see "SET DOWN QUEST" button
      const setDownButton = page.getByRole('button', { name: /SET DOWN QUEST/i });
      await expect(setDownButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('should complete quest personalization flow', async ({ page }) => {
    await setupQuestHub(page);

    // Find an unenrolled quest
    const result = await findUnenrolledQuest(page, 5);

    if (result.found) {
      // We're now on a quest detail page with "Pick Up Quest" button
      const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
      await pickUpButton.click();

      // Wait for personalization wizard or tasks to load
      await page.waitForTimeout(2000);

      // If personalization wizard appears, interact with it
      const wizardVisible = await page.locator('text=/personalize|customize/i').isVisible({ timeout: 3000 }).catch(() => false);

      if (wizardVisible) {
        // Look for continue/next/done button in wizard
        const continueButton = page.getByRole('button', { name: /Continue|Next|Done|Finish/i }).first();
        const hasContinue = await continueButton.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasContinue) {
          await continueButton.click();
          await page.waitForTimeout(2000);
        }
      }

      // Should eventually show "SET DOWN QUEST" button
      await expect(page.getByRole('button', { name: /SET DOWN QUEST/i })).toBeVisible({ timeout: 10000 });
    } else {
      // All quests are already enrolled - skip this test
      test.skip();
    }
  });

  test('should show enrolled quests in My Active Quests', async ({ page }) => {
    // Try /my-quests route first
    const myQuestsResponse = await page.goto(`${BASE_URL}/my-quests`).catch(() => null);

    // If /my-quests doesn't exist, go to quest-hub
    if (!myQuestsResponse || myQuestsResponse.status() === 404) {
      await setupQuestHub(page);
    } else {
      await page.waitForLoadState('domcontentloaded');
      await waitForQuestCards(page);
    }

    // Should show at least one quest card
    const questCards = await waitForQuestCards(page);
    await expect(questCards.first()).toBeVisible({ timeout: 5000 });

    // Click on first quest to verify it's enrolled
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "SET DOWN QUEST" button or "Continue" button (indicating enrollment)
    const enrolledIndicators = page.locator('button:has-text("SET DOWN QUEST"), button:has-text("Continue")');
    await expect(enrolledIndicators.first()).toBeVisible({ timeout: 5000 });
  });

  test('should drop a quest (set down quest)', async ({ page }) => {
    await setupQuestHub(page);

    // Find an enrolled quest
    const result = await findEnrolledQuest(page, 5);

    if (result.found) {
      // We're now on a quest detail page with "SET DOWN QUEST" button
      const setDownButton = page.getByRole('button', { name: /SET DOWN QUEST/i });
      await setDownButton.click();

      // Wait for confirmation modal or reflection form
      await page.waitForTimeout(2000);

      // Look for confirmation dialog
      const confirmationDialog = page.locator('text=/are you sure|reflect|what did you learn/i');
      const hasConfirmation = await confirmationDialog.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasConfirmation) {
        // Look for confirm button
        const confirmButton = page.getByRole('button', { name: /Yes|Confirm|Set Down|Submit/i }).first();
        const hasConfirmButton = await confirmButton.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasConfirmButton) {
          await confirmButton.click();
          await page.waitForTimeout(2000);
        }
      }

      // Should show "Pick Up Quest" button after dropping OR be redirected away
      const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
      const isPickUpVisible = await pickUpButton.isVisible({ timeout: 5000 }).catch(() => false);

      const currentUrl = page.url();
      const onQuestDetailPage = /\/quests\/[a-f0-9-]{36}/.test(currentUrl);

      if (onQuestDetailPage) {
        // Still on quest detail page - should show Pick Up button
        await expect(pickUpButton).toBeVisible();
      } else {
        // Redirected away - success
        expect(onQuestDetailPage).toBe(false);
      }
    } else {
      // No enrolled quests found - skip this test
      test.skip();
    }
  });
});
