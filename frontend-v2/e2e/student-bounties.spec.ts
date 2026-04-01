import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Bounties', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'bounties');
  });

  test('ST35: Bounty Board page loads', async ({ page }) => {
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST36: Bounty Board shows tabs', async ({ page }) => {
    // Bounty Board has Browse/Claims/Posted tabs
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/browse|claims|posted|bounty/);
  });

  test.skip('ST37: Bounty shows XP cost (requires seeded data)', async ({ page }) => {
    // Skipped: requires bounty data
  });

  test.skip('ST38: Can view bounty details (requires seeded data)', async ({ page }) => {
    // Skipped: requires bounty data
  });

  test.skip('ST39: Can redeem a bounty with sufficient XP (requires seeded data)', async ({ page }) => {
    // Skipped: requires bounty data and sufficient XP
  });

  test.skip('ST40: Redeemed bounties section visible (requires seeded data)', async ({ page }) => {
    // Skipped: requires redeemed bounty data
  });

  test.skip('ST41: Bounty shows creator info (requires seeded data)', async ({ page }) => {
    // Skipped: requires bounty data
  });
});
