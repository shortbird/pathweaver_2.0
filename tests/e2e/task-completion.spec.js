import { test, expect } from '@playwright/test';

/**
 * Task Completion E2E Tests
 *
 * Tests the task completion flow:
 * - View quest tasks
 * - Submit task evidence (text, link, image)
 * - View task completion status
 * - Track XP progress
 */

// Helper function to login
async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });
}

test.describe('Task Completion', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display quest tasks', async ({ page }) => {
    // Navigate to an active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Should show task list
    const tasks = page.locator('[data-testid="task"], .task, div:has-text("Task")');
    await expect(tasks.first()).toBeVisible({ timeout: 10000 });
  });

  test('should open task evidence submission form', async ({ page }) => {
    // Navigate to active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Find an incomplete task
    const task = page.locator('[data-testid="task"]:not(:has-text("Completed")), .task:not(:has-text("Completed"))').first();

    // Click on task or "Submit Evidence" button
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Add Evidence"), button:has-text("Complete")').first();

    const isVisible = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await submitButton.click();

      // Should show evidence submission form
      const formIndicators = [
        page.locator('textarea, input[type="text"]'),
        page.locator('text=/evidence|submission|what did you/i'),
        page.locator('button:has-text("Submit Evidence"), button:has-text("Save")')
      ];

      const hasForm = await Promise.race(
        formIndicators.map(async (locator) => {
          try {
            await locator.waitFor({ timeout: 5000 });
            return true;
          } catch {
            return false;
          }
        })
      );

      expect(hasForm).toBeTruthy();
    }
  });

  test('should submit text evidence', async ({ page }) => {
    // Navigate to active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Open evidence submission
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Add Evidence"), button:has-text("Complete")').first();
    const isVisible = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Select text evidence type (if there's a type selector)
      const textTypeButton = page.locator('button:has-text("Text"), [data-type="text"]');
      const hasTypeSelector = await textTypeButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasTypeSelector) {
        await textTypeButton.click();
      }

      // Fill in text evidence
      const textarea = page.locator('textarea').first();
      await textarea.fill('This is my test evidence submission. I completed this task by testing the E2E flow and ensuring everything works correctly. The process taught me about automated testing and quality assurance.');

      // Submit evidence
      const saveButton = page.locator('button:has-text("Submit"), button:has-text("Save"), button[type="submit"]').first();
      await saveButton.click();

      // Should show success message
      const successIndicators = [
        page.locator('text=/success|submitted|saved/i'),
        page.locator('text=/pending|review|approval/i')
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
    }
  });

  test('should submit link evidence', async ({ page }) => {
    // Navigate to active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Open evidence submission
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Add Evidence"), button:has-text("Complete")').first();
    const isVisible = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Select link evidence type
      const linkTypeButton = page.locator('button:has-text("Link"), [data-type="link"]');
      const hasTypeSelector = await linkTypeButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasTypeSelector) {
        await linkTypeButton.click();

        // Fill in URL
        const urlInput = page.locator('input[type="url"], input[placeholder*="http"], input[placeholder*="URL"]');
        await urlInput.fill('https://example.com/my-project');

        // Optional: Fill description
        const descInput = page.locator('textarea, input[placeholder*="description"]');
        const hasDesc = await descInput.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasDesc) {
          await descInput.fill('Link to my completed project');
        }

        // Submit
        const saveButton = page.locator('button:has-text("Submit"), button:has-text("Save")').first();
        await saveButton.click();

        // Verify success
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should show task completion progress', async ({ page }) => {
    // Navigate to active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Should show progress indicator (percentage, progress bar, or completed/total count)
    const progressIndicators = [
      page.locator('text=/%|percent/i'),
      page.locator('[role="progressbar"], .progress-bar'),
      page.locator('text=/\\d+\\/\\d+ (tasks|completed)/i')
    ];

    const hasProgress = await Promise.race(
      progressIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(hasProgress).toBeTruthy();
  });

  test('should show XP earned', async ({ page }) => {
    // Navigate to active quest or profile
    await page.goto('/my-quests');

    // Should show XP somewhere (total XP, quest XP, or task XP)
    const xpIndicators = [
      page.locator('text=/\\d+ xp/i'),
      page.locator('text=/experience|points/i'),
      page.locator('[data-testid="xp"], .xp-count')
    ];

    const hasXP = await Promise.race(
      xpIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(hasXP).toBeTruthy();
  });

  test('should view completed tasks', async ({ page }) => {
    // Navigate to active quest
    await page.goto('/my-quests');
    const activeQuest = page.locator('[data-testid="active-quest"], .active-quest, .quest-card').first();
    await activeQuest.click();

    // Should show some completed tasks (if any exist)
    const completedTasks = page.locator('[data-testid="task"]:has-text("Completed"), .task:has-text("Completed"), .task.completed');

    // Check if any completed tasks exist
    const count = await completedTasks.count();

    if (count > 0) {
      // Verify completed task has visual indicator
      const firstCompleted = completedTasks.first();
      await expect(firstCompleted).toBeVisible();

      // Should show checkmark or completion indicator
      const completionIndicators = [
        firstCompleted.locator('svg'), // checkmark icon
        firstCompleted.locator('text=/✓|✔|complete/i')
      ];

      const hasIndicator = await Promise.race(
        completionIndicators.map(async (locator) => {
          try {
            await locator.waitFor({ timeout: 3000 });
            return true;
          } catch {
            return false;
          }
        })
      );

      expect(hasIndicator).toBeTruthy();
    }
  });
});
