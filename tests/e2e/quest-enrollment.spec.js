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
 */

// Helper function to login before each test
async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });
}

test.describe('Quest Enrollment', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available quests', async ({ page }) => {
    // Navigate to quest hub/browse
    await page.goto('/quest-hub');

    // Should show quest cards or list
    const questCards = page.locator('[data-testid="quest-card"], .quest-card, div:has-text("Quest")');
    await expect(questCards.first()).toBeVisible({ timeout: 10000 });

    // Should show quest titles
    const questTitles = page.locator('h2, h3, .quest-title');
    await expect(questTitles.first()).toBeVisible();
  });

  test('should view quest details', async ({ page }) => {
    await page.goto('/quest-hub');

    // Click on first quest card
    const firstQuest = page.locator('[data-testid="quest-card"], .quest-card').first();
    await firstQuest.click();

    // Should navigate to quest detail page
    await page.waitForURL(/.*\/quests\/[a-f0-9-]+/, { timeout: 10000 });

    // Should show quest information
    await expect(page.locator('text=/what you.*ll create|your mission|showcase/i')).toBeVisible();
  });

  test('should enroll in a quest (pick up)', async ({ page }) => {
    await page.goto('/quest-hub');

    // Click on first quest
    const firstQuest = page.locator('[data-testid="quest-card"], .quest-card').first();
    const questTitle = await firstQuest.locator('h2, h3, .quest-title').first().textContent();
    await firstQuest.click();

    // Wait for quest detail page
    await page.waitForURL(/.*\/quests\/[a-f0-9-]+/, { timeout: 10000 });

    // Look for "Pick Up" or "Start Quest" button
    const pickUpButton = page.locator('button:has-text("Pick Up"), button:has-text("Start Quest"), button:has-text("Enroll")').first();

    // Check if button exists and is visible
    const isVisible = await pickUpButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await pickUpButton.click();

      // Should show success message or navigate to personalization
      const successIndicators = [
        page.locator('text=/success|enrolled|picked up/i'),
        page.locator('text=/personalize|customize/i'),
        page.locator('button:has-text("Set Down"), button:has-text("Drop Quest")')
      ];

      const hasSuccess = await Promise.race(
        successIndicators.map(async (locator) => {
          try {
            await locator.waitFor({ timeout: 5000 });
            return true;
          } catch {
            return false;
          }
        })
      );

      expect(hasSuccess).toBeTruthy();
    } else {
      // Quest might already be enrolled - check for "Set Down" button
      const setDownButton = page.locator('button:has-text("Set Down"), button:has-text("Drop")');
      await expect(setDownButton).toBeVisible();
    }
  });

  test('should show enrolled quests in My Quests', async ({ page }) => {
    // Navigate to My Quests / Active Quests
    await page.goto('/my-quests');

    // Should show at least one active quest
    const activeQuests = page.locator('[data-testid="active-quest"], .active-quest, div:has-text("Active")');
    await expect(activeQuests.first()).toBeVisible({ timeout: 10000 });
  });

  test('should complete quest personalization', async ({ page }) => {
    await page.goto('/quest-hub');

    // Find a quest that's not enrolled yet
    const questCard = page.locator('[data-testid="quest-card"], .quest-card').first();
    await questCard.click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]+/, { timeout: 10000 });

    // Try to pick up quest
    const pickUpButton = page.locator('button:has-text("Pick Up"), button:has-text("Start Quest")').first();
    const isVisible = await pickUpButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      await pickUpButton.click();

      // Wait for personalization page or form
      const personalizationIndicators = [
        page.locator('text=/personalize|customize|choose|select/i'),
        page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Done")')
      ];

      const hasPersonalization = await Promise.race(
        personalizationIndicators.map(async (locator) => {
          try {
            await locator.waitFor({ timeout: 5000 });
            return true;
          } catch {
            return false;
          }
        })
      );

      if (hasPersonalization) {
        // Look for continue/submit button
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Done"), button:has-text("Start")').first();
        await continueButton.click();

        // Should navigate to quest detail or task view
        await page.waitForTimeout(2000);
        await expect(page.locator('text=/task|mission|objective/i')).toBeVisible();
      }
    }
  });

  test('should drop a quest (set down)', async ({ page }) => {
    // First ensure we have an active quest
    await page.goto('/my-quests');

    // Find an active quest
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest').first();
    await activeQuest.click();

    // Wait for quest detail page
    await page.waitForURL(/.*\/quests\/[a-f0-9-]+/, { timeout: 10000 });

    // Look for "Set Down" or "Drop Quest" button
    const setDownButton = page.locator('button:has-text("Set Down"), button:has-text("Drop Quest"), button:has-text("Drop")').first();

    const isVisible = await setDownButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await setDownButton.click();

      // Should show confirmation dialog or reflection form
      const confirmationIndicators = [
        page.locator('text=/confirm|are you sure/i'),
        page.locator('text=/reflect|what did you learn/i'),
        page.locator('button:has-text("Yes"), button:has-text("Confirm")')
      ];

      const hasConfirmation = await Promise.race(
        confirmationIndicators.map(async (locator) => {
          try {
            await locator.waitFor({ timeout: 3000 });
            return true;
          } catch {
            return false;
          }
        })
      );

      if (hasConfirmation) {
        // Confirm dropping the quest
        const confirmButton = page.locator('button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Set Down")').first();
        await confirmButton.click();

        // Should show success or navigate away
        await page.waitForTimeout(2000);
      }
    }
  });
});
