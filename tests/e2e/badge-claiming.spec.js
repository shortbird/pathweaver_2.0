import { test, expect } from '@playwright/test';

/**
 * Badge Claiming E2E Tests
 *
 * Tests the badge progression and claiming flow:
 * - View available badges
 * - Track badge progress
 * - Claim completed badges
 * - View claimed badges on diploma
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
  await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });
}

test.describe('Badge System', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available badges', async ({ page }) => {
    // Navigate to badges page (QuestBadgeHub shows BADGES tab by default on /badges route)
    await page.goto(`${BASE_URL}/badges`);
    await page.waitForLoadState('networkidle');

    // Should show badge carousel cards
    // BadgeCarouselCard uses classes: w-72 bg-white rounded-xl cursor-pointer
    const badgeCards = page.locator('.w-72.bg-white.rounded-xl.cursor-pointer');
    await expect(badgeCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should view badge details', async ({ page }) => {
    await page.goto(`${BASE_URL}/badges`);
    await page.waitForLoadState('networkidle');

    // Click on first badge
    const firstBadge = page.locator('.w-72.bg-white.rounded-xl.cursor-pointer').first();
    await firstBadge.waitFor({ state: 'visible', timeout: 10000 });
    await firstBadge.click();

    // Should navigate to badge detail page
    await page.waitForURL(/.*\/badges\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show badge details (requirements on detail page)
    const requirementsText = page.locator('text=/Required Quests|Minimum XP|Academic Credits/i');
    await expect(requirementsText.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show badge progress if badge is active', async ({ page }) => {
    await page.goto(`${BASE_URL}/badges`);
    await page.waitForLoadState('networkidle');

    // Click on first badge
    const firstBadge = page.locator('.w-72.bg-white.rounded-xl.cursor-pointer').first();
    await firstBadge.waitFor({ state: 'visible', timeout: 10000 });
    await firstBadge.click();
    await page.waitForURL(/.*\/badges\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Check if badge shows progress section (only for active badges)
    const progressSection = page.locator('text=/Your Progress|Overall Progress/i');
    const hasProgress = await progressSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasProgress) {
      // Should show progress metrics
      const progressMetrics = page.locator('text=/Quests Completed|XP Earned|%/i');
      await expect(progressMetrics.first()).toBeVisible();
    } else {
      // Not an active badge - that's okay
      console.log('Badge is not active - no progress to show');
    }
  });

  test('should show "Start This Badge" button for unselected badges', async ({ page }) => {
    await page.goto(`${BASE_URL}/badges`);
    await page.waitForLoadState('networkidle');

    // Try to find an unselected badge
    const badgeCards = page.locator('.w-72.bg-white.rounded-xl.cursor-pointer');
    await badgeCards.first().waitFor({ state: 'visible', timeout: 10000 });
    const cardCount = await badgeCards.count();

    let foundUnselectBadge = false;

    // Check up to 5 badges
    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      await badgeCards.nth(i).click();
      await page.waitForURL(/.*\/badges\/[a-f0-9-]{36}/, { timeout: 10000 });

      // Look for "Start This Badge" button
      const startButton = page.getByRole('button', { name: /Start This Badge/i });
      const hasStart = await startButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasStart) {
        foundUnselectBadge = true;
        await expect(startButton).toBeVisible();
        break;
      }

      // Go back and try next badge
      await page.goto(`${BASE_URL}/badges`);
      await page.waitForLoadState('networkidle');
    }

    if (!foundUnselectBadge) {
      // All badges are already selected - skip test
      test.skip();
    }
  });

  test('should view diploma page', async ({ page }) => {
    // Navigate to diploma page
    await page.goto(`${BASE_URL}/diploma`);
    await page.waitForLoadState('networkidle');

    // Should show diploma header
    const diplomaHeader = page.locator('text=/Portfolio Diploma|Self-Validated/i');
    await expect(diplomaHeader.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show earned badges on diploma', async ({ page }) => {
    await page.goto(`${BASE_URL}/diploma`);
    await page.waitForLoadState('networkidle');

    // Look for "View All Badges" button specifically (only appears if > 3 earned badges)
    const viewAllButton = page.getByRole('button', { name: /View All.*Badges/i });
    const hasViewAllButton = await viewAllButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasViewAllButton) {
      // Click to view all badges
      await viewAllButton.click();

      // Should show modal with earned badges
      const badgeModal = page.locator('text=/Earned Badges/i');
      await expect(badgeModal).toBeVisible({ timeout: 5000 });
    } else {
      // No "View All" button means < 4 badges earned
      // Just verify the Badges section exists
      const badgesSection = page.locator('text=/Badges \\(\\d+\\)/i');
      await expect(badgesSection).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show XP by pillar on diploma', async ({ page }) => {
    await page.goto(`${BASE_URL}/diploma`);
    await page.waitForLoadState('networkidle');

    // Should show pillar names in sidebar (Skills Radar section)
    const pillarText = page.locator('text=/STEM|Art|Wellness|Communication|Civics/i');
    await expect(pillarText.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show related quests on badge detail page', async ({ page }) => {
    await page.goto(`${BASE_URL}/badges`);
    await page.waitForLoadState('networkidle');

    // Click on first badge
    const firstBadge = page.locator('.w-72.bg-white.rounded-xl.cursor-pointer').first();
    await firstBadge.waitFor({ state: 'visible', timeout: 10000 });
    await firstBadge.click();
    await page.waitForURL(/.*\/badges\/[a-f0-9-]{36}/, { timeout: 10000 });

    // Should show "Quests Related to" heading
    const questsHeading = page.locator('text=/Quests Related to/i');
    await expect(questsHeading).toBeVisible({ timeout: 10000 });
  });
});
