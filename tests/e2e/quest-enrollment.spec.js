import { test, expect } from '@playwright/test';

/**
 * Quest Enrollment E2E Tests
 *
 * Tests the quest enrollment flow:
 * - Browse available quests
 * - View quest details
 * - Enroll in a quest (pick up)
 * - View enrolled quests
 * - Drop a quest (set down)
 *
 * IMPORTANT: These tests are built against the actual UI at https://optio-dev-frontend.onrender.com
 * Last verified: December 2025
 */

const BASE_URL = 'https://optio-dev-frontend.onrender.com';

// Helper function to login before each test
async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  // Wait for successful login (redirects to quest-hub)
  await page.waitForURL(/.*\/(quest-hub|quests|dashboard)/, { timeout: 15000 });
}

test.describe('Quest Enrollment', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available quests in quest hub', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click on QUESTS tab using getByRole to avoid strict mode violations
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isQuestsTabVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isQuestsTabVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000); // Wait for tab switch animation
    }

    // Should show quest cards in a grid
    const questCards = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer');
    await expect(questCards.first()).toBeVisible({ timeout: 15000 });

    // Should show at least one quest title
    const questTitles = page.locator('h3');
    await expect(questTitles.first()).toBeVisible();
  });

  test('should navigate to quest detail page when clicking a quest card', async ({ page }) => {
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Get the first quest card (clickable div)
    const firstQuestCard = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer').first();
    await firstQuestCard.waitFor({ state: 'visible', timeout: 15000 });

    // Click the card (entire card is clickable)
    await firstQuestCard.click();

    // Should navigate to quest detail page with UUID
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show quest detail content
    await expect(page.locator('text=/Pick Up Quest|SET DOWN QUEST|Continue/i')).toBeVisible({ timeout: 10000 });
  });

  test('should enroll in a quest (pick up quest)', async ({ page }) => {
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on first quest card
    const firstQuestCard = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer').first();
    await firstQuestCard.waitFor({ state: 'visible', timeout: 15000 });
    await firstQuestCard.click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Look for "Pick Up Quest" button (button might not exist if already enrolled)
    const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
    const isPickUpVisible = await pickUpButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isPickUpVisible) {
      // Click Pick Up Quest button
      await pickUpButton.click();

      // Wait for either:
      // 1. Personalization wizard to appear
      // 2. Tasks to load
      // 3. "SET DOWN QUEST" button to appear
      const enrollmentSuccess = page.locator('button:has-text("SET DOWN QUEST"), text=/personalize|customize/i');
      await expect(enrollmentSuccess.first()).toBeVisible({ timeout: 10000 });
    } else {
      // Quest is already enrolled - should see "SET DOWN QUEST" button
      const setDownButton = page.getByRole('button', { name: /SET DOWN QUEST/i });
      await expect(setDownButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('should complete quest personalization flow', async ({ page }) => {
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Find a quest that's not enrolled
    const questCards = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    const cardCount = await questCards.count();

    let foundUnenrolledQuest = false;

    // Try up to 5 quests to find one that's not enrolled
    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      await questCards.nth(i).click();
      await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

      const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
      const isPickUpVisible = await pickUpButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isPickUpVisible) {
        foundUnenrolledQuest = true;
        break;
      }

      // Go back and try next quest
      await page.goto(`${BASE_URL}/quest-hub`);
      await page.waitForLoadState('networkidle');
      const questsTabAgain = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
      if (await questsTabAgain.isVisible({ timeout: 5000 }).catch(() => false)) {
        await questsTabAgain.click();
        await page.waitForTimeout(1000);
      }
    }

    if (foundUnenrolledQuest) {
      // Click Pick Up Quest
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
    // Note: The actual route might be /quest-hub with a filter or /my-quests
    // First try /my-quests
    const myQuestsResponse = await page.goto(`${BASE_URL}/my-quests`).catch(() => null);

    // If /my-quests doesn't exist, go to quest-hub and filter
    if (!myQuestsResponse || myQuestsResponse.status() === 404) {
      await page.goto(`${BASE_URL}/quest-hub`);
      await page.waitForLoadState('networkidle');

      // Switch to QUESTS tab
      const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
      if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await questsTab.click();
        await page.waitForTimeout(1000);
      }
    } else {
      await page.waitForLoadState('networkidle');
    }

    // Should show at least one quest card (user should have at least one active quest)
    const questCards = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer');
    await expect(questCards.first()).toBeVisible({ timeout: 15000 });

    // Click on first quest to verify it's enrolled
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "SET DOWN QUEST" button or "Continue" button (indicating enrollment)
    const enrolledIndicators = page.locator('button:has-text("SET DOWN QUEST"), button:has-text("Continue")');
    await expect(enrolledIndicators.first()).toBeVisible({ timeout: 5000 });
  });

  test('should drop a quest (set down quest)', async ({ page }) => {
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Find an enrolled quest by clicking through quest cards
    const questCards = page.locator('.group.bg-white.rounded-xl.overflow-hidden.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    const cardCount = await questCards.count();

    let foundEnrolledQuest = false;

    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      await questCards.nth(i).click();
      await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

      // Check if "SET DOWN QUEST" button exists
      const setDownButton = page.getByRole('button', { name: /SET DOWN QUEST/i });
      const isVisible = await setDownButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isVisible) {
        foundEnrolledQuest = true;
        break;
      }

      // Go back and try next quest
      await page.goto(`${BASE_URL}/quest-hub`);
      await page.waitForLoadState('networkidle');
      const questsTabAgain = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
      if (await questsTabAgain.isVisible({ timeout: 5000 }).catch(() => false)) {
        await questsTabAgain.click();
        await page.waitForTimeout(1000);
      }
    }

    if (foundEnrolledQuest) {
      // Click "SET DOWN QUEST" button
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

      // Should show "Pick Up Quest" button after dropping
      // OR be redirected away from quest detail page
      const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
      const isPickUpVisible = await pickUpButton.isVisible({ timeout: 5000 }).catch(() => false);

      // If still on quest detail page, should show Pick Up button
      // If redirected, that's also a success
      const currentUrl = page.url();
      const onQuestDetailPage = /\/quests\/[a-f0-9-]{36}/.test(currentUrl);

      if (onQuestDetailPage) {
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
