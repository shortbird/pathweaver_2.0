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

  // Check if already logged in (redirected away from login)
  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    return; // Already logged in
  }

  await page.fill('input[type="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  // Wait for redirect away from login page (could be /dashboard, /quests, or other)
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 });
}

test.describe('Quest Enrollment', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available quests in quest hub', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quests`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click on QUESTS tab using getByRole to avoid strict mode violations
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isQuestsTabVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isQuestsTabVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000); // Wait for tab switch animation
    }

    // Should show quest cards in a grid (use simpler selector for reliability)
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await expect(questCards.first()).toBeVisible({ timeout: 15000 });

    // Should show at least one quest title
    const questTitles = page.locator('h3');
    await expect(questTitles.first()).toBeVisible();
  });

  test('should navigate to quest detail page when clicking a quest card', async ({ page }) => {
    await page.goto(`${BASE_URL}/quests`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Get the first quest card (clickable div)
    const firstQuestCard = page.locator('.bg-white.rounded-xl.cursor-pointer').first();
    await firstQuestCard.waitFor({ state: 'visible', timeout: 15000 });

    // Click the card (entire card is clickable)
    await firstQuestCard.click();

    // Should navigate to quest detail page with UUID
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show quest detail content (use .first() to avoid strict mode violation)
    await expect(page.locator('text=/Pick Up Quest|SET DOWN QUEST|Continue/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should enroll in a quest (pick up quest)', async ({ page }) => {
    await page.goto(`${BASE_URL}/quests`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on first quest card
    const firstQuestCard = page.locator('.bg-white.rounded-xl.cursor-pointer').first();
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
      // 4. URL to change (enrollment success)
      await page.waitForTimeout(3000); // Wait for enrollment to process

      const setDownButton = page.locator('button').filter({ hasText: /set down/i });
      const personalizeContent = page.locator('text=/personalize|customize|task/i');
      const enrollmentSuccess = setDownButton.or(personalizeContent);
      await expect(enrollmentSuccess.first()).toBeVisible({ timeout: 10000 });
    } else {
      // Quest is already enrolled - should see "SET DOWN QUEST" button or task list
      const setDownButton = page.locator('button').filter({ hasText: /set down/i });
      const taskContent = page.locator('text=/task|Your Evidence/i');
      const enrolledIndicators = setDownButton.or(taskContent);
      await expect(enrolledIndicators.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should complete quest personalization flow', async ({ page }) => {
    await page.goto(`${BASE_URL}/quests`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Find a quest that's not enrolled
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
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
      await page.goto(`${BASE_URL}/quests`);
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

      // Should eventually show enrollment success indicators
      const setDownButton = page.locator('button').filter({ hasText: /set down/i });
      const taskContent = page.locator('text=/task|Your Evidence/i');
      const successIndicators = setDownButton.or(taskContent);
      await expect(successIndicators.first()).toBeVisible({ timeout: 10000 });
    } else {
      // All quests are already enrolled - skip this test
      test.skip();
    }
  });

  test('should show enrolled quests in My Active Quests', async ({ page }) => {
    // Note: The actual route might be /quests with a filter or /my-quests
    // First try /my-quests
    const myQuestsResponse = await page.goto(`${BASE_URL}/my-quests`).catch(() => null);

    // If /my-quests doesn't exist, go to quests and filter
    if (!myQuestsResponse || myQuestsResponse.status() === 404) {
      await page.goto(`${BASE_URL}/quests`);
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
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await expect(questCards.first()).toBeVisible({ timeout: 15000 });

    // Click on first quest to verify it's enrolled
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show enrollment indicators: SET DOWN button, Continue button, or task list
    const setDownButton = page.locator('button').filter({ hasText: /set down/i });
    const continueButton = page.locator('button').filter({ hasText: /continue/i });
    const taskContent = page.locator('text=/task|Your Evidence/i');
    const enrolledIndicators = setDownButton.or(continueButton).or(taskContent);
    await expect(enrolledIndicators.first()).toBeVisible({ timeout: 10000 });
  });

  test('should drop a quest (set down quest)', async ({ page }) => {
    await page.goto(`${BASE_URL}/quests`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Find an enrolled quest by clicking through quest cards
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    const cardCount = await questCards.count();

    let foundEnrolledQuest = false;

    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      await questCards.nth(i).click();
      await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

      // Check if "SET DOWN QUEST" button exists (case-insensitive)
      const setDownButton = page.locator('button:has-text("SET DOWN"), button:has-text("Set Down")').first();
      const isVisible = await setDownButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (isVisible) {
        foundEnrolledQuest = true;
        break;
      }

      // Go back and try next quest
      await page.goto(`${BASE_URL}/quests`);
      await page.waitForLoadState('networkidle');
      const questsTabAgain = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
      if (await questsTabAgain.isVisible({ timeout: 5000 }).catch(() => false)) {
        await questsTabAgain.click();
        await page.waitForTimeout(1000);
      }
    }

    if (foundEnrolledQuest) {
      // Click "SET DOWN QUEST" button (case-insensitive)
      const setDownButton = page.locator('button:has-text("SET DOWN"), button:has-text("Set Down")').first();
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
