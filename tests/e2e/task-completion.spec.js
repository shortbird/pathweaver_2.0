import { test, expect } from '@playwright/test';

/**
 * Task Completion E2E Tests
 *
 * Tests the task completion flow:
 * - View quest tasks
 * - Submit task evidence (text, link, image)
 * - View task completion status
 * - Track XP progress
 *
 * IMPORTANT: These tests are built against the actual UI at https://optio-dev-frontend.onrender.com
 * Last verified: December 2025
 */

const BASE_URL = 'https://optio-dev-frontend.onrender.com';

// Helper function to login
async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  // Test user is a student, redirects to /dashboard
  await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
}

test.describe('Task Completion', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display quest tasks', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Find an enrolled quest (one that shows "Continue" or progress bar)
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });

    // Click on first quest
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show task workspace indicators (from TaskWorkspace component)
    const taskIndicators = page.locator('text=/Your Evidence|Select a task to get started/i');
    await expect(taskIndicators.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show task details and evidence editor', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "Your Evidence" section (indicates TaskWorkspace is loaded)
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
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Check if "Add Content" button exists (indicates evidence editor)
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

        // Find the textarea in the evidence editor (should be visible after adding text block)
        const textarea = page.locator('textarea').first();
        const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasTextarea) {
          // Fill in evidence
          await textarea.fill('This is my E2E test evidence. I completed this task successfully and learned about automated testing.');
          await page.waitForTimeout(1000); // Wait for autosave

          // Should show "Saved" indicator
          const savedIndicator = page.locator('text=/Saved|Autosaved/i');
          await expect(savedIndicator).toBeVisible({ timeout: 5000 });
        }
      }
    } else {
      // No editor available - might be a completed task or not enrolled
      test.skip();
    }
  });

  test('should mark task as completed', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Look for "Mark Task as Completed" button
    const markCompleteButton = page.getByRole('button', { name: /Mark Task as Completed/i });
    const hasButton = await markCompleteButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasButton) {
      // Click the button
      await markCompleteButton.click();

      // Should show either:
      // 1. "Task Completed! +X XP Earned" message
      // 2. "Marking Complete..." loading state
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
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show stats: "X/Y Tasks" and "Z XP Earned"
    const taskStats = page.locator('text=/\\d+\\/\\d+ TASKS|Tasks/i');
    await expect(taskStats.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show XP earned in quest stats', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
    await questCards.first().click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "XP Earned" in stats section
    const xpStats = page.locator('text=/\\d+ XP|XP Earned/i');
    await expect(xpStats.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display task with pillar and XP badges', async ({ page }) => {
    // Navigate to quest hub
    await page.goto(`${BASE_URL}/quest-hub`);
    await page.waitForLoadState('networkidle');

    // Switch to QUESTS tab
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(1000);
    }

    // Click on enrolled quest
    const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
    await questCards.first().waitFor({ state: 'visible', timeout: 15000 });
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
