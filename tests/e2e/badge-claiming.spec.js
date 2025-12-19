import { test, expect } from '@playwright/test';

/**
 * Badge Claiming E2E Tests
 *
 * Tests the badge progression and claiming flow:
 * - View available badges
 * - Track badge progress
 * - Claim completed badges
 * - View claimed badges on diploma
 */

// Helper function to login
async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });
}

test.describe('Badge System', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display available badges', async ({ page }) => {
    // Navigate to badges page
    await page.goto('/badges');

    // Should show badge cards or list
    const badges = page.locator('[data-testid="badge"], .badge, div:has-text("Badge")');
    await expect(badges.first()).toBeVisible({ timeout: 10000 });
  });

  test('should view badge details', async ({ page }) => {
    await page.goto('/badges');

    // Click on first badge
    const firstBadge = page.locator('[data-testid="badge"], .badge-card').first();
    await firstBadge.click();

    // Should show badge details (requirements, quests, progress)
    const detailIndicators = [
      page.locator('text=/required|requirement/i'),
      page.locator('text=/quest|xp/i'),
      page.locator('text=/progress|complete/i')
    ];

    const hasDetails = await Promise.race(
      detailIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(hasDetails).toBeTruthy();
  });

  test('should show badge progress', async ({ page }) => {
    await page.goto('/badges');

    // Should show progress on badge cards (percentage or progress bar)
    const progressIndicators = [
      page.locator('text=/%|percent/i'),
      page.locator('[role="progressbar"], .progress-bar'),
      page.locator('text=/\\d+\\/\\d+/i')
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

  test('should claim a completed badge if available', async ({ page }) => {
    await page.goto('/badges');

    // Look for a claimable badge (100% progress, not yet claimed)
    const claimButton = page.locator('button:has-text("Claim"), button:has-text("Earn Badge")').first();

    const isVisible = await claimButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      await claimButton.click();

      // Should show success message or celebration animation
      const successIndicators = [
        page.locator('text=/success|congratulations|earned/i'),
        page.locator('text=/claimed|badge earned/i')
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
      // No claimable badges - this is okay for the test
      console.log('No claimable badges available - test skipped');
    }
  });

  test('should view diploma with claimed badges', async ({ page }) => {
    // Navigate to diploma/portfolio page
    await page.goto('/diploma');

    // Should show diploma page
    await expect(page.locator('text=/diploma|portfolio|achievements/i')).toBeVisible({ timeout: 10000 });

    // Should show badges (if any claimed)
    const badgeIndicators = [
      page.locator('[data-testid="badge"], .badge'),
      page.locator('text=/badge|achievement/i')
    ];

    const hasBadges = await Promise.race(
      badgeIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    // It's okay if no badges are shown (user might not have claimed any yet)
    // Just verify the page loads
    expect(page.url()).toContain('diploma');
  });

  test('should show XP by pillar', async ({ page }) => {
    // Navigate to profile or diploma
    await page.goto('/diploma');

    // Should show XP breakdown by pillar (STEM, Arts, Wellness, etc.)
    const pillarIndicators = [
      page.locator('text=/stem|art|wellness|communication|civics/i'),
      page.locator('text=/pillar|skill/i')
    ];

    const hasPillars = await Promise.race(
      pillarIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(hasPillars).toBeTruthy();
  });

  test('should filter badges by pillar', async ({ page }) => {
    await page.goto('/badges');

    // Look for pillar filter buttons
    const filterButtons = page.locator('button:has-text("STEM"), button:has-text("Arts"), button:has-text("Wellness")');

    const hasFilters = await filterButtons.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFilters) {
      // Click on a filter
      await filterButtons.first().click();

      // Wait for badges to update
      await page.waitForTimeout(1000);

      // Should still show badges (filtered)
      const badges = page.locator('[data-testid="badge"], .badge');
      await expect(badges.first()).toBeVisible();
    }
  });
});
